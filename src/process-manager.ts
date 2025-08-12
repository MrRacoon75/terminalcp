import crypto from "node:crypto";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { stripVTControlCharacters } from "node:util";
import type { Terminal as XtermTerminalType } from "@xterm/headless";
import xterm from "@xterm/headless";
import * as pty from "node-pty";
import { type SocketMessage, SocketProtocol } from "./socket-protocol.js";

const Terminal = xterm.Terminal;

class WriteQueue {
	private queue = Promise.resolve();

	enqueue(writeFn: () => Promise<void> | void): void {
		this.queue = this.queue
			.then(() => writeFn())
			.catch((error) => {
				console.error("WriteQueue error:", error);
			});
	}

	async drain(): Promise<void> {
		await this.queue;
	}
}

export interface ManagedProcess {
	id: string;
	name: string;
	command: string;
	process: pty.IPty;
	terminal: XtermTerminalType;
	startedAt: Date;
	rawOutput: string;
	lastStreamReadPosition: number;
	terminalWriteQueue: WriteQueue;
	ptyWriteQueue: WriteQueue;
	socketPath?: string;
	socketServer?: net.Server;
	socketProtocol?: SocketProtocol;
}

export interface ProcessOutput {
	buffer: string; // Terminal buffer output (processed)
	raw: string; // Raw output with ANSI sequences
}

export class ProcessManager {
	private processes = new Map<string, ManagedProcess>();
	private sessionsDir = path.join(os.homedir(), ".terminalcp", "sessions");

	constructor() {
		// Ensure sessions directory exists
		this.ensureSessionsDir();
		// Clean up orphaned sockets on startup
		this.cleanupOrphanedSockets();
	}

	private ensureSessionsDir(): void {
		if (!fs.existsSync(this.sessionsDir)) {
			fs.mkdirSync(this.sessionsDir, { recursive: true });
		}
	}

	/**
	 * Check if a socket is alive by trying to connect
	 */
	private async isSocketAlive(socketPath: string): Promise<boolean> {
		return new Promise((resolve) => {
			const socket = net.createConnection(socketPath);

			const timeout = setTimeout(() => {
				socket.destroy();
				resolve(false);
			}, 100); // 100ms timeout

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
	 * Clean up orphaned socket files on startup
	 */
	private async cleanupOrphanedSockets(): Promise<void> {
		if (!fs.existsSync(this.sessionsDir)) {
			return;
		}

		const files = fs.readdirSync(this.sessionsDir);
		const socketFiles = files.filter((f) => f.endsWith(".sock"));

		if (socketFiles.length === 0) {
			return;
		}

		let cleaned = 0;

		for (const file of socketFiles) {
			const socketPath = path.join(this.sessionsDir, file);
			const alive = await this.isSocketAlive(socketPath);

			if (!alive) {
				try {
					fs.unlinkSync(socketPath);
					console.error(`Cleaned up orphaned socket: ${file}`);
					cleaned++;
				} catch (err) {
					console.error(`Failed to remove orphaned socket ${file}: ${err}`);
				}
			}
		}

		if (cleaned > 0) {
			console.error(`Removed ${cleaned} orphaned socket(s)`);
		}
	}

	/**
	 * Start a new process with virtual terminal
	 */
	async start(command: string, options?: { cwd?: string; name?: string }): Promise<string> {
		const id = `proc-${crypto.randomBytes(6).toString("hex")}`;
		const name = options?.name || command.split(" ")[0].split("/").pop() || "unnamed";

		const terminal = new Terminal({
			cols: 80,
			rows: 24,
			scrollback: 10000,
			allowProposedApi: true,
			convertEol: true, // Convert \n to \r\n
		});

		// Use node-pty to create a pseudo-terminal
		const proc = pty.spawn(process.env.SHELL || "/bin/bash", ["-c", command], {
			name: "xterm-256color",
			cols: 80,
			rows: 24,
			cwd: options?.cwd || process.cwd(),
			env: process.env as { [key: string]: string },
		});

		// Create process entry
		const processEntry: ManagedProcess = {
			id,
			name,
			command,
			process: proc,
			terminal,
			startedAt: new Date(),
			rawOutput: "",
			lastStreamReadPosition: 0,
			terminalWriteQueue: new WriteQueue(),
			ptyWriteQueue: new WriteQueue(),
		};

		// Set up socket server for this process
		await this.setupSocketServer(processEntry);

		// Capture output from PTY
		proc.onData((data) => {
			processEntry.rawOutput += data;
			// Queue terminal write to prevent race conditions
			processEntry.terminalWriteQueue.enqueue(async () => {
				await new Promise<void>((resolve) => {
					terminal.write(data, () => resolve());
				});
			});
			// Broadcast to socket clients
			if (processEntry.socketProtocol) {
				processEntry.socketProtocol.broadcast({
					type: "output",
					payload: { data },
				});
			}
		});

		// Handle process exit
		proc.onExit((exitCode) => {
			const code = exitCode.exitCode;
			const signal = exitCode.signal;
			const exitMsg = `\n[Process exited with code ${code}${signal ? ` (signal: ${signal})` : ""}]\n`;
			processEntry.rawOutput += exitMsg;
			// Queue terminal write for exit message
			processEntry.terminalWriteQueue.enqueue(async () => {
				await new Promise<void>((resolve) => {
					terminal.write(exitMsg, () => resolve());
				});
			});
			// Keep the process in the map so users can still query its output
			// Users must explicitly call "stop" to clean up
		});

		this.processes.set(id, processEntry);
		return id;
	}

	/**
	 * Set up socket server for a process
	 */
	private async setupSocketServer(processEntry: ManagedProcess): Promise<void> {
		const socketPath = path.join(this.sessionsDir, `${processEntry.name}-${processEntry.id}.sock`);

		// Remove existing socket file if it exists
		if (fs.existsSync(socketPath)) {
			fs.unlinkSync(socketPath);
		}

		const socketProtocol = new SocketProtocol();
		const server = net.createServer(async (socket) => {
			const clientId = `client-${crypto.randomBytes(6).toString("hex")}`;
			console.error(`Client ${clientId} connected to process ${processEntry.id}`);

			socketProtocol.addClient(clientId, socket);

			// Send initial attach response with terminal size
			socketProtocol.sendToClient(clientId, {
				type: "attach",
				clientId,
				payload: {
					cols: processEntry.terminal.cols,
					rows: processEntry.terminal.rows,
					processId: processEntry.id,
					name: processEntry.name,
				},
			});

			// Send the current terminal buffer to the new client
			await processEntry.terminalWriteQueue.drain();
			const buffer = processEntry.terminal.buffer.active;
			let bufferContent = "";
			for (let i = 0; i < buffer.length; i++) {
				const line = buffer.getLine(i);
				if (line) {
					bufferContent += `${line.translateToString(true)}\n`;
				}
			}

			if (bufferContent) {
				// Send the existing buffer as output
				socketProtocol.sendToClient(clientId, {
					type: "output",
					clientId,
					payload: { data: bufferContent },
				});
			}
		});

		// Handle messages from socket clients
		socketProtocol.on("message", (message: SocketMessage, _clientId: string) => {
			switch (message.type) {
				case "input":
					// Forward input to PTY
					processEntry.ptyWriteQueue.enqueue(() => {
						processEntry.process.write(message.payload.data);
					});
					break;
				case "resize": {
					// Resize PTY and terminal
					const { cols, rows } = message.payload;
					processEntry.process.resize(cols, rows);
					processEntry.terminal.resize(cols, rows);
					// Broadcast resize to other clients
					socketProtocol.broadcast({
						type: "resize",
						payload: { cols, rows },
					});
					break;
				}
			}
		});

		await new Promise<void>((resolve, reject) => {
			server.listen(socketPath, () => {
				console.error(`Socket server listening at ${socketPath}`);
				resolve();
			});
			server.on("error", reject);
		});

		processEntry.socketPath = socketPath;
		processEntry.socketServer = server;
		processEntry.socketProtocol = socketProtocol;
	}

	/**
	 * Stop a process
	 */
	async stop(id: string): Promise<void> {
		const proc = this.processes.get(id);
		if (!proc) {
			throw new Error(`Process not found: ${id}`);
		}

		// Clean up socket server
		if (proc.socketProtocol) {
			proc.socketProtocol.disconnectAll();
		}
		if (proc.socketServer) {
			proc.socketServer.close();
		}
		if (proc.socketPath && fs.existsSync(proc.socketPath)) {
			fs.unlinkSync(proc.socketPath);
		}

		proc.process.kill();
		this.processes.delete(id);
	}

	/**
	 * Send input to a process
	 */
	async sendInput(id: string, data: string): Promise<void> {
		const proc = this.processes.get(id);
		if (!proc) {
			throw new Error(`Process not found: ${id}`);
		}

		// Queue pty write to prevent race conditions
		proc.ptyWriteQueue.enqueue(() => {
			proc.process.write(data);
		});
	}

	/**
	 * Get output from a process
	 */
	async getOutput(id: string, options?: { lines?: number }): Promise<string> {
		const proc = this.processes.get(id);
		if (!proc) {
			throw new Error(`Process not found: ${id}`);
		}

		// Return terminal buffer (processed output)
		// IMPORTANT: Drain the write queue first to ensure all writes are processed
		await proc.terminalWriteQueue.drain();

		const buffer = proc.terminal.buffer.active;
		const totalLines = buffer.length;
		const startLine = options?.lines ? Math.max(0, totalLines - options.lines) : 0;

		let output = "";
		for (let i = startLine; i < totalLines; i++) {
			const line = buffer.getLine(i);
			if (line) {
				output += `${line.translateToString(true)}\n`;
			}
		}

		return output || "[No output]";
	}

	/**
	 * Get both buffer and raw output
	 */
	async getFullOutput(id: string): Promise<ProcessOutput> {
		const proc = this.processes.get(id);
		if (!proc) {
			throw new Error(`Process not found: ${id}`);
		}

		// Get buffer output
		await proc.terminalWriteQueue.drain();
		const buffer = proc.terminal.buffer.active;
		let bufferOutput = "";
		for (let i = 0; i < buffer.length; i++) {
			const line = buffer.getLine(i);
			if (line) {
				bufferOutput += `${line.translateToString(true)}\n`;
			}
		}

		return {
			buffer: bufferOutput || "[No output]",
			raw: proc.rawOutput || "[No output]",
		};
	}

	/**
	 * Get terminal size (rows and columns) and scrollback buffer info
	 */
	getTerminalSize(id: string): { rows: number; cols: number; scrollback_lines: number } {
		const proc = this.processes.get(id);
		if (!proc) {
			throw new Error(`Process not found: ${id}`);
		}

		// Get the number of lines in the scrollback buffer
		const scrollbackLines = proc.terminal.buffer.active.length;

		return {
			rows: proc.terminal.rows,
			cols: proc.terminal.cols,
			scrollback_lines: scrollbackLines,
		};
	}

	/**
	 * Get raw stream output (with ANSI stripping by default)
	 */
	async getStream(id: string, options?: { since_last?: boolean; strip_ansi?: boolean }): Promise<string> {
		const proc = this.processes.get(id);
		if (!proc) {
			throw new Error(`Process not found: ${id}`);
		}

		let output: string;

		if (options?.since_last) {
			// Get only new output since last read
			output = proc.rawOutput.substring(proc.lastStreamReadPosition);
			proc.lastStreamReadPosition = proc.rawOutput.length;
		} else {
			// Get all output
			output = proc.rawOutput;
		}

		// Strip ANSI codes by default (can be disabled by setting strip_ansi: false)
		if (options?.strip_ansi !== false && output) {
			output = stripVTControlCharacters(output);
		}

		return output || "[No output]";
	}

	/**
	 * List all processes
	 */
	listProcesses(): Array<{
		id: string;
		name: string;
		command: string;
		startedAt: string;
		running: boolean;
		pid?: number;
		socketPath?: string;
		connectedClients: number;
	}> {
		return Array.from(this.processes.values()).map((p) => ({
			id: p.id,
			name: p.name,
			command: p.command,
			startedAt: p.startedAt.toISOString(),
			running: p.process.pid !== undefined,
			pid: p.process.pid,
			socketPath: p.socketPath,
			connectedClients: p.socketProtocol?.getClientCount() || 0,
		}));
	}

	/**
	 * Get a specific process
	 */
	getProcess(id: string): ManagedProcess | undefined {
		return this.processes.get(id);
	}

	/**
	 * Stop all processes
	 */
	async stopAll(): Promise<void> {
		for (const proc of this.processes.values()) {
			// Clean up socket server
			if (proc.socketProtocol) {
				proc.socketProtocol.disconnectAll();
			}
			if (proc.socketServer) {
				proc.socketServer.close();
			}
			if (proc.socketPath && fs.existsSync(proc.socketPath)) {
				fs.unlinkSync(proc.socketPath);
			}
			proc.process.kill();
		}
		this.processes.clear();
	}
}
