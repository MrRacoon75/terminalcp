#!/usr/bin/env node
import { ProcessManager } from "../src/process-manager.js";

async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testClaudeSubmit() {
	console.log("Testing different ways to submit input to Claude...\n");
	const manager = new ProcessManager();

	try {
		// Test 1: Send text and \r together
		console.log("=== Test 1: Send 'say hello\\r' in one write ===");
		let claudeId = await manager.start("CI=false /Users/badlogic/.claude/local/node_modules/.bin/claude");
		await sleep(3000);
		
		await manager.sendInput(claudeId, "say hello\r");
		console.log("Sent in one write, waiting...");
		await sleep(5000);
		
		let output = await manager.getFullOutput(claudeId);
		if (output.buffer.includes("How can I help")) {
			console.log("✅ Got LLM response!");
		} else {
			console.log("❌ No LLM response - only shows input in prompt");
		}
		await manager.stop(claudeId);
		await sleep(1000);
		
		// Test 2: Send text, then \r separately
		console.log("\n=== Test 2: Send 'say hello' then '\\r' in two writes ===");
		claudeId = await manager.start("CI=false /Users/badlogic/.claude/local/node_modules/.bin/claude");
		await sleep(3000);
		
		await manager.sendInput(claudeId, "say hello");
		await sleep(100); // Small delay between writes
		await manager.sendInput(claudeId, "\r");
		console.log("Sent in two writes, waiting...");
		await sleep(5000);
		
		output = await manager.getFullOutput(claudeId);
		console.log("\nBuffer output:");
		console.log(output.buffer);
		if (output.buffer.includes("How can I help")) {
			console.log("✅ Got LLM response!");
		} else {
			console.log("❌ No LLM response - only shows input in prompt");
		}
		await manager.stop(claudeId);
		await sleep(1000);
		
		// Test 3: Send text, wait longer, then \r
		console.log("\n=== Test 3: Send 'say hello', wait 1s, then '\\r' ===");
		claudeId = await manager.start("CI=false /Users/badlogic/.claude/local/node_modules/.bin/claude");
		await sleep(3000);
		
		await manager.sendInput(claudeId, "say hello");
		await sleep(1000); // Longer delay
		await manager.sendInput(claudeId, "\r");
		console.log("Sent with 1s delay, waiting...");
		await sleep(5000);
		
		output = await manager.getFullOutput(claudeId);
		if (output.buffer.includes("How can I help")) {
			console.log("✅ Got LLM response!");
		} else {
			console.log("❌ No LLM response - only shows input in prompt");
		}
		
		await manager.stopAll();
		
	} catch (error) {
		console.error("❌ Test failed:", error);
		await manager.stopAll();
		process.exit(1);
	}
}

testClaudeSubmit().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});