// Report generation script
(function() {
    // Process the evaluation data
    const agents = new Set();
    const tools = new Set();
    const tasks = new Set();
    const agentToolCombos = [];
    
    // Extract unique agents, tools, tasks, and combinations
    for (const [agentName, agentData] of Object.entries(EVALUATION_DATA)) {
        agents.add(agentName);
        for (const [taskName, taskData] of Object.entries(agentData)) {
            tasks.add(taskName);
            for (const [toolName, toolData] of Object.entries(taskData)) {
                if (toolName !== 'judgeNotes' && toolData.runs) {
                    tools.add(toolName);
                    agentToolCombos.push({
                        agent: agentName,
                        tool: toolName,
                        task: taskName,
                        runs: toolData.runs
                    });
                }
            }
        }
    }
    
    // Display names
    const agentNames = {
        'claude-code': 'Claude',
        'claude': 'Claude',
        'gemini': 'Gemini',
        'opencode': 'OpenCode'
    };
    
    const toolNames = {
        'terminalcp': 'terminalcp (MCP)',
        'terminalcp-cli': 'terminalcp (CLI)',
        'terminalcp-stream': 'terminalcp-stream (MCP)',
        'terminalcp-lldb': 'terminalcp-lldb (MCP)',
        'tmux': 'tmux',
        'screen': 'screen'
    };
    
    const taskNames = {
        'debug-lldb': 'Debug (LLDB)',
        'project-analysis': 'Project Analysis',
        'python-repl': 'Python REPL'
    };
    
    // Calculate metrics for each agent+tool combination
    function calculateMetrics() {
        const metrics = {};
        
        for (const [agentName, agentData] of Object.entries(EVALUATION_DATA)) {
            for (const [taskName, taskData] of Object.entries(agentData)) {
                for (const [toolName, toolData] of Object.entries(taskData)) {
                    if (toolName === 'judgeNotes' || !toolData.runs) continue;
                    
                    const key = `${agentName}::${toolName}`;
                    if (!metrics[key]) {
                        metrics[key] = {
                            agent: agentName,
                            tool: toolName,
                            tasks: {},
                            totalRuns: 0,
                            totalSuccess: 0,
                            totalCost: 0,
                            totalTime: 0,
                            allRuns: []
                        };
                    }
                    
                    const runs = toolData.runs;
                    const successful = runs.filter(r => r.success).length;
                    const cost = runs.reduce((sum, r) => sum + (r.totalCost || 0), 0);
                    const time = runs.reduce((sum, r) => sum + parseDuration(r.totalDurationWall), 0);
                    
                    metrics[key].tasks[taskName] = {
                        runs: runs.length,
                        success: successful,
                        cost: cost,
                        time: time,
                        runDetails: runs
                    };
                    
                    metrics[key].totalRuns += runs.length;
                    metrics[key].totalSuccess += successful;
                    metrics[key].totalCost += cost;
                    metrics[key].totalTime += time;
                    metrics[key].allRuns = metrics[key].allRuns.concat(runs);
                }
            }
        }
        
        return metrics;
    }
    
    // Parse duration string to seconds
    function parseDuration(dur) {
        if (!dur) return 0;
        let seconds = 0;
        const match = dur.match(/(\d+)m\s*([\d.]+)s/);
        if (match) {
            seconds = parseInt(match[1]) * 60 + parseFloat(match[2]);
        } else if (dur.includes('s')) {
            seconds = parseFloat(dur.replace('s', ''));
        }
        return seconds;
    }
    
    // Format duration from seconds
    function formatDuration(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    }
    
    // Calculate standard deviation
    function calculateStdDev(values) {
        const n = values.length;
        if (n === 0) return 0;
        const mean = values.reduce((a, b) => a + b, 0) / n;
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
        return Math.sqrt(variance);
    }
    
    // Render the report
    function renderReport(agentFilter = 'all', toolFilter = 'all') {
        const metrics = calculateMetrics();
        const content = document.getElementById('content');
        
        // Filter metrics based on selections
        const filteredMetrics = Object.entries(metrics).filter(([key, data]) => {
            if (agentFilter !== 'all' && data.agent !== agentFilter) return false;
            if (toolFilter !== 'all' && data.tool !== toolFilter) return false;
            return true;
        });
        
        // Generate HTML
        let html = '<h2>Performance Overview</h2><div class="metric-cards">';
        
        // Metric cards
        filteredMetrics.forEach(([key, data]) => {
            const agentDisplay = agentNames[data.agent] || data.agent;
            const toolDisplay = toolNames[data.tool] || data.tool;
            const overallRate = data.totalRuns > 0 
                ? Math.round(data.totalSuccess / data.totalRuns * 100) 
                : 0;
            const rateClass = overallRate === 100 ? 'success-high' : overallRate < 70 ? 'success-low' : '';
            
            html += `
                <div class="metric-card">
                    <h4>${agentDisplay} + ${toolDisplay}</h4>`;
            
            Array.from(tasks).sort().forEach(taskName => {
                const taskData = data.tasks[taskName];
                if (taskData) {
                    const rate = taskData.runs > 0 
                        ? Math.round(taskData.success / taskData.runs * 100) 
                        : 0;
                    const successClass = rate === 100 ? 'success-high' : rate === 0 ? 'success-low' : '';
                    
                    html += `
                        <div class="metric-row">
                            <span class="metric-label">${taskNames[taskName] || taskName}</span>
                            <span class="metric-value ${successClass}">${taskData.success}/${taskData.runs} (${rate}%)</span>
                        </div>`;
                }
            });
            
            html += `
                    <div class="metric-row overall-metric">
                        <span class="metric-label"><strong>Overall Success</strong></span>
                        <span class="metric-value ${rateClass}"><strong>${overallRate}%</strong></span>
                    </div>
                    <div class="metric-row">
                        <span class="metric-label">Total Cost</span>
                        <span class="metric-value">$${data.totalCost.toFixed(2)}</span>
                    </div>
                    <div class="metric-row">
                        <span class="metric-label">Total Time</span>
                        <span class="metric-value">${formatDuration(data.totalTime)}</span>
                    </div>
                </div>`;
        });
        
        html += '</div>';
        
        // Detailed Metrics section
        html += '<h2>Detailed Metrics</h2>';
        
        // Success Rates Table
        html += '<h3>Success Rates</h3><div class="table-wrapper"><table><thead><tr><th>Agent + Tool</th>';
        Array.from(tasks).sort().forEach(task => {
            html += `<th>${taskNames[task] || task}</th>`;
        });
        html += '<th><strong>Overall</strong></th></tr></thead><tbody>';
        
        filteredMetrics.forEach(([key, data]) => {
            const agentDisplay = agentNames[data.agent] || data.agent;
            const toolDisplay = toolNames[data.tool] || data.tool;
            const overallRate = data.totalRuns > 0 
                ? Math.round(data.totalSuccess / data.totalRuns * 100) 
                : 0;
            
            html += `<tr><td>${agentDisplay} + ${toolDisplay}</td>`;
            
            Array.from(tasks).sort().forEach(taskName => {
                const taskData = data.tasks[taskName];
                if (taskData) {
                    const rate = taskData.runs > 0 
                        ? Math.round(taskData.success / taskData.runs * 100) 
                        : 0;
                    const rateClass = rate === 100 ? 'success-high' : rate === 0 ? 'success-low' : '';
                    html += `<td class="${rateClass}">${taskData.success}/${taskData.runs} (${rate}%)</td>`;
                } else {
                    html += '<td>-</td>';
                }
            });
            
            const overallClass = overallRate === 100 ? 'success-high' : overallRate < 70 ? 'success-low' : '';
            html += `<td class="${overallClass}"><strong>${overallRate}%</strong></td></tr>`;
        });
        
        html += '</tbody></table></div>';
        
        // Total Cost Table
        html += '<h3>Total Cost</h3><div class="table-wrapper"><table><thead><tr><th>Agent + Tool</th>';
        Array.from(tasks).sort().forEach(task => {
            html += `<th>${taskNames[task] || task}</th>`;
        });
        html += '<th><strong>Total</strong></th></tr></thead><tbody>';
        
        const sortedByCost = [...filteredMetrics].sort((a, b) => a[1].totalCost - b[1].totalCost);
        sortedByCost.forEach(([key, data]) => {
            const agentDisplay = agentNames[data.agent] || data.agent;
            const toolDisplay = toolNames[data.tool] || data.tool;
            html += `<tr><td>${agentDisplay} + ${toolDisplay}</td>`;
            
            Array.from(tasks).sort().forEach(taskName => {
                const taskData = data.tasks[taskName];
                if (taskData) {
                    html += `<td>$${taskData.cost.toFixed(2)}</td>`;
                } else {
                    html += '<td>-</td>';
                }
            });
            
            html += `<td><strong>$${data.totalCost.toFixed(2)}</strong></td></tr>`;
        });
        
        html += '</tbody></table></div>';
        
        // Average Cost Table with Standard Deviation
        html += '<h3>Average Cost per Run</h3><div class="table-wrapper"><table><thead><tr><th>Agent + Tool</th>';
        Array.from(tasks).sort().forEach(task => {
            html += `<th>${taskNames[task] || task}</th>`;
        });
        html += '<th><strong>Overall</strong></th></tr></thead><tbody>';
        
        filteredMetrics.forEach(([key, data]) => {
            const agentDisplay = agentNames[data.agent] || data.agent;
            const toolDisplay = toolNames[data.tool] || data.tool;
            html += `<tr><td>${agentDisplay} + ${toolDisplay}</td>`;
            
            Array.from(tasks).sort().forEach(taskName => {
                const taskData = data.tasks[taskName];
                if (taskData && taskData.runDetails.length > 0) {
                    const costs = taskData.runDetails.map(r => r.totalCost || 0);
                    const avg = costs.reduce((a, b) => a + b, 0) / costs.length;
                    const stdDev = calculateStdDev(costs);
                    html += `<td>$${avg.toFixed(3)} ± $${stdDev.toFixed(3)}</td>`;
                } else {
                    html += '<td>-</td>';
                }
            });
            
            // Overall average
            if (data.allRuns.length > 0) {
                const costs = data.allRuns.map(r => r.totalCost || 0);
                const avg = costs.reduce((a, b) => a + b, 0) / costs.length;
                const stdDev = calculateStdDev(costs);
                html += `<td><strong>$${avg.toFixed(3)} ± $${stdDev.toFixed(3)}</strong></td>`;
            } else {
                html += '<td>-</td>';
            }
            
            html += '</tr>';
        });
        
        html += '</tbody></table></div>';
        
        // Total Time Table
        html += '<h3>Total Time</h3><div class="table-wrapper"><table><thead><tr><th>Agent + Tool</th>';
        Array.from(tasks).sort().forEach(task => {
            html += `<th>${taskNames[task] || task}</th>`;
        });
        html += '<th><strong>Total</strong></th></tr></thead><tbody>';
        
        const sortedByTime = [...filteredMetrics].sort((a, b) => a[1].totalTime - b[1].totalTime);
        sortedByTime.forEach(([key, data]) => {
            const agentDisplay = agentNames[data.agent] || data.agent;
            const toolDisplay = toolNames[data.tool] || data.tool;
            html += `<tr><td>${agentDisplay} + ${toolDisplay}</td>`;
            
            Array.from(tasks).sort().forEach(taskName => {
                const taskData = data.tasks[taskName];
                if (taskData) {
                    html += `<td>${formatDuration(taskData.time)}</td>`;
                } else {
                    html += '<td>-</td>';
                }
            });
            
            html += `<td><strong>${formatDuration(data.totalTime)}</strong></td></tr>`;
        });
        
        html += '</tbody></table></div>';
        
        // Average Time Table with Standard Deviation
        html += '<h3>Average Time per Run</h3><div class="table-wrapper"><table><thead><tr><th>Agent + Tool</th>';
        Array.from(tasks).sort().forEach(task => {
            html += `<th>${taskNames[task] || task}</th>`;
        });
        html += '<th><strong>Overall</strong></th></tr></thead><tbody>';
        
        filteredMetrics.forEach(([key, data]) => {
            const agentDisplay = agentNames[data.agent] || data.agent;
            const toolDisplay = toolNames[data.tool] || data.tool;
            html += `<tr><td>${agentDisplay} + ${toolDisplay}</td>`;
            
            Array.from(tasks).sort().forEach(taskName => {
                const taskData = data.tasks[taskName];
                if (taskData && taskData.runDetails.length > 0) {
                    const times = taskData.runDetails.map(r => parseDuration(r.totalDurationWall));
                    const avg = times.reduce((a, b) => a + b, 0) / times.length;
                    const stdDev = calculateStdDev(times);
                    html += `<td>${formatDuration(avg)} ± ${formatDuration(stdDev)}</td>`;
                } else {
                    html += '<td>-</td>';
                }
            });
            
            // Overall average
            if (data.allRuns.length > 0) {
                const times = data.allRuns.map(r => parseDuration(r.totalDurationWall));
                const avg = times.reduce((a, b) => a + b, 0) / times.length;
                const stdDev = calculateStdDev(times);
                html += `<td><strong>${formatDuration(avg)} ± ${formatDuration(stdDev)}</strong></td>`;
            } else {
                html += '<td>-</td>';
            }
            
            html += '</tr>';
        });
        
        html += '</tbody></table></div>';
        
        // Token usage charts - one per model
        html += '<h2>Token Usage Analysis</h2>';
        
        // Collect all models used
        const modelsUsed = new Set();
        filteredMetrics.forEach(([key, data]) => {
            data.allRuns.forEach(run => {
                if (run.models) {
                    Object.keys(run.models).forEach(model => modelsUsed.add(model));
                }
            });
        });
        
        // Create a chart for each model
        Array.from(modelsUsed).sort().forEach(modelName => {
            html += `
                <div class="chart-container">
                    <div class="chart-title">${modelName} Token Usage</div>
                    <canvas id="chart-${modelName.replace(/[^a-zA-Z0-9]/g, '-')}"></canvas>
                </div>`;
        });
        
        content.innerHTML = html;
        
        // Render charts if Chart.js is available
        if (window.Chart) {
            renderCharts(filteredMetrics, modelsUsed);
        }
    }
    
    // Render charts
    function renderCharts(filteredMetrics, modelsUsed) {
        // For each model, create a chart
        Array.from(modelsUsed).sort().forEach(modelName => {
            const ctx = document.getElementById(`chart-${modelName.replace(/[^a-zA-Z0-9]/g, '-')}`);
            if (!ctx) return;
            
            // Only include agent+tool combinations that have data for this model
            const labels = [];
            const inputData = [];
            const outputData = [];
            const cacheReadData = [];
            const cacheWriteData = [];
            
            filteredMetrics.forEach(([key, data]) => {
                let totalInput = 0, totalOutput = 0, totalCacheRead = 0, totalCacheWrite = 0;
                let hasDataForModel = false;
                
                // Check if this agent+tool combination has any data for this model
                data.allRuns.forEach(run => {
                    if (run.models && run.models[modelName]) {
                        hasDataForModel = true;
                        totalInput += run.models[modelName].input || 0;
                        totalOutput += run.models[modelName].output || 0;
                        totalCacheRead += run.models[modelName].cacheRead || 0;
                        totalCacheWrite += run.models[modelName].cacheWrite || 0;
                    }
                });
                
                // Only add to chart if there's data for this model
                if (hasDataForModel) {
                    const agentDisplay = agentNames[data.agent] || data.agent;
                    const toolDisplay = toolNames[data.tool] || data.tool;
                    labels.push(`${agentDisplay} + ${toolDisplay}`);
                    inputData.push(totalInput);
                    outputData.push(totalOutput);
                    cacheReadData.push(totalCacheRead);
                    cacheWriteData.push(totalCacheWrite);
                }
            });
            
            // Skip creating chart if no data for this model
            if (labels.length === 0) {
                // Remove the empty chart container
                const chartContainer = ctx.parentElement;
                if (chartContainer) {
                    chartContainer.remove();
                }
                return;
            }
            
            // Create datasets array
            const datasets = [];
            
            // Only add datasets that have non-zero data
            if (inputData.some(v => v > 0)) {
                datasets.push({
                    label: 'Input Tokens',
                    data: inputData,
                    backgroundColor: 'rgba(59, 130, 246, 0.8)'
                });
            }
            
            if (outputData.some(v => v > 0)) {
                datasets.push({
                    label: 'Output Tokens',
                    data: outputData,
                    backgroundColor: 'rgba(34, 197, 94, 0.8)'
                });
            }
            
            if (cacheReadData.some(v => v > 0)) {
                datasets.push({
                    label: 'Cache Read',
                    data: cacheReadData,
                    backgroundColor: 'rgba(251, 146, 60, 0.8)'
                });
            }
            
            if (cacheWriteData.some(v => v > 0)) {
                datasets.push({
                    label: 'Cache Write',
                    data: cacheWriteData,
                    backgroundColor: 'rgba(168, 85, 247, 0.8)'
                });
            }
            
            new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'top',
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: function(value) {
                                    if (value >= 1000000) {
                                        return (value / 1000000).toFixed(1) + 'M';
                                    } else if (value >= 1000) {
                                        return (value / 1000).toFixed(0) + 'k';
                                    }
                                    return value;
                                }
                            }
                        }
                    }
                }
            });
        });
    }
    
    // Setup filters
    function setupFilters() {
        const agentFilter = document.getElementById('agentFilter');
        const toolFilter = document.getElementById('toolFilter');
        
        // Populate filters
        Array.from(agents).sort().forEach(agent => {
            const option = document.createElement('option');
            option.value = agent;
            option.textContent = agentNames[agent] || agent;
            agentFilter.appendChild(option);
        });
        
        Array.from(tools).sort().forEach(tool => {
            const option = document.createElement('option');
            option.value = tool;
            option.textContent = toolNames[tool] || tool;
            toolFilter.appendChild(option);
        });
        
        // Add event listeners
        agentFilter.addEventListener('change', () => {
            renderReport(agentFilter.value, toolFilter.value);
        });
        
        toolFilter.addEventListener('change', () => {
            renderReport(agentFilter.value, toolFilter.value);
        });
    }
    
    // Set timestamp
    document.getElementById('timestamp').textContent = 
        `Report generated on ${new Date().toLocaleString()}`;
    
    // Initialize
    setupFilters();
    renderReport();
})();