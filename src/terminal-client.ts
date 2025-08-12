import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import type { ServerMessage } from "./server.js";

export class TerminalServerClient {
	private socket?: net.Socket;
	private serverSocketPath = path.join(os.homedir(), ".terminalcp", "server.sock");
	private requestCounter = 0;
	private pendingRequests = new Map<string, { resolve: (result: any) => void; reject: (error: Error) => void }>();
	private eventHandlers = new Map<string, (sessionId: string, data: any) => void>();
	private connected = false;
	private connectPromise?: Promise<void>;

	/**
	 * Connect to the terminal server, starting it if necessary
	 */
	async connect(): Promise<void> {
		// If already connecting, wait for that
		if (this.connectPromise) {
			return this.connectPromise;
		}

		// If already connected, return immediately
		if (this.connected) {
			return;
		}

		this.connectPromise = this.doConnect();
		return this.connectPromise;
	}

	private async doConnect(): Promise<void> {
		// Check if server is already running
		if (await this.isServerRunning()) {
			await this.connectToServer();
		} else {
			// Start the server
			await this.startServer();

			// Wait for server to start with retries
			let retries = 10;
			while (retries > 0) {
				await new Promise((resolve) => setTimeout(resolve, 500));
				if (await this.isServerRunning()) {
					break;
				}
				retries--;
			}

			if (retries === 0) {
				throw new Error("Failed to start server");
			}

			// Try to connect
			await this.connectToServer();
		}
	}

	/**
	 * Check if the server is running
	 */
	private async isServerRunning(): Promise<boolean> {
		return new Promise((resolve) => {
			if (!fs.existsSync(this.serverSocketPath)) {
				resolve(false);
				return;
			}

			const socket = net.createConnection(this.serverSocketPath);

			const timeout = setTimeout(() => {
				socket.destroy();
				resolve(false);
			}, 100);

			socket.once("connect", () => {
				clearTimeout(timeout);
				socket.end();
				resolve(true);
			});

			socket.once("error", () => {
				clearTimeout(timeout);
				resolve(false);
			});
		});
	}

	/**
	 * Start the terminal server
	 */
	private async startServer(): Promise<void> {
		// Determine how to start the server
		let command: string;
		let args: string[];

		// Check if we're running via tsx (development) or from dist
		const scriptPath = new URL(import.meta.url).pathname;
		const isTypescript = scriptPath.includes("/src/");

		if (isTypescript) {
			// Development mode: use tsx to run the TypeScript file
			command = "npx";
			args = ["tsx", path.join(path.dirname(scriptPath), "index.ts"), "--server"];
		} else {
			// Production mode: run the compiled JavaScript
			command = "node";
			args = [path.join(path.dirname(scriptPath), "index.js"), "--server"];
		}

		const serverProcess = spawn(command, args, {
			detached: true,
			stdio: "ignore",
		});

		serverProcess.unref(); // Allow parent to exit independently
	}

	/**
	 * Connect to the running server
	 */
	private async connectToServer(): Promise<void> {
		return new Promise((resolve, reject) => {
			this.socket = net.createConnection(this.serverSocketPath);

			let buffer = "";

			this.socket.on("connect", () => {
				this.connected = true;
				resolve();
			});

			this.socket.on("data", (data) => {
				buffer += data.toString();
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";

				for (const line of lines) {
					if (line.trim()) {
						try {
							const message: ServerMessage = JSON.parse(line);
							this.handleMessage(message);
						} catch (err) {
							console.error("Failed to parse server message:", err);
						}
					}
				}
			});

			this.socket.on("close", () => {
				this.connected = false;
				this.socket = undefined;

				// Reject all pending requests
				for (const [id, { reject }] of this.pendingRequests) {
					reject(new Error("Server connection closed"));
				}
				this.pendingRequests.clear();
			});

			this.socket.on("error", (err) => {
				this.connected = false;
				reject(err);
			});
		});
	}

	/**
	 * Handle a message from the server
	 */
	private handleMessage(message: ServerMessage): void {
		if (message.type === "response") {
			const pending = this.pendingRequests.get(message.id);
			if (pending) {
				this.pendingRequests.delete(message.id);
				if (message.error) {
					pending.reject(new Error(message.error));
				} else {
					pending.resolve(message.result);
				}
			}
		} else if (message.type === "event") {
			const handler = this.eventHandlers.get(message.event!);
			if (handler) {
				handler(message.sessionId!, message.data);
			}
		}
	}

	/**
	 * Send a request to the server
	 */
	async request(action: string, args?: any): Promise<any> {
		if (!this.connected) {
			await this.connect();
		}

		return new Promise((resolve, reject) => {
			const requestId = `req-${++this.requestCounter}`;

			this.pendingRequests.set(requestId, { resolve, reject });

			const message: ServerMessage = {
				id: requestId,
				type: "request",
				action,
				args,
			};

			this.socket!.write(JSON.stringify(message) + "\n");

			// Set a timeout for the request
			setTimeout(() => {
				if (this.pendingRequests.has(requestId)) {
					this.pendingRequests.delete(requestId);
					reject(new Error("Request timeout"));
				}
			}, 30000); // 30 second timeout
		});
	}

	/**
	 * Register an event handler
	 */
	onEvent(event: string, handler: (sessionId: string, data: any) => void): void {
		this.eventHandlers.set(event, handler);
	}

	/**
	 * Close the connection
	 */
	close(): void {
		if (this.socket) {
			this.socket.end();
		}
	}
}
