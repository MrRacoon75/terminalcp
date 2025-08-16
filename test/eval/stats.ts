#!/usr/bin/env npx tsx

import { query, type SDKMessage } from "@anthropic-ai/claude-code";
import chalk from "chalk";
import * as fs from "fs";
import * as path from "path";

interface ModelUsage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
}

interface EvaluationResult {
	agent: string;
	task: string;
	tool: string;
	timestamp: string;
	success: boolean;
	totalCost: number;
	totalDurationWall: string;
	models: Record<string, ModelUsage>;
}

interface JudgedResults {
	judgeNotes: string;
	runs: EvaluationResult[];
}

interface JudgedTask {
	judgeNotes: string;
	[tool: string]: JudgedResults | string;
}

/**
 * Call Claude to analyze results using file-based prompts
 */
async function claude(promptFile: string, systemPrompt?: string): Promise<string> {
	const messages: SDKMessage[] = [];
	for await (const message of query({
		prompt: `Read ${promptFile} in full and follow the instructions`,
		options: {
			customSystemPrompt: systemPrompt,
			maxTurns: 100,
			allowedTools: ["Read"],
			mcpServers: {},
		},
	})) {
		messages.push(message);
	}

	const result = messages.find((m) => m.type === "result");
	if (!result || result?.subtype !== "success") {
		throw new Error(`Claude failed to respond successfully: ${JSON.stringify(result)}`);
	}

	let message = messages.pop();
	while (message) {
		if (message.type === "assistant") {
			return message.message.content.map((c) => (c.type === "text" ? c.text : "")).join("");
		}
		message = messages.pop();
	}
	throw new Error(`Claude failed to respond successfully: ${JSON.stringify(messages)}`);
}

function parseUsageString(usageStr: string): ModelUsage {
	// Parse strings like "100.6k input, 1.5k output, 0 cache read, 0 cache write"
	// or "498 input, 95 output, 0 cache read, 0 cache write"

	const parseValue = (str: string): number => {
		const match = str.match(/^([\d.]+)([km]?)/);
		if (!match) return 0;

		const num = parseFloat(match[1]);
		const unit = match[2];

		if (unit === "k") return num * 1000;
		if (unit === "m") return num * 1000000;
		return num;
	};

	const parts = usageStr.split(",").map((s) => s.trim());

	const input = parseValue(parts[0]);
	const output = parseValue(parts[1]);
	const cacheRead = parseValue(parts[2]);
	const cacheWrite = parseValue(parts[3]);

	return { input, output, cacheRead, cacheWrite };
}

function extractStats(filePath: string): EvaluationResult | null {
	// Extract agent--task--tool--timestamp from filename
	const basename = path.basename(filePath);
	const match = basename.match(/^(.+?)--(.+?)--(.+?)--(\d+)-scrollbuffer\.txt$/);

	if (!match) {
		console.error(chalk.yellow(`Could not parse filename: ${basename}`));
		return null;
	}

	const [, agent, task, tool, timestamp] = match;

	// Read entire file
	const content = fs.readFileSync(filePath, "utf-8");
	const lines = content.split("\n");
	const lastLines = lines.slice(-100).join("\n");

	// Check for success - look for TASK_COMPLETE in entire file
	const success = content.includes("TASK_COMPLETE");

	// Extract cost information
	const costMatch = lastLines.match(/Total cost:\s+\$?([\d.]+)/);
	const totalCost = costMatch ? parseFloat(costMatch[1]) : 0;

	// Extract wall time
	const wallTimeMatch = lastLines.match(/Total duration \(wall\):\s+([\dm\s.]+s)/);
	const totalDurationWall = wallTimeMatch ? wallTimeMatch[1].trim() : "";

	// Extract model usage
	const models: Record<string, ModelUsage> = {};

	// Look for usage by model section
	const usageSection = lastLines.match(/Usage by model:([\s\S]*?)(?:\n\n|\n╭|$)/);

	if (usageSection) {
		const usageLines = usageSection[1].split("\n").filter((line) => line.trim());

		for (const line of usageLines) {
			// Match model name and usage
			const modelMatch = line.match(/^\s*([\w-]+):\s+(.*)/);
			if (modelMatch) {
				const modelName = modelMatch[1].trim();
				const usageStr = modelMatch[2].trim();
				models[modelName] = parseUsageString(usageStr);
			}
		}
	}

	return {
		agent,
		task,
		tool,
		timestamp,
		success,
		totalCost,
		totalDurationWall,
		models,
	};
}

async function main() {
	// Get evaluation directory from command line argument or use default
	const evalDir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(process.cwd(), "evaluation-results");

	if (!fs.existsSync(evalDir)) {
		console.error(chalk.red(`Evaluation directory not found: ${evalDir}`));
		console.error(chalk.gray("Usage: npx tsx test/eval/stats.ts [evaluation-directory]"));
		process.exit(1);
	}

	console.log(chalk.bold.white("Processing Evaluation Results"));
	console.log(chalk.gray(`Directory: ${evalDir}\n`));

	// Get all scrollbuffer files
	const files = fs
		.readdirSync(evalDir)
		.filter((f) => f.endsWith("-scrollbuffer.txt"))
		.sort();

	// Create nested structure: agent -> task -> tool -> runs
	const allResults: Record<string, Record<string, Record<string, EvaluationResult[]>>> = {};

	for (const file of files) {
		const filePath = path.join(evalDir, file);
		const result = extractStats(filePath);

		if (result) {
			// Initialize nested structure if needed
			if (!allResults[result.agent]) {
				allResults[result.agent] = {};
			}
			if (!allResults[result.agent][result.task]) {
				allResults[result.agent][result.task] = {};
			}
			if (!allResults[result.agent][result.task][result.tool]) {
				allResults[result.agent][result.task][result.tool] = [];
			}

			// Add result to the appropriate location
			allResults[result.agent][result.task][result.tool].push(result);

			console.log(chalk.cyan(`Processed: ${file}`));
			console.log(chalk.gray(`  Success: ${result.success ? chalk.green("✓") : chalk.red("✗")}`));
			console.log(chalk.gray(`  Cost: $${result.totalCost}`));
			console.log(chalk.gray(`  Duration: ${result.totalDurationWall}`));
			console.log(chalk.gray(`  Models: ${Object.keys(result.models).join(", ")}`));
			console.log();
		}
	}

	// Now run Claude to judge each agent/task/tool combination
	console.log(chalk.bold.white("\n=== Running Claude Judge ===\n"));

	const judgedResults: Record<string, Record<string, JudgedTask>> = {};

	// Collect all judging tasks
	interface JudgeTask {
		agent: string;
		task: string;
		tool: string;
		results: EvaluationResult[];
	}

	const judgeTasks: JudgeTask[] = [];
	for (const [agent, tasks] of Object.entries(allResults)) {
		for (const [task, tools] of Object.entries(tasks)) {
			for (const [tool, results] of Object.entries(tools)) {
				judgeTasks.push({ agent, task, tool, results });
			}
		}
	}

	console.log(chalk.gray(`Total tool combinations to judge: ${judgeTasks.length}`));
	console.log(chalk.gray(`Running up to 10 judges in parallel...\n`));

	// Function to judge a single tool combination
	const judgeToolCombination = async (
		judgeTask: JudgeTask,
	): Promise<{
		agent: string;
		task: string;
		tool: string;
		judgment: JudgedResults;
	}> => {
		const { agent, task, tool, results } = judgeTask;
		console.log(chalk.cyan(`Starting judge for ${agent}/${task}/${tool} (${results.length} runs)...`));

		// Build list of files for Claude to read
		const fileList = results.flatMap((r) => {
			const base = `${agent}--${task}--${tool}--${r.timestamp}`;
			return [`evaluation-results/${base}-prompt.md`, `evaluation-results/${base}-scrollbuffer.txt`];
		});

		// Create judge prompt
		const judgePrompt = `Analyze these evaluation runs for ${agent} using ${tool} on ${task}.

The runs are located in evaluation-results/ with filenames:
${fileList.join("\n")}

CRITICAL INSTRUCTIONS:
1. You MUST read EVERY file listed above IN FULL
2. You MUST use the EXACT format provided below - no deviations allowed
3. You MUST fill in ACTUAL content for each section - no placeholder text

After reading ALL files, output your response in EXACTLY this format (replace the bracketed text with your actual analysis):

## Overall Performance
Write a 2-3 sentence summary of how well the agent performed across all runs. Be specific about success rates and patterns you observed.

## What Went Well
- Specific strength observed in the runs
- Another specific strength with evidence
- Continue listing all strengths you observed

## What Went Wrong  
- Specific issue or failure pattern
- Another problem you identified
- Continue listing all issues found

## Run-by-Run Analysis
${results.map((r) => `- Run ${r.timestamp}: Pass or Fail - Provide a specific 1-2 sentence assessment of this run`).join("\n")}

## Recommendations
Write 2-3 specific, actionable improvements that would help the agent perform better on this task.

REMINDER: You MUST follow this EXACT format. Do not write a summary paragraph. Do not skip sections. Do not use placeholder text. Start your response with "## Overall Performance" and follow the format exactly.`;

		// Write prompt to file
		const promptFile = path.join(evalDir, `${agent}--${task}--${tool}--judge.md`);
		fs.writeFileSync(promptFile, judgePrompt);

		try {
			// Call Claude
			const judgeNotes = await claude(promptFile);

			console.log(chalk.green(`✓ Completed ${agent}/${task}/${tool}`));

			// Append judge response to the prompt file
			const fullContent = judgePrompt + "\n\n---\n\n# Judge Response\n\n" + judgeNotes;
			fs.writeFileSync(promptFile, fullContent);

			return {
				agent,
				task,
				tool,
				judgment: {
					judgeNotes,
					runs: results,
				},
			};
		} catch (error) {
			console.error(chalk.red(`✗ Failed ${agent}/${task}/${tool}:`), error);
			return {
				agent,
				task,
				tool,
				judgment: {
					judgeNotes: `Error during judging: ${error}`,
					runs: results,
				},
			};
		}
	};

	// Process in batches of 10
	const batchSize = 10;
	const allJudgments: Array<{ agent: string; task: string; tool: string; judgment: JudgedResults }> = [];

	for (let i = 0; i < judgeTasks.length; i += batchSize) {
		const batch = judgeTasks.slice(i, Math.min(i + batchSize, judgeTasks.length));
		console.log(
			chalk.yellow(
				`\nProcessing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(judgeTasks.length / batchSize)}`,
			),
		);

		const batchResults = await Promise.all(batch.map(judgeToolCombination));
		allJudgments.push(...batchResults);
	}

	// Organize judgments back into nested structure
	for (const [agent, tasks] of Object.entries(allResults)) {
		if (!judgedResults[agent]) judgedResults[agent] = {};

		for (const [task, tools] of Object.entries(tasks)) {
			if (!judgedResults[agent][task]) judgedResults[agent][task] = { judgeNotes: "" };

			// Collect tool judgments for this task
			const toolJudgments: Record<string, JudgedResults> = {};

			for (const toolName of Object.keys(tools)) {
				const judgment = allJudgments.find((j) => j.agent === agent && j.task === task && j.tool === toolName);
				if (judgment) {
					toolJudgments[toolName] = judgment.judgment;
				}
			}

			// Now judge the task overall, comparing tools
			if (Object.keys(toolJudgments).length > 1) {
				console.log(
					chalk.cyan(
						`\nJudging ${agent}/${task} overall (comparing ${Object.keys(toolJudgments).length} tools)...`,
					),
				);

				const taskJudgePrompt = `Compare how different tools performed on the ${task} task for ${agent}.

You have already judged each tool individually. Here are the summaries with metrics:

${Object.entries(toolJudgments)
	.map(([tool, judgment]) => {
		const runs = judgment.runs;
		const successRate = ((runs.filter((r) => r.success).length / runs.length) * 100).toFixed(1);

		// Cost metrics
		const totalCost = runs.reduce((sum, r) => sum + r.totalCost, 0);
		const avgCost = totalCost / runs.length;

		// Duration metrics - parse duration strings to seconds for averaging
		const parseDuration = (dur: string) => {
			if (!dur) return 0;
			let seconds = 0;
			const match = dur.match(/(\d+)m\s*([\d.]+)s/);
			if (match) {
				seconds = parseInt(match[1]) * 60 + parseFloat(match[2]);
			} else if (dur.includes("s")) {
				seconds = parseFloat(dur.replace("s", ""));
			}
			return seconds;
		};

		const durations = runs.map((r) => parseDuration(r.totalDurationWall));
		const totalDuration = durations.reduce((sum, d) => sum + d, 0);
		const avgDuration = totalDuration / runs.length;

		// Format durations back to string
		const formatDuration = (seconds: number) => {
			const mins = Math.floor(seconds / 60);
			const secs = (seconds % 60).toFixed(1);
			return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
		};

		// Aggregate token usage across all runs
		const totalUsage = runs.reduce(
			(sum, r) => {
				Object.values(r.models).forEach((usage) => {
					sum.input += usage.input;
					sum.output += usage.output;
					sum.cacheRead += usage.cacheRead;
					sum.cacheWrite += usage.cacheWrite;
				});
				return sum;
			},
			{ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		);

		return `
### ${tool}
**Metrics:**
- Runs: ${runs.length}
- Success Rate: ${successRate}%
- Total Cost: $${totalCost.toFixed(4)} (avg: $${avgCost.toFixed(4)})
- Total Duration: ${formatDuration(totalDuration)} (avg: ${formatDuration(avgDuration)})
- Total Tokens: ${totalUsage.input.toLocaleString()} in, ${totalUsage.output.toLocaleString()} out, ${totalUsage.cacheRead.toLocaleString()} cache read, ${totalUsage.cacheWrite.toLocaleString()} cache write

**Judge Notes:**
${judgment.judgeNotes}
`;
	})
	.join("\n")}

CRITICAL: You MUST now provide a comparative analysis using EXACTLY this format (replace bracketed text with actual analysis):

## Tool Comparison for ${task}

### Rankings
Rank the tools from best to worst based on success rate, efficiency, ease of use, and overall effectiveness:
1. [First place tool] - [brief reason why it's #1]
2. [Second place tool] - [brief reason why it's #2]  
3. [Third place tool] - [brief reason why it's #3]
4. [Fourth place tool] - [brief reason why it's #4]

### Best Tool: [actual tool name]
Write 2-3 sentences explaining specifically why this tool performed best for this task, referencing the metrics and judge notes above.

### Tool-by-Tool Analysis
${Object.keys(toolJudgments)
	.map((tool) => `- **${tool}**: Write 1-2 sentences comparing this tool's performance to the others`)
	.join("\n")}

### Key Insights
Write 2-3 sentences about what patterns emerged across tools for this specific task. What made some tools succeed where others failed?

### Recommendation
Write 2-3 sentences with a clear recommendation of which tool should be preferred for this task and why, considering both performance and practical factors.

REMINDER: Start your response with "## Tool Comparison for ${task}" and follow this EXACT format. Do not write any introductory text.`;

				// Write prompt to file
				const taskPromptFile = path.join(evalDir, `${agent}--${task}--overall--judge.md`);
				fs.writeFileSync(taskPromptFile, taskJudgePrompt);

				try {
					// Call Claude
					const taskJudgeNotes = await claude(taskPromptFile);

					console.log(chalk.green(`✓ Completed task comparison for ${agent}/${task}`));

					// Store task-level judge notes
					judgedResults[agent][task] = {
						judgeNotes: taskJudgeNotes,
						...toolJudgments,
					};

					// Append judge response to the prompt file
					const fullContent = taskJudgePrompt + "\n\n---\n\n# Judge Response\n\n" + taskJudgeNotes;
					fs.writeFileSync(taskPromptFile, fullContent);
				} catch (error) {
					console.error(chalk.red(`Failed to judge ${agent}/${task} overall:`), error);
					judgedResults[agent][task] = {
						judgeNotes: `Error during task judging: ${error}`,
						...toolJudgments,
					};
				}
			} else {
				// Only one tool, no comparison needed
				judgedResults[agent][task] = {
					judgeNotes: "Only one tool tested for this task",
					...toolJudgments,
				};
			}
		}
	}

	// Write single JSON file with judged results
	const outputPath = path.join(evalDir, "evaluation-summary.json");
	fs.writeFileSync(outputPath, JSON.stringify(judgedResults, null, 2));
	console.log(chalk.green(`\n✓ Written judged results to: ${outputPath}`));

	// Print summary statistics
	console.log(chalk.bold.white("\n=== Summary Statistics ===\n"));

	for (const [agent, tasks] of Object.entries(allResults)) {
		for (const [task, tools] of Object.entries(tasks)) {
			for (const [tool, results] of Object.entries(tools)) {
				const successRate = ((results.filter((r) => r.success).length / results.length) * 100).toFixed(1);
				const avgCost = (results.reduce((sum, r) => sum + r.totalCost, 0) / results.length).toFixed(2);

				console.log(chalk.cyan(`${agent}/${task}/${tool}:`));
				console.log(chalk.gray(`  Runs: ${results.length}`));
				console.log(chalk.gray(`  Success rate: ${successRate}%`));
				console.log(chalk.gray(`  Average cost: $${avgCost}`));
			}
		}
	}
}

main().catch((error) => {
	console.error(chalk.red("Error:"), error);
	process.exit(1);
});
