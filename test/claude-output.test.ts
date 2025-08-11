#!/usr/bin/env node
import { ProcessManager } from "../src/process-manager.js";

async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testClaudeOutput() {
	console.log("Testing Claude output capture directly with ProcessManager...");
	const manager = new ProcessManager();

	try {
		// Test 1: Claude --help
		console.log("\n=== Test 1: Claude --help ===");
		const helpId = await manager.start("/Users/badlogic/.claude/local/node_modules/.bin/claude --help");
		console.log(`✓ Started claude --help with ID: ${helpId}`);

		// Wait for claude to output and exit
		await sleep(2000);

		const helpOutput = await manager.getFullOutput(helpId);
		
		console.log("\nTerminal Buffer Output (processed):");
		console.log("  Length:", helpOutput.buffer.length);
		console.log("  First 500 chars:", helpOutput.buffer.substring(0, 500));
		
		console.log("\nRaw Output (with ANSI):");
		console.log("  Length:", helpOutput.raw.length);
		console.log("  First 500 chars:", helpOutput.raw.substring(0, 500));

		// Test 2: Claude --version
		console.log("\n=== Test 2: Claude --version ===");
		const versionId = await manager.start("/Users/badlogic/.claude/local/node_modules/.bin/claude --version");
		console.log(`✓ Started claude --version with ID: ${versionId}`);

		await sleep(1000);

		const versionOutput = await manager.getFullOutput(versionId);
		console.log("Buffer output:", JSON.stringify(versionOutput.buffer.trim()));
		console.log("Raw output:", JSON.stringify(versionOutput.raw));

		// Test 3: Interactive command with input
		console.log("\n=== Test 3: Interactive bash ===");
		const bashId = await manager.start("bash -c 'read -p \"Enter name: \" name; echo \"Hello, $name!\"'");
		console.log(`✓ Started interactive bash with ID: ${bashId}`);

		await sleep(500);
		
		// Send input
		await manager.sendInput(bashId, "Claude\n");
		console.log("✓ Sent input: 'Claude'");
		
		await sleep(500);

		const bashOutput = await manager.getFullOutput(bashId);
		console.log("Buffer output:", JSON.stringify(bashOutput.buffer.trim()));
		console.log("Raw output:", JSON.stringify(bashOutput.raw));

		// Test 4: Less command (alternate screen)
		console.log("\n=== Test 4: Less (alternate screen) ===");
		const lessId = await manager.start("echo 'Line 1\\nLine 2\\nLine 3' | less");
		console.log(`✓ Started less with ID: ${lessId}`);

		await sleep(1000);

		// Send 'q' to quit less
		await manager.sendInput(lessId, "q");
		console.log("✓ Sent 'q' to quit less");
		
		await sleep(500);

		const lessOutput = await manager.getFullOutput(lessId);
		console.log("Buffer output:", JSON.stringify(lessOutput.buffer.trim()));
		console.log("Raw output:", JSON.stringify(lessOutput.raw));

		// Test 5: Command with ANSI colors
		console.log("\n=== Test 5: ANSI colors ===");
		const colorId = await manager.start("ls -la --color=always | head -5");
		console.log(`✓ Started colored ls with ID: ${colorId}`);

		await sleep(1000);

		const colorOutput = await manager.getFullOutput(colorId);
		console.log("Buffer output (first 200 chars):", colorOutput.buffer.substring(0, 200));
		console.log("Raw output (first 200 chars):", colorOutput.raw.substring(0, 200));
		
		// Check for ANSI codes in raw output
		const hasAnsiCodes = colorOutput.raw.includes('\x1b[');
		console.log("Raw output contains ANSI codes:", hasAnsiCodes);

		// Test 6: Long-running process with periodic output
		console.log("\n=== Test 6: Long-running process ===");
		const watchId = await manager.start("for i in 1 2 3; do echo \"Tick $i\"; sleep 0.5; done");
		console.log(`✓ Started watch command with ID: ${watchId}`);

		// Check output periodically
		for (let i = 0; i < 3; i++) {
			await sleep(600);
			const output = await manager.getOutput(watchId, { raw: true });
			console.log(`  After ${(i+1)*0.6}s:`, JSON.stringify(output));
		}

		// List all processes
		console.log("\n=== Active Processes ===");
		const processes = manager.listProcesses();
		console.log(`Total: ${processes.length}`);
		processes.forEach(p => {
			console.log(`  - ${p.id}: ${p.command.substring(0, 40)}... (running: ${p.running})`);
		});

		// Cleanup
		console.log("\n=== Cleanup ===");
		await manager.stopAll();
		console.log("✓ All processes stopped");

		console.log("\n✅ All tests completed successfully!");
		
	} catch (error) {
		console.error("❌ Test failed:", error);
		await manager.stopAll();
		process.exit(1);
	}
}

testClaudeOutput().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});