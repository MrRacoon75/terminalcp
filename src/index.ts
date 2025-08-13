#!/usr/bin/env node
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { AttachClient } from "./attach-client.js";
import { runMCPServer } from "./mcp-server.js";
import { TerminalServerClient as TerminalClient } from "./terminal-client.js";
import { TerminalServer } from "./terminal-server.js";

// Read version from package.json
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.join(__dirname, "..", "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
const CLIENT_VERSION = packageJson.version;

// Parse CLI arguments
const args = process.argv.slice(2);

// Show help if no arguments
if (args.length === 0) {
	console.log(`terminalcp - Terminal Control Protocol
A centralized terminal session manager with MCP server support

USAGE:
  terminalcp --mcp                       Start as MCP server for Claude Desktop
  terminalcp --server                    Start the terminal server daemon
  terminalcp <command> [options]         Run a CLI command

COMMANDS:
  list, ls                               List all active sessions
  start <id> <command>                   Start a new named session
  stop [id]                              Stop session(s) (all if no id given)
  attach <id>                            Attach to a session interactively
  stdout <id> [lines]                    Get terminal output (rendered view)
  stream <id> [opts]                     Get raw output stream
  stdin <id> <data> [--submit]           Send input to a session
  resize <id> <cols> <rows>              Resize terminal dimensions
  term-size <id>                         Get terminal size
  version                                Show client and server versions
  kill-server                            Shutdown the terminal server

EXAMPLES:
  # Start as MCP server for Claude Desktop
  terminalcp --mcp

  # Start a development server
  terminalcp start dev-server "npm run dev"
  
  # Start an interactive Python session
  terminalcp start python "python3 -i"
  terminalcp stdin python "print('Hello')" --submit
  terminalcp stdout python
  
  # Debug with lldb
  terminalcp start debug "lldb ./myapp"
  terminalcp stdin debug "b main" --submit
  terminalcp stdin debug "run" --submit
  terminalcp attach debug  # Interactive debugging
  
  # Monitor build output
  terminalcp start build "npm run build"
  terminalcp stream build --since-last
  
  # Attach to interact with a session
  terminalcp attach python
  # Press Ctrl+B to detach

OPTIONS:
  --mcp                                  Run as MCP server on stdio
  --server                               Run as terminal server daemon
  --since-last                           Only show new output (stream)
  --with-ansi                            Keep ANSI codes (stream)
  --submit                               Add Enter key after input (stdin)

CLAUDE DESKTOP CONFIGURATION:
  Add to claude_desktop_config.json:
  {
    "mcpServers": {
      "terminalcp": {
        "command": "npx",
        "args": ["-y", "@mariozechner/terminalcp", "--mcp"]
      }
    }
  }

For more information: https://github.com/badlogic/terminalcp`);
	process.exit(0);
}

// Check if running in MCP server mode
if (args[0] === "--mcp") {
	// MCP server mode
	runMCPServer().catch((error) => {
		console.error("Fatal error:", error);
		process.exit(1);
	});
} else if (args.length > 0) {
	if (args[0] === "ls" || args[0] === "list") {
		const client = new TerminalClient();
		client
			.request({ action: "list" })
			.then((response) => {
				const lines = response.split("\n").filter((line: string) => line.trim());
				if (lines.length === 0) {
					console.log("No active sessions");
				} else {
					for (const line of lines) {
						const [id, status, cwd, ...commandParts] = line.split(" ");
						const command = commandParts.join(" ");
						console.log(`  ${id}`);
						console.log(`    Status: ${status}`);
						console.log(`    CWD: ${cwd}`);
						console.log(`    Command: ${command}`);
						console.log();
					}
				}
				process.exit(0);
			})
			.catch((err) => {
				console.error(err.message);
				process.exit(1);
			});
	} else if (args[0] === "start") {
		if (args.length < 3) {
			console.error("Usage: terminalcp start <session-id> <command> [args...]");
			process.exit(1);
		}
		const sessionId = args[1];
		const command = args.slice(2).join(" ");

		const client = new TerminalClient();
		client
			.request({ action: "start", command, name: sessionId })
			.then((id) => {
				console.log(`Started session: ${id}`);
				process.exit(0);
			})
			.catch((err) => {
				console.error("Failed to start session:", err.message);
				process.exit(1);
			});
	} else if (args[0] === "stop") {
		const sessionId = args[1]; // Optional
		const client = new TerminalClient();
		client
			.request({ action: "stop", id: sessionId })
			.then((result) => {
				console.log(result);
				process.exit(0);
			})
			.catch((err) => {
				console.error("Failed to stop session:", err.message);
				process.exit(1);
			});
	} else if (args[0] === "stdout") {
		if (!args[1]) {
			console.error("Usage: terminalcp stdout <id> [lines]");
			process.exit(1);
		}
		const client = new TerminalClient();
		const lines = args[2] ? parseInt(args[2]) : undefined;
		client
			.request({ action: "stdout", id: args[1], lines })
			.then((output) => {
				process.stdout.write(output);
				process.exit(0);
			})
			.catch((err) => {
				console.error("Failed to get stdout:", err.message);
				process.exit(1);
			});
	} else if (args[0] === "stream") {
		if (!args[1]) {
			console.error("Usage: terminalcp stream <id> [--since-last] [--with-ansi]");
			process.exit(1);
		}
		const client = new TerminalClient();
		const since_last = args.includes("--since-last");
		const strip_ansi = !args.includes("--with-ansi");
		client
			.request({ action: "stream", id: args[1], since_last, strip_ansi })
			.then((output) => {
				process.stdout.write(output);
				process.exit(0);
			})
			.catch((err) => {
				console.error("Failed to get stream:", err.message);
				process.exit(1);
			});
	} else if (args[0] === "stdin") {
		if (args.length < 3) {
			console.error("Usage: terminalcp stdin <id> <data> [--submit]");
			process.exit(1);
		}
		const client = new TerminalClient();
		const submit = args.includes("--submit");
		const dataArgs = args.slice(2).filter((arg) => arg !== "--submit");
		const data = dataArgs.join(" ");
		client
			.request({ action: "stdin", id: args[1], data, submit })
			.then(() => {
				process.exit(0);
			})
			.catch((err) => {
				console.error("Failed to send stdin:", err.message);
				process.exit(1);
			});
	} else if (args[0] === "term-size") {
		if (!args[1]) {
			console.error("Usage: terminalcp term-size <id>");
			process.exit(1);
		}
		const client = new TerminalClient();
		client
			.request({ action: "term-size", id: args[1] })
			.then((result) => {
				console.log(result);
				process.exit(0);
			})
			.catch((err) => {
				console.error("Failed to get terminal size:", err.message);
				process.exit(1);
			});
	} else if (args[0] === "resize") {
		if (args.length < 4) {
			console.error("Usage: terminalcp resize <id> <cols> <rows>");
			process.exit(1);
		}
		const client = new TerminalClient();
		client
			.request({ action: "resize", id: args[1], cols: parseInt(args[2]), rows: parseInt(args[3]) })
			.then(() => {
				console.log("Terminal resized");
				process.exit(0);
			})
			.catch((err) => {
				console.error("Failed to resize terminal:", err.message);
				process.exit(1);
			});
	} else if (args[0] === "attach") {
		if (!args[1]) {
			console.error("Usage: terminalcp attach <id>");
			process.exit(1);
		}
		const client = new AttachClient();
		client.attach(args[1]).catch((err) => {
			console.error(err.message);
			process.exit(1);
		});
	} else if (args[0] === "version") {
		const client = new TerminalClient();
		client
			.request({ action: "version" })
			.then((version) => {
				console.log(`Server version: ${version}`);
				console.log(`Client version: ${CLIENT_VERSION}`);
				process.exit(0);
			})
			.catch((err) => {
				console.error("Failed to get server version:", err.message);
				console.log(`Client version: ${CLIENT_VERSION}`);
				process.exit(1);
			});
	} else if (args[0] === "kill-server") {
		// Check if server is running first
		const socketPath = path.join(os.homedir(), ".terminalcp", "server.sock");
		if (!fs.existsSync(socketPath)) {
			console.error("No server running");
			process.exit(1);
		}
		const client = new TerminalClient();
		client
			.request({ action: "kill-server" })
			.then(() => {
				console.log("Server killed");
				process.exit(0);
			})
			.catch((err) => {
				console.error("Failed to kill server:", err.message);
				process.exit(1);
			});
	} else if (args[0] === "--server") {
		const server = new TerminalServer();
		server.start().catch((err) => {
			console.error("Failed to start server:", err);
			process.exit(1);
		});
	} else {
		console.error(`Unknown command: ${args[0]}`);
		console.error("Run 'terminalcp' without arguments to see help");
		process.exit(1);
	}
}
