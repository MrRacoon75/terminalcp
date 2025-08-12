import crypto from "node:crypto";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import type { ServerMessage } from "./server.js";

export class AttachClient {
	private socket?: net.Socket;
	private serverSocketPath = path.join(os.homedir(), ".terminalcp", "server.sock");
	private requestCounter = 0;
	private clientId = `attach-${crypto.randomBytes(6).toString("hex")}`;
	private isRawMode = false;
	private stdin = process.stdin;
	private stdout = process.stdout;
	private attachedSession?: string;

	/**
	 * List all available sessions
	 */
	async listSessions(): Promise<void> {
		const socket = await this.connect();

		const response = await this.request(socket, "list");
		socket.end();

		if (!response) {
			console.log("No active sessions");
			return;
		}

		const lines = response.split("\n").filter((line: string) => line.trim());
		if (lines.length === 0) {
			console.log("No active sessions");
			return;
		}

		console.log("Active sessions:");
		console.log("================");
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

	/**
	 * Attach to a session
	 */
	async attach(sessionId: string): Promise<void> {
		console.error(`Attaching to session ${sessionId}...`);
		console.error("Press Ctrl+Q to detach");
		console.error("");

		const socket = await this.connect();
		this.socket = socket;
		this.attachedSession = sessionId;

		// Request attachment
		const attachResponse = await this.request(socket, "attach", { id: sessionId });

		// Set up terminal
		this.setupTerminal();

		// Display initial output
		if (attachResponse.rawOutput) {
			this.stdout.write(attachResponse.rawOutput);
		}

		// Handle incoming messages
		let buffer = "";
		socket.on("data", (data) => {
			buffer += data.toString();
			const lines = buffer.split("\n");
			buffer = lines.pop() || "";

			for (const line of lines) {
				if (line.trim()) {
					try {
						const message: ServerMessage = JSON.parse(line);
						this.handleMessage(message);
					} catch (err) {
						// Ignore parse errors
					}
				}
			}
		});

		socket.on("close", () => {
			console.error("\n[Session closed]");
			this.cleanup();
		});

		socket.on("error", (err) => {
			console.error("\n[Connection error]", err.message);
			this.cleanup();
		});
	}

	/**
	 * Connect to the server
	 */
	private connect(): Promise<net.Socket> {
		return new Promise((resolve, reject) => {
			const socket = net.createConnection(this.serverSocketPath);

			socket.once("connect", () => {
				resolve(socket);
			});

			socket.once("error", (err) => {
				reject(new Error(`Cannot connect to terminal server: ${err.message}`));
			});
		});
	}

	/**
	 * Send a request and wait for response
	 */
	private request(socket: net.Socket, action: string, args?: any): Promise<any> {
		return new Promise((resolve, reject) => {
			const requestId = `req-${++this.requestCounter}`;

			const message: ServerMessage = {
				id: requestId,
				type: "request",
				action,
				args,
			};

			// Set up one-time response handler
			const handleData = (data: Buffer) => {
				const lines = data.toString().split("\n");
				for (const line of lines) {
					if (line.trim()) {
						try {
							const response: ServerMessage = JSON.parse(line);
							if (response.id === requestId && response.type === "response") {
								socket.removeListener("data", handleData);
								if (response.error) {
									reject(new Error(response.error));
								} else {
									resolve(response.result);
								}
								return;
							}
						} catch (err) {
							// Continue looking
						}
					}
				}
			};

			socket.on("data", handleData);
			socket.write(JSON.stringify(message) + "\n");

			// Timeout after 5 seconds
			setTimeout(() => {
				socket.removeListener("data", handleData);
				reject(new Error("Request timeout"));
			}, 5000);
		});
	}

	/**
	 * Handle incoming server messages
	 */
	private handleMessage(message: ServerMessage): void {
		if (message.type === "event") {
			if (message.event === "output" && message.sessionId === this.attachedSession) {
				// Write output to stdout
				this.stdout.write(message.data);
			}
		}
	}

	/**
	 * Set up terminal for raw mode
	 */
	private setupTerminal(): void {
		if (!this.stdin.isTTY) {
			console.error("Not running in a TTY");
			process.exit(1);
		}

		// Save current terminal state and enter raw mode
		this.stdin.setRawMode(true);
		this.isRawMode = true;
		this.stdin.resume();

		// Send initial terminal size
		this.sendResize();

		// Handle input
		this.stdin.on("data", (data) => {
			// Check for Ctrl+Q to detach
			if (data[0] === 0x11) {
				// Ctrl+Q
				this.detach();
				return;
			}

			// Forward input to server
			if (this.socket && !this.socket.destroyed && this.attachedSession) {
				const message: ServerMessage = {
					id: `input-${Date.now()}`,
					type: "request",
					action: "stdin",
					args: {
						id: this.attachedSession,
						data: data.toString(),
						submit: false,
					},
				};
				this.socket.write(JSON.stringify(message) + "\n");
			}
		});

		// Handle terminal resize
		this.stdout.on("resize", () => {
			this.sendResize();
		});
	}

	/**
	 * Send terminal resize event
	 */
	private sendResize(): void {
		if (!this.socket || this.socket.destroyed || !this.attachedSession) return;

		const cols = this.stdout.columns || 80;
		const rows = this.stdout.rows || 24;

		const message: ServerMessage = {
			id: `resize-${Date.now()}`,
			type: "request",
			action: "resize",
			args: {
				id: this.attachedSession,
				cols,
				rows,
			},
		};
		this.socket.write(JSON.stringify(message) + "\n");
	}

	/**
	 * Detach from session
	 */
	private detach(): void {
		console.error("\n[Detaching...]");

		if (this.socket && !this.socket.destroyed && this.attachedSession) {
			const message: ServerMessage = {
				id: `detach-${Date.now()}`,
				type: "request",
				action: "detach",
				args: { id: this.attachedSession },
			};
			this.socket.write(JSON.stringify(message) + "\n");
			this.socket.end();
		}

		this.cleanup();
	}

	/**
	 * Clean up and restore terminal
	 */
	private cleanup(): void {
		if (this.isRawMode && this.stdin.isTTY) {
			this.stdin.setRawMode(false);
			this.isRawMode = false;
		}
		this.stdin.pause();

		// Reset terminal to clear any lingering state
		this.stdout.write("\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l\x1b[?47l\x1b[?1049l\x1bc");

		process.exit(0);
	}
}
