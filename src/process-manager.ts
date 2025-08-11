import crypto from "node:crypto";
import type { Terminal as XtermTerminalType } from "@xterm/headless";
import xterm from "@xterm/headless";
import * as pty from "node-pty";

const Terminal = xterm.Terminal;

export interface ManagedProcess {
	id: string;
	command: string;
	process: pty.IPty;
	terminal: XtermTerminalType;
	startedAt: Date;
	rawOutput: string;
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
	async start(command: string): Promise<string> {
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
			cwd: process.cwd(),
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
		};

		// Capture output from PTY
		proc.onData((data) => {
			processEntry.rawOutput += data;
			terminal.write(data);
		});

		// Handle process exit
		proc.onExit((exitCode) => {
			const code = exitCode.exitCode;
			const signal = exitCode.signal;
			const exitMsg = `\n[Process exited with code ${code}${signal ? ` (signal: ${signal})` : ""}]\n`;
			processEntry.rawOutput += exitMsg;
			terminal.write(exitMsg);
			// Remove the process from the map when it exits
			this.processes.delete(id);
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

		proc.process.write(data);
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
		// IMPORTANT: Flush the terminal first to ensure all writes are processed
		await this.flushTerminal(proc.terminal);

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
		await this.flushTerminal(proc.terminal);
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

	/**
	 * Helper to flush terminal writes
	 */
	private async flushTerminal(terminal: XtermTerminalType): Promise<void> {
		return new Promise<void>((resolve) => {
			terminal.write("", () => resolve());
		});
	}
}

