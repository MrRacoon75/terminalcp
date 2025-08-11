#!/usr/bin/env node
import { type ChildProcess, spawn } from "node:child_process";
import crypto from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Terminal as XtermTerminalType } from "@xterm/headless";
import xterm from "@xterm/headless";

// Extract Terminal class from the module
const Terminal = xterm.Terminal;

interface Process {
	id: string;
	command: string;
	process: ChildProcess;
	terminal: XtermTerminalType;
	startedAt: Date;
	rawOutput: string; // Store raw output including ANSI sequences
}

const processes = new Map<string, Process>();

// Helper to flush terminal writes
async function flushTerminal(terminal: XtermTerminalType): Promise<void> {
	return new Promise<void>((resolve) => {
		terminal.write("", () => resolve());
	});
}

const server = new Server(
	{
		name: "tuicp",
		version: "1.0.0",
	},
	{
		capabilities: {
			tools: {},
		},
	},
);

// Define the terminal tool
server.setRequestHandler(ListToolsRequestSchema, async () => ({
	tools: [
		{
			name: "terminal",
			description: `Control background processes with virtual terminals.

Examples:
  Start: {"action": "start", "command": "npm run dev"}
  Stop: {"action": "stop", "id": "proc-abc123"}
  Get output: {"action": "stdout", "id": "proc-abc123", "lines": 50}
  Get raw output: {"action": "stdout", "id": "proc-abc123", "raw": true}
  Send input: {"action": "stdin", "id": "proc-abc123", "data": "ls\\n"}
  List: {"action": "list"}

Note: Use raw: true for TUI apps (vim, htop, etc) to get ANSI sequences`,
			inputSchema: {
				type: "object",
				properties: {
					args: {
						type: "object",
						properties: {
							action: {
								type: "string",
								enum: ["start", "stop", "stdout", "stdin", "list"],
								description: "The action to perform",
							},
							command: {
								type: "string",
								description: "Command to execute (required for 'start' action)",
							},
							id: {
								type: "string",
								description: "Process ID (required for 'stop', 'stdout', 'stdin' actions)",
							},
							data: {
								type: "string",
								description: "Data to send to stdin (required for 'stdin' action)",
							},
							lines: {
								type: "number",
								description: "Number of lines to retrieve (optional for 'stdout' action)",
							},
							raw: {
								type: "boolean",
								description:
									"Return raw output with ANSI sequences (optional for 'stdout' action, default: false)",
							},
						},
						required: ["action"],
						additionalProperties: false,
					},
				},
				required: ["args"],
				additionalProperties: false,
			},
		},
	],
}));

// Handle terminal tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
	if (request.params.name !== "terminal") {
		throw new Error(`Unknown tool: ${request.params.name}`);
	}

	const args = request.params.arguments?.args as any;

	if (!args || typeof args !== "object") {
		throw new Error("Invalid arguments: expected JSON object");
	}

	const { action } = args;

	switch (action) {
		case "start": {
			const { command } = args;
			if (!command) {
				throw new Error("Missing required field: command");
			}

			const id = `proc-${crypto.randomBytes(6).toString("hex")}`;
			const terminal = new Terminal({
				cols: 80,
				rows: 24,
				scrollback: 10000,
				allowProposedApi: true,
				convertEol: true, // Convert \n to \r\n
			});

			const proc = spawn(command, {
				shell: true,
				env: { ...process.env, TERM: "xterm-256color" },
			});

			// Create process entry
			const processEntry: Process = {
				id,
				command,
				process: proc,
				terminal,
				startedAt: new Date(),
				rawOutput: "",
			};

			// Pipe stdout/stderr to terminal and capture raw output
			proc.stdout?.on("data", (data) => {
				const str = data.toString();
				processEntry.rawOutput += str;
				terminal.write(data);
			});

			proc.stderr?.on("data", (data) => {
				const str = data.toString();
				processEntry.rawOutput += str;
				terminal.write(data);
			});

			// Handle process exit
			proc.on("exit", (code, signal) => {
				const exitMsg = `\n[Process exited with code ${code}${signal ? ` (signal: ${signal})` : ""}]\n`;
				processEntry.rawOutput += exitMsg;
				terminal.write(exitMsg);
			});

			processes.set(id, processEntry);

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({ id, command, status: "started" }, null, 2),
					},
				],
			};
		}

		case "stop": {
			const { id } = args;
			if (!id) {
				throw new Error("Missing required field: id");
			}

			const proc = processes.get(id);
			if (!proc) {
				throw new Error(`Process not found: ${id}`);
			}

			proc.process.kill("SIGTERM");
			processes.delete(id);

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({ id, status: "stopped" }, null, 2),
					},
				],
			};
		}

		case "stdout": {
			const { id, lines, raw } = args;
			if (!id) {
				throw new Error("Missing required field: id");
			}

			const proc = processes.get(id);
			if (!proc) {
				throw new Error(`Process not found: ${id}`);
			}

			// If raw output is requested, return the raw output with ANSI sequences
			if (raw) {
				// If lines specified, get last N lines of raw output
				if (lines) {
					const rawLines = proc.rawOutput.split("\n");
					const startIdx = Math.max(0, rawLines.length - lines);
					const output = rawLines.slice(startIdx).join("\n");
					return {
						content: [
							{
								type: "text",
								text: output || "[No output]",
							},
						],
					};
				}
				return {
					content: [
						{
							type: "text",
							text: proc.rawOutput || "[No output]",
						},
					],
				};
			}

			// Otherwise return terminal buffer (processed output)
			// IMPORTANT: Flush the terminal first to ensure all writes are processed
			await flushTerminal(proc.terminal);

			const buffer = proc.terminal.buffer.active;
			const totalLines = buffer.length;
			const startLine = lines ? Math.max(0, totalLines - lines) : 0;

			let output = "";
			for (let i = startLine; i < totalLines; i++) {
				const line = buffer.getLine(i);
				if (line) {
					output += line.translateToString(true) + "\n";
				}
			}

			return {
				content: [
					{
						type: "text",
						text: output || "[No output]",
					},
				],
			};
		}

		case "stdin": {
			const { id, data } = args;
			if (!id || data === undefined) {
				throw new Error("Missing required fields: id, data");
			}

			const proc = processes.get(id);
			if (!proc) {
				throw new Error(`Process not found: ${id}`);
			}

			proc.process.stdin?.write(data);
			// Note: The input echo (if any) will be captured via stdout

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({ id, status: "input sent" }, null, 2),
					},
				],
			};
		}

		case "list": {
			const list = Array.from(processes.values()).map((p) => ({
				id: p.id,
				command: p.command,
				startedAt: p.startedAt.toISOString(),
				running: !p.process.killed,
			}));

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(list, null, 2),
					},
				],
			};
		}

		default:
			throw new Error(`Unknown action: ${action}`);
	}
});

// Cleanup on exit
process.on("SIGINT", () => {
	console.error("Shutting down tuicp server...");
	for (const proc of processes.values()) {
		proc.process.kill("SIGTERM");
	}
	process.exit(0);
});

// Start the server
async function main() {
	const transport = new StdioServerTransport();
	await server.connect(transport);
	console.error("tuicp MCP server running on stdio");
}

main().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
