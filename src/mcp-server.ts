import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Args } from "./messages.js";
import { TerminalServerClient } from "./terminal-client.js";

export async function runMCPServer(): Promise<void> {
	const serverClient = new TerminalServerClient();

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
  Send prompt with auto-submit: {"action": "stdin", "id": "proc-123", "data": "Write a test for main.py", "submit": true}
  Send without submit: {"action": "stdin", "id": "proc-123", "data": "partial input"}
  Manual Enter key: {"action": "stdin", "id": "proc-123", "data": "\\r"}
  Stop process: {"action": "stop", "id": "proc-abc123"}
  Stop ALL processes: {"action": "stop"}
  Get terminal screen: {"action": "stdout", "id": "proc-abc123", "lines": 50}
  Get raw stream (for logs/builds): {"action": "stream", "id": "proc-abc123", "since_last": true}
  Get terminal size: {"action": "term-size", "id": "proc-abc123"}
  List processes: {"action": "list"}

Output modes:
  - stdout: Returns rendered terminal screen with scrollback (use for TUIs, REPLs, debuggers). If scrollback > viewport, the TUI may handle scrolling - try sending Page Up/Down (\\u001b[5~ / \\u001b[6~) via stdin to navigate
  - stream: Returns raw output with ANSI codes stripped by default (use for logs, builds, incremental monitoring). Set strip_ansi: false to keep ANSI codes

Interactive CLI usage:
  - Use submit: true to automatically append Enter key (\\r) to your input
  - Omit submit or set to false for manual control

Interactive examples:
  Claude: start → stdin "say hello" with submit: true → stdout → stop
  Python: start "python3 -i" → stdin "print('hi')" with submit: true → stdout
  LLDB: start "lldb ./app" → stdin "run" with submit: true → stdout

Note: Commands are executed via bash -c wrapper. Aliases won't work - use absolute paths.`,
				inputSchema: {
					type: "object",
					properties: {
						args: {
							type: "object",
							properties: {
								action: {
									type: "string",
									enum: ["start", "stop", "stdout", "stdin", "list", "stream", "term-size"],
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
								name: {
									type: "string",
									description: "Human-readable name for the session (optional for 'start' action)",
								},
								id: {
									type: "string",
									description:
										"Process ID (required for 'stdout', 'stdin', 'stream', 'term-size' actions; optional for 'stop' - if omitted, stops all processes)",
								},
								data: {
									type: "string",
									description: "Data to send to stdin (required for 'stdin' action)",
								},
								submit: {
									type: "boolean",
									description:
										"Automatically append Enter key (\\r) to the input (optional, defaults to false)",
								},
								lines: {
									type: "number",
									description: "Number of lines to retrieve (optional for 'stdout' action)",
								},
								since_last: {
									type: "boolean",
									description:
										"Only return output since last stream read (optional for 'stream' action, defaults to false)",
								},
								strip_ansi: {
									type: "boolean",
									description:
										"Strip ANSI escape codes from output (optional for 'stream' action, defaults to true)",
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
		const args = request.params.arguments?.args as Args;
		if (!args || typeof args !== "object") {
			throw new Error("Invalid arguments: expected JSON object");
		}

		switch (args.action) {
			case "start": {
				if (!args.command) throw new Error("Missing required field: command");
				const id = await serverClient.request("start", args);
				return {
					content: [
						{
							type: "text",
							text: id,
						},
					],
				};
			}

			case "stop": {
				const result = await serverClient.request("stop", args);
				return {
					content: [
						{
							type: "text",
							text: result,
						},
					],
				};
			}

			case "stdout": {
				if (!args.id) throw new Error("Missing required field: id");
				const output = await serverClient.request("stdout", args);
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
				if (!args.id || args.data === undefined) {
					throw new Error("Missing required fields: id, data");
				}
				await serverClient.request("stdin", args);
				return {
					content: [],
				};
			}

			case "list": {
				const result = await serverClient.request("list", {});
				return {
					content: [
						{
							type: "text",
							text: result,
						},
					],
				};
			}

			case "stream": {
				if (!args.id) {
					throw new Error("Missing required field: id");
				}

				const output = await serverClient.request("stream", args);
				return {
					content: [
						{
							type: "text",
							text: output,
						},
					],
				};
			}

			case "term-size": {
				if (!args.id) throw new Error("Missing required field: id");
				const result = await serverClient.request("term-size", args);

				return {
					content: [
						{
							type: "text",
							text: result,
						},
					],
				};
			}
			default:
				throw new Error(`Unknown action: ${args.action}`);
		}
	});

	// Cleanup on exit
	process.on("SIGINT", async () => {
		console.error("Shutting down MCP server...");
		serverClient.close();
		process.exit(0);
	});

	// Start the server
	const transport = new StdioServerTransport();
	await server.connect(transport);
	console.error("terminalcp MCP server running on stdio");
}
