#!/usr/bin/env node
import { ProcessManager } from "../src/process-manager.js";

async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testClaudeExitVariations() {
	console.log("Testing different ways to exit Claude...\n");
	const manager = new ProcessManager();

	async function tryExit(method: string, sendFunc: () => Promise<void>): Promise<boolean> {
		console.log(`\n=== Testing: ${method} ===`);
		const claudeId = await manager.start("CI=false /Users/badlogic/.claude/local/node_modules/.bin/claude");
		console.log(`Started Claude with ID: ${claudeId}`);
		
		// Wait for initialization
		await sleep(2000);
		
		// Try the exit method
		await sendFunc.call(null);
		await sleep(2000);
		
		// Check if exited
		const proc = manager.getProcess(claudeId);
		if (!proc) {
			console.log(`✅ Claude exited with: ${method}`);
			return true;
		} else {
			console.log(`❌ Claude still running after: ${method}`);
			// Clean up
			await manager.stop(claudeId);
			await sleep(500);
			return false;
		}
	}

	try {
		// Test 1: Just /exit without newline
		await tryExit("/exit (no newline)", async () => {
			const claudeId = (await manager.listProcesses())[0].id;
			await manager.sendInput(claudeId, "/exit");
		});

		// Test 2: /exit with Enter key (newline)
		await tryExit("/exit with Enter", async () => {
			const claudeId = (await manager.listProcesses())[0].id;
			await manager.sendInput(claudeId, "/exit\n");
		});

		// Test 3: /exit with Return key (\r)
		await tryExit("/exit with Return", async () => {
			const claudeId = (await manager.listProcesses())[0].id;
			await manager.sendInput(claudeId, "/exit\r");
		});

		// Test 4: /exit with CRLF
		await tryExit("/exit with CRLF", async () => {
			const claudeId = (await manager.listProcesses())[0].id;
			await manager.sendInput(claudeId, "/exit\r\n");
		});

		// Test 5: Character by character
		await tryExit("Character by character", async () => {
			const claudeId = (await manager.listProcesses())[0].id;
			for (const char of "/exit") {
				await manager.sendInput(claudeId, char);
				await sleep(50);
			}
			await manager.sendInput(claudeId, "\n");
		});

		// Test 6: /quit
		await tryExit("/quit", async () => {
			const claudeId = (await manager.listProcesses())[0].id;
			await manager.sendInput(claudeId, "/quit\n");
		});

		// Test 7: Ctrl+D (EOF)
		await tryExit("Ctrl+D", async () => {
			const claudeId = (await manager.listProcesses())[0].id;
			await manager.sendInput(claudeId, "\x04");
		});

		// Test 8: q command
		await tryExit("q", async () => {
			const claudeId = (await manager.listProcesses())[0].id;
			await manager.sendInput(claudeId, "q\n");
		});

		console.log("\n✅ Testing complete!");
		
	} catch (error) {
		console.error("❌ Test failed:", error);
		await manager.stopAll();
		process.exit(1);
	} finally {
		await manager.stopAll();
	}
}

testClaudeExitVariations().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});