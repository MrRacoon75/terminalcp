#!/usr/bin/env node
import { ProcessManager } from "../src/process-manager.js";

async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testClaudeRealTyping() {
	console.log("Testing Claude input more like real typing...\n");
	const manager = new ProcessManager();

	try {
		// Test 1: Just send text and \r together (baseline - we know this doesn't work)
		console.log("=== Test 1: Baseline - 'say hello\\r' together ===");
		let claudeId = await manager.start("CI=false /Users/badlogic/.claude/local/node_modules/.bin/claude");
		await sleep(3000);
		
		await manager.sendInput(claudeId, "say hello\r");
		await sleep(5000);
		
		let output = await manager.getFullOutput(claudeId);
		console.log("Result: " + (output.buffer.includes("How can I help") ? "✅ Works" : "❌ Doesn't work"));
		await manager.stop(claudeId);
		await sleep(1000);
		
		// Test 2: Send \n instead of \r
		console.log("\n=== Test 2: Try 'say hello\\n' ===");
		claudeId = await manager.start("CI=false /Users/badlogic/.claude/local/node_modules/.bin/claude");
		await sleep(3000);
		
		await manager.sendInput(claudeId, "say hello\n");
		await sleep(5000);
		
		output = await manager.getFullOutput(claudeId);
		console.log("Result: " + (output.buffer.includes("How can I help") ? "✅ Works" : "❌ Doesn't work"));
		await manager.stop(claudeId);
		await sleep(1000);
		
		// Test 3: Send \r\n (CRLF)
		console.log("\n=== Test 3: Try 'say hello\\r\\n' ===");
		claudeId = await manager.start("CI=false /Users/badlogic/.claude/local/node_modules/.bin/claude");
		await sleep(3000);
		
		await manager.sendInput(claudeId, "say hello\r\n");
		await sleep(5000);
		
		output = await manager.getFullOutput(claudeId);
		console.log("Result: " + (output.buffer.includes("How can I help") ? "✅ Works" : "❌ Doesn't work"));
		await manager.stop(claudeId);
		await sleep(1000);
		
		// Test 4: Type char by char with tiny delays (simulate human typing)
		console.log("\n=== Test 4: Char by char with 50ms delays + \\r ===");
		claudeId = await manager.start("CI=false /Users/badlogic/.claude/local/node_modules/.bin/claude");
		await sleep(3000);
		
		for (const char of "say hello") {
			await manager.sendInput(claudeId, char);
			await sleep(50);
		}
		await manager.sendInput(claudeId, "\r");
		await sleep(5000);
		
		output = await manager.getFullOutput(claudeId);
		console.log("Result: " + (output.buffer.includes("How can I help") ? "✅ Works" : "❌ Doesn't work"));
		console.log("\nBuffer output:");
		console.log(output.buffer);
		
		await manager.stopAll();
		
	} catch (error) {
		console.error("❌ Test failed:", error);
		await manager.stopAll();
		process.exit(1);
	}
}

testClaudeRealTyping().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});