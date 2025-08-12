import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import * as readline from "node:readline";
import { type SocketMessage } from "./socket-protocol.js";

export class TerminalClient {
	private socket?: net.Socket;
	private clientId = `client-${crypto.randomBytes(6).toString("hex")}`;
	private sessionsDir = path.join(os.homedir(), ".terminalcp", "sessions");
	private isRawMode = false;
	private stdin = process.stdin;
	private stdout = process.stdout;

	/**
	 * List all available sessions
	 */
	async listSessions(): Promise<void> {
		if (!fs.existsSync(this.sessionsDir)) {
			console.log("No active sessions");
			return;
		}

		const files = fs.readdirSync(this.sessionsDir);
		const sessions = files
			.filter(f => f.endsWith(".sock"))
			.map(f => {
				const parts = f.replace(".sock", "").split("-");
				const id = parts[parts.length - 1];
				const name = parts.slice(0, -1).join("-") || "unnamed";
				const socketPath = path.join(this.sessionsDir, f);
				
				// Check if socket is still active
				const exists = fs.existsSync(socketPath);
				const stats = exists ? fs.statSync(socketPath) : null;
				
				return {
					name,
					id: `proc-${id}`,
					socketPath,
					active: exists && stats?.isSocket(),
					created: stats?.birthtime,
				};
			})
			.filter(s => s.active);

		if (sessions.length === 0) {
			console.log("No active sessions");
			return;
		}

		console.log("Active sessions:");
		console.log("================");
		for (const session of sessions) {
			console.log(`  ${session.name} (${session.id})`);
			console.log(`    Socket: ${session.socketPath}`);
			if (session.created) {
				console.log(`    Started: ${session.created.toLocaleString()}`);
			}
			console.log();
		}
	}

	/**
	 * Attach to a session
	 */
	async attach(nameOrId: string): Promise<void> {
		const socketPath = await this.findSocketPath(nameOrId);
		if (!socketPath) {
			console.error(`Session not found: ${nameOrId}`);
			process.exit(1);
		}

		console.log(`Attaching to session at ${socketPath}`);
		console.log("Press Ctrl+Q to detach");
		console.log();

		await this.connect(socketPath);
	}

	/**
	 * Find socket path by name or ID
	 */
	private async findSocketPath(nameOrId: string): Promise<string | null> {
		if (!fs.existsSync(this.sessionsDir)) {
			return null;
		}

		const files = fs.readdirSync(this.sessionsDir);
		for (const file of files) {
			if (file.endsWith(".sock")) {
				// Check if file matches name or ID pattern
				const cleanId = nameOrId.replace("proc-", "");
				if (file.includes(nameOrId) || file.includes(cleanId)) {
					const fullPath = path.join(this.sessionsDir, file);
					if (fs.existsSync(fullPath)) {
						return fullPath;
					}
				}
			}
		}
		return null;
	}

	/**
	 * Connect to a session socket
	 */
	private async connect(socketPath: string): Promise<void> {
		return new Promise((resolve, reject) => {
			this.socket = net.createConnection(socketPath, () => {
				this.setupTerminal();
				this.setupSocketHandlers();
				resolve();
			});

			this.socket.on("error", (err) => {
				console.error("Connection error:", err.message);
				this.cleanup();
				reject(err);
			});
		});
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
			if (data[0] === 0x11) { // Ctrl+Q
				this.detach();
				return;
			}

			// Forward input to socket
			if (this.socket && !this.socket.destroyed) {
				const message: SocketMessage = {
					type: "input",
					clientId: this.clientId,
					timestamp: Date.now(),
					payload: { data: data.toString() },
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
	 * Set up socket message handlers
	 */
	private setupSocketHandlers(): void {
		if (!this.socket) return;

		let buffer = "";
		this.socket.on("data", (data) => {
			buffer += data.toString();
			const lines = buffer.split("\n");
			buffer = lines.pop() || "";

			for (const line of lines) {
				if (line.trim()) {
					try {
						const message: SocketMessage = JSON.parse(line);
						this.handleMessage(message);
					} catch (err) {
						console.error("Failed to parse message:", err);
					}
				}
			}
		});

		this.socket.on("close", () => {
			console.log("\n[Session closed]");
			this.cleanup();
		});
	}

	/**
	 * Handle incoming socket messages
	 */
	private handleMessage(message: SocketMessage): void {
		switch (message.type) {
			case "output":
				// Write output directly to stdout
				this.stdout.write(message.payload.data);
				break;
			case "attach":
				// Initial attach confirmation
				console.log(`[Attached to ${message.payload.name} (${message.payload.processId})]`);
				break;
			case "resize":
				// Another client resized the terminal
				// We could potentially handle this, but for now just note it
				break;
			case "error":
				console.error(`[Error: ${message.payload}]`);
				break;
		}
	}

	/**
	 * Send terminal resize event
	 */
	private sendResize(): void {
		if (!this.socket || this.socket.destroyed) return;

		const cols = this.stdout.columns || 80;
		const rows = this.stdout.rows || 24;

		const message: SocketMessage = {
			type: "resize",
			clientId: this.clientId,
			timestamp: Date.now(),
			payload: { cols, rows },
		};
		this.socket.write(JSON.stringify(message) + "\n");
	}

	/**
	 * Detach from session
	 */
	private detach(): void {
		console.log("\n[Detaching...]");
		
		if (this.socket && !this.socket.destroyed) {
			const message: SocketMessage = {
				type: "detach",
				clientId: this.clientId,
				timestamp: Date.now(),
				payload: {},
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
		process.exit(0);
	}
}

// Add missing crypto import
import crypto from "node:crypto";