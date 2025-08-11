#!/usr/bin/env node
import { ProcessManager } from "../src/process-manager.js";

async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testClaudeSpawn() {
	console.log("Testing if Claude stays running when spawned...\n");
	const manager = new ProcessManager();

	try {
		// Start Claude
		console.log("=== Starting Claude ===");
		const claudeId = await manager.start("CI=false /Users/badlogic/.claude/local/node_modules/.bin/claude");
		console.log(`Started Claude with ID: ${claudeId}`);
		
		// Check immediately
		console.log("\n=== Checking immediately ===");
		let proc = manager.getProcess(claudeId);
		if (!proc) {
			console.log("❌ Claude exited immediately!");
			return;
		}
		console.log("✓ Claude is running (PID: " + proc.process.pid + ")");
		
		// Wait 1 second
		await sleep(1000);
		console.log("\n=== After 1 second ===");
		proc = manager.getProcess(claudeId);
		if (!proc) {
			console.log("❌ Claude exited after 1 second!");
			const processes = manager.listProcesses();
			console.log("Remaining processes:", processes.length);
			return;
		}
		console.log("✓ Claude still running");
		
		// Wait 3 more seconds
		await sleep(3000);
		console.log("\n=== After 4 seconds total ===");
		proc = manager.getProcess(claudeId);
		if (!proc) {
			console.log("❌ Claude exited after 4 seconds!");
			const processes = manager.listProcesses();
			console.log("Remaining processes:", processes.length);
			return;
		}
		console.log("✓ Claude still running");
		
		// Get output to see what's happening
		const output = await manager.getFullOutput(claudeId);
		console.log("\n=== Claude output ===");
		console.log("Buffer length:", output.buffer.length);
		console.log("Raw length:", output.raw.length);
		if (output.buffer.includes("Welcome to Claude")) {
			console.log("✓ Claude shows welcome message");
		}
		if (output.buffer.includes("Process exited")) {
			console.log("❌ Process exit message found!");
		}
		
		console.log("\n=== Current processes ===");
		const processes = manager.listProcesses();
		processes.forEach(p => {
			console.log(`- ${p.id}: running=${p.running}, pid=${p.pid}, exitCode=${p.exitCode}`);
		});
		
		// Test different ways to submit
		console.log("\n=== Testing different submission methods ===");
		
		// Method 1: Just newline
		console.log("\n1. Trying newline (\\n)");
		await manager.sendInput(claudeId, "say hello\n");
		await sleep(3000);
		let output1 = await manager.getFullOutput(claudeId);
		if (output1.buffer.includes("Hello!") || output1.buffer.includes("hello")) {
			console.log("✅ Got response with \\n!");
			console.log("\n--- Buffer after 'say hello' ---");
			console.log(output1.buffer);
			console.log("--- End buffer ---\n");
		} else {
			console.log("❌ No response with \\n");
			console.log("\n--- Buffer (no response) ---");
			console.log(output1.buffer);
			console.log("--- End buffer ---\n");
		}
		
		// Method 2: Carriage return
		console.log("\n2. Trying carriage return (\\r)");
		await manager.sendInput(claudeId, "say goodbye\r");
		await sleep(3000);
		let output2 = await manager.getFullOutput(claudeId);
		if (output2.buffer.includes("goodbye") || output2.buffer.includes("Goodbye")) {
			console.log("✅ Got response with \\r!");
			console.log("\n--- Buffer after 'say goodbye' ---");
			console.log(output2.buffer);
			console.log("--- End buffer ---\n");
		} else {
			console.log("❌ No response with \\r");
			console.log("\n--- Buffer (no response) ---");
			console.log(output2.buffer);
			console.log("--- End buffer ---\n");
		}
		
		// Method 3: Type character by character then Enter
		console.log("\n3. Trying character by character + \\r");
		for (const char of "tell me a joke") {
			await manager.sendInput(claudeId, char);
			await sleep(10);
		}
		await manager.sendInput(claudeId, "\r");
		await sleep(5000);
		let output3 = await manager.getFullOutput(claudeId);
		if (output3.buffer.includes("joke") || output3.raw.length > output2.raw.length + 100) {
			console.log("✅ Got response with char-by-char + \\r!");
			console.log("\n--- Buffer after 'tell me a joke' ---");
			console.log(output3.buffer);
			console.log("--- End buffer ---\n");
		} else {
			console.log("❌ No response with char-by-char + \\r");
			console.log("\n--- Buffer (no response) ---");
			console.log(output3.buffer);
			console.log("--- End buffer ---\n");
		}
		
		// Get final output
		const finalOutput = await manager.getFullOutput(claudeId);
		console.log("\n=== Final output ===");
		console.log("Buffer length:", finalOutput.buffer.length);
		console.log("Raw length:", finalOutput.raw.length);
		
		// Show last part of buffer to see response
		const lines = finalOutput.buffer.trim().split('\n');
		console.log("\n=== Last 30 lines of buffer ===");
		console.log(lines.slice(-30).join('\n'));
		
		// Clean up
		console.log("\n🧹 Cleaning up...");
		await manager.stopAll();
		
	} catch (error) {
		console.error("❌ Test failed:", error);
		await manager.stopAll();
		process.exit(1);
	}
}

testClaudeSpawn().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});