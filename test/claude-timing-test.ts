#!/usr/bin/env node
import { ProcessManager } from "../src/process-manager.js";

async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testTiming(delay: number): Promise<boolean> {
	const manager = new ProcessManager();
	try {
		const claudeId = await manager.start("CI=false /Users/badlogic/.claude/local/node_modules/.bin/claude");
		await sleep(3000);
		
		await manager.sendInput(claudeId, "say hello");
		await sleep(delay);
		await manager.sendInput(claudeId, "\r");
		await sleep(5000);
		
		const output = await manager.getFullOutput(claudeId);
		const hasResponse = output.buffer.includes("How can I help") || 
		                   output.buffer.includes("Hello!") ||
		                   (output.buffer.match(/⏺/g) || []).length > 0;
		
		await manager.stop(claudeId);
		await sleep(500);
		return hasResponse;
	} catch (error) {
		await manager.stopAll();
		return false;
	}
}

async function findTimingThreshold() {
	console.log("Finding timing threshold for Claude input submission...\n");
	
	const delays = [0, 10, 50, 100, 200, 300, 400, 500, 750, 1000];
	
	for (const delay of delays) {
		console.log(`Testing ${delay}ms delay...`);
		const works = await testTiming(delay);
		console.log(`  ${delay}ms: ${works ? '✅ Works' : '❌ Fails'}`);
	}
}

findTimingThreshold().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});