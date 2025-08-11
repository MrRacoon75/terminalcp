#!/usr/bin/env node
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn } from "node:child_process";

async function testClaudeOutput() {
	console.log("Testing Claude output capture through MCP server...");

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

		// Start claude with --help to get quick output and exit
		console.log("\nStarting claude --help through MCP server...");
		const result = await client.callTool({
			name: "terminal",
			arguments: {
				args: {
					action: "start",
					command: "/Users/badlogic/.claude/local/node_modules/.bin/claude --help",
				},
			},
		});
		
		const processId = JSON.parse(result.content[0].text).id;
		console.log(`✓ Started claude with ID: ${processId}`);

		// Wait for claude to output and exit
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Get terminal buffer output (processed)
		console.log("\n=== Terminal Buffer Output (processed) ===");
		const bufferOutput = await client.callTool({
			name: "terminal",
			arguments: {
				args: {
					action: "stdout",
					id: processId,
					raw: false,
				},
			},
		});
		console.log("Length:", bufferOutput.content[0].text.length);
		console.log("First 500 chars:", bufferOutput.content[0].text.substring(0, 500));

		// Get raw output (with ANSI)
		console.log("\n=== Raw Output (with ANSI) ===");
		const rawOutput = await client.callTool({
			name: "terminal",
			arguments: {
				args: {
					action: "stdout",
					id: processId,
					raw: true,
				},
			},
		});
		console.log("Length:", rawOutput.content[0].text.length);
		console.log("First 500 chars:", rawOutput.content[0].text.substring(0, 500));

		// Also test with a simpler command that uses alternate screen
		console.log("\n\nTesting with less command (uses alternate screen)...");
		const lessResult = await client.callTool({
			name: "terminal",
			arguments: {
				args: {
					action: "start",
					command: "echo 'Line 1\\nLine 2\\nLine 3' | less",
				},
			},
		});
		
		const lessId = JSON.parse(lessResult.content[0].text).id;
		console.log(`✓ Started less with ID: ${lessId}`);

		// Wait a bit
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// Send 'q' to quit less
		await client.callTool({
			name: "terminal",
			arguments: {
				args: {
					action: "stdin",
					id: lessId,
					data: "q",
				},
			},
		});

		await new Promise((resolve) => setTimeout(resolve, 500));

		// Get output from less
		console.log("\n=== Less Terminal Buffer Output ===");
		const lessBufferOutput = await client.callTool({
			name: "terminal",
			arguments: {
				args: {
					action: "stdout",
					id: lessId,
					raw: false,
				},
			},
		});
		console.log("Buffer output:", JSON.stringify(lessBufferOutput.content[0].text));

		console.log("\n=== Less Raw Output ===");
		const lessRawOutput = await client.callTool({
			name: "terminal",
			arguments: {
				args: {
					action: "stdout",
					id: lessId,
					raw: true,
				},
			},
		});
		console.log("Raw output:", JSON.stringify(lessRawOutput.content[0].text));

		// Cleanup
		try {
			await client.callTool({
				name: "terminal",
				arguments: {
					args: {
						action: "stop",
						id: processId,
					},
				},
			});
		} catch (e) {
			// Process might have already exited
		}

		try {
			await client.callTool({
				name: "terminal",
				arguments: {
					args: {
						action: "stop",
						id: lessId,
					},
				},
			});
		} catch (e) {
			// Process might have already exited
		}

		console.log("\n✅ Tests completed!");
	} catch (error) {
		console.error("❌ Test failed:", error);
		process.exit(1);
	} finally {
		await client.close();
	}
}

testClaudeOutput().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});