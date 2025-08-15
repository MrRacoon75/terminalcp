import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import { TerminalManager } from "../../src/terminal-manager.js";
import type { Agent } from "./agents.js";
import { AGENTS, isAgentWorking } from "./agents.js";

export interface EvalConfig {
	outputDir: string;
	agents: string[]; // Agent IDs from AGENTS
	taskPaths: string[]; // Paths to task files (resolved from names or direct paths)
	toolPaths: string[]; // Paths to tool files (resolved from names or direct paths)
}

interface ToolConfig {
	type: "mcp" | "cli";
	cleanup?: string;
	mcpServers?: Record<string, any>;
}

class ConfigManager {
	private createdFiles: string[] = [];

	async setupAgentConfig(agent: Agent, toolConfig: ToolConfig): Promise<string> {
		if (!agent.supportsMcp || toolConfig.type !== "mcp" || !toolConfig.mcpServers) {
			return agent.command; // Return original command
		}

		// Create config files
		for (const configFile of agent.configFiles || []) {
			const fullPath = resolve(process.cwd(), configFile.path);
			const dir = dirname(fullPath);

			// Create directory if needed
			if (!existsSync(dir)) {
				mkdirSync(dir, { recursive: true });
			}

			// Write config
			const config = configFile.template(toolConfig.mcpServers);
			writeFileSync(fullPath, JSON.stringify(config, null, 2));
			this.createdFiles.push(fullPath);
		}

		return agent.command;
	}

	async cleanup() {
		// Delete all created files and directories
		for (const file of this.createdFiles.reverse()) {
			// Reverse to delete files before dirs
			try {
				if (existsSync(file)) {
					unlinkSync(file);
				}

				// Try to remove parent directory if empty
				const dir = dirname(file);
				if (dir !== process.cwd() && existsSync(dir)) {
					const files = readdirSync(dir);
					if (files.length === 0) {
						rmdirSync(dir);
					}
				}
			} catch {
				// Ignore cleanup errors
			}
		}
		this.createdFiles = [];
	}
}

export class EvalRunner {
	private config: EvalConfig;
	private manager: TerminalManager;

	constructor(config: EvalConfig) {
		this.config = config;
		this.manager = new TerminalManager();

		// Ensure output directory exists
		if (!existsSync(config.outputDir)) {
			mkdirSync(config.outputDir, { recursive: true });
		}
	}

	/**
	 * Load task descriptions from resolved file paths
	 */
	private loadTasks(): Map<string, string> {
		const tasks = new Map<string, string>();

		// If no paths specified, load all from default directory
		const paths =
			this.config.taskPaths.length > 0
				? this.config.taskPaths
				: readdirSync(resolve(dirname(fileURLToPath(import.meta.url)), "tasks"))
						.filter((f) => f.endsWith(".md"))
						.map((f) => resolve(dirname(fileURLToPath(import.meta.url)), "tasks", f));

		for (const path of paths) {
			// Extract task ID from filename (without extension and path)
			const filename = path.split("/").pop() || path;
			const taskId = filename.replace(".md", "");

			const content = readFileSync(path, "utf8");
			tasks.set(taskId, content);
		}

		return tasks;
	}

	/**
	 * Parse tool configuration from markdown frontmatter
	 */
	private parseToolConfig(content: string): { config: ToolConfig; instructions: string } {
		// Check if content has frontmatter
		if (!content.startsWith("---\n")) {
			// Default to CLI tool if no frontmatter
			return {
				config: { type: "cli" },
				instructions: content,
			};
		}

		// Extract frontmatter
		const endIndex = content.indexOf("\n---\n", 4);
		if (endIndex === -1) {
			return {
				config: { type: "cli" },
				instructions: content,
			};
		}

		const frontmatter = content.substring(4, endIndex);
		const instructions = content.substring(endIndex + 5).trim();

		try {
			const config = JSON.parse(frontmatter) as ToolConfig;
			return { config, instructions };
		} catch (e) {
			console.warn(chalk.yellow(`Failed to parse tool config frontmatter: ${e}`));
			return {
				config: { type: "cli" },
				instructions: content,
			};
		}
	}

	/**
	 * Load tool instructions from resolved file paths
	 */
	private loadTools(): Map<string, { config: ToolConfig; instructions: string }> {
		const tools = new Map<string, { config: ToolConfig; instructions: string }>();

		// If no paths specified, load all from default directory
		const paths =
			this.config.toolPaths.length > 0
				? this.config.toolPaths
				: readdirSync(resolve(dirname(fileURLToPath(import.meta.url)), "tools"))
						.filter((f) => f.endsWith(".md"))
						.map((f) => resolve(dirname(fileURLToPath(import.meta.url)), "tools", f));

		for (const path of paths) {
			// Extract tool ID from filename (without extension and path)
			const filename = path.split("/").pop() || path;
			const toolId = filename.replace(".md", "");

			const content = readFileSync(path, "utf8");
			const parsed = this.parseToolConfig(content);
			tools.set(toolId, parsed);
		}

		return tools;
	}

	/**
	 * Run a single evaluation
	 */
	async runEval(
		agent: Agent,
		taskId: string,
		taskContent: string,
		toolId: string,
		tool: { config: ToolConfig; instructions: string },
	): Promise<void> {
		const evalId = `${agent.name.toLowerCase().replace(/\s+/g, "-")}-${taskId}-${toolId}`;
		const outputFile = resolve(this.config.outputDir, `${evalId}.log`);
		const configManager = new ConfigManager();

		console.log(chalk.cyan(`\nStarting: ${evalId}`));

		// Build and save the full prompt
		const fullPrompt = `${tool.instructions}\n\n${taskContent}`;
		const promptFile = resolve(this.config.outputDir, `${evalId}-prompt.md`);
		writeFileSync(promptFile, fullPrompt);

		// Start the agent session directly with TerminalManager
		const sessionId = `eval-${evalId}`;
		console.log(chalk.gray(`  Starting ${agent.name}...`));

		try {
			// Setup agent config and get potentially modified command
			const agentCommand = await configManager.setupAgentConfig(agent, tool.config);

			await this.manager.start(agentCommand, { name: sessionId });

			// Wait for agent to initialize
			const initDelay = agent.initDelay || 3000;
			console.log(chalk.gray(`  Waiting ${initDelay}ms for initialization...`));
			await this.sleep(initDelay);

			// Send the prompt with Enter
			console.log(chalk.gray(`  Sending prompt...`));
			await this.manager.sendInput(sessionId, `read ${promptFile}\r`);

			// Monitor for agent working marker
			let isWorking = false;
			let attempts = 0;
			const maxAttempts = 30; // 30 seconds max wait

			while (!isWorking && attempts < maxAttempts) {
				await this.sleep(1000);
				const output = await this.manager.getOutput(sessionId);
				isWorking = isAgentWorking(agent, output);
				attempts++;

				// Show viewport every 5 seconds
				if (attempts % 5 === 0) {
					console.log(chalk.gray(`  Waiting for agent to start working... (${attempts}s)`));
					console.log(chalk.dim("  --- Current viewport ---"));
					const lines = output.split("\n").slice(-10); // Show last 10 lines
					for (const line of lines) {
						console.log(chalk.dim(`  ${line}`));
					}
					console.log(chalk.dim("  ------------------------"));
				}
			}

			if (isWorking) {
				console.log(chalk.green(`  Agent is working`));

				// Wait for completion (monitor for marker disappearing or timeout)
				let stillWorking = true;
				let workTime = 0;
				const maxWorkTime = 300; // 5 minutes max

				while (stillWorking && workTime < maxWorkTime) {
					await this.sleep(5000); // Check every 5 seconds
					workTime += 5;

					const output = await this.manager.getOutput(sessionId);
					stillWorking = isAgentWorking(agent, output);

					// Show progress every 30 seconds
					console.log(chalk.gray(`  Still working... (${workTime}s)`));
					console.log(chalk.dim("  --- Current viewport ---"));
					const lines = output.split("\n").slice(-15); // Show last 15 lines
					for (const line of lines) {
						console.log(chalk.dim(`  ${line}`));
					}
					console.log(chalk.dim("  ------------------------"));
				}

				console.log(chalk.gray(`  Work completed after ${workTime}s`));

				// Get cost/usage
				console.log(chalk.gray(`  Getting cost information...`));
				await this.manager.sendInput(sessionId, `${agent.costCommand}\r`);
				await this.sleep(2000);

				// Capture all output formats
				const scrollBuffer = await this.manager.getOutput(sessionId);
				const streamClean = await this.manager.getStream(sessionId, { strip_ansi: true });
				const streamWithAnsi = await this.manager.getStream(sessionId, { strip_ansi: false });

				// Save scrollbuffer (rendered terminal view)
				const scrollBufferFile = outputFile.replace(".log", "-scrollbuffer.txt");
				writeFileSync(scrollBufferFile, scrollBuffer);

				// Save clean stream (no ANSI codes)
				const streamFile = outputFile.replace(".log", "-stream.txt");
				writeFileSync(streamFile, streamClean);

				// Save stream with ANSI codes
				const streamAnsiFile = outputFile.replace(".log", "-stream-ansi.txt");
				writeFileSync(streamAnsiFile, streamWithAnsi);

				console.log(chalk.green(`  Saved outputs:`));
				console.log(chalk.gray(`    Scrollbuffer: ${scrollBufferFile}`));
				console.log(chalk.gray(`    Stream (clean): ${streamFile}`));
				console.log(chalk.gray(`    Stream (ANSI): ${streamAnsiFile}`));
			} else {
				console.log(chalk.red(`  Agent failed to start working`));
				const output = await this.manager.getOutput(sessionId);
				console.log(chalk.dim("  --- Final viewport ---"));
				const lines = output.split("\n");
				for (const line of lines) {
					console.log(chalk.dim(`  ${line}`));
				}
				console.log(chalk.dim("  ----------------------"));
				writeFileSync(outputFile, `ERROR: Agent failed to start working\n\n${output}`);
			}

			// Clean up
			await this.manager.stop(sessionId);
		} catch (error) {
			console.error(chalk.red(`  Error: ${error}`));
			writeFileSync(outputFile, `ERROR: ${error}\n`);

			// Try to clean up
			try {
				await this.manager.stop(sessionId);
			} catch {
				// Ignore cleanup errors
			}
		} finally {
			// Always cleanup configs
			await configManager.cleanup();

			// Run tool-specific cleanup
			if (tool.config.cleanup) {
				console.log(chalk.gray(`  Running ${toolId} cleanup...`));
				try {
					execSync(tool.config.cleanup, { stdio: "ignore", shell: "/bin/bash" });
				} catch {
					// Ignore cleanup errors
				}
			}
		}
	}

	/**
	 * Run all evaluations
	 */
	async runAll(): Promise<void> {
		// Load tasks and tools
		const tasks = this.loadTasks();
		const tools = this.loadTools();

		console.log(chalk.bold.white("Starting Evaluation Suite"));
		console.log(chalk.gray(`Output directory: ${this.config.outputDir}`));
		console.log(
			chalk.gray(`Tasks: ${tasks.size} task${tasks.size !== 1 ? "s" : ""} (${Array.from(tasks.keys()).join(", ")})`),
		);
		console.log(
			chalk.gray(`Tools: ${tools.size} tool${tools.size !== 1 ? "s" : ""} (${Array.from(tools.keys()).join(", ")})`),
		);
		console.log(chalk.gray(`Agents: ${this.config.agents.join(", ")}`));

		const totalEvals = this.config.agents.length * tasks.size * tools.size;
		console.log(chalk.gray(`Total evaluations: ${totalEvals}\n`));

		let completed = 0;
		for (const agentId of this.config.agents) {
			const agent = AGENTS[agentId];
			if (!agent) {
				console.log(chalk.yellow(`Warning: Unknown agent: ${agentId}`));
				continue;
			}

			for (const [taskId, taskContent] of tasks) {
				for (const [toolId, tool] of tools) {
					try {
						await this.runEval(agent, taskId, taskContent, toolId, tool);
						completed++;
						console.log(chalk.dim(`Progress: ${completed}/${totalEvals}`));
					} catch (error) {
						console.error(chalk.red(`Failed ${agent.name}-${taskId}-${toolId}:`), error);
					}
				}
			}
		}

		console.log(chalk.bold.green(`\nEvaluation complete! ${completed}/${totalEvals} successful`));

		// Final cleanup - run all tool cleanups
		console.log(chalk.gray("\nRunning final cleanup..."));
		const allTools = this.loadTools(); // Reload to get all tools for cleanup
		for (const [toolId, tool] of allTools) {
			if (tool.config.cleanup) {
				console.log(chalk.gray(`  Cleaning up ${toolId}...`));
				try {
					execSync(tool.config.cleanup, { stdio: "ignore", shell: "/bin/bash" });
				} catch {
					// Ignore cleanup errors
				}
			}
		}

		// Clean up terminal manager
		await this.manager.stopAll();
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
