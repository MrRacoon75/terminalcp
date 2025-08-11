#!/usr/bin/env node
import { ProcessManager } from "../src/process-manager.js";

async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testClaudeExit() {
	console.log("Testing various Claude exit methods...\n");
	const manager = new ProcessManager();

	try {
		// Start Claude
		console.log("=== Starting Claude ===");
		const claudeId = await manager.start("CI=false /Users/badlogic/.claude/local/node_modules/.bin/claude");
		console.log(`Started Claude with ID: ${claudeId}`);
		
		// Wait for initialization
		await sleep(3000);
		
		// Try sending Ctrl+D (EOF)
		console.log("\n=== Trying Ctrl+D (EOF) ===");
		await manager.sendInput(claudeId, "\x04");
		await sleep(2000);
		
		// Check if exited
		let processes = manager.listProcesses();
		if (processes.length === 0) {
			console.log("✅ Claude exited with Ctrl+D!");
			return;
		}
		console.log(`Still running after Ctrl+D (${processes.length} processes)`);
		
		// Try sending Ctrl+C
		console.log("\n=== Trying Ctrl+C ===");
		await manager.sendInput(claudeId, "\x03");
		await sleep(2000);
		
		processes = manager.listProcesses();
		if (processes.length === 0) {
			console.log("✅ Claude exited with Ctrl+C!");
			return;
		}
		console.log(`Still running after Ctrl+C (${processes.length} processes)`);
		
		// Get output to see what's happening
		const output = await manager.getFullOutput(claudeId);
		console.log("\n=== Current buffer (last 500 chars) ===");
		console.log(output.buffer.slice(-500));
		
		// Clean up
		console.log("\n🧹 Cleaning up...");
		await manager.stopAll();
		
	} catch (error) {
		console.error("❌ Test failed:", error);
		await manager.stopAll();
		process.exit(1);
	}
}

testClaudeExit().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});