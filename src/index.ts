#!/usr/bin/env node
import { AttachClient } from "./attach-client.js";
import { runMCPServer } from "./mcp-server.js";
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
		import("./terminal-server.js").then(({ TerminalServer }) => {
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
	runMCPServer().catch((error) => {
		console.error("Fatal error:", error);
		process.exit(1);
	});
}
