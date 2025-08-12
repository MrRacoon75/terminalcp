#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { TerminalClient } from "./client.js";
import { ProcessManager } from "./process-manager.js";

// Parse CLI arguments
const args = process.argv.slice(2);

// Check if running in CLI mode
if (args.length > 0) {
	// CLI mode
	const client = new TerminalClient();

	if (args[0] === "ls" || args[0] === "list") {
		// List sessions
		client.listSessions().then(() => process.exit(0));
	} else if (args[0] === "attach") {
		// Attach to session
		if (!args[1]) {
			console.error("Usage: terminalcp attach <name|id>");
			process.exit(1);
		}
		client.attach(args[1]).catch(() => process.exit(1));
	} else {
		// Try to attach to the first argument as a session name/id
		client.attach(args[0]).catch(() => {
			console.error(`Unknown command or session: ${args[0]}`);
			console.error("Usage:");
			console.error("  terminalcp              - Start MCP server");
			console.error("  terminalcp ls           - List active sessions");
			console.error("  terminalcp attach <id>  - Attach to a session");
			process.exit(1);
		});
	}
} else {
	// MCP server mode
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
  - stdout: Returns rendered terminal screen with scrollback (use for TUIs, REPLs, debuggers)
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

		const args = request.params.arguments?.args as any;

		if (!args || typeof args !== "object") {
			throw new Error("Invalid arguments: expected JSON object");
		}

		const { action } = args;

		switch (action) {
			case "start": {
				const { command, cwd, name } = args;
				if (!command) {
					throw new Error("Missing required field: command");
				}

				const id = await processManager.start(command, { cwd, name });
				const processes = processManager.listProcesses();
				const processInfo = processes.find((p) => p.id === id);

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									id,
									name: processInfo?.name,
									command,
									status: "started",
									cwd: cwd || process.cwd(),
									socketPath: processInfo?.socketPath,
								},
								null,
								2,
							),
						},
					],
				};
			}

			case "stop": {
				const { id } = args;

				if (!id) {
					// Stop all processes if no ID provided
					const allProcesses = processManager.listProcesses();
					const stoppedIds = [];
					for (const proc of allProcesses) {
						await processManager.stop(proc.id);
						stoppedIds.push(proc.id);
					}

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(
									{
										status: "all stopped",
										count: stoppedIds.length,
										ids: stoppedIds,
									},
									null,
									2,
								),
							},
						],
					};
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
				const { id, data, submit } = args;
				if (!id || data === undefined) {
					throw new Error("Missing required fields: id, data");
				}

				const inputData = submit ? data + "\r" : data;
				await processManager.sendInput(id, inputData);

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

			case "stream": {
				const { id, since_last, strip_ansi } = args;
				if (!id) {
					throw new Error("Missing required field: id");
				}

				const output = await processManager.getStream(id, { since_last, strip_ansi });

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
				const { id } = args;
				if (!id) {
					throw new Error("Missing required field: id");
				}

				const size = processManager.getTerminalSize(id);

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(size, null, 2),
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
}
