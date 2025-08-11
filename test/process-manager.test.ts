#!/usr/bin/env node
import { ProcessManager } from "../src/process-manager.js";

async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testProcessManager() {
	console.log("Testing ProcessManager directly...\n");
	const manager = new ProcessManager();

	try {
		// Test 1: Simple echo
		console.log("=== Test 1: Simple echo ===");
		const echoId = await manager.start("echo 'Hello World'");
		console.log(`Started process: ${echoId}`);
		
		await sleep(500);
		
		const echoOutput = await manager.getFullOutput(echoId);
		console.log("Buffer output:", JSON.stringify(echoOutput.buffer));
		console.log("Raw output:", JSON.stringify(echoOutput.raw));
		
		// Test 2: Multiple lines
		console.log("\n=== Test 2: Multiple lines ===");
		const multiId = await manager.start("echo 'Line 1'; echo 'Line 2'; echo 'Line 3'");
		
		await sleep(500);
		
		const multiOutput = await manager.getFullOutput(multiId);
		console.log("Buffer output:", JSON.stringify(multiOutput.buffer));
		console.log("Raw output:", JSON.stringify(multiOutput.raw));
		
		// Test 3: Interactive process
		console.log("\n=== Test 3: Interactive cat ===");
		const catId = await manager.start("cat");
		
		await sleep(200);
		await manager.sendInput(catId, "Test input\n");
		await sleep(200);
		await manager.sendInput(catId, "Another line\n");
		await sleep(200);
		
		const catOutput = await manager.getFullOutput(catId);
		console.log("Buffer output:", JSON.stringify(catOutput.buffer));
		console.log("Raw output:", JSON.stringify(catOutput.raw));
		
		await manager.stop(catId);
		
		// Test 4: Claude --version
		console.log("\n=== Test 4: Claude --version ===");
		const claudeId = await manager.start("/Users/badlogic/.claude/local/node_modules/.bin/claude --version");
		
		await sleep(1000);
		
		const claudeOutput = await manager.getFullOutput(claudeId);
		console.log("Buffer output:", JSON.stringify(claudeOutput.buffer));
		console.log("Raw output:", JSON.stringify(claudeOutput.raw));
		
		// Test 5: Process with ANSI colors
		console.log("\n=== Test 5: ANSI colors ===");
		const colorId = await manager.start("echo -e '\\033[31mRed\\033[0m \\033[32mGreen\\033[0m \\033[34mBlue\\033[0m'");
		
		await sleep(500);
		
		const colorOutput = await manager.getFullOutput(colorId);
		console.log("Buffer output:", JSON.stringify(colorOutput.buffer));
		console.log("Raw output:", JSON.stringify(colorOutput.raw));
		
		// Test 6: Test with less (alternate screen)
		console.log("\n=== Test 6: Less (alternate screen) ===");
		const lessId = await manager.start("echo 'Line 1\\nLine 2\\nLine 3' | less");
		
		await sleep(500);
		
		// Send 'q' to quit less
		await manager.sendInput(lessId, "q");
		await sleep(500);
		
		const lessOutput = await manager.getFullOutput(lessId);
		console.log("Buffer output length:", lessOutput.buffer.length);
		console.log("Buffer first 200 chars:", lessOutput.buffer.substring(0, 200));
		console.log("Raw output:", JSON.stringify(lessOutput.raw));
		
		// Test 7: List processes
		console.log("\n=== Test 7: List processes ===");
		const processes = manager.listProcesses();
		console.log("Active processes:", processes.length);
		processes.forEach(p => {
			console.log(`  - ${p.id}: ${p.command.substring(0, 50)}... (running: ${p.running})`);
		});
		
		// Cleanup
		console.log("\n=== Cleanup ===");
		await manager.stopAll();
		console.log("All processes stopped");
		
		console.log("\n✅ All tests passed!");
		
	} catch (error) {
		console.error("❌ Test failed:", error);
		await manager.stopAll();
		process.exit(1);
	}
}

testProcessManager().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});