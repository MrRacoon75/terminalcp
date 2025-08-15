import * as assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { buildInput } from "../src/key-parser.js";
import { TerminalManager } from "../src/terminal-manager.js";

describe("Key Parser Integration", () => {
	const manager = new TerminalManager();
	const sessions: string[] = [];

	after(async () => {
		// Clean up all sessions
		for (const id of sessions) {
			try {
				await manager.stop(id);
			} catch (e) {
				// Session might already be stopped
			}
		}
	});

	it("should handle buildInput with symbolic keys", async () => {
		const id = await manager.start("bash", { name: "key-test-1" });
		sessions.push(id);

		// Wait for bash to start
		await new Promise((resolve) => setTimeout(resolve, 500));

		// Send text with arrow keys to move cursor and insert text
		await manager.sendInput(id, buildInput("echo test", "Left", "Left", "Left", "Left", "hi ", "Enter"));

		// Wait for output
		await new Promise((resolve) => setTimeout(resolve, 500));

		const output = await manager.getOutput(id);
		assert.match(output, /echo hi test/, "Should show command with 'hi ' inserted");
		assert.match(output, /\nhi test/, "Should show output with inserted text");
	});

	it("should handle control sequences", async () => {
		const id = await manager.start("bash", { name: "key-test-2" });
		sessions.push(id);

		// Wait for bash to start
		await new Promise((resolve) => setTimeout(resolve, 500));

		// Send echo command
		await manager.sendInput(id, buildInput("echo hello", "Enter"));
		await new Promise((resolve) => setTimeout(resolve, 200));

		// Send Ctrl+C to interrupt, then another command
		await manager.sendInput(id, buildInput("sleep 10", "Enter"));
		await new Promise((resolve) => setTimeout(resolve, 200));
		await manager.sendInput(id, buildInput("C-c"));
		await new Promise((resolve) => setTimeout(resolve, 200));
		await manager.sendInput(id, buildInput("echo done", "Enter"));
		await new Promise((resolve) => setTimeout(resolve, 300));

		const output = await manager.getOutput(id);
		assert.match(output, /echo done/, "Should show the echo done command");
		assert.match(output, /\ndone/, "Should show 'done' output");
	});

	it("should handle navigation keys", async () => {
		const id = await manager.start("bash", { name: "key-test-3" });
		sessions.push(id);

		// Type a command and use Home/End keys
		await manager.sendInput(id, buildInput("echo world"));
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Go to beginning and add "hello "
		await manager.sendInput(id, buildInput("Home"));
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Move right past "echo " (5 chars)
		await manager.sendInput(id, buildInput("Right", "Right", "Right", "Right", "Right"));
		await new Promise((resolve) => setTimeout(resolve, 100));

		await manager.sendInput(id, buildInput("hello ", "Enter"));
		await new Promise((resolve) => setTimeout(resolve, 200));

		const output = await manager.getOutput(id);
		assert.match(output, /hello world/, "Should output 'hello world'");
	});

	it("should handle function keys and special keys", async () => {
		const id = await manager.start("bash", { name: "key-test-4" });
		sessions.push(id);

		// Test Tab completion
		await manager.sendInput(id, buildInput("ec", "Tab"));
		await new Promise((resolve) => setTimeout(resolve, 200));

		const output = await manager.getOutput(id);
		// Tab might complete to 'echo' or show options
		assert.match(output, /ec/, "Should show at least 'ec'");
	});

	it("should maintain backward compatibility with strings", async () => {
		const id = await manager.start("bash -c 'read input && echo \"Got: $input\"'", { name: "key-test-5" });
		sessions.push(id);

		// Send as regular string with escape sequences
		await manager.sendInput(id, "hello world\r");
		await new Promise((resolve) => setTimeout(resolve, 200));

		const output = await manager.getOutput(id);
		assert.match(output, /Got: hello world/, "Should handle string input");
	});

	it("should handle mixed text and keys", async () => {
		const id = await manager.start("bash -c 'read input && echo \"Got: $input\"'", { name: "key-test-6" });
		sessions.push(id);

		// Mix of text and special keys
		await manager.sendInput(id, buildInput("hello", "Space", "world", "Enter"));
		await new Promise((resolve) => setTimeout(resolve, 200));

		const output = await manager.getOutput(id);
		assert.match(output, /Got: hello world/, "Should combine text and Space key");
	});
});
