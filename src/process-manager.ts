import { type ChildProcess, spawn } from "node:child_process";
import crypto from "node:crypto";
import type { Terminal as XtermTerminalType } from "@xterm/headless";
import xterm from "@xterm/headless";

const Terminal = xterm.Terminal;

export interface ManagedProcess {
	id: string;
	command: string;
	process: ChildProcess;
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

		const proc = spawn(command, {
			shell: true,
			stdio: ["pipe", "pipe", "pipe"],
			env: { ...process.env, TERM: "xterm-256color" },
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

		// Pipe stdout/stderr to terminal and capture raw output
		proc.stdout?.on("data", (data) => {
			const str = data.toString();
			processEntry.rawOutput += str;
			terminal.write(data);
		});

		proc.stderr?.on("data", (data) => {
			const str = data.toString();
			processEntry.rawOutput += str;
			terminal.write(data);
		});

		// Handle process exit
		proc.on("exit", (code, signal) => {
			const exitMsg = `\n[Process exited with code ${code}${signal ? ` (signal: ${signal})` : ""}]\n`;
			processEntry.rawOutput += exitMsg;
			terminal.write(exitMsg);
		});

		proc.on("error", (error) => {
			const errorMsg = `\n[Process error: ${error.message}]\n`;
			processEntry.rawOutput += errorMsg;
			terminal.write(errorMsg);
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

		proc.process.kill("SIGTERM");
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

		proc.process.stdin?.write(data);
	}

	/**
	 * Get output from a process
	 */
	async getOutput(id: string, options?: { lines?: number; raw?: boolean }): Promise<string> {
		const proc = this.processes.get(id);
		if (!proc) {
			throw new Error(`Process not found: ${id}`);
		}

		// If raw output is requested, return the raw output with ANSI sequences
		if (options?.raw) {
			if (options.lines) {
				const rawLines = proc.rawOutput.split("\n");
				const startIdx = Math.max(0, rawLines.length - options.lines);
				return rawLines.slice(startIdx).join("\n");
			}
			return proc.rawOutput;
		}

		// Otherwise return terminal buffer (processed output)
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
	}> {
		return Array.from(this.processes.values()).map((p) => ({
			id: p.id,
			command: p.command,
			startedAt: p.startedAt.toISOString(),
			running: !p.process.killed,
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
			proc.process.kill("SIGTERM");
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

