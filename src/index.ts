#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { ProcessManager } from "./process-manager.js";

const processManager = new ProcessManager();

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
  Start dev server: {"action": "start", "command": "npm run dev"}
  Run debugger: {"action": "start", "command": "lldb ./myapp"}
  Start Claude: {"action": "start", "command": "claude"}
  Stop process: {"action": "stop", "id": "proc-abc123"}
  Get output: {"action": "stdout", "id": "proc-abc123", "lines": 50}
  Send command: {"action": "stdin", "id": "proc-abc123", "data": "break main\\n"}
  List processes: {"action": "list"}

Interactive examples:
  LLDB: start → stdin "run\\n" → stdin "bt\\n" → stdout
  Claude: start → stdin "say hello\\n" → stdout
  Python: start "python3 -i" → stdin "print('hi')\\n" → stdout`,
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

			const id = await processManager.start(command);

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
	console.error("Shutting down tuicp server...");
	await processManager.stopAll();
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
