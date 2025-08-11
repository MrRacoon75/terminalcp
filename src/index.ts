#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { ProcessManager } from "./process-manager.js";

const processManager = new ProcessManager();

const server = new Server(
	{
		name: "terminalcp",
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
			description: `Control background processes with virtual terminals. IMPORTANT: Always clean up processes with "stop" action when done.

Examples:
  Start dev server: {"action": "start", "command": "npm run dev", "cwd": "/path/to/project"}
  Start Claude: {"action": "start", "command": "/Users/username/.claude/local/claude --dangerously-skip-permissions"}
  Start Gemini: {"action": "start", "command": "gemini"}
  Send prompt: {"action": "stdin", "id": "proc-123", "data": "Write a test for main.py"}
  Submit with Enter: {"action": "stdin", "id": "proc-123", "data": "\\r"}
  Stop process: {"action": "stop", "id": "proc-abc123"}
  Get output: {"action": "stdout", "id": "proc-abc123", "lines": 50}
  List processes: {"action": "list"}

IMPORTANT for interactive CLIs (Claude, Gemini, Python, etc):
  - Send text and Enter key SEPARATELY for proper submission
  - Send text: {"action": "stdin", "id": "proc-123", "data": "say hello"}
  - Then submit: {"action": "stdin", "id": "proc-123", "data": "\\r"}
  - The \\r (carriage return) MUST be sent as a separate stdin call

Interactive examples:
  Claude: start → stdin "say hello" → stdin "\\r" → stdout → stop
  Python: start "python3 -i" → stdin "print('hi')" → stdin "\\r" → stdout
  LLDB: start "lldb ./app" → stdin "run" → stdin "\\r" → stdout

Note: Commands are executed via bash -c wrapper. Aliases won't work - use absolute paths.`,
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
							cwd: {
								type: "string",
								description: "Working directory for the process (optional for 'start' action)",
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
			const { command, cwd } = args;
			if (!command) {
				throw new Error("Missing required field: command");
			}

			const id = await processManager.start(command, cwd);

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify({ id, command, status: "started", cwd: cwd || process.cwd() }, null, 2),
					},
				],
			};
		}

		case "stop": {
			const { id } = args;
			if (!id) {
				throw new Error("Missing required field: id");
			}

			await processManager.stop(id);

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

			const output = await processManager.getOutput(id, { lines });

			return {
				content: [
					{
						type: "text",
						text: output,
					},
				],
			};
		}

		case "stdin": {
			const { id, data } = args;
			if (!id || data === undefined) {
				throw new Error("Missing required fields: id, data");
			}

			await processManager.sendInput(id, data);

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
			const list = processManager.listProcesses();

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
process.on("SIGINT", async () => {
	console.error("Shutting down terminalcp server...");
	await processManager.stopAll();
	process.exit(0);
});

// Start the server
async function main() {
	const transport = new StdioServerTransport();
	await server.connect(transport);
	console.error("terminalcp MCP server running on stdio");
}

main().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
