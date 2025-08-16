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

export interface ManagedTerminal {
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
	running: boolean;
	exitCode?: number;
}

export class TerminalManager {
	private processes = new Map<string, ManagedTerminal>();
	private outputHandlers = new Map<string, (sessionId: string, data: string) => void>();

	/**
	 * Start a new process with virtual terminal
	 */
	async start(command: string, options?: { cwd?: string; name?: string }): Promise<string> {
		const id = options?.name || `proc-${crypto.randomBytes(6).toString("hex")}`;
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

		const processEntry: ManagedTerminal = {
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
			running: true,
		};

		proc.onData((data) => {
			processEntry.terminalWriteQueue.enqueue(async () => {
				processEntry.rawOutput += data;
				await new Promise<void>((resolve) => {
					terminal.write(data, () => resolve());
				});
				const handler = this.outputHandlers.get(id);
				if (handler) {
					handler(id, data);
				}
			});
		});

		proc.onExit((exitCode) => {
			const code = exitCode.exitCode;
			const signal = exitCode.signal;
			const exitMsg = `\n[Process exited with code ${code}${signal ? ` (signal: ${signal})` : ""}]\n`;

			// Mark process as not running
			processEntry.running = false;
			processEntry.exitCode = code;

			processEntry.terminalWriteQueue.enqueue(async () => {
				processEntry.rawOutput += exitMsg;
				await new Promise<void>((resolve) => {
					terminal.write(exitMsg, () => resolve());
				});
			});
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
		proc.process.kill();
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
			throw new Error(`Session not found: ${id}`);
		}

		if (!proc.running) {
			throw new Error(
				`Session ${id} is not running (pid: ${proc.process.pid}, exit code: ${proc.exitCode ?? "unknown"}). Check stdout or stream.`,
			);
		}

		// Scan through string and handle \r specially (unless it's part of \r\n)
		// This helps with some TUI apps that need \r sent separately
		let buffer = "";

		for (let i = 0; i < data.length; i++) {
			if (data[i] === "\r") {
				// Check if next character is \n (Windows line ending)
				if (i + 1 < data.length && data[i + 1] === "\n") {
					// It's \r\n, keep them together
					buffer += "\r\n";
					i++; // Skip the \n since we already added it
				} else {
					// It's a standalone \r, send buffer then \r separately
					if (buffer) {
						const bufferCopy = buffer; // Capture buffer value for closure
						proc.ptyWriteQueue.enqueue(() => {
							proc.process.write(bufferCopy);
						});
						buffer = "";
					}

					// Send \r separately with a small delay
					proc.ptyWriteQueue.enqueue(async () => {
						// Small delay helps some TUIs recognize \r as Enter
						await new Promise((resolve) => setTimeout(resolve, 200));
						proc.process.write("\r");
					});
				}
			} else {
				buffer += data[i];
			}
		}

		// Send any remaining buffer
		if (buffer) {
			const bufferCopy = buffer; // Capture buffer value for closure
			proc.ptyWriteQueue.enqueue(() => {
				proc.process.write(bufferCopy);
			});
		}
		await proc.ptyWriteQueue.drain();
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

		// Get all lines first
		for (let i = 0; i < endRow; i++) {
			const line = buffer.getLine(i);
			if (line) {
				lines.push(line.translateToString(true));
			}
		}

		// Remove trailing empty lines
		while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
			lines.pop();
		}

		// Apply line limit after removing empty lines
		if (options?.lines && lines.length > options.lines) {
			return lines.slice(-options.lines).join("\n");
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
			running: p.running,
			pid: p.process.pid,
		}));
	}

	/**
	 * Get a specific process
	 */
	getProcess(id: string): ManagedTerminal | undefined {
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
