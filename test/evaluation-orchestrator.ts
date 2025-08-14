#!/usr/bin/env npx tsx
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as readline from "node:readline";
import { fileURLToPath } from "node:url";
import { query, type SDKMessage } from "@anthropic-ai/claude-code";

const __dirname = dirname(fileURLToPath(import.meta.url));
const absolute = (path: string) => resolve(__dirname, path);
const EVAL_DIR = resolve(__dirname, "../evaluation");

// Tools and tasks from evaluation.ts
const tools = {
	terminalcp: `
    You MUST use the terminalcp tool to complete the following task.
    
    IMPORTANT: When sending input with terminalcp:
    - Send input with Enter: terminalcp stdin "input\\r"
    - The CLI interprets \\r as carriage return (Enter key)
    - Without \\r, your input will not be processed by the program
  `,
	tmux: `You must use **tmux** to complete the following task.

- **Start**: \`tmux new-session -d -s NAME 'program args'\`
- **Send input**: \`tmux send-keys -t NAME "input" C-m\`
- **Get output**: \`tmux capture-pane -t NAME -p\`
- **Get last N lines**: \`tmux capture-pane -t NAME -p -S -N\`
- **Stream/monitor**: \`tmux capture-pane -t NAME -p\` (repeat periodically)
- **Kill**: \`tmux kill-session -t NAME\`

You are free to run \`tmux --help\` if you require more information on the tool.
  `,
	screen: `You must use **screen** to complete the following task.

- **Start**: \`screen -dmS NAME -L program args\`
  - The -L flag enables logging to screenlog.0 (or screenlog.N for multiple sessions)
- **Send input**: \`screen -S NAME -X stuff $'input\\n'\` (the $'...' syntax is REQUIRED for proper escape sequences)
  - For sending Enter key: \`screen -S NAME -X stuff $'\\n'\`
  - For special keys: \`screen -S NAME -X stuff $'\\033[A'\` (up arrow)
- **Get output**:
  - Hardcopy (current screen): \`screen -S NAME -X hardcopy ./screen_output.txt && cat ./screen_output.txt\`
  - From log (all output): \`cat screenlog.0\`
  - IMPORTANT: Always specify ./ for hardcopy files to ensure they're created in current directory
- **Get last N lines**: \`tail -N screenlog.0\` or after hardcopy: \`tail -N screen_output.txt\`
- **Stream/monitor**: \`tail -f screenlog.0\`
- **Kill**: \`screen -S NAME -X quit\`

IMPORTANT: 
- Always use $'...' syntax with stuff command to properly handle escape sequences and newlines
- screenlog.0 contains all output since session start (created by -L flag)
- Hardcopy captures only what's currently visible on the screen
- Use ./filename for hardcopy to ensure files are created in current directory

You are free to run \`screen --help\` if you require more information on the tool.
  `,
	"terminalcp-cli": `
You must use **terminalcp CLI** to complete the following task.

- **Start**: \`npx tsx src/index.ts start NAME program args\`
- **Send input**: 
  - With Enter: \`npx tsx src/index.ts stdin NAME "input\\r"\`
  - Without Enter: \`npx tsx src/index.ts stdin NAME "input"\`
  - Just Enter: \`npx tsx src/index.ts stdin NAME "\\r"\`
- **Get output**: \`npx tsx src/index.ts stdout NAME\`
- **Get last N lines**: \`npx tsx src/index.ts stdout NAME N\`
- **Stream/monitor**: \`npx tsx src/index.ts stream NAME --since-last\`
- **Kill**: \`npx tsx src/index.ts stop NAME\`

IMPORTANT: Input is NOT processed until you send Enter (\\r):
- Include \\r in your input: \`npx tsx src/index.ts stdin NAME "input\\r"\`
- The CLI interprets \\r as carriage return

You are free to run \`npx tsx src/index.ts --help\` if you require more information on the tool.
  `,
};

const tasks = {
	task1: {
		title: "Debug Analysis with LLDB",
		prompt: `
The program \`evaluation/demo-buggy\` crashes when executed. Use the tool mentioned above to control LLDB to:
- Start the program under the debugger
- Identify where and why it crashes
- Examine variables, memory, and call stack
- Do NOT look at source code files
- Report the root cause of the crash

IMPORTANT: When you have successfully identified the crash reason and explained it, output exactly "TASK_COMPLETE" on its own line.
If you determine you cannot complete the task, output exactly "TASK_FAILED" on its own line.
  `,
	},
	task2: {
		title: "OpenCode Interaction",
		prompt: `
Use the tool mentioned above to control OpenCode to analyze this project:
- Start opencode with: \`opencode --model groq/gpt-oss-120b\`
- Navigate the TUI to change the model to \`anthropic/claude-sonnet-4\`
- Send this exact prompt: "Please analyze this entire project and provide a comprehensive summary including: 1) Overall purpose and description, 2) Key files and directory structure, 3) Main components and functionality, 4) Technologies used, 5) How the different parts work together"
- Wait for the complete response to be generated (wait until output stops streaming)
- Capture the COMPLETE response using your multiplexer's output method. You may have to scroll back to see the full response.

IMPORTANT: When you have successfully captured the complete analysis, output exactly "TASK_COMPLETE" on its own line.
If you determine you cannot complete the task, output exactly "TASK_FAILED" on its own line.
  `,
	},
	task3: {
		title: "Python REPL Calculations",
		prompt: `
Start a Python REPL and perform these tasks in sequence:
1. Calculate 42 * 17
2. Import math module and calculate math.factorial(10)
3. Create list comprehension: [x**2 for x in range(10)]
4. Define a function that checks if a number is prime
5. Test your prime function with the number 17
6. Exit the REPL cleanly

Capture all output and results from each step.

IMPORTANT: When you have successfully completed all steps and exited the REPL, output exactly "TASK_COMPLETE" on its own line.
If you determine you cannot complete the task, output exactly "TASK_FAILED" on its own line.
  `,
	},
};

async function setup(): Promise<Set<string>> {
	let completedEvals = new Set<string>();

	// Check if evaluation directory exists with previous results
	if (existsSync(EVAL_DIR)) {
		completedEvals = checkCompletedEvaluations();

		if (completedEvals.size > 0) {
			console.log("\n📁 Found existing evaluation directory with completed evaluations:");
			for (const completed of completedEvals) {
				console.log(`  ✅ ${completed}`);
			}

			const shouldResume = await promptUser("\nDo you want to resume from where you left off?");

			if (!shouldResume) {
				console.log("Starting fresh evaluation...");
				rmSync(EVAL_DIR, { recursive: true, force: true });
				completedEvals = new Set<string>();
			} else {
				console.log("Resuming evaluation...");
			}
		}
	}

	// Create directory if it doesn't exist
	if (!existsSync(EVAL_DIR)) {
		mkdirSync(EVAL_DIR, { recursive: true });
	}

	// Compile demo-buggy if needed
	const demoBuggyPath = absolute(`../evaluation/demo-buggy`);
	if (!existsSync(demoBuggyPath)) {
		const sourceFile = absolute("demo-buggy.c");
		if (!existsSync(sourceFile)) {
			console.error(`demo-buggy.c not found in test directory. Please ensure test/demo-buggy.c exists.`);
			process.exit(1);
		}

		try {
			console.log("Compiling demo-buggy...");
			execSync(`gcc -g -o ${demoBuggyPath} ${sourceFile}`);
		} catch (error) {
			console.error(`❌ Failed to compile demo-buggy: ${error}`);
			process.exit(1);
		}
	}

	// Generate prompt files for any missing evaluations
	for (const task of Object.keys(tasks)) {
		for (const tool of Object.keys(tools)) {
			const promptFile = `${EVAL_DIR}/${task}-${tool}-prompt.md`;
			if (!existsSync(promptFile)) {
				const prompt = `${tools[tool as keyof typeof tools]}\n\n##${tasks[task as keyof typeof tasks].title}\n\n${tasks[task as keyof typeof tasks].prompt}`;
				writeFileSync(promptFile, prompt);
			}
		}
	}

	return completedEvals;
}

async function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function claude(prompt: string, systemPrompt?: string) {
	const messages: SDKMessage[] = [];
	for await (const message of query({
		prompt,
		options: {
			customSystemPrompt: systemPrompt,
			maxTurns: 10,
			allowedTools: [],
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

function checkTaskStatus(output: string): "complete" | "failed" | "running" {
	// Check last 50 lines for completion markers (in case of scrolling)
	const lines = output.split("\n").slice(-50);
	const lastSection = lines.join("\n");

	if (lastSection.includes("TASK_COMPLETE")) {
		return "complete";
	}
	if (lastSection.includes("TASK_FAILED")) {
		return "failed";
	}
	return "running";
}

async function generateAnalysis(
	taskTitle: string,
	toolTitle: string,
	taskPrompt: string,
	fullScrollBuffer: string,
	taskStatus: "complete" | "failed" | "running",
	outputPath: string,
): Promise<void> {
	const prompt = `
Another agent was given this task:

\`\`\`
${taskPrompt}
\`\`\`

This is the agent working on that task:
\`\`\`
${fullScrollBuffer}
\`\`\`

The agent marked the task as: ${taskStatus.toUpperCase()} (look for TASK_COMPLETE or TASK_FAILED in the output)

Extract the cost section from the output above, count the number of tool calls, and analyze the performance of the agent.

Output the analysis in Markdown format with the following structure:
# ${taskTitle} - ${toolTitle}

## Cost
<extracted cost section from output>

## Metrics
- Tool Calls: [count from cost output]
- Task Success: ${taskStatus === "complete" ? "YES" : "NO"}
- Completion Time: [from cost output]

## Observations
### What went well:
[analyze performance from scrollbuffer]

### Where Claude struggled:
[analyze issues from scrollbuffer]

Write the complete analysis.md content:`;

	try {
		const analysis = await claude(prompt);
		writeFileSync(outputPath, analysis);

		if (!existsSync(outputPath)) {
			console.log("Analysis file not written, retrying...");
			const retryAnalysis = await claude(prompt);
			writeFileSync(outputPath, retryAnalysis);
		}
	} catch (error) {
		console.error(`Failed to generate analysis for ${outputPath}:`, error);
		throw error;
	}
}

function getTaskTitle(task: string): string {
	const titles = {
		task1: "Debug Analysis with LLDB",
		task2: "OpenCode Interaction",
		task3: "Python REPL Calculations",
	};
	return titles[task as keyof typeof titles] || task;
}

function checkCompletedEvaluations(): Set<string> {
	const completed = new Set<string>();
	if (!existsSync(EVAL_DIR)) {
		return completed;
	}

	const files = readdirSync(EVAL_DIR);
	// Look for analysis files to determine completion
	for (const file of files) {
		if (file.endsWith("-analysis.md")) {
			// Extract task-tool from filename (e.g., "task1-terminalcp-analysis.md" -> "task1-terminalcp")
			const match = file.match(/^(task\d+-.+)-analysis\.md$/);
			if (match) {
				completed.add(match[1]);
			}
		}
	}

	return completed;
}

async function promptUser(question: string): Promise<boolean> {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	return new Promise((resolve) => {
		rl.question(`${question} (y/n): `, (answer) => {
			rl.close();
			resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
		});
	});
}

async function runEvaluation(completedEvals: Set<string>) {
	console.log("\n=== Terminal Multiplexer Evaluation Orchestrator ===");

	// Get tasks and tools
	const taskKeys = Object.keys(tasks);
	const toolKeys = Object.keys(tools);
	console.log(`Tasks: ${taskKeys.join(", ")}`);
	console.log(`Tools: ${toolKeys.join(", ")}`);

	// Count remaining evaluations
	const totalEvals = taskKeys.length * toolKeys.length;
	const remainingEvals = totalEvals - completedEvals.size;
	console.log(`\nTotal evaluations: ${totalEvals}`);
	console.log(`Completed: ${completedEvals.size}`);
	console.log(`Remaining: ${remainingEvals}`);

	// Execute
	for (const task of taskKeys) {
		console.log(`\n=== ${task.toUpperCase()} - ${getTaskTitle(task)} ===`);

		for (const tool of toolKeys) {
			const evalKey = `${task}-${tool}`;

			// Skip if already completed
			if (completedEvals.has(evalKey)) {
				console.log(`\n--- ${evalKey} --- [SKIPPED - Already completed]`);
				continue;
			}

			console.log(`\n--- ${evalKey} --- [RUNNING]`);

			try {
				// Clean state
				console.log("Cleaning state...");
				execSync("npx tsx src/index.ts stop || true", { stdio: "ignore" });
				execSync("tmux kill-server || true", { stdio: "ignore" });
				execSync(
					'for session in $(screen -ls | grep -o "[0-9]*\\.[^ ]*"); do screen -S "$session" -X quit; done || true',
					{ stdio: "ignore" },
				);

				// Start Claude instance
				const processName = `claude-${tool}-${task}`;
				const logBasename = `${task}-${tool}`;
				const promptFile = `${EVAL_DIR}/${task}-${tool}-prompt.md`;

				console.log(`Starting ${processName}...`);
				const startCmd = `npx tsx src/index.ts start ${processName} "CLAUDE_CONFIG_DIR=${absolute("../claude-code")} ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY} npx @mariozechner/claude-trace --no-open --log ${logBasename} --run-with --dangerously-skip-permissions"`;
				execSync(startCmd);

				// Send read prompt command with Enter
				execSync(`npx tsx src/index.ts stdin ${processName} "read ${promptFile}\\r"`);

				// Monitor loop
				let taskStatus: "running" | "complete" | "failed" = "running";
				let lastOutput = "";
				let noChangeCount = 0;
				const maxNoChangeWait = 30; // 30 seconds of no change before prompting

				while (taskStatus === "running") {
					await sleep(1000); // Poll every 1 second

					try {
						const currentOutput = execSync(`npx tsx src/index.ts stdout ${processName} 30`, { encoding: "utf8" });

						if (currentOutput === lastOutput) {
							noChangeCount++;
						} else {
							noChangeCount = 0;
							lastOutput = currentOutput;
						}

						// Display current viewport
						console.log(`${"-".repeat(60)}\n${currentOutput}\n${"-".repeat(60)}\n`);

						// Check task status if Claude is not actively typing
						if (!currentOutput.includes("esc to interrupt")) {
							taskStatus = checkTaskStatus(currentOutput);
							console.log(`Task status: ${taskStatus}`);

							// If still running and no change for a while, send continue prompt
							if (taskStatus === "running" && noChangeCount >= maxNoChangeWait) {
								console.log("No output change for 30s, sending continue prompt...");
								execSync(`npx tsx src/index.ts stdin ${processName} "continue working on the task\\r"`);
								noChangeCount = 0;
							}
						}
					} catch (error) {
						console.error("Monitor error:", error);
						break;
					}
				}

				if (taskStatus === "failed") {
					console.log(`⚠️ Task marked as failed by agent`);
				}

				console.log(`Task ${taskStatus}, collecting cost...`);

				// Get cost (even for failed tasks)
				execSync(`npx tsx src/index.ts stdin ${processName} "/cost\\r"`);
				await sleep(2000); // Give more time for cost generation

				const finalOutput = execSync(`npx tsx src/index.ts stdout ${processName}`, { encoding: "utf8" });

				// Stop session
				execSync(`npx tsx src/index.ts stop ${processName}`);

				// Copy trace files from .claude-trace to evaluation directory
				console.log("Copying trace files...");
				const traceDir = absolute("../.claude-trace");
				const traceHtmlFile = `${traceDir}/${logBasename}.html`;
				const traceJsonFile = `${traceDir}/${logBasename}.json`;

				if (existsSync(traceHtmlFile)) {
					copyFileSync(traceHtmlFile, `${EVAL_DIR}/${task}-${tool}.html`);
					console.log(`  Copied ${task}-${tool}.html`);
				}
				if (existsSync(traceJsonFile)) {
					copyFileSync(traceJsonFile, `${EVAL_DIR}/${task}-${tool}.json`);
					console.log(`  Copied ${task}-${tool}.json`);
				}

				// Generate analysis
				console.log("Generating analysis...");
				const taskPrompt = execSync(`cat ${promptFile}`, { encoding: "utf8" });
				const analysisPath = `${EVAL_DIR}/${task}-${tool}-analysis.md`;

				await generateAnalysis(getTaskTitle(task), tool, taskPrompt, finalOutput, taskStatus, analysisPath);

				console.log(`✅ Completed ${task}-${tool} (status: ${taskStatus})`);
			} catch (error) {
				console.error(`❌ Failed ${task}-${tool}:`, error);
			}
		}
	}

	// Final cleanup
	console.log("\nFinal cleanup...");
	execSync("npx tsx src/index.ts stop || true", { stdio: "ignore" });
	execSync("tmux kill-server || true", { stdio: "ignore" });
	execSync('for session in $(screen -ls | grep -o "[0-9]*\\.[^ ]*"); do screen -S "$session" -X quit; done || true', {
		stdio: "ignore",
	});

	// Summary
	console.log(`\n${"=".repeat(60)}`);
	console.log("📊 EVALUATION SUMMARY");
	console.log("=".repeat(60));

	const finalCompleted = checkCompletedEvaluations();
	const newlyCompleted = [...finalCompleted].filter((x) => !completedEvals.has(x));

	console.log(`\nTotal evaluations: ${totalEvals}`);
	console.log(`Previously completed: ${completedEvals.size}`);
	console.log(`Newly completed in this run: ${newlyCompleted.length}`);
	console.log(`Total completed: ${finalCompleted.size}`);

	if (newlyCompleted.length > 0) {
		console.log("\n✅ Newly completed evaluations:");
		for (const evalKey of newlyCompleted) {
			console.log(`  - ${evalKey}`);
		}
	}

	const remaining = totalEvals - finalCompleted.size;
	if (remaining > 0) {
		console.log(`\n⚠️ Still remaining: ${remaining} evaluations`);
		const incomplete: string[] = [];
		for (const task of taskKeys) {
			for (const tool of toolKeys) {
				const evalKey = `${task}-${tool}`;
				if (!finalCompleted.has(evalKey)) {
					incomplete.push(evalKey);
				}
			}
		}
		console.log("Incomplete evaluations:");
		for (const evalKey of incomplete) {
			console.log(`  - ${evalKey}`);
		}
	} else {
		console.log("\n🎉 All evaluations complete!");
	}
}

// Main execution
const completedEvals = await setup();
try {
	await runEvaluation(completedEvals);
} catch (error) {
	console.error("Evaluation failed:", error);
	process.exit(1);
}
