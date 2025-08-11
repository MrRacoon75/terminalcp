#!/usr/bin/env node
import { ProcessManager } from "../src/process-manager.js";

async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testClaudeExitOutput() {
	console.log("Testing Claude /exit command output...\n");
	const manager = new ProcessManager();

	try {
		// Start Claude
		console.log("=== Starting Claude ===");
		const claudeId = await manager.start("CI=false /Users/badlogic/.claude/local/node_modules/.bin/claude");
		console.log(`Started Claude with ID: ${claudeId}`);
		
		// Wait for initialization
		await sleep(3000);
		
		// Get initial output
		const initialOutput = await manager.getFullOutput(claudeId);
		console.log("\n=== Initial buffer (last 200 chars) ===");
		console.log(initialOutput.buffer.slice(-200));
		
		// Send /exit command
		console.log("\n=== Sending /exit ===");
		await manager.sendInput(claudeId, "/exit\n");
		await sleep(2000);
		
		// Get output after /exit
		const afterExitOutput = await manager.getFullOutput(claudeId);
		console.log("\n=== Buffer after /exit (last 500 chars) ===");
		console.log(afterExitOutput.buffer.slice(-500));
		
		// Check if there's an exit confirmation or if Claude is waiting for something
		console.log("\n=== Raw output after /exit (last 500 chars) ===");
		console.log(JSON.stringify(afterExitOutput.raw.slice(-500)));
		
		// Try sending 'y' in case it's asking for confirmation
		console.log("\n=== Sending 'y' for confirmation ===");
		await manager.sendInput(claudeId, "y\n");
		await sleep(1000);
		
		const afterConfirm = await manager.getFullOutput(claudeId);
		console.log("\n=== Buffer after 'y' (last 300 chars) ===");
		console.log(afterConfirm.buffer.slice(-300));
		
		// Check if process is still running
		const proc = manager.getProcess(claudeId);
		if (!proc) {
			console.log("\n✅ Claude exited!");
		} else {
			console.log("\n❌ Claude still running");
			console.log("Process PID:", proc.process.pid);
			console.log("Exit code:", proc.process.exitCode);
		}
		
		// Clean up
		await manager.stopAll();
		
	} catch (error) {
		console.error("❌ Test failed:", error);
		await manager.stopAll();
		process.exit(1);
	}
}

testClaudeExitOutput().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});