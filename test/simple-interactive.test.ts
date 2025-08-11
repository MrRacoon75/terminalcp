#!/usr/bin/env node
import { ProcessManager } from "../src/process-manager.js";

async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testSimpleInteractive() {
	console.log("Testing simple interactive programs with ProcessManager...\n");
	const manager = new ProcessManager();

	try {
		// Test 1: Python interactive mode
		console.log("=== Test 1: Python interactive ===");
		const pythonId = await manager.start("python3 -i");
		console.log(`✓ Started Python with ID: ${pythonId}`);
		
		await sleep(1000);
		
		// Send a simple command
		await manager.sendInput(pythonId, "print('Hello from Python')\n");
		await sleep(500);
		
		// Send exit command
		await manager.sendInput(pythonId, "exit()\n");
		await sleep(1000);
		
		// Check if Python exited
		const pythonProc = manager.getProcess(pythonId);
		if (!pythonProc) {
			console.log("✓ Python exited successfully");
		} else {
			const pythonOutput = await manager.getFullOutput(pythonId);
			console.log("Python still running. Output:", pythonOutput.raw);
		}
		
		// Test 2: Node.js interactive mode
		console.log("\n=== Test 2: Node.js interactive ===");
		const nodeId = await manager.start("node -i");
		console.log(`✓ Started Node.js with ID: ${nodeId}`);
		
		await sleep(1000);
		
		// Send a simple command
		await manager.sendInput(nodeId, "console.log('Hello from Node')\n");
		await sleep(500);
		
		// Send exit command
		await manager.sendInput(nodeId, ".exit\n");
		await sleep(1000);
		
		// Check if Node exited
		const nodeProc = manager.getProcess(nodeId);
		if (!nodeProc) {
			console.log("✓ Node.js exited successfully");
		} else {
			const nodeOutput = await manager.getFullOutput(nodeId);
			console.log("Node still running. Output:", nodeOutput.raw);
		}
		
		// Test 3: Bash interactive
		console.log("\n=== Test 3: Bash interactive ===");
		const bashId = await manager.start("bash -i");
		console.log(`✓ Started Bash with ID: ${bashId}`);
		
		await sleep(1000);
		
		// Send a command
		await manager.sendInput(bashId, "echo 'Hello from Bash'\n");
		await sleep(500);
		
		// Send exit
		await manager.sendInput(bashId, "exit\n");
		await sleep(1000);
		
		// Check if Bash exited
		const bashProc = manager.getProcess(bashId);
		if (!bashProc) {
			console.log("✓ Bash exited successfully");
		} else {
			const bashOutput = await manager.getFullOutput(bashId);
			console.log("Bash still running. Raw output length:", bashOutput.raw.length);
			console.log("Bash buffer output:", bashOutput.buffer.trim());
		}
		
		// Check remaining processes
		const remaining = manager.listProcesses();
		console.log(`\n=== Remaining processes: ${remaining.length} ===`);
		remaining.forEach(p => {
			console.log(`  - ${p.id}: ${p.command} (running: ${p.running})`);
		});
		
		// Clean up
		await manager.stopAll();
		console.log("\n✅ Test completed!");
		
	} catch (error) {
		console.error("❌ Test failed:", error);
		await manager.stopAll();
		process.exit(1);
	}
}

testSimpleInteractive().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});