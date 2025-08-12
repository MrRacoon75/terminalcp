#!/usr/bin/env node
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { SimpleProcessManager } from "./simple-process-manager.js";

export interface ServerMessage {
	id: string; // Request ID for matching responses
	type: "request" | "response" | "event";
	action?: string; // For requests: start, stop, stdin, stdout, etc.
	args?: any; // Arguments for the action
	result?: any; // For responses
	error?: string; // For error responses
	event?: string; // For events: output, exit, etc.
	sessionId?: string; // For events tied to a session
	data?: any; // Event data
}

export class TerminalServer {
	private processManager = new SimpleProcessManager();
	private server?: net.Server;
	private clients = new Map<string, net.Socket>();
	private sessionSubscribers = new Map<string, Set<string>>(); // sessionId -> Set<clientId>
	private serverSocketPath = path.join(os.homedir(), ".terminalcp", "server.sock");
	private clientCounter = 0;

	constructor() {
		// Ensure directory exists
		const dir = path.dirname(this.serverSocketPath);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
	}

	/**
	 * Start the server
	 */
	async start(): Promise<void> {
		// Remove existing socket file if it exists
		if (fs.existsSync(this.serverSocketPath)) {
			try {
				fs.unlinkSync(this.serverSocketPath);
			} catch (err) {
				console.error("Failed to remove existing socket:", err);
			}
		}

		return new Promise((resolve, reject) => {
			this.server = net.createServer((socket) => {
				this.handleClient(socket);
			});

			this.server.on("error", (err) => {
				console.error("Server error:", err);
				reject(err);
			});

			this.server.listen(this.serverSocketPath, () => {
				console.error(`Terminal server listening at ${this.serverSocketPath}`);

				// Set socket permissions to be user-only
				fs.chmodSync(this.serverSocketPath, 0o600);

				resolve();
			});
		});
	}

	/**
	 * Handle a new client connection
	 */
	private handleClient(socket: net.Socket): void {
		const clientId = `client-${++this.clientCounter}`;
		this.clients.set(clientId, socket);

		console.error(`Client connected: ${clientId}`);

		let buffer = "";

		socket.on("data", (data) => {
			buffer += data.toString();
			const lines = buffer.split("\n");
			buffer = lines.pop() || "";

			for (const line of lines) {
				if (line.trim()) {
					try {
						const message: ServerMessage = JSON.parse(line);
						this.handleMessage(clientId, message);
					} catch (err) {
						console.error(`Failed to parse message from ${clientId}:`, err);
						this.sendError(clientId, "invalid-request", "Invalid JSON");
					}
				}
			}
		});

		socket.on("close", () => {
			console.error(`Client disconnected: ${clientId}`);
			this.clients.delete(clientId);

			// Remove client from all session subscriptions
			for (const subscribers of this.sessionSubscribers.values()) {
				subscribers.delete(clientId);
			}
		});

		socket.on("error", (err) => {
			console.error(`Client ${clientId} error:`, err);
		});
	}

	/**
	 * Handle a message from a client
	 */
	private async handleMessage(clientId: string, message: ServerMessage): Promise<void> {
		if (message.type !== "request") {
			return; // Ignore non-request messages from clients
		}

		const { id: requestId, action, args } = message;

		if (!requestId || !action) {
			this.sendError(clientId, requestId || "unknown", "Missing required fields");
			return;
		}

		try {
			let result: any;

			switch (action) {
				case "start": {
					const { command, cwd, name } = args || {};
					if (!command) {
						throw new Error("Missing required field: command");
					}
					const sessionId = await this.processManager.start(command, { cwd, name });

					// Register output handler for this session
					this.processManager.onOutput(sessionId, (id, data) => {
						this.broadcastEvent(id, "output", data);
					});

					// Auto-subscribe the creator to this session
					if (!this.sessionSubscribers.has(sessionId)) {
						this.sessionSubscribers.set(sessionId, new Set());
					}
					this.sessionSubscribers.get(sessionId)!.add(clientId);

					result = sessionId;
					break;
				}

				case "stop": {
					const { id } = args || {};
					if (!id) {
						// Stop all
						const processes = this.processManager.listProcesses();
						let count = 0;
						for (const proc of processes) {
							this.processManager.offOutput(proc.id);
							await this.processManager.stop(proc.id);
							count++;
						}
						result = `stopped ${count} processes`;
					} else {
						this.processManager.offOutput(id);
						await this.processManager.stop(id);
						result = `stopped ${id}`;
					}
					break;
				}

				case "stdin": {
					const { id, data, submit } = args || {};
					if (!id || data === undefined) {
						throw new Error("Missing required fields: id, data");
					}
					const inputData = submit ? `${data}\r` : data;
					await this.processManager.sendInput(id, inputData);
					result = null; // No response for stdin
					break;
				}

				case "stdout": {
					const { id, lines } = args || {};
					if (!id) {
						throw new Error("Missing required field: id");
					}
					result = await this.processManager.getOutput(id, { lines });
					break;
				}

				case "stream": {
					const { id, since_last, strip_ansi } = args || {};
					if (!id) {
						throw new Error("Missing required field: id");
					}
					result = await this.processManager.getStream(id, { since_last, strip_ansi });
					break;
				}

				case "list": {
					const list = this.processManager.listProcesses();
					const lines = list.map((p) => `${p.id} ${p.running ? "running" : "stopped"} ${p.cwd} ${p.command}`);
					result = lines.join("\n");
					break;
				}

				case "term-size": {
					const { id } = args || {};
					if (!id) {
						throw new Error("Missing required field: id");
					}
					const size = this.processManager.getTerminalSize(id);
					result = `${size.rows} ${size.cols} ${size.scrollback_lines}`;
					break;
				}

				case "subscribe": {
					const { id } = args || {};
					if (!id) {
						throw new Error("Missing required field: id");
					}
					if (!this.sessionSubscribers.has(id)) {
						this.sessionSubscribers.set(id, new Set());
					}
					this.sessionSubscribers.get(id)!.add(clientId);
					result = "subscribed";
					break;
				}

				case "unsubscribe": {
					const { id } = args || {};
					if (!id) {
						throw new Error("Missing required field: id");
					}
					const subscribers = this.sessionSubscribers.get(id);
					if (subscribers) {
						subscribers.delete(clientId);
					}
					result = "unsubscribed";
					break;
				}

				case "attach": {
					const { id } = args || {};
					if (!id) {
						throw new Error("Missing required field: id");
					}

					const proc = this.processManager.getProcess(id);
					if (!proc) {
						throw new Error(`Process not found: ${id}`);
					}

					// Subscribe client to this session
					if (!this.sessionSubscribers.has(id)) {
						this.sessionSubscribers.set(id, new Set());
					}
					this.sessionSubscribers.get(id)!.add(clientId);

					// Send initial terminal state
					result = {
						cols: proc.terminal.cols,
						rows: proc.terminal.rows,
						rawOutput: proc.rawOutput,
					};
					break;
				}

				case "resize": {
					const { id, cols, rows } = args || {};
					if (!id) {
						throw new Error("Missing required field: id");
					}

					this.processManager.resizeTerminal(id, cols, rows);

					// Broadcast resize to other clients
					this.broadcastEvent(id, "resize", { cols, rows });
					result = null; // No response needed
					break;
				}

				case "detach": {
					const { id } = args || {};
					if (!id) {
						throw new Error("Missing required field: id");
					}

					// Unsubscribe client from session
					const subscribers = this.sessionSubscribers.get(id);
					if (subscribers) {
						subscribers.delete(clientId);
					}
					result = "detached";
					break;
				}

				case "kill-server": {
					result = "shutting down";
					// Send response before shutting down
					this.sendResponse(clientId, requestId, result);
					await this.shutdown();
					return;
				}

				default:
					throw new Error(`Unknown action: ${action}`);
			}

			// Send response (unless it's stdin which returns null)
			if (result !== null) {
				this.sendResponse(clientId, requestId, result);
			}
		} catch (err) {
			const error = err instanceof Error ? err.message : String(err);
			this.sendError(clientId, requestId, error);
		}
	}

	/**
	 * Send a response to a client
	 */
	private sendResponse(clientId: string, requestId: string, result: any): void {
		const socket = this.clients.get(clientId);
		if (!socket || socket.destroyed) return;

		const response: ServerMessage = {
			id: requestId,
			type: "response",
			result,
		};

		socket.write(JSON.stringify(response) + "\n");
	}

	/**
	 * Send an error response to a client
	 */
	private sendError(clientId: string, requestId: string, error: string): void {
		const socket = this.clients.get(clientId);
		if (!socket || socket.destroyed) return;

		const response: ServerMessage = {
			id: requestId,
			type: "response",
			error,
		};

		socket.write(JSON.stringify(response) + "\n");
	}

	/**
	 * Broadcast an event to subscribed clients
	 */
	private broadcastEvent(sessionId: string, event: string, data: any): void {
		const subscribers = this.sessionSubscribers.get(sessionId);
		if (!subscribers) return;

		const message: ServerMessage = {
			id: `event-${Date.now()}`,
			type: "event",
			event,
			sessionId,
			data,
		};

		const messageStr = JSON.stringify(message) + "\n";

		for (const clientId of subscribers) {
			const socket = this.clients.get(clientId);
			if (socket && !socket.destroyed) {
				socket.write(messageStr);
			}
		}
	}

	/**
	 * Shutdown the server
	 */
	async shutdown(): Promise<void> {
		console.error("Shutting down terminal server...");

		// Stop all processes
		await this.processManager.stopAll();

		// Close all client connections
		for (const socket of this.clients.values()) {
			socket.end();
		}

		// Close the server
		if (this.server) {
			this.server.close();
		}

		// Remove socket file
		if (fs.existsSync(this.serverSocketPath)) {
			try {
				fs.unlinkSync(this.serverSocketPath);
			} catch (err) {
				// Ignore
			}
		}

		process.exit(0);
	}
}

// If run directly, start the server
if (import.meta.url === `file://${process.argv[1]}`) {
	const server = new TerminalServer();

	server.start().catch((err) => {
		console.error("Failed to start server:", err);
		process.exit(1);
	});

	// Handle shutdown signals
	process.on("SIGINT", () => server.shutdown());
	process.on("SIGTERM", () => server.shutdown());
}
