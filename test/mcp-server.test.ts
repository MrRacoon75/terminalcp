#!/usr/bin/env node
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn } from "node:child_process";

async function testMCPServer() {
	console.log("Starting MCP server test...");

	// Spawn the MCP server
	const serverProcess = spawn("npx", ["tsx", "src/index.ts"], {
		stdio: ["pipe", "pipe", "pipe"],
		cwd: process.cwd(),
	});

	// Create MCP client
	const transport = new StdioClientTransport({
		command: "npx",
		args: ["tsx", "src/index.ts"],
	});

	const client = new Client(
		{
			name: "test-client",
			version: "1.0.0",
		},
		{
			capabilities: {},
		},
	);

	try {
		// Connect to server
		await client.connect(transport);
		console.log("✓ Connected to MCP server");

		// List available tools
		const tools = await client.listTools();
		console.log("✓ Available tools:", tools.tools?.map((t) => t.name).join(", "));

		// Test: Start a process
		console.log("\nTest 1: Starting a process...");
		const startResult = await client.callTool({
			name: "terminal",
			arguments: {
				args: {
					action: "start",
					command: "echo 'Hello from MCP test!'",
				},
			},
		});
		const startData = JSON.parse(startResult.content[0].text);
		const processId = startData.id;
		console.log(`✓ Process started with ID: ${processId}`);

		// Give process time to execute
		await new Promise((resolve) => setTimeout(resolve, 500));

		// Test: Get output
		console.log("\nTest 2: Getting process output...");
		const outputResult = await client.callTool({
			name: "terminal",
			arguments: {
				args: {
					action: "stdout",
					id: processId,
				},
			},
		});
		console.log("✓ Process output:", outputResult.content[0].text);

		// Test: List processes
		console.log("\nTest 3: Listing processes...");
		const listResult = await client.callTool({
			name: "terminal",
			arguments: {
				args: {
					action: "list",
				},
			},
		});
		console.log("✓ Active processes:", listResult.content[0].text);

		// Test: Send input to process
		console.log("\nTest 4: Starting interactive process and sending input...");
		const interactiveResult = await client.callTool({
			name: "terminal",
			arguments: {
				args: {
					action: "start",
					command: "cat",
				},
			},
		});
		const interactiveId = JSON.parse(interactiveResult.content[0].text).id;
		console.log(`✓ Interactive process started with ID: ${interactiveId}`);

		// Send input
		await client.callTool({
			name: "terminal",
			arguments: {
				args: {
					action: "stdin",
					id: interactiveId,
					data: "Test input line\n",
				},
			},
		});
		console.log("✓ Sent input to process");

		// Get output after input
		await new Promise((resolve) => setTimeout(resolve, 200));
		const interactiveOutput = await client.callTool({
			name: "terminal",
			arguments: {
				args: {
					action: "stdout",
					id: interactiveId,
				},
			},
		});
		console.log("✓ Process echoed:", interactiveOutput.content[0].text);

		// Test: Stop process
		console.log("\nTest 5: Stopping processes...");
		await client.callTool({
			name: "terminal",
			arguments: {
				args: {
					action: "stop",
					id: processId,
				},
			},
		});
		console.log(`✓ Stopped process ${processId}`);

		await client.callTool({
			name: "terminal",
			arguments: {
				args: {
					action: "stop",
					id: interactiveId,
				},
			},
		});
		console.log(`✓ Stopped process ${interactiveId}`);

		console.log("\n✅ All tests passed!");
	} catch (error) {
		console.error("❌ Test failed:", error);
		process.exit(1);
	} finally {
		// Cleanup
		await client.close();
		serverProcess.kill();
	}
}

// Run the test
testMCPServer().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});