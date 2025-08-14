import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { dirname } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { TerminalManager } from "../src/terminal-manager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

describe("Terminal Manager Submit", () => {
	let manager: TerminalManager;
	let sessionId: string;

	before(() => {
		manager = new TerminalManager();
	});

	after(async () => {
		// Clean up any remaining sessions
		if (sessionId) {
			try {
				await manager.stop(sessionId);
			} catch (_e) {
				// Session might already be stopped
			}
		}
	});

	it("should send input with submit (\\r appended)", async () => {
		// Start a simple echo process that reads lines
		sessionId = await manager.start('while IFS= read -r line; do echo "Got: $line"; done', { name: "echo-test" });

		// Wait a moment for process to start
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Get output BEFORE sending input
		const outputBefore = await manager.getOutput(sessionId, { lines: 24 });
		console.log("=== BEFORE SUBMIT ===");
		console.log(outputBefore || "(empty)");

		// Send "hello" with \r (submit)
		await manager.sendInput(sessionId, "hello\r");

		// Get output IMMEDIATELY after submit
		const outputImmediate = await manager.getOutput(sessionId, { lines: 24 });
		console.log("=== IMMEDIATELY AFTER SUBMIT ===");
		console.log(outputImmediate);

		// Give it a moment to process
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Get output AFTER processing
		const outputAfter = await manager.getOutput(sessionId, { lines: 24 });
		console.log("=== AFTER 100ms DELAY ===");
		console.log(outputAfter);

		// Check that we got the echoed response
		assert(outputAfter.includes("Got: hello"), "Output should contain 'Got: hello'");

		// Clean up
		await manager.stop(sessionId);
	});

	it("should test Python REPL with submit", async () => {
		// Start Python in interactive mode
		sessionId = await manager.start("python3 -i", { name: "python-test" });

		// Wait for Python to start
		await new Promise((resolve) => setTimeout(resolve, 200));

		// Get output BEFORE sending input
		const outputBefore = await manager.getOutput(sessionId, { lines: 24 });
		console.log("=== BEFORE SUBMIT ===");
		console.log(outputBefore);

		// Send a command with submit
		await manager.sendInput(sessionId, "print('Hello from Python')\r");

		// Get output IMMEDIATELY after submit
		const outputImmediate = await manager.getOutput(sessionId, { lines: 24 });
		console.log("=== IMMEDIATELY AFTER SUBMIT ===");
		console.log(outputImmediate);

		// Wait for output
		await new Promise((resolve) => setTimeout(resolve, 200));

		// Get output AFTER processing
		const outputAfter = await manager.getOutput(sessionId, { lines: 24 });
		console.log("=== AFTER 200ms DELAY ===");
		console.log(outputAfter);

		// Check for Python output
		assert(outputAfter.includes("Hello from Python"), "Output should contain 'Hello from Python'");

		// Clean up
		await manager.stop(sessionId);
	});

	it("should test Claude CLI with submit", { timeout: 10000 }, async () => {
		// Check if Claude CLI exists
		const claudePath = path.join(projectRoot, "node_modules/@anthropic-ai/claude-code/cli.js");
		if (!fs.existsSync(claudePath)) {
			console.log("Claude CLI not found, skipping test");
			return;
		}

		// Check if ~/.claude directory exists (requires authenticated local Claude installation)
		const homeDir = process.env.HOME || process.env.USERPROFILE || "";
		const claudeConfigDir = path.join(homeDir, ".claude");
		if (!fs.existsSync(claudeConfigDir)) {
			console.log(
				"~/.claude directory not found (requires authenticated local Claude Code installation), skipping test",
			);
			return;
		}

		// Start Claude CLI with custom config dir (assumes ANTHROPIC_API_KEY is already in environment)
		sessionId = await manager.start(`node ${claudePath}`, { name: "claude-test" });

		// Wait for Claude to initialize
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Get output BEFORE sending input
		const outputBefore = await manager.getOutput(sessionId, { lines: 24 });
		console.log("=== BEFORE SUBMIT ===");
		console.log(outputBefore);

		// Send "hello\r" - terminal-manager will automatically split and send \r separately
		await manager.sendInput(sessionId, "hello\r");

		// Check if that worked
		const check1 = await manager.getOutput(sessionId, { lines: 24 });
		if (check1.toLowerCase().includes("esc to interrupt")) {
			console.log("\\r worked!");
		}

		// Get output IMMEDIATELY after submit
		const outputImmediate = await manager.getOutput(sessionId, { lines: 24 });
		console.log("=== IMMEDIATELY AFTER SUBMIT ===");
		console.log(outputImmediate);

		// Poll for up to 3 seconds for "esc to interrupt" to appear
		const startTime = Date.now();
		let foundEscPrompt = false;
		let lastOutput = outputImmediate;

		while (Date.now() - startTime < 3000) {
			await new Promise((resolve) => setTimeout(resolve, 200));

			const currentOutput = await manager.getOutput(sessionId, { lines: 24 });
			if (currentOutput !== lastOutput) {
				console.log(`=== AFTER ${Date.now() - startTime}ms ===`);
				console.log(currentOutput.substring(currentOutput.length - 500)); // Last 500 chars
				lastOutput = currentOutput;
			}

			if (currentOutput?.toLowerCase().includes("esc to interrupt")) {
				foundEscPrompt = true;
				console.log(">>> Found 'esc to interrupt' in output!");
				break;
			}
		}

		// Check that Claude started processing
		assert.strictEqual(foundEscPrompt, true, "Should find 'esc to interrupt' in output");

		// Clean up
		await manager.stop(sessionId);

		// Clean up config directory
		const cleanupDir = path.resolve(projectRoot, "claude-config");
		if (fs.existsSync(cleanupDir)) {
			fs.rmSync(cleanupDir, { recursive: true, force: true });
		}
	});

	it("should test OpenCode with submit", { timeout: 10000 }, async () => {
		// Start OpenCode (assumes it's installed and in PATH)
		try {
			sessionId = await manager.start("opencode", { name: "opencode-test" });
		} catch (_error) {
			console.log("OpenCode not available, skipping test");
			return;
		}

		// Wait for OpenCode to initialize
		await new Promise((resolve) => setTimeout(resolve, 5000));

		// Get output BEFORE sending input
		const outputBefore = await manager.getOutput(sessionId, { lines: 50 });
		console.log("=== BEFORE SUBMIT ===");
		console.log(outputBefore);

		// Send "hello\r" - terminal-manager will automatically split and send \r separately
		await manager.sendInput(sessionId, "hello\r");

		// Poll for up to 5 seconds for "esc" (more generic marker) to appear
		const startTime = Date.now();
		let foundEscMarker = false;
		let lastOutput = outputBefore;

		while (Date.now() - startTime < 5000) {
			await new Promise((resolve) => setTimeout(resolve, 200));

			const currentOutput = await manager.getOutput(sessionId, { lines: 50 });
			if (currentOutput !== lastOutput) {
				console.log(`=== AFTER ${Date.now() - startTime}ms ===`);
				console.log(currentOutput);
				lastOutput = currentOutput;
			}

			// OpenCode might use different text, look for markers that it received input
			const lowerOutput = currentOutput?.toLowerCase() || "";
			// Check if input appears in the output or if there's any change indicating processing
			if (
				currentOutput.includes("hello") ||
				lowerOutput.includes("esc") ||
				lowerOutput.includes("interrupt") ||
				lowerOutput.includes("processing") ||
				lowerOutput.includes("thinking")
			) {
				foundEscMarker = true;
				console.log(">>> Found processing marker in output!");
				break;
			}
		}

		// Final output check
		if (!foundEscMarker) {
			const finalOutput = await manager.getOutput(sessionId, { lines: 50 });
			console.log("=== FINAL OUTPUT ===");
			console.log(finalOutput);
		}

		// Check that OpenCode started processing
		assert.strictEqual(foundEscMarker, true, "Should find processing marker in output");

		// Clean up
		await manager.stop(sessionId);
	});
});
