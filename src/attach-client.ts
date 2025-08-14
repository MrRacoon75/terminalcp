import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { type AttachResult, createRequest, type ServerMessage, type ServerResponse } from "./messages.js";

export class AttachClient {
	private socket?: net.Socket;
	private isRawMode = false;
	private stdin = process.stdin;
	private stdout = process.stdout;
	private attachedSession?: string;

	/**
	 * Attach to a session
	 */
	async attach(sessionId: string): Promise<void> {
		console.error(`Attaching to session ${sessionId}...`);
		console.error("Press Ctrl+B to detach");
		console.error("");

		const socket = await this.connect();
		this.socket = socket;
		this.attachedSession = sessionId;

		// Request attachment
		const attachResponse = (await this.requestAttach(sessionId)) as AttachResult;

		// Set up terminal
		this.setupTerminal();

		// Reset terminal completely before showing session
		this.resetTerminal();

		// Display initial output
		if (attachResponse.rawOutput) {
			if (!this.stdout.write(attachResponse.rawOutput)) {
				// Handle backpressure - wait for drain before continuing
				await new Promise((resolve) => this.stdout.once("drain", resolve));
			}
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
					} catch (_err) {
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
			const socket = net.createConnection(path.join(os.homedir(), ".terminalcp", "server.sock"));

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
	private requestAttach(sessionId: string): Promise<AttachResult> {
		return new Promise((resolve, reject) => {
			const request = createRequest({ action: "attach", id: sessionId });
			const requestId = request.id;

			// Set up one-time response handler
			let buffer = "";
			const handleData = (data: Buffer) => {
				buffer += data.toString();
				const lines = buffer.split("\n");
				buffer = lines.pop() || ""; // Keep incomplete line in buffer

				for (const line of lines) {
					if (line.trim()) {
						try {
							const response: ServerMessage = JSON.parse(line);
							if (response.type === "response" && response.id === requestId) {
								this.socket?.removeListener("data", handleData);
								const res = response as ServerResponse;
								if (res.error) {
									reject(new Error(res.error));
								} else {
									if (!res.result || typeof res.result !== "object") {
										reject(new Error("Invalid response format"));
										return;
									}
									resolve(res.result as AttachResult);
								}
								return;
							}
						} catch (_err) {
							// Continue looking
						}
					}
				}
			};

			this.socket?.on("data", handleData);

			const requestStr = `${JSON.stringify(request)}\n`;
			this.socket?.write(requestStr, (err) => {
				if (err) {
					reject(new Error(`Failed to send request: ${err.message}`));
				}
			});

			// Timeout after 5 seconds
			setTimeout(() => {
				this.socket?.removeListener("data", handleData);
				reject(new Error(`Request timeout - no response for request ${requestId}`));
			}, 5000);
		});
	}

	/**
	 * Handle incoming server messages
	 */
	private handleMessage(message: ServerMessage): void {
		if (message.type === "event") {
			if (message.event === "output" && message.sessionId === this.attachedSession) {
				if (!this.stdout.write(message.data)) {
					// Handle backpressure - pause reading from socket until stdout drains
					this.socket?.pause();
					this.stdout.once("drain", () => {
						this.socket?.resume();
					});
				}
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
			// Check for Ctrl+B to detach
			if (data[0] === 0x02) {
				// Ctrl+B
				this.detach();
				return;
			}

			// Forward input to server
			if (this.socket && !this.socket.destroyed && this.attachedSession) {
				const message = createRequest({
					action: "stdin",
					id: this.attachedSession,
					data: data.toString(),
				});
				if (!this.socket.write(`${JSON.stringify(message)}\n`)) {
					// Handle backpressure - pause stdin until socket drains
					this.stdin.pause();
					this.socket.once("drain", () => {
						this.stdin.resume();
					});
				}
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

		const message = createRequest({
			action: "resize",
			id: this.attachedSession,
			cols,
			rows,
		});
		this.socket.write(`${JSON.stringify(message)}\n`);
	}

	/**
	 * Detach from session
	 */
	private detach(): void {
		console.error("\n[Detaching...]");

		if (this.socket && !this.socket.destroyed && this.attachedSession) {
			const message = createRequest({
				action: "detach",
				id: this.attachedSession,
			});
			this.socket.write(`${JSON.stringify(message)}\n`);
			this.socket.end();
		}

		this.cleanup();
	}

	/**
	 * Reset terminal to default state
	 */
	private resetTerminal(): void {
		// Reset terminal to clear any lingering state:
		// - \x1b[?1000l, \x1b[?1002l, \x1b[?1003l, \x1b[?1006l: Disable mouse tracking modes
		// - \x1b[?47l, \x1b[?1049l: Exit alternate screen buffer
		// - \x1b[?25h: Show cursor
		// - \x1b[0m: Reset all colors and text attributes
		// - \x1bc: Full terminal reset
		this.stdout.write("\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l\x1b[?47l\x1b[?1049l\x1b[?25h\x1b[0m\x1bc");
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

		this.resetTerminal();

		process.exit(0);
	}
}
