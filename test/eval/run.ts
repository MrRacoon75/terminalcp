#!/usr/bin/env npx tsx
/**
 * Simple evaluation runner using TerminalManager directly
 */

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import { EvalRunner } from "./runner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Parse command line arguments
const args = process.argv.slice(2);

// Parse CLI flags
function parseArgs(args: string[]): {
	agents: string[];
	tasks: string[];
	tools: string[];
	help: boolean;
} {
	const result = {
		agents: [] as string[],
		tasks: [] as string[],
		tools: [] as string[],
		help: false,
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];

		if (arg === "--help" || arg === "-h") {
			result.help = true;
		} else if (arg === "--agents" && i + 1 < args.length) {
			result.agents = args[++i].split(",").map((s) => s.trim());
		} else if (arg === "--tasks" && i + 1 < args.length) {
			result.tasks = args[++i].split(",").map((s) => s.trim());
		} else if (arg === "--tools" && i + 1 < args.length) {
			result.tools = args[++i].split(",").map((s) => s.trim());
		}
	}

	// Default to claude if no agents specified
	if (result.agents.length === 0) {
		result.agents = ["claude"];
	}

	return result;
}

const parsed = parseArgs(args);

// Show usage if --help
if (parsed.help) {
	console.log(`
Usage: npx tsx test/eval/run.ts [options]

Options:
  --agents <list>  Comma-separated list of agents (default: claude)
  --tasks <list>   Comma-separated list of tasks (default: all)
  --tools <list>   Comma-separated list of tools (default: all)
  --help, -h       Show this help

Examples:
  npx tsx test/eval/run.ts
    Run all tasks and tools with claude

  npx tsx test/eval/run.ts --agents claude,opencode
    Run all tasks and tools with claude and opencode

  npx tsx test/eval/run.ts --agents claude,opencode --tasks python-repl,debug --tools tmux,screen
    Run specific tasks and tools with specific agents

  npx tsx test/eval/run.ts --tasks debug --tools tmux
    Run debug task with tmux tool using claude (default)

Available agents: claude, opencode, gemini
Tasks are loaded from: test/eval/tasks/*.md
Tools are loaded from: test/eval/tools/*.md
Results saved to: evaluation-results/
`);
	process.exit(0);
}

// Configure evaluation
const config = {
	outputDir: resolve(__dirname, "../../evaluation-results"),
	tasksDir: resolve(__dirname, "tasks"),
	toolsDir: resolve(__dirname, "tools"),
	agents: parsed.agents,
	taskFilter: parsed.tasks,
	toolFilter: parsed.tools,
};

// Ensure output directory exists before compiling
try {
	if (!existsSync(config.outputDir)) {
		const { mkdirSync } = await import("node:fs");
		mkdirSync(config.outputDir, { recursive: true });
	}
} catch (error) {
	console.error(chalk.red("Failed to create output directory:"), error);
	process.exit(1);
}

// Compile demo-buggy if needed for debug task
const demoBuggyPath = resolve(config.outputDir, "demo-buggy");
if (!existsSync(demoBuggyPath)) {
	const sourceFile = resolve(__dirname, "../demo-buggy.c");
	if (existsSync(sourceFile)) {
		console.log(chalk.gray("Compiling demo-buggy..."));
		const { execSync } = await import("node:child_process");
		try {
			execSync(`gcc -g -o ${demoBuggyPath} ${sourceFile}`);
			console.log(chalk.green("Compiled demo-buggy"));
		} catch (error) {
			console.error(chalk.red("Failed to compile demo-buggy:"), error);
			process.exit(1);
		}
	}
}

// Run evaluation
console.log(chalk.cyan("=".repeat(60)));
console.log(chalk.bold.cyan("Terminal Multiplexer Evaluation Suite"));
console.log(chalk.cyan("=".repeat(60)));
console.log();

const runner = new EvalRunner(config);
runner.runAll().catch((error) => {
	console.error(chalk.red("Evaluation failed:"), error);
	process.exit(1);
});
