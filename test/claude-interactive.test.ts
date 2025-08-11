#!/usr/bin/env node
import { ProcessManager } from "../src/process-manager.js";

async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testClaudeInteractive() {
	console.log("Testing Claude in interactive mode with ProcessManager...\n");
	const manager = new ProcessManager();

	try {
		// Start Claude in interactive mode (no arguments)
		console.log("=== Starting Claude in interactive mode ===");
		// Set CI=false to ensure Claude runs in interactive mode
		const claudeId = await manager.start("CI=false /Users/badlogic/.claude/local/node_modules/.bin/claude");
		console.log(`✓ Started Claude with ID: ${claudeId}`);

		// Wait for Claude to initialize and show its prompt
		console.log("⏳ Waiting for Claude to initialize...");
		await sleep(5000);

		// Get the initial output (should show Claude's welcome message and prompt)
		console.log("\n=== Initial Claude Output ===");
		const initialOutput = await manager.getFullOutput(claudeId);
		
		console.log("Terminal Buffer length:", initialOutput.buffer.length);
		console.log("Terminal Buffer (first 1000 chars):");
		console.log(JSON.stringify(initialOutput.buffer.substring(0, 1000)));
		
		console.log("\nRaw Output length:", initialOutput.raw.length);
		console.log("Raw Output (first 1000 chars):");
		console.log(JSON.stringify(initialOutput.raw.substring(0, 1000)));
		
		// Check the process details
		const proc = manager.getProcess(claudeId);
		if (proc) {
			console.log("\nProcess details:");
			console.log("  PID:", proc.process.pid);
			console.log("  Killed:", proc.process.killed);
			console.log("  Exit code:", proc.process.exitCode);
		}

		// Check that Claude is still running
		const processesBeforeExit = manager.listProcesses();
		console.log("\n=== Processes before sending /exit ===");
		console.log(`Total processes: ${processesBeforeExit.length}`);
		processesBeforeExit.forEach(p => {
			console.log(`  - ${p.id}: ${p.command} (running: ${p.running})`);
		});

		// Send /exit command to quit Claude
		console.log("\n=== Sending /exit command ===");
		await manager.sendInput(claudeId, "/exit\n");
		console.log("✓ Sent '/exit' command to Claude");

		// Wait for Claude to process the exit command
		console.log("⏳ Waiting for Claude to process /exit...");
		await sleep(2000);
		
		// Try pressing Enter to confirm exit
		console.log("=== Sending Enter to confirm ===");
		await manager.sendInput(claudeId, "\n");
		await sleep(2000);

		// Get final output to see exit message
		console.log("\n=== Final Output after /exit ===");
		const finalOutput = await manager.getFullOutput(claudeId);
		
		// Show only the last part of the output (should contain exit message)
		const bufferLines = finalOutput.buffer.trim().split('\n');
		const lastLines = bufferLines.slice(-10).join('\n');
		console.log("Last 10 lines of buffer:");
		console.log(lastLines);

		// Check if Claude process has exited
		const processesAfterExit = manager.listProcesses();
		console.log("\n=== Processes after /exit ===");
		console.log(`Total processes: ${processesAfterExit.length}`);
		
		if (processesAfterExit.length === 0) {
			console.log("✅ No processes remaining - Claude exited successfully!");
		} else {
			console.log("⚠️ Processes still in list:");
			processesAfterExit.forEach(p => {
				console.log(`  - ${p.id}: ${p.command}`);
				console.log(`    running: ${p.running}, pid: ${p.pid}, exitCode: ${p.exitCode}`);
			});
			
			// Clean up any remaining processes
			console.log("\n🧹 Cleaning up remaining processes...");
			await manager.stopAll();
		}

		console.log("\n✅ Test completed successfully!");
		
	} catch (error) {
		console.error("❌ Test failed:", error);
		
		// Make sure to clean up on error
		console.log("\n🧹 Cleaning up due to error...");
		await manager.stopAll();
		
		process.exit(1);
	}
}

testClaudeInteractive().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});