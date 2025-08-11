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
}

const processes = new Map<string, Process>();

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
  Send input: {"action": "stdin", "id": "proc-abc123", "data": "ls\\n"}
  List: {"action": "list"}`,
			inputSchema: {
				type: "object",
				properties: {
					args: {
						type: "object",
						required: true,
					},
				},
				required: ["args"],
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
			});

			const proc = spawn(command, {
				shell: true,
				env: { ...process.env, TERM: "xterm-256color" },
			});

			// Pipe stdout/stderr to terminal
			proc.stdout?.on("data", (data) => {
				terminal.write(data);
			});

			proc.stderr?.on("data", (data) => {
				terminal.write(data);
			});

			// Handle process exit
			proc.on("exit", (code, signal) => {
				terminal.write(`\n[Process exited with code ${code}${signal ? ` (signal: ${signal})` : ""}]\n`);
			});

			processes.set(id, {
				id,
				command,
				process: proc,
				terminal,
				startedAt: new Date(),
			});

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
			const { id, lines } = args;
			if (!id) {
				throw new Error("Missing required field: id");
			}

			const proc = processes.get(id);
			if (!proc) {
				throw new Error(`Process not found: ${id}`);
			}

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
