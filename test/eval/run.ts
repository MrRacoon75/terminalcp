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

// Helper to resolve task/tool paths
function resolveFilePath(item: string, type: "tasks" | "tools"): string | null {
	// First check if it's a valid file path as-is
	if (existsSync(item)) {
		return resolve(item);
	}

	// Check with .md extension if not already present
	if (!item.endsWith(".md") && existsSync(item + ".md")) {
		return resolve(item + ".md");
	}

	// Check in the default directory
	const defaultPath = resolve(__dirname, type, item.endsWith(".md") ? item : `${item}.md`);
	if (existsSync(defaultPath)) {
		return defaultPath;
	}

	return null;
}

// Parse command line arguments
const args = process.argv.slice(2);

// Parse CLI flags with support for multiple values and file paths
function parseArgs(args: string[]): {
	agents: string[];
	tasks: string[];
	tools: string[];
	repeat: number;
	parallel: number;
	help: boolean;
} {
	const result = {
		agents: [] as string[],
		tasks: [] as string[],
		tools: [] as string[],
		repeat: 1,
		parallel: 1,
		help: false,
	};

	let currentList: "agents" | "tasks" | "tools" | null = null;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];

		if (arg === "--help" || arg === "-h") {
			result.help = true;
			currentList = null;
		} else if (arg === "--agents") {
			currentList = "agents";
		} else if (arg === "--tasks") {
			currentList = "tasks";
		} else if (arg === "--tools") {
			currentList = "tools";
		} else if (arg === "--repeat") {
			currentList = null;
			if (i + 1 < args.length) {
				const value = parseInt(args[++i], 10);
				if (!isNaN(value) && value > 0) {
					result.repeat = value;
				} else {
					console.warn(`Invalid repeat value: ${args[i]}, using default (1)`);
				}
			}
		} else if (arg === "--parallel") {
			currentList = null;
			if (i + 1 < args.length) {
				const value = parseInt(args[++i], 10);
				if (!isNaN(value) && value > 0) {
					result.parallel = value;
				} else {
					console.warn(`Invalid parallel value: ${args[i]}, using default (1)`);
				}
			}
		} else if (arg.startsWith("--")) {
			// Unknown flag, stop collecting for current list
			currentList = null;
			console.warn(`Unknown flag: ${arg}`);
		} else if (currentList) {
			// Add to current list - support comma-separated values for backwards compatibility
			const items = arg
				.split(",")
				.map((s) => s.trim())
				.filter((s) => s.length > 0);
			result[currentList].push(...items);
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
  --agents <items...>  Agent names (default: claude)
  --tasks <items...>   Task names or file paths (default: all tasks in test/eval/tasks/)
  --tools <items...>   Tool names or file paths (default: all tools in test/eval/tools/)
  --repeat <n>         Number of times to repeat each evaluation (default: 1)
  --parallel <n>       Number of evaluations to run in parallel (default: 1)
  --help, -h           Show this help

Arguments can be:
  - Multiple items after each flag: --agents claude gemini
  - Comma-separated (backwards compatible): --agents claude,gemini
  - Mixed flags: --agents claude --tasks python-repl --agents gemini
  - File paths for tasks/tools: --tasks ./my-task.md --tools ~/my-tool.md
  - Short names (looked up in test/eval/): --tasks python-repl --tools screen

Examples:
  npx tsx test/eval/run.ts
    Run all tasks and tools with claude

  npx tsx test/eval/run.ts --agents claude gemini --tasks python-repl debug-lldb
    Run two agents with two tasks on all tools

  npx tsx test/eval/run.ts --agents claude --tasks python-repl ./custom-task.md --tools terminalcp
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

// Process and validate task/tool paths
const resolvedTasks: string[] = [];
const resolvedTools: string[] = [];

// Resolve task paths
if (parsed.tasks.length > 0) {
	for (const task of parsed.tasks) {
		const resolved = resolveFilePath(task, "tasks");
		if (resolved) {
			resolvedTasks.push(resolved);
		} else {
			console.error(chalk.red(`Task not found: ${task}`));
			console.error(chalk.gray(`  Looked for:`));
			console.error(chalk.gray(`    - ${resolve(task)}`));
			console.error(chalk.gray(`    - ${resolve(task + ".md")}`));
			console.error(chalk.gray(`    - ${resolve(__dirname, "tasks", task + ".md")}`));
			process.exit(1);
		}
	}
}

// Resolve tool paths
if (parsed.tools.length > 0) {
	for (const tool of parsed.tools) {
		const resolved = resolveFilePath(tool, "tools");
		if (resolved) {
			resolvedTools.push(resolved);
		} else {
			console.error(chalk.red(`Tool not found: ${tool}`));
			console.error(chalk.gray(`  Looked for:`));
			console.error(chalk.gray(`    - ${resolve(tool)}`));
			console.error(chalk.gray(`    - ${resolve(tool + ".md")}`));
			console.error(chalk.gray(`    - ${resolve(__dirname, "tools", tool + ".md")}`));
			process.exit(1);
		}
	}
}

// Configure evaluation
const config = {
	outputDir: resolve(__dirname, "../../evaluation-results"),
	agents: parsed.agents,
	taskPaths: resolvedTasks,
	toolPaths: resolvedTools,
	repeat: parsed.repeat,
	parallel: parsed.parallel,
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
