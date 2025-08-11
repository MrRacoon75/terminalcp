#!/usr/bin/env node
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function testRawOutput() {
	console.log("Testing raw output with ANSI sequences...");

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
		await client.connect(transport);
		console.log("✓ Connected to MCP server");

		// Test 1: Command with color output
		console.log("\nTest 1: Color output with ANSI sequences");
		const colorResult = await client.callTool({
			name: "terminal",
			arguments: {
				args: {
					action: "start",
					command: "echo -e '\\033[31mRed\\033[0m \\033[32mGreen\\033[0m \\033[34mBlue\\033[0m'",
				},
			},
		});
		const colorId = JSON.parse(colorResult.content[0].text).id;
		console.log(`✓ Started color test process: ${colorId}`);

		await new Promise((resolve) => setTimeout(resolve, 500));

		// Get raw output (with ANSI)
		const rawOutput = await client.callTool({
			name: "terminal",
			arguments: {
				args: {
					action: "stdout",
					id: colorId,
					raw: true,
				},
			},
		});
		console.log("Raw output (with ANSI):", JSON.stringify(rawOutput.content[0].text));

		// Get processed output (without ANSI)
		const processedOutput = await client.callTool({
			name: "terminal",
			arguments: {
				args: {
					action: "stdout",
					id: colorId,
					raw: false,
				},
			},
		});
		console.log("Processed output (clean):", JSON.stringify(processedOutput.content[0].text));

		// Test 2: Interactive command
		console.log("\nTest 2: Interactive command with raw output");
		const interactiveResult = await client.callTool({
			name: "terminal",
			arguments: {
				args: {
					action: "start",
					command: "bash -c 'PS1=\"> \" bash --norc'",
				},
			},
		});
		const interactiveId = JSON.parse(interactiveResult.content[0].text).id;
		console.log(`✓ Started interactive bash: ${interactiveId}`);

		await new Promise((resolve) => setTimeout(resolve, 500));

		// Send command
		await client.callTool({
			name: "terminal",
			arguments: {
				args: {
					action: "stdin",
					id: interactiveId,
					data: "echo 'Hello World'\n",
				},
			},
		});

		await new Promise((resolve) => setTimeout(resolve, 500));

		// Get raw output
		const bashRawOutput = await client.callTool({
			name: "terminal",
			arguments: {
				args: {
					action: "stdout",
					id: interactiveId,
					raw: true,
				},
			},
		});
		console.log("Bash raw output:", bashRawOutput.content[0].text);

		// Cleanup
		await client.callTool({
			name: "terminal",
			arguments: {
				args: {
					action: "stop",
					id: colorId,
				},
			},
		});

		await client.callTool({
			name: "terminal",
			arguments: {
				args: {
					action: "stop",
					id: interactiveId,
				},
			},
		});

		console.log("\n✅ Raw output tests passed!");
	} catch (error) {
		console.error("❌ Test failed:", error);
		process.exit(1);
	} finally {
		await client.close();
	}
}

testRawOutput().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});