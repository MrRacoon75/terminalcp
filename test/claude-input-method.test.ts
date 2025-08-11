#!/usr/bin/env node
import { ProcessManager } from "../src/process-manager.js";

async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testClaudeInputMethod() {
	console.log("Testing which input method works with Claude...\n");
	const manager = new ProcessManager();

	try {
		// Test 1: Send string all at once with \n
		console.log("=== Test 1: Send 'say hello\\n' all at once ===");
		let claudeId = await manager.start("CI=false /Users/badlogic/.claude/local/node_modules/.bin/claude");
		await sleep(3000); // Wait for Claude to start
		
		await manager.sendInput(claudeId, "say hello\n");
		console.log("Sent 'say hello\\n', waiting 5 seconds...");
		await sleep(5000);
		
		let output = await manager.getFullOutput(claudeId);
		console.log("\nBuffer output:");
		console.log(output.buffer);
		if (output.buffer.includes("Hello") || output.buffer.includes("hello")) {
			console.log("✅ Got response!");
		} else {
			console.log("❌ No response");
		}
		await manager.stop(claudeId);
		await sleep(1000);
		
		// Test 2: Send string all at once with \r
		console.log("\n=== Test 2: Send 'say hello\\r' all at once ===");
		claudeId = await manager.start("CI=false /Users/badlogic/.claude/local/node_modules/.bin/claude");
		await sleep(3000);
		
		await manager.sendInput(claudeId, "say hello\r");
		console.log("Sent 'say hello\\r', waiting 5 seconds...");
		await sleep(5000);
		
		output = await manager.getFullOutput(claudeId);
		console.log("\nBuffer output:");
		console.log(output.buffer);
		if (output.buffer.includes("Hello") || output.buffer.includes("hello")) {
			console.log("✅ Got response!");
		} else {
			console.log("❌ No response");
		}
		await manager.stop(claudeId);
		await sleep(1000);
		
		// Test 3: Send char by char then \r
		console.log("\n=== Test 3: Send char-by-char then \\r ===");
		claudeId = await manager.start("CI=false /Users/badlogic/.claude/local/node_modules/.bin/claude");
		await sleep(3000);
		
		for (const char of "say hello") {
			await manager.sendInput(claudeId, char);
			await sleep(20);
		}
		await manager.sendInput(claudeId, "\r");
		console.log("Sent 'say hello' char-by-char then \\r, waiting 5 seconds...");
		await sleep(5000);
		
		output = await manager.getFullOutput(claudeId);
		console.log("\nBuffer output:");
		console.log(output.buffer);
		if (output.buffer.includes("Hello") || output.buffer.includes("hello")) {
			console.log("✅ Got response!");
		} else {
			console.log("❌ No response");
		}
		await manager.stop(claudeId);
		await sleep(1000);
		
		// Test 4: Send char by char then \n
		console.log("\n=== Test 4: Send char-by-char then \\n ===");
		claudeId = await manager.start("CI=false /Users/badlogic/.claude/local/node_modules/.bin/claude");
		await sleep(3000);
		
		for (const char of "say hello") {
			await manager.sendInput(claudeId, char);
			await sleep(20);
		}
		await manager.sendInput(claudeId, "\n");
		console.log("Sent 'say hello' char-by-char then \\n, waiting 5 seconds...");
		await sleep(5000);
		
		output = await manager.getFullOutput(claudeId);
		console.log("\nBuffer output:");
		console.log(output.buffer);
		if (output.buffer.includes("Hello") || output.buffer.includes("hello")) {
			console.log("✅ Got response!");
		} else {
			console.log("❌ No response");
		}
		
		await manager.stopAll();
		
	} catch (error) {
		console.error("❌ Test failed:", error);
		await manager.stopAll();
		process.exit(1);
	}
}

testClaudeInputMethod().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});