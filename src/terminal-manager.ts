import crypto from "node:crypto";
import { stripVTControlCharacters } from "node:util";
import type { Terminal as XtermTerminalType } from "@xterm/headless";
import xterm from "@xterm/headless";
import * as pty from "node-pty";

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
	command: string;
	cwd: string;
	process: pty.IPty;
	terminal: XtermTerminalType;
	startedAt: Date;
	rawOutput: string;
	lastStreamReadPosition: number;
	terminalWriteQueue: WriteQueue;
	ptyWriteQueue: WriteQueue;
}

export class SimpleProcessManager {
	private processes = new Map<string, ManagedProcess>();
	private outputHandlers = new Map<string, (sessionId: string, data: string) => void>();

	/**
	 * Start a new process with virtual terminal
	 */
	async start(command: string, options?: { cwd?: string; name?: string }): Promise<string> {
		// Use name as ID, or generate one if not provided
		const id = options?.name || `proc-${crypto.randomBytes(6).toString("hex")}`;

		// Check if session already exists
		if (this.processes.has(id)) {
			throw new Error(`Session '${id}' already exists`);
		}

		const terminal = new xterm.Terminal({
			cols: 80,
			rows: 24,
			scrollback: 10000,
			allowProposedApi: true,
			convertEol: true,
		});

		// Use node-pty to create a pseudo-terminal
		const proc = pty.spawn(process.env.SHELL || "/bin/bash", ["-c", command], {
			name: "xterm-256color",
			cols: 80,
			rows: 24,
			cwd: options?.cwd || process.cwd(),
			env: {
				...process.env,
				TERM: "xterm-256color",
				COLORTERM: "truecolor",
				FORCE_COLOR: "1",
			} as { [key: string]: string },
		});

		// Create process entry
		const processEntry: ManagedProcess = {
			id,
			command,
			cwd: options?.cwd || process.cwd(),
			process: proc,
			terminal,
			startedAt: new Date(),
			rawOutput: "",
			lastStreamReadPosition: 0,
			terminalWriteQueue: new WriteQueue(),
			ptyWriteQueue: new WriteQueue(),
		};

		// Capture output from PTY
		proc.onData((data) => {
			// Store the raw output exactly as received
			processEntry.rawOutput += data;

			// Queue terminal write to prevent race conditions
			processEntry.terminalWriteQueue.enqueue(async () => {
				await new Promise<void>((resolve) => {
					terminal.write(data, () => resolve());
				});
			});

			// Notify output handler if registered
			const handler = this.outputHandlers.get(id);
			if (handler) {
				handler(id, data);
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
	 * Stop a process
	 */
	async stop(id: string): Promise<void> {
		const proc = this.processes.get(id);
		if (!proc) {
			throw new Error(`Process not found: ${id}`);
		}

		// Kill the process
		proc.process.kill();

		// Remove from map
		this.processes.delete(id);
	}

	/**
	 * Stop all processes
	 */
	async stopAll(): Promise<void> {
		const ids = Array.from(this.processes.keys());
		for (const id of ids) {
			await this.stop(id);
		}
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
	 * Get terminal output (rendered)
	 */
	async getOutput(id: string, options?: { lines?: number }): Promise<string> {
		const proc = this.processes.get(id);
		if (!proc) {
			throw new Error(`Process not found: ${id}`);
		}

		// Ensure terminal writes are complete
		await proc.terminalWriteQueue.drain();

		const buffer = proc.terminal.buffer.active;
		const lines = [];
		const endRow = buffer.length;
		const startRow = options?.lines ? Math.max(0, endRow - options.lines) : 0;

		for (let i = startRow; i < endRow; i++) {
			const line = buffer.getLine(i);
			if (line) {
				lines.push(line.translateToString(true));
			}
		}

		return lines.join("\n");
	}

	/**
	 * Get raw output stream
	 */
	async getStream(id: string, options?: { since_last?: boolean; strip_ansi?: boolean }): Promise<string> {
		const proc = this.processes.get(id);
		if (!proc) {
			throw new Error(`Process not found: ${id}`);
		}

		let output: string;
		if (options?.since_last) {
			output = proc.rawOutput.substring(proc.lastStreamReadPosition);
			proc.lastStreamReadPosition = proc.rawOutput.length;
		} else {
			output = proc.rawOutput;
		}

		// Strip ANSI codes by default (can be disabled by setting strip_ansi: false)
		if (options?.strip_ansi !== false && output) {
			output = stripVTControlCharacters(output);
		}

		return output;
	}

	/**
	 * Get terminal size
	 */
	getTerminalSize(id: string): { rows: number; cols: number; scrollback_lines: number } {
		const proc = this.processes.get(id);
		if (!proc) {
			throw new Error(`Process not found: ${id}`);
		}

		return {
			rows: proc.terminal.rows,
			cols: proc.terminal.cols,
			scrollback_lines: proc.terminal.buffer.active.length,
		};
	}

	/**
	 * Resize terminal
	 */
	resizeTerminal(id: string, cols: number, rows: number): void {
		const proc = this.processes.get(id);
		if (!proc) {
			throw new Error(`Process not found: ${id}`);
		}

		proc.process.resize(cols, rows);
		proc.terminal.resize(cols, rows);
	}

	/**
	 * List all processes
	 */
	listProcesses(): Array<{
		id: string;
		command: string;
		cwd: string;
		startedAt: string;
		running: boolean;
		pid?: number;
	}> {
		return Array.from(this.processes.values()).map((p) => ({
			id: p.id,
			command: p.command,
			cwd: p.cwd,
			startedAt: p.startedAt.toISOString(),
			running: p.process.pid !== undefined,
			pid: p.process.pid,
		}));
	}

	/**
	 * Get a specific process
	 */
	getProcess(id: string): ManagedProcess | undefined {
		return this.processes.get(id);
	}

	/**
	 * Register an output handler
	 */
	onOutput(sessionId: string, handler: (sessionId: string, data: string) => void): void {
		this.outputHandlers.set(sessionId, handler);
	}

	/**
	 * Unregister an output handler
	 */
	offOutput(sessionId: string): void {
		this.outputHandlers.delete(sessionId);
	}
}
