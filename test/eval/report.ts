#!/usr/bin/env npx tsx

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

type EvaluationData = Record<string, Record<string, JudgedTask>>;

/**
 * Generate HTML report from evaluation summary data using templates
 */
export async function generateReport(evaluationData: EvaluationData, outputPath: string): Promise<void> {
	const templateDir = path.join(path.dirname(import.meta.url.replace("file://", "")), "report");
	const templatePath = path.join(templateDir, "template.html");
	const scriptPath = path.join(templateDir, "report.js");

	// Read template files
	const htmlTemplate = fs.readFileSync(templatePath, "utf-8");
	const jsScript = fs.readFileSync(scriptPath, "utf-8");

	// Fetch Chart.js from CDN
	let chartJs = "";
	try {
		const response = await fetch("https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js");
		chartJs = await response.text();
		console.log(chalk.gray("✓ Embedded Chart.js for CSP-safe report"));
	} catch (err) {
		console.log(chalk.yellow("Warning: Could not fetch Chart.js, charts will be disabled"));
		chartJs = "window.Chart = function() { return { destroy: function() {} }; };";
	}

	// Prepare the data by massaging it for easy consumption
	// The JS expects the raw evaluation data as-is
	const dataJson = JSON.stringify(evaluationData, null, "\t");

	// Replace placeholders in template
	const html = htmlTemplate
		.replace("{{CHART_JS}}", chartJs)
		.replace("{{DATA}}", dataJson)
		.replace("{{SCRIPT}}", jsScript);

	// Write the HTML file
	fs.writeFileSync(outputPath, html);
	console.log(chalk.green(`✓ HTML report generated: ${outputPath}`));
}

// Main function when run directly
async function main() {
	const summaryPath = process.argv[2]
		? path.resolve(process.argv[2])
		: path.join(process.cwd(), "evaluation-results", "evaluation-summary.json");

	if (!fs.existsSync(summaryPath)) {
		console.error(chalk.red(`Evaluation summary not found: ${summaryPath}`));
		console.error(chalk.gray("Usage: npx tsx test/eval/report.ts [evaluation-summary.json]"));
		process.exit(1);
	}

	console.log(chalk.bold.white("Generating HTML Report"));
	console.log(chalk.gray(`Input: ${summaryPath}`));

	// Read the evaluation data
	const evaluationData = JSON.parse(fs.readFileSync(summaryPath, "utf-8")) as EvaluationData;

	// Generate output path (same directory as input, with .html extension)
	const outputPath = summaryPath.replace(".json", ".html");

	// Generate the report
	await generateReport(evaluationData, outputPath);

	console.log(chalk.green(`\n✓ Report generated successfully!`));
	console.log(chalk.gray(`View it at: ${outputPath}`));
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((error) => {
		console.error(chalk.red("Error:"), error);
		process.exit(1);
	});
}
