#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { AttachClient } from "./attach-client.js";
import { TerminalServerClient } from "./terminal-client.js";

// Parse CLI arguments
const args = process.argv.slice(2);

// Check if running in CLI mode
if (args.length > 0) {
	// CLI mode

	if (args[0] === "ls" || args[0] === "list") {
		// List sessions
		const client = new AttachClient();
		client
			.listSessions()
			.then(() => process.exit(0))
			.catch((err) => {
				console.error(err.message);
				process.exit(1);
			});
	} else if (args[0] === "start") {
		// Start a new session
		if (args.length < 3) {
			console.error("Usage: terminalcp start <session-id> <command> [args...]");
			process.exit(1);
		}
		const sessionId = args[1];
		const command = args.slice(2).join(" ");

		const serverClient = new TerminalServerClient();
		serverClient
			.request("start", { command, name: sessionId })
			.then((id) => {
				console.log(`Started session: ${id}`);
				process.exit(0);
			})
			.catch((err) => {
				console.error("Failed to start session:", err.message);
				process.exit(1);
			});
	} else if (args[0] === "stop") {
		// Stop a session
		const sessionId = args[1]; // Optional
		const serverClient = new TerminalServerClient();
		serverClient
			.request("stop", { id: sessionId })
			.then((result) => {
				console.log(result);
				process.exit(0);
			})
			.catch((err) => {
				console.error("Failed to stop session:", err.message);
				process.exit(1);
			});
	} else if (args[0] === "stdout") {
		// Get stdout from a session
		if (!args[1]) {
			console.error("Usage: terminalcp stdout <id> [lines]");
			process.exit(1);
		}
		const serverClient = new TerminalServerClient();
		const lines = args[2] ? parseInt(args[2]) : undefined;
		serverClient
			.request("stdout", { id: args[1], lines })
			.then((output) => {
				process.stdout.write(output);
				process.exit(0);
			})
			.catch((err) => {
				console.error("Failed to get stdout:", err.message);
				process.exit(1);
			});
	} else if (args[0] === "stream") {
		// Get raw stream from a session
		if (!args[1]) {
			console.error("Usage: terminalcp stream <id> [--since-last] [--with-ansi]");
			process.exit(1);
		}
		const serverClient = new TerminalServerClient();
		const since_last = args.includes("--since-last");
		const strip_ansi = !args.includes("--with-ansi");
		serverClient
			.request("stream", { id: args[1], since_last, strip_ansi })
			.then((output) => {
				process.stdout.write(output);
				process.exit(0);
			})
			.catch((err) => {
				console.error("Failed to get stream:", err.message);
				process.exit(1);
			});
	} else if (args[0] === "stdin") {
		// Send stdin to a session
		if (args.length < 3) {
			console.error("Usage: terminalcp stdin <id> <data> [--submit]");
			process.exit(1);
		}
		const serverClient = new TerminalServerClient();
		const submit = args.includes("--submit");
		const dataArgs = args.slice(2).filter((arg) => arg !== "--submit");
		const data = dataArgs.join(" ");
		serverClient
			.request("stdin", { id: args[1], data, submit })
			.then(() => {
				process.exit(0);
			})
			.catch((err) => {
				console.error("Failed to send stdin:", err.message);
				process.exit(1);
			});
	} else if (args[0] === "term-size") {
		// Get terminal size
		if (!args[1]) {
			console.error("Usage: terminalcp term-size <id>");
			process.exit(1);
		}
		const serverClient = new TerminalServerClient();
		serverClient
			.request("term-size", { id: args[1] })
			.then((result) => {
				console.log(result);
				process.exit(0);
			})
			.catch((err) => {
				console.error("Failed to get terminal size:", err.message);
				process.exit(1);
			});
	} else if (args[0] === "resize") {
		// Resize terminal
		if (args.length < 4) {
			console.error("Usage: terminalcp resize <id> <cols> <rows>");
			process.exit(1);
		}
		const serverClient = new TerminalServerClient();
		serverClient
			.request("resize", {
				id: args[1],
				cols: parseInt(args[2]),
				rows: parseInt(args[3]),
			})
			.then(() => {
				console.log("Terminal resized");
				process.exit(0);
			})
			.catch((err) => {
				console.error("Failed to resize terminal:", err.message);
				process.exit(1);
			});
	} else if (args[0] === "attach") {
		// Attach to session
		if (!args[1]) {
			console.error("Usage: terminalcp attach <id>");
			process.exit(1);
		}
		const client = new AttachClient();
		client.attach(args[1]).catch((err) => {
			console.error(err.message);
			process.exit(1);
		});
	} else if (args[0] === "kill-server") {
		// Kill the terminal server
		const serverClient = new TerminalServerClient();
		serverClient
			.request("kill-server")
			.then(() => {
				console.log("Server killed");
				process.exit(0);
			})
			.catch((err) => {
				console.error("Failed to kill server:", err.message);
				process.exit(1);
			});
	} else if (args[0] === "--server") {
		// Run in server mode (internal use)
		import("./server.js").then(({ TerminalServer }) => {
			const server = new TerminalServer();
			server.start().catch((err) => {
				console.error("Failed to start server:", err);
				process.exit(1);
			});
		});
	} else {
		// Try to attach to the first argument as a session id
		const client = new AttachClient();
		client.attach(args[0]).catch((err) => {
			console.error(`Unknown command or session: ${args[0]}`);
			console.error("Usage:");
			console.error("  terminalcp                       - Start MCP server");
			console.error("  terminalcp ls                    - List active sessions");
			console.error("  terminalcp start <id> <cmd>      - Start a new session");
			console.error("  terminalcp stop [id]             - Stop session(s)");
			console.error("  terminalcp attach <id>           - Attach to a session");
			console.error("  terminalcp stdout <id> [lines]   - Get terminal output");
			console.error("  terminalcp stream <id> [opts]    - Get raw stream (--since-last, --with-ansi)");
			console.error("  terminalcp stdin <id> <data>     - Send input (--submit adds Enter)");
			console.error("  terminalcp term-size <id>        - Get terminal size");
			console.error("  terminalcp resize <id> <c> <r>   - Resize terminal");
			console.error("  terminalcp kill-server           - Kill the terminal server");
			process.exit(1);
		});
	}
} else {
	// MCP server mode
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

		// biome-ignore lint/suspicious/noExplicitAny: MCP arguments are dynamically typed
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

				const id = await serverClient.request("start", { command, cwd, name });

				// Minimal response - just return the ID
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
				const { id } = args;
				const result = await serverClient.request("stop", { id });

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
				const { id, lines } = args;
				if (!id) {
					throw new Error("Missing required field: id");
				}

				const output = await serverClient.request("stdout", { id, lines });

				// Return raw output string directly
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

				await serverClient.request("stdin", { id, data, submit });

				// Minimal response - no content needed for stdin
				return {
					content: [],
				};
			}

			case "list": {
				const result = await serverClient.request("list");

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
				const { id, since_last, strip_ansi } = args;
				if (!id) {
					throw new Error("Missing required field: id");
				}

				const output = await serverClient.request("stream", { id, since_last, strip_ansi });

				// Return raw stream output directly
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

				const result = await serverClient.request("term-size", { id });

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
				throw new Error(`Unknown action: ${action}`);
		}
	});

	// Cleanup on exit
	process.on("SIGINT", async () => {
		console.error("Shutting down MCP server...");
		serverClient.close();
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
