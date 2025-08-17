# Evaluation Framework

A comprehensive evaluation system for testing terminal multiplexer tools with various AI coding agents. This framework automates the process of running tasks, capturing outputs, using Claude to judge the results, and generating interactive HTML reports.

## Overview

The evaluation framework tests how well different AI agents (Claude Code, OpenCode, Gemini) can complete terminal-based tasks using various terminal multiplexer tools (terminalcp, tmux, screen). It provides automated testing, parallel execution, AI-powered judging of results, and visual reporting.

## Structure

```
test/eval/
├── tasks/                    # Task descriptions (markdown files)
│   ├── debug-lldb.md        # Debug a crashing C program with LLDB
│   ├── python-repl.md       # Interactive Python REPL tasks
│   └── project-analysis.md  # Model switching and project analysis
├── tools/                    # Tool instructions with MCP/CLI config
│   ├── terminalcp.md        # MCP server version (standard)
│   ├── terminalcp-cli.md    # CLI version
│   ├── terminalcp-stream.md # MCP with stream optimization
│   ├── tmux.md              # Terminal multiplexer
│   └── screen.md            # GNU Screen
├── agents.ts                # Agent definitions and detection
├── runner.ts                # Core evaluation runner using TerminalManager
├── run.ts                   # Main CLI entry point
├── stats.ts                 # Statistics generator with Claude judging
└── report.ts                # HTML report generator
```

## Key Features

1. **Direct TerminalManager Integration** - Uses the core library directly for optimal performance
2. **Markdown-based Configuration** - Tasks and tools defined in markdown for easy modification
3. **Intelligent Agent Detection** - Identifies agent state using unique UI markers
4. **Structured Prompt Generation** - Automatically builds consistent Task → Tool → Completion prompts
5. **MCP Configuration Management** - Dynamically creates and cleans up MCP config files
6. **Repetition Support** - Run evaluations multiple times for statistical significance
7. **Parallel Execution** - Run multiple evaluations concurrently to save time
8. **Multi-format Output Capture** - Saves scrollbuffer, stream, and ANSI-formatted outputs
9. **AI-powered Judging** - Uses Claude to analyze results and compare tool performance
10. **Comprehensive Statistics** - Extracts cost, duration, and token usage metrics
11. **Interactive HTML Reports** - Self-contained reports with charts and responsive tables
12. **Dynamic Tool Discovery** - Automatically detects and includes new tools in reports

## Quick Start

```bash
# Run default evaluation (claude agent, all tasks, all tools)
npx tsx test/eval/run.ts

# Analyze results with AI judging and generate HTML report
npx tsx test/eval/stats.ts

# Skip judging (faster, metrics only)
npx tsx test/eval/stats.ts --no-judge

# Generate HTML report from existing summary
npx tsx test/eval/report.ts evaluation-results/evaluation-summary.json
```

## Usage

### Running Evaluations

```bash
# Run all tasks/tools with default agent (claude)
npx tsx test/eval/run.ts

# Specify agents, tasks, and tools
npx tsx test/eval/run.ts --agents claude gemini --tasks python-repl --tools tmux screen

# Run each evaluation 3 times for consistency testing
npx tsx test/eval/run.ts --repeat 3

# Run 4 evaluations in parallel for speed
npx tsx test/eval/run.ts --parallel 4

# Combine repeat and parallel (e.g., 3 repetitions, 2 at a time)
npx tsx test/eval/run.ts --repeat 3 --parallel 2

# Use file paths for custom tasks/tools
npx tsx test/eval/run.ts --tasks ./my-task.md --tools ~/custom-tool.md

# Mix short names and file paths
npx tsx test/eval/run.ts --tasks python-repl ./custom-task.md --tools tmux ~/my-tool.md

# Get help
npx tsx test/eval/run.ts --help
```

### Command-line Options

| Option | Description | Default |
|--------|-------------|---------|
| `--agents <items...>` | Agent names (claude, gemini, opencode) | claude |
| `--tasks <items...>` | Task names or file paths | All in test/eval/tasks/ |
| `--tools <items...>` | Tool names or file paths | All in test/eval/tools/ |
| `--repeat <n>` | Number of times to repeat each evaluation | 1 |
| `--parallel <n>` | Number of evaluations to run in parallel | 1 |
| `--help, -h` | Show help message | - |

### Analyzing Results

```bash
# Analyze all results in evaluation-results/ with Claude judging
npx tsx test/eval/stats.ts

# Analyze results in a specific directory
npx tsx test/eval/stats.ts /path/to/results

# Skip Claude judging (metrics only, much faster)
npx tsx test/eval/stats.ts --no-judge

# Analyze specific directory without judging
npx tsx test/eval/stats.ts /path/to/results --no-judge
```

The stats script will:
1. Extract metrics from all evaluation runs (cost, duration, tokens)
2. Use Claude to judge each agent/task/tool combination (unless --no-judge)
3. Generate comparative analysis when multiple tools tested on same task
4. Create judge files with detailed assessments
5. Output `evaluation-summary.json` with complete results and judgments
6. Generate `evaluation-summary.html` with interactive visualizations

### Generating HTML Reports

```bash
# Generate report from existing summary (automatic with stats.ts)
npx tsx test/eval/report.ts evaluation-results/evaluation-summary.json

# Generate report from custom location
npx tsx test/eval/report.ts /path/to/evaluation-summary.json
```

The HTML report includes:
- Performance overview cards for each tool
- Success rate tables with color coding
- Cost analysis (total and average with standard deviation)
- Time analysis (total and average)
- Interactive charts for token usage (Chart.js)
- Responsive design for mobile and desktop
- Automatic detection of all tools and tasks

## How It Works

### Evaluation Pipeline

1. **Configuration Loading**
   - Tasks loaded from `test/eval/tasks/*.md` or custom file paths
   - Tools loaded from `test/eval/tools/*.md` or custom file paths
   - Tools specify type (MCP/CLI) and optional cleanup commands via frontmatter
   - Frontmatter parsed with support for both Unix and Windows line endings

2. **Prompt Construction**
   - Automatically generates structured prompts with three sections:
     - **Task**: Description of what needs to be done
     - **Tool**: Specific tool to use with instructions
     - **Completion**: Success/failure reporting (TASK_COMPLETE/TASK_FAILED)

3. **Execution Flow (per evaluation)**
   - Creates temporary MCP config files for MCP-enabled agents
   - Starts agent process using TerminalManager
   - Waits for initialization (configurable delay, default 3s)
   - Sends prompt: `Read {promptFile} and follow the instructions.`
   - Monitors for agent's "working" marker (30s timeout with nudge)
   - Waits for task completion (5 minute timeout)
   - Requests cost/token usage via agent's cost command
   - Captures output in multiple formats
   - Cleans up sessions and config files
   - Runs tool-specific cleanup commands

4. **Parallel Execution**
   - Batches evaluations based on `--parallel` setting
   - Manages cleanup at batch level to avoid conflicts
   - Ensures unique timestamps even for concurrent runs

### Agent Configuration

Agents are defined in `agents.ts` with these properties:

```typescript
{
  name: string,           // Display name
  command: string,        // CLI command to start agent
  workingMarker: string,  // Text that appears when processing
  costCommand: string,    // Command to get token usage
  initDelay?: number,     // Initialization wait time (ms)
  supportsMcp: boolean,   // Whether agent supports MCP
  configFiles?: [{        // Config files to create for MCP
    path: string,
    template: (mcpServers) => object
  }]
}
```

**Currently Supported Agents:**
- **Claude Code**: MCP-enabled, uses `/cost` command
- **OpenCode**: No MCP support, uses `/usage` command  
- **Gemini**: MCP-enabled, uses `/stats` command

### Output Files

Each evaluation generates multiple output files with timestamp-based naming:

| File Pattern | Description |
|--------------|-------------|
| `{agent}--{task}--{tool}--{timestamp}-prompt.md` | Full structured prompt sent to agent |
| `{agent}--{task}--{tool}--{timestamp}-scrollbuffer.txt` | Terminal viewport with scrollback |
| `{agent}--{task}--{tool}--{timestamp}-stream.txt` | Raw output without ANSI codes |
| `{agent}--{task}--{tool}--{timestamp}-stream-ansi.txt` | Raw output with ANSI codes |
| `{agent}--{task}--{tool}--{timestamp}.log` | Error log (only if evaluation failed) |
| `{agent}--{task}--{tool}--judge.md` | Judge analysis (generated by stats.ts) |
| `{agent}--{task}--overall--judge.md` | Tool comparison (generated by stats.ts) |
| `evaluation-summary.json` | Complete results with metrics and judgments |
| `evaluation-summary.html` | Interactive HTML report with charts |

Timestamp format: `yyyymmddhhmmssSSS{counter}` (includes milliseconds and counter for uniqueness)

## Tool Optimization Strategies

### Stream vs Stdout

The framework includes optimized tool variants that demonstrate different output strategies:

1. **Standard (stdout)**: Best for TUIs and programs with complex terminal manipulation
   - Example: `terminalcp.md` - uses stdout for full terminal state

2. **Stream Optimized**: Best for simple line-based tools (debuggers, REPLs)
   - Example: `terminalcp-stream.md` - uses stream with `since_last: true` and `strip_ansi: true`
   - Reduces redundant data transfer
   - Cleaner output for tools that just append text

3. **Viewport-only Programs**: For editors and viewers
   - Get terminal size with `term-size` action
   - Use `stdout` with `lines` parameter matching terminal height
   - Avoids transferring unnecessary scrollback

## Adding New Components

### Creating a New Task

Create a markdown file in `test/eval/tasks/` with your task description:

```markdown
# task-name.md
Your task description here. Be specific about what needs to be accomplished.

1. First step with clear instructions
2. Second step with expected output
3. Continue with numbered steps...

After each step, verify the output before proceeding.
Finally, summarize all results including specific findings.
```

**Note**: The framework automatically adds TASK_COMPLETE/TASK_FAILED instructions.

### Creating a New Tool

Tools require frontmatter configuration followed by usage instructions.

#### CLI Tool Example

```markdown
---
{
  "type": "cli",
  "cleanup": "killall mytool 2>/dev/null || true"
}
---

### Quick Start (Typical Workflow)
1. Start session: `mytool start NAME`
2. Send input: `mytool send NAME "input"`
3. Get output: `mytool output NAME`
4. Clean up: `mytool stop NAME`

### Core Commands
- **Start**: `mytool start NAME command args`
- **Send input**: `mytool send NAME "text"`
- **Get output**: `mytool output NAME`
- **Stop**: `mytool stop NAME`

### Important Notes
- Only stop sessions you started by name
- Additional tool-specific guidance...
```

#### MCP Tool Example

```markdown
---
{
  "type": "mcp",
  "mcpServers": {
    "mytool": {
      "type": "stdio",
      "command": "npx",
      "args": ["mytool", "--mcp"]
    }
  }
}
---

### Quick Start
1. Start: `{"action": "start", "command": "cmd", "name": "NAME"}`
2. Send: `{"action": "send", "id": "NAME", "data": "input\r"}`
3. Get: `{"action": "output", "id": "NAME"}`
4. Stop: `{"action": "stop", "id": "NAME"}`

### Important Notes
- MCP-specific instructions...
```

### Adding a New Agent

Edit `agents.ts` to add your agent configuration:

```typescript
export const AGENTS: Record<string, Agent> = {
  // ... existing agents ...
  
  mynewagent: {
    name: "My New Agent",
    command: "mynewagent --model gpt-4",
    workingMarker: "processing request",  // Unique text shown when working
    costCommand: "/usage",                // Command to get token usage
    initDelay: 3000,                      // Wait time after starting (ms)
    supportsMcp: true,                    // Whether MCP is supported
    configFiles: [                        // Config files to create (if MCP)
      {
        path: ".mynewagent/config.json",
        template: (mcpServers) => ({
          mcpServers: mcpServers || {},
          // Other config options...
        })
      }
    ]
  }
};
```

## Statistics and Judging

The `stats.ts` script provides comprehensive analysis of evaluation results using Claude as a judge.

### Analysis Process

1. **Metrics Extraction**
   - Success/failure detection (TASK_COMPLETE marker)
   - Cost calculation from agent output
   - Duration parsing (wall time)
   - Token usage by model (Sonnet, Haiku, cache)
   - Aggregation across multiple runs

2. **Individual Tool Judging** (unless --no-judge)
   - Claude reads all prompt and output files
   - Analyzes what went well and what failed
   - Provides run-by-run assessment
   - Generates actionable recommendations

3. **Comparative Analysis** (when multiple tools tested)
   - Ranks tools by performance
   - Compares success rates, costs, and durations
   - Identifies patterns across tools
   - Provides clear tool recommendations

### Output Structure

#### Judge Files
- `{agent}--{task}--{tool}--judge.md` - Individual tool assessment
- `{agent}--{task}--overall--judge.md` - Comparative tool analysis

#### Summary JSON (`evaluation-summary.json`)
```json
{
  "agent": {
    "task": {
      "judgeNotes": "Tool comparison and rankings",
      "tool1": {
        "judgeNotes": "Detailed assessment",
        "runs": [
          {
            "agent": "claude",
            "task": "python-repl",
            "tool": "tmux",
            "timestamp": "20250815153045123000",
            "success": true,
            "totalCost": 0.0234,
            "totalDurationWall": "45.2s",
            "models": {
              "claude-3-5-sonnet": {
                "input": 15234,
                "output": 892,
                "cacheRead": 0,
                "cacheWrite": 0
              }
            }
          }
        ]
      }
    }
  }
}
```

## Best Practices

### Tool Design Guidelines

1. **Quick Start Section** - Provide a 4-step workflow for common usage
2. **Consistent Commands** - Use similar patterns across tools
3. **Output Strategy** - Choose appropriate method (stdout/stream) for tool type
4. **Batching Support** - Allow sending multiple commands efficiently
5. **Clear Cleanup** - Provide reliable cleanup commands

### Task Design Guidelines

1. **Clear Steps** - Number each step explicitly
2. **Verification Points** - Include "verify output" instructions
3. **Specific Success Criteria** - Define what constitutes completion
4. **Summary Requirements** - Request specific information in final summary

### Running Evaluations

1. **Start Small** - Test with single task/tool combinations first
2. **Use Repetition** - Run 3-5 times for statistical significance
3. **Leverage Parallelism** - Use `--parallel` for faster results
4. **Monitor Progress** - Check viewport output shown during execution
5. **Skip Judging Initially** - Use `--no-judge` for quick metrics
6. **Review Judge Notes** - Read AI assessments for deeper insights

## Troubleshooting

### Common Issues

**Agent Not Responding**
- Check agent is installed and accessible
- Verify workingMarker is correct in agents.ts
- Increase initDelay if agent needs more startup time

**MCP Configuration Errors**
- Ensure MCP server paths are correct
- Check config file permissions
- Verify JSON syntax in tool frontmatter

**Cleanup Failures**
- Use `|| true` in cleanup commands to prevent errors
- Test cleanup commands manually first
- Check for process name variations

**Parallel Execution Issues**
- Reduce `--parallel` if seeing resource conflicts
- Ensure cleanup commands handle multiple sessions
- Check for port/socket conflicts

**Windows Line Ending Issues**
- Framework handles both `\r\n` and `\n` in markdown frontmatter
- Use text editor that preserves line endings

### Debug Mode

To see more detailed output during evaluation:
- The runner shows viewport snapshots every 5-30 seconds
- Check stream files for complete output
- Use `stats.ts` to analyze partial results
- View HTML reports for visual analysis

## Advanced Usage

### Custom Evaluation Scenarios

You can create specialized evaluation scenarios by:

1. **Custom Task Files** - Write task-specific markdown files
2. **Custom Tool Configurations** - Create tool variants with different settings
3. **Agent Parameters** - Modify agent commands in agents.ts
4. **Batch Scripts** - Chain multiple evaluation runs with different parameters

### Integration with CI/CD

The evaluation framework can be integrated into CI/CD pipelines:

```bash
# Run evaluation in CI
npx tsx test/eval/run.ts --agents claude --tasks python-repl --tools terminalcp

# Generate metrics without judging (faster for CI)
npx tsx test/eval/stats.ts --no-judge

# Parse evaluation-summary.json for pass/fail criteria
jq '.["claude-code"]["python-repl"]["terminalcp"].runs[].success' evaluation-results/evaluation-summary.json
```

### Extending the Framework

The modular design allows for extensions:

1. **New Agent Types** - Add support for additional AI coding assistants
2. **Custom Judges** - Implement alternative judging strategies in stats.ts
3. **Additional Metrics** - Extract more data points from evaluation runs
4. **Custom Reports** - Build specialized visualizations from evaluation-summary.json
5. **Tool Variants** - Create optimized versions for specific use cases

## Performance Insights

Based on evaluation results:

1. **Token Usage Patterns**
   - Stream-based tools may use more tokens due to increased polling
   - Verbose tool instructions increase base token usage
   - MCP routing adds overhead per tool call

2. **Optimization Trade-offs**
   - Data transfer efficiency vs interaction efficiency
   - Incremental output may encourage more frequent polling
   - Balance between guidance detail and token cost

3. **Tool Selection**
   - Simple line-based tools: Use stream with since_last
   - Complex TUIs: Use stdout for full terminal state
   - Viewport-only apps: Use stdout with lines parameter