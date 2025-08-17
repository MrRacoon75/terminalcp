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
	repeat?: number; // Number of times to repeat each evaluation
	parallel?: number; // Number of evaluations to run in parallel
}

interface ToolConfig {
	type: "mcp" | "cli";
	cleanup?: string;
	mcpServers?: Record<string, any>;
}

class ConfigManager {
	private createdFiles: string[] = [];

	async setupAgentConfig(agent: Agent, toolConfig: ToolConfig): Promise<string> {
		if (!agent.supportsMcp || !agent.configFiles) {
			return agent.command; // Return original command if agent doesn't support MCP
		}

		// Always create config files - either with MCP servers or empty
		for (const configFile of agent.configFiles) {
			const fullPath = resolve(process.cwd(), configFile.path);
			const dir = dirname(fullPath);

			// Create directory if needed
			if (!existsSync(dir)) {
				mkdirSync(dir, { recursive: true });
			}

			// Write config - use mcpServers from tool config or empty object
			const config = configFile.template(toolConfig.mcpServers || {});
			writeFileSync(fullPath, JSON.stringify(config, null, 2));
			this.createdFiles.push(fullPath);
		}

		return agent.command;
	}

	async cleanup() {
		// Delete all created config files
		for (const file of this.createdFiles) {
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
	private terminal: TerminalManager;

	constructor(config: EvalConfig) {
		this.config = config;
		this.terminal = new TerminalManager();

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
		// Normalize line endings
		content = content.replace(/\r\n/g, "\n");

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

	private timestampCounter = 0;

	/**
	 * Get timestamp string in yyyymmddhhmmssSSS format (with milliseconds)
	 */
	private getTimestamp(): string {
		const now = new Date();
		const year = now.getFullYear();
		const month = String(now.getMonth() + 1).padStart(2, "0");
		const day = String(now.getDate()).padStart(2, "0");
		const hours = String(now.getHours()).padStart(2, "0");
		const minutes = String(now.getMinutes()).padStart(2, "0");
		const seconds = String(now.getSeconds()).padStart(2, "0");
		const millis = String(now.getMilliseconds()).padStart(3, "0");
		// Add a counter to ensure uniqueness even if called at exact same millisecond
		const counter = String(this.timestampCounter++).padStart(3, "0");
		return `${year}${month}${day}${hours}${minutes}${seconds}${millis}${counter}`;
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
		runNumber?: number,
		totalRuns?: number,
	): Promise<void> {
		const timestamp = this.getTimestamp();
		const agentName = agent.name.toLowerCase().replace(/\s+/g, "-");
		const evalId = `${agentName}--${taskId}--${toolId}`;
		const evalIdWithTime = `${evalId}--${timestamp}`;
		const outputFile = resolve(this.config.outputDir, `${evalIdWithTime}.log`);
		const configManager = new ConfigManager();

		const runInfo = runNumber && totalRuns ? ` (run ${runNumber}/${totalRuns})` : "";
		console.log(chalk.cyan(`\nStarting: ${evalIdWithTime}${runInfo}`));

		// Extract tool name from toolId (e.g., "screen" from "screen" or "terminalcp-cli" from "terminalcp-cli")
		const toolName = toolId.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

		// Build the structured prompt
		const fullPrompt = `## Task

${taskContent}

## Tool

You must use **${toolName}** to complete this task.

${tool.instructions}

## Completion

Complete the task using only the tool specified above.
- If successful, output: TASK_COMPLETE
- If unsuccessful, output: TASK_FAILED and explain what went wrong`;

		const promptFile = resolve(this.config.outputDir, `${evalIdWithTime}-prompt.md`);
		writeFileSync(promptFile, fullPrompt);

		// Start the agent session directly with TerminalManager
		const sessionId = `eval-${evalId}-${timestamp}`;
		console.log(chalk.gray(`  Starting ${agent.name}...`));

		try {
			// Setup agent config and get potentially modified command
			const agentCommand = await configManager.setupAgentConfig(agent, tool.config);
			console.log(chalk.gray(`  Command: ${agentCommand}`));

			await this.terminal.start(agentCommand, { name: sessionId });

			// Wait for agent to initialize
			const initDelay = agent.initDelay || 3000;
			console.log(chalk.gray(`  Waiting ${initDelay}ms for initialization...`));
			await this.sleep(initDelay);

			// Send the prompt with Enter
			console.log(chalk.gray(`  Sending prompt...`));
			await this.terminal.sendInput(sessionId, `Read ${promptFile} and follow the instructions.\r`);

			// Monitor for agent working marker
			let isWorking = false;
			let attempts = 0;
			const maxAttempts = 30; // 30 seconds max wait

			while (!isWorking && attempts < maxAttempts) {
				await this.sleep(1000);
				const output = await this.terminal.getOutput(sessionId);
				isWorking = isAgentWorking(agent, output);
				attempts++;

				// Show viewport every 5 seconds
				if (attempts % 5 === 0) {
					console.log(
						chalk.gray(`  Waiting for agent to start working on ${chalk.blue(evalIdWithTime)} (${attempts}s)`),
					);
					console.log(chalk.dim("  --- Current viewport ---"));
					const lines = output.split("\n").slice(-24); // Show last 24 lines
					for (const line of lines) {
						console.log(chalk.dim(`  ${line}`));
					}
					console.log(chalk.dim("  ------------------------"));
				}
			}

			// If agent still not working after 30 seconds, send a nudge
			if (!isWorking) {
				console.log(chalk.yellow(`  Agent not responding, sending nudge...`));
				await this.terminal.sendInput(
					sessionId,
					`Please proceed with the task, or output TASK_COMPLETE/TASK_FAILED.\r`,
				);

				// Give it another 10 seconds to respond
				for (let i = 0; i < 10; i++) {
					await this.sleep(1000);
					const output = await this.terminal.getOutput(sessionId);
					isWorking = isAgentWorking(agent, output);
					if (isWorking) break;
				}
			}

			if (isWorking) {
				console.log(chalk.green(`  Agent is working`));

				// Wait for completion (monitor for marker disappearing or timeout)
				let stillWorking = true;
				let workTime = 0;
				const maxWorkTime = 600; // 5 minutes max

				let firstProgress = true;
				let notWorkingCount = 0; // Count how many times we've seen the agent not working
				const graceSeconds = 1; // Grace period in seconds

				while ((stillWorking || notWorkingCount < graceSeconds) && workTime < maxWorkTime) {
					await this.sleep(1000); // Check every second
					workTime += 1;

					const output = await this.terminal.getOutput(sessionId);
					const currentlyWorking = isAgentWorking(agent, output);

					// Track if agent stopped working (for grace period)
					if (!currentlyWorking) {
						notWorkingCount++;
					} else {
						notWorkingCount = 0; // Reset if working again
					}

					// Update stillWorking based on grace period
					stillWorking = currentlyWorking || notWorkingCount < graceSeconds;

					// Clear previous output if not first iteration
					if (!firstProgress) {
						// Move cursor up to start of previous progress output (2 header lines + 24 viewport lines + 1 footer line = 27 lines)
						process.stdout.write("\x1b[27A");
						// Clear from cursor to end of screen
						process.stdout.write("\x1b[J");
					}
					firstProgress = false;

					// Show progress every second
					console.log(chalk.gray(`  Still working on ${chalk.blue(evalIdWithTime)} (${workTime}s)`));
					console.log(chalk.dim("  --- Current viewport ---"));
					const lines = output.split("\n").slice(-24); // Show last 24 lines
					for (const line of lines) {
						console.log(chalk.dim(`  ${line}`));
					}
					console.log(chalk.dim("  ------------------------"));
				}

				const timedOut = workTime >= maxWorkTime;
				if (timedOut) {
					console.log(chalk.yellow(`  ⚠ Work timed out on ${chalk.blue(evalIdWithTime)} after ${workTime}s`));
				} else {
					console.log(chalk.gray(`  Work completed on ${chalk.blue(evalIdWithTime)} after ${workTime}s`));
				}

				// Get cost/usage
				console.log(chalk.gray(`  Getting cost information...`));
				await this.terminal.sendInput(sessionId, `${agent.costCommand}\r`);
				await this.sleep(1000); // Give time for cost command to complete

				// Capture all output formats (including cost info)
				let scrollBuffer = await this.terminal.getOutput(sessionId);
				let streamClean = await this.terminal.getStream(sessionId, { strip_ansi: true });
				let streamWithAnsi = await this.terminal.getStream(sessionId, { strip_ansi: false });

				// Show final viewport with cost info
				console.log(chalk.gray(`  Final output for ${chalk.blue(evalIdWithTime)}:`));
				console.log(chalk.dim("  --- Final viewport (with cost) ---"));
				const finalLines = scrollBuffer.split("\n").slice(-24);
				for (const line of finalLines) {
					console.log(chalk.dim(`  ${line}`));
				}
				console.log(chalk.dim("  ----------------------------------"));

				// Add timeout indicator if needed
				if (timedOut) {
					const timeoutMsg = "\n\n[EVALUATION TIMEOUT: Task exceeded 300 second limit]";
					scrollBuffer += timeoutMsg;
					streamClean += timeoutMsg;
					streamWithAnsi += timeoutMsg;
				}

				// Check for task completion markers
				const taskComplete = streamClean.includes("TASK_COMPLETE");
				const taskFailed = streamClean.includes("TASK_FAILED");

				if (taskComplete) {
					console.log(chalk.green(`  ✓ Task completed successfully`));
				} else if (taskFailed) {
					console.log(chalk.yellow(`  ⚠ Task marked as failed by agent`));
				} else {
					console.log(chalk.red(`  ✗ No completion marker found`));
				}

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
				console.log(chalk.red(`  Agent failed to start working on ${chalk.blue(evalIdWithTime)}`));
				const output = await this.terminal.getOutput(sessionId);
				console.log(chalk.dim("  --- Final viewport ---"));
				const lines = output.split("\n");
				for (const line of lines) {
					console.log(chalk.dim(`  ${line}`));
				}
				console.log(chalk.dim("  ----------------------"));
				writeFileSync(outputFile, `ERROR: Agent failed to start working\n\n${output}`);
			}

			// Clean up
			await this.terminal.stop(sessionId);
		} catch (error: any) {
			console.error(chalk.red(`  Error: ${error}`));

			// Try to get output for debugging
			try {
				const output = await this.terminal.getOutput(sessionId);
				console.log(chalk.gray(`  Error output for ${chalk.blue(evalIdWithTime)}:`));
				console.log(chalk.dim("  --- Session output ---"));
				const lines = output.split("\n").slice(-25); // Show last 25 lines
				for (const line of lines) {
					console.log(chalk.dim(`  ${line}`));
				}
				console.log(chalk.dim("  ----------------------"));
				writeFileSync(outputFile, `ERROR: ${error}\n\n${output}`);
			} catch {
				writeFileSync(outputFile, `ERROR: ${error}\n`);
			}

			// Try to clean up
			try {
				await this.terminal.stop(sessionId);
			} catch {
				// Ignore cleanup errors
			}

			// Re-throw to mark as failed
			throw error;
		} finally {
			// Always cleanup configs
			await configManager.cleanup();

			// Run tool-specific cleanup only in non-parallel mode
			if (tool.config.cleanup && (!this.config.parallel || this.config.parallel === 1)) {
				console.log(chalk.gray(`  Running ${toolId} cleanup...`));
				try {
					execSync(tool.config.cleanup, { stdio: "ignore", shell: "/bin/bash" });
				} catch {
					// Ignore cleanup errors
				}
			}
			// In parallel mode, cleanup is handled at batch level
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

		const repeat = this.config.repeat || 1;
		const parallel = this.config.parallel || 1;
		const totalEvals = this.config.agents.length * tasks.size * tools.size * repeat;
		console.log(
			chalk.gray(
				`Total evaluations: ${totalEvals} (${repeat} repetition${repeat !== 1 ? "s" : ""}, ${parallel} parallel)\n`,
			),
		);

		// Build list of all evaluation tasks
		const evalTasks: Array<{
			agent: Agent;
			taskId: string;
			taskContent: string;
			toolId: string;
			tool: { config: ToolConfig; instructions: string };
			run: number;
		}> = [];

		for (const agentId of this.config.agents) {
			const agent = AGENTS[agentId];
			if (!agent) {
				console.log(chalk.yellow(`Warning: Unknown agent: ${agentId}`));
				continue;
			}

			for (const [taskId, taskContent] of tasks) {
				for (const [toolId, tool] of tools) {
					for (let run = 1; run <= repeat; run++) {
						evalTasks.push({ agent, taskId, taskContent, toolId, tool, run });
					}
				}
			}
		}

		// Run evaluations with parallelism
		let completed = 0;
		let failed = 0;
		const results: Array<{ success: boolean; error?: any }> = [];

		for (let i = 0; i < evalTasks.length; i += parallel) {
			const batch = evalTasks.slice(i, i + parallel);
			const batchPromises = batch.map(async (task) => {
				try {
					await this.runEval(task.agent, task.taskId, task.taskContent, task.toolId, task.tool, task.run, repeat);
					return { success: true, toolId: task.toolId, tool: task.tool };
				} catch (error) {
					return { success: false, error, toolId: task.toolId, tool: task.tool };
				}
			});

			const batchResults = await Promise.all(batchPromises);

			// Update counters and show progress
			for (let j = 0; j < batchResults.length; j++) {
				const result = batchResults[j];
				const task = batch[j];
				if (result.success) {
					completed++;
				} else {
					failed++;
					console.error(
						chalk.red(`Failed ${task.agent.name}-${task.taskId}-${task.toolId} (run ${task.run}/${repeat})`),
					);
				}
			}

			console.log(chalk.dim(`Progress: ${completed + failed}/${totalEvals} (${completed} successful)`));

			// Run cleanup for all tools used in this batch
			if (parallel > 1) {
				const toolsToClean = new Set<string>();
				for (const result of batchResults) {
					if (result.tool.config.cleanup) {
						toolsToClean.add(result.toolId);
					}
				}

				for (const toolId of toolsToClean) {
					const tool = tools.get(toolId);
					if (tool?.config.cleanup) {
						console.log(chalk.gray(`  Cleaning up ${toolId} after batch...`));
						try {
							execSync(tool.config.cleanup, { stdio: "ignore", shell: "/bin/bash" });
						} catch {
							// Ignore cleanup errors
						}
					}
				}
			}
		}

		if (failed > 0) {
			console.log(
				chalk.bold.yellow(`\nEvaluation complete! ${completed}/${totalEvals} successful, ${failed} failed`),
			);
		} else {
			console.log(chalk.bold.green(`\nEvaluation complete! ${completed}/${totalEvals} successful`));
		}

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
		await this.terminal.stopAll();
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
