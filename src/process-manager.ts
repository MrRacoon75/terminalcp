import crypto from "node:crypto";
import { stripVTControlCharacters } from "node:util";
import type { Terminal as XtermTerminalType } from "@xterm/headless";
import xterm from "@xterm/headless";
import * as pty from "node-pty";

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
	command: string;
	process: pty.IPty;
	terminal: XtermTerminalType;
	startedAt: Date;
	rawOutput: string;
	lastStreamReadPosition: number;
	terminalWriteQueue: WriteQueue;
	ptyWriteQueue: WriteQueue;
}

export interface ProcessOutput {
	buffer: string; // Terminal buffer output (processed)
	raw: string; // Raw output with ANSI sequences
}

export class ProcessManager {
	private processes = new Map<string, ManagedProcess>();

	/**
	 * Start a new process with virtual terminal
	 */
	async start(command: string, cwd?: string): Promise<string> {
		const id = `proc-${crypto.randomBytes(6).toString("hex")}`;

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
			cwd: cwd || process.cwd(),
			env: process.env as { [key: string]: string },
		});

		// Create process entry
		const processEntry: ManagedProcess = {
			id,
			command,
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
			processEntry.rawOutput += data;
			// Queue terminal write to prevent race conditions
			processEntry.terminalWriteQueue.enqueue(async () => {
				await new Promise<void>((resolve) => {
					terminal.write(data, () => resolve());
				});
			});
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
	 * Get raw stream output (with optional ANSI stripping)
	 */
	async getStream(
		id: string,
		options?: { since_last?: boolean; strip_ansi?: boolean },
	): Promise<string> {
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

		// Strip ANSI codes if requested
		if (options?.strip_ansi && output) {
			output = stripVTControlCharacters(output);
		}

		return output || "[No output]";
	}

	/**
	 * List all processes
	 */
	listProcesses(): Array<{
		id: string;
		command: string;
		startedAt: string;
		running: boolean;
		pid?: number;
	}> {
		return Array.from(this.processes.values()).map((p) => ({
			id: p.id,
			command: p.command,
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
	 * Stop all processes
	 */
	async stopAll(): Promise<void> {
		for (const proc of this.processes.values()) {
			proc.process.kill();
		}
		this.processes.clear();
	}
}

