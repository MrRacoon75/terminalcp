#!/usr/bin/env npx tsx
/**
 * Analyze evaluation results using Claude
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { query, type SDKMessage } from "@anthropic-ai/claude-code";
import chalk from "chalk";

const __dirname = dirname(fileURLToPath(import.meta.url));
const resultsDir = resolve(__dirname, "../../evaluation-results");

/**
 * Call Claude to analyze results using file-based prompts
 */
async function claude(promptFile: string, systemPrompt?: string): Promise<string> {
	const messages: SDKMessage[] = [];
	for await (const message of query({
		prompt: `read ${promptFile}`,
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

/**
 * Analyze a single evaluation result
 */
async function analyzeResult(
	agent: string,
	task: string,
	tool: string,
	logContent: string,
	promptContent: string,
): Promise<string> {
	const prompt = `
Another agent was given this task:

\`\`\`
${promptContent}
\`\`\`

This is the agent working on that task:
\`\`\`
${logContent}
\`\`\`

The agent was supposed to output TASK_COMPLETE or TASK_FAILED when done.

Extract the cost/token information from the output, count the number of tool calls, and analyze the performance of the agent.

Output the analysis in Markdown format with the following structure:
# ${agent} - ${task} - ${tool}

## Task Status
[Did the agent complete the task? Look for TASK_COMPLETE or TASK_FAILED markers]

## Cost Metrics
[Extract any token/cost information from the output]

## Tool Usage
[Count and summarize tool calls made]

## Performance Analysis
### What went well:
[Analyze successful aspects]

### Issues encountered:
[Analyze any problems or inefficiencies]

### Key observations:
[Notable patterns or behaviors]

Write the complete analysis in markdown:`;

	// Write prompt to a file in evaluation-results directory (so it's accessible)
	const promptFile = resolve(resultsDir, `analyze-${agent}-${task}-${tool}.md`);
	writeFileSync(promptFile, prompt);

	try {
		const result = await claude(promptFile);
		// Clean up prompt file
		if (existsSync(promptFile)) {
			require("fs").unlinkSync(promptFile);
		}
		return result;
	} catch (error) {
		// Clean up prompt file on error
		if (existsSync(promptFile)) {
			require("fs").unlinkSync(promptFile);
		}
		throw error;
	}
}

/**
 * Main analysis function
 */
async function main() {
	if (!existsSync(resultsDir)) {
		console.error(chalk.red("No evaluation-results directory found. Run evaluations first."));
		process.exit(1);
	}

	// Read all scrollbuffer files (primary output files)
	const logFiles = readdirSync(resultsDir).filter((f) => f.endsWith("-scrollbuffer.txt"));

	if (logFiles.length === 0) {
		console.error(chalk.red("No log files found in evaluation-results/"));
		process.exit(1);
	}

	console.log(chalk.bold.white("Analyzing Evaluation Results\n"));
	console.log(chalk.gray(`Found ${logFiles.length} log files to analyze`));

	// Collect all analyses
	const analyses: string[] = [];

	for (const file of logFiles) {
		const [agent, task, tool] = file.replace(".log", "").split("-");
		const logPath = resolve(resultsDir, file);
		const promptPath = resolve(resultsDir, file.replace(".log", "-prompt.md"));

		console.log(chalk.cyan(`\nAnalyzing: ${file}`));

		try {
			const logContent = readFileSync(logPath, "utf8");
			const promptContent = existsSync(promptPath) ? readFileSync(promptPath, "utf8") : "Prompt file not found";

			console.log(chalk.gray("  Sending to Claude for analysis..."));
			const analysis = await analyzeResult(agent, task, tool, logContent, promptContent);
			analyses.push(analysis);

			// Save individual analysis
			const analysisPath = resolve(resultsDir, file.replace(".log", "-analysis.md"));
			writeFileSync(analysisPath, analysis);
			console.log(chalk.green(`  Saved analysis to ${analysisPath}`));
		} catch (error) {
			console.error(chalk.red(`  Failed to analyze ${file}:`), error);
			analyses.push(`# ${agent} - ${task} - ${tool}\n\nERROR: Failed to analyze\n${error}\n`);
		}
	}

	// Generate combined report
	console.log(chalk.cyan("\nGenerating combined report..."));

	const combinedPrompt = `
I have multiple evaluation analyses. Please create a comprehensive summary report.

${analyses.map((a, i) => `Analysis ${i + 1}:\n${a}`).join("\n\n---\n\n")}

Create a summary report with:

# Evaluation Summary Report

## Overview
[High-level summary of all evaluations]

## Success Rate
[Table showing success/failure rates by agent, task, and tool]

## Cost Comparison
[Compare token usage and costs across agents]

## Tool Performance
[Which tools worked best for which tasks]

## Agent Comparison
[Strengths and weaknesses of each agent]

## Key Findings
[Most important observations]

## Recommendations
[Suggestions for improvements]

Write the complete summary report in markdown:`;

	try {
		console.log(chalk.gray("  Asking Claude to generate summary report..."));

		// Write combined prompt to file in evaluation-results directory
		const summaryPromptFile = resolve(resultsDir, "analyze-summary-prompt.md");
		writeFileSync(summaryPromptFile, combinedPrompt);

		const summaryReport = await claude(summaryPromptFile);

		// Clean up prompt file
		if (existsSync(summaryPromptFile)) {
			require("fs").unlinkSync(summaryPromptFile);
		}

		const summaryPath = resolve(resultsDir, "SUMMARY-REPORT.md");
		writeFileSync(summaryPath, summaryReport);

		console.log(chalk.bold.green(`\nSummary report saved to: ${summaryPath}`));

		// Also save all individual analyses in one file
		const allAnalysesPath = resolve(resultsDir, "ALL-ANALYSES.md");
		writeFileSync(allAnalysesPath, analyses.join("\n\n---\n\n"));
		console.log(chalk.green(`All analyses saved to: ${allAnalysesPath}`));
	} catch (error) {
		console.error(chalk.red("Failed to generate summary report:"), error);
	}
}

// Run the analysis
main().catch((error) => {
	console.error(chalk.red("Analysis failed:"), error);
	process.exit(1);
});
