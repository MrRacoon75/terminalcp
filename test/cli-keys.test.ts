import * as assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { after, describe, it } from "node:test";
import { TerminalClient } from "../src/terminal-client.js";

describe("CLI Key Handling", () => {
	let sessionId: string;

	// Helper to run CLI commands
	async function runCLI(args: string[]): Promise<{ stdout: string; stderr: string }> {
		return new Promise((resolve, reject) => {
			const proc = spawn("npx", ["tsx", "src/index.ts", ...args]);
			let stdout = "";
			let stderr = "";

			proc.stdout.on("data", (data) => {
				stdout += data.toString();
			});

			proc.stderr.on("data", (data) => {
				stderr += data.toString();
			});

			proc.on("close", (code) => {
				if (code !== 0 && !args.includes("--help")) {
					reject(new Error(`CLI exited with code ${code}: ${stderr}`));
				} else {
					resolve({ stdout, stderr });
				}
			});

			proc.on("error", reject);
		});
	}

	it("should start a test session", async () => {
		const result = await runCLI(["start", "cli-test", "bash"]);
		assert.match(result.stdout, /cli-test/, "Should return session ID");
		sessionId = "cli-test";
	});

	it("should send text with :: prefix for Enter", async () => {
		// Send echo command with ::Enter
		await runCLI(["stdin", sessionId, "echo hello", "::Enter"]);

		// Wait a bit for command to execute
		await new Promise((resolve) => setTimeout(resolve, 200));

		// Get output
		const result = await runCLI(["stdout", sessionId]);
		assert.match(result.stdout, /echo hello/, "Should show command");
		assert.match(result.stdout, /hello/, "Should show output");
	});

	it("should handle arrow keys with :: prefix", async () => {
		// Send text, navigate with arrows, insert text
		await runCLI(["stdin", sessionId, "echo test"]);
		await runCLI(["stdin", sessionId, "::Left", "::Left", "::Left", "::Left"]);
		await runCLI(["stdin", sessionId, "my "]);
		await runCLI(["stdin", sessionId, "::Enter"]);

		await new Promise((resolve) => setTimeout(resolve, 200));

		const result = await runCLI(["stdout", sessionId]);
		assert.match(result.stdout, /echo my test/, "Should show modified command");
		assert.match(result.stdout, /my test/, "Should show output with inserted text");
	});

	it("should handle control sequences with :: prefix", async () => {
		// Start a sleep command
		await runCLI(["stdin", sessionId, "sleep 5", "::Enter"]);
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Send Ctrl+C to interrupt
		await runCLI(["stdin", sessionId, "::C-c"]);
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Send another command to verify we're back at prompt
		await runCLI(["stdin", sessionId, "echo done", "::Enter"]);
		await new Promise((resolve) => setTimeout(resolve, 200));

		const result = await runCLI(["stdout", sessionId]);
		assert.match(result.stdout, /echo done/, "Should show echo done command");
		assert.match(result.stdout, /done/, "Should show done output");
	});

	it("should handle special keys with :: prefix", async () => {
		// Test Tab, Space, Escape
		await runCLI(["stdin", sessionId, "ec", "::Tab"]);
		await new Promise((resolve) => setTimeout(resolve, 200));

		await runCLI(["stdin", sessionId, "::Space", "hello", "::Enter"]);
		await new Promise((resolve) => setTimeout(resolve, 200));

		const result = await runCLI(["stdout", sessionId]);
		// Tab might complete to 'echo' or show options
		assert.match(result.stdout, /hello/, "Should show hello output");
	});

	it("should handle navigation keys", async () => {
		// Test Home, End keys
		await runCLI(["stdin", sessionId, "echo world"]);
		await runCLI(["stdin", sessionId, "::Home"]);
		await new Promise((resolve) => setTimeout(resolve, 50));

		// Move right past "echo " (5 chars)
		await runCLI(["stdin", sessionId, "::Right", "::Right", "::Right", "::Right", "::Right"]);
		await runCLI(["stdin", sessionId, "hello "]);
		await runCLI(["stdin", sessionId, "::Enter"]);

		await new Promise((resolve) => setTimeout(resolve, 200));

		const result = await runCLI(["stdout", sessionId]);
		assert.match(result.stdout, /hello world/, "Should output hello world");
	});

	it("should handle literal text that looks like keys", async () => {
		// Send literal "Home" without :: prefix
		await runCLI(["stdin", sessionId, "echo Home", "::Enter"]);
		await new Promise((resolve) => setTimeout(resolve, 200));

		const result = await runCLI(["stdout", sessionId]);
		assert.match(result.stdout, /echo Home/, "Should show literal Home in command");
		assert.match(result.stdout, /^Home$/m, "Should output literal Home");
	});

	it("should handle mixed literal and keys", async () => {
		// Mix of literal text and special keys
		await runCLI(["stdin", sessionId, "echo", "::Space", "Left", "::Space", "and", "::Space", "Right", "::Enter"]);
		await new Promise((resolve) => setTimeout(resolve, 200));

		const result = await runCLI(["stdout", sessionId]);
		assert.match(result.stdout, /Left and Right/, "Should output literal 'Left and Right'");
	});

	after(async () => {
		// Clean up
		if (sessionId) {
			try {
				await runCLI(["stop", sessionId]);
			} catch (_e) {
				// Session might already be stopped
			}
		}
	});
});
