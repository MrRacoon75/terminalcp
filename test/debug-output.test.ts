#!/usr/bin/env node
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function debugOutput() {
	console.log("Debug: Testing terminal output capture...");

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

		// Test 1: Simple echo without ANSI
		console.log("\n=== Test 1: Simple echo ===");
		const echoResult = await client.callTool({
			name: "terminal",
			arguments: {
				args: {
					action: "start",
					command: "echo 'Line 1'; echo 'Line 2'; echo 'Line 3'",
				},
			},
		});
		const echoId = JSON.parse(echoResult.content[0].text).id;
		
		await new Promise((resolve) => setTimeout(resolve, 500));
		
		const echoBuffer = await client.callTool({
			name: "terminal",
			arguments: {
				args: {
					action: "stdout",
					id: echoId,
					raw: false,
				},
			},
		});
		console.log("Buffer output:", JSON.stringify(echoBuffer.content[0].text));
		
		const echoRaw = await client.callTool({
			name: "terminal",
			arguments: {
				args: {
					action: "stdout",
					id: echoId,
					raw: true,
				},
			},
		});
		console.log("Raw output:", JSON.stringify(echoRaw.content[0].text));

		// Test 2: Output with ANSI codes
		console.log("\n=== Test 2: ANSI cursor movement ===");
		const ansiResult = await client.callTool({
			name: "terminal",
			arguments: {
				args: {
					action: "start",
					// This simulates what might be happening with claude
					command: "printf 'Line 1\\r\\nLine 2\\r\\nLine 3\\r\\n'",
				},
			},
		});
		const ansiId = JSON.parse(ansiResult.content[0].text).id;
		
		await new Promise((resolve) => setTimeout(resolve, 500));
		
		const ansiBuffer = await client.callTool({
			name: "terminal",
			arguments: {
				args: {
					action: "stdout",
					id: ansiId,
					raw: false,
				},
			},
		});
		console.log("Buffer output:", JSON.stringify(ansiBuffer.content[0].text));
		
		const ansiRaw = await client.callTool({
			name: "terminal",
			arguments: {
				args: {
					action: "stdout",
					id: ansiId,
					raw: true,
				},
			},
		});
		console.log("Raw output:", JSON.stringify(ansiRaw.content[0].text));

		// Test 3: Check what claude --version outputs
		console.log("\n=== Test 3: claude --version ===");
		const versionResult = await client.callTool({
			name: "terminal",
			arguments: {
				args: {
					action: "start",
					command: "/Users/badlogic/.claude/local/node_modules/.bin/claude --version",
				},
			},
		});
		const versionId = JSON.parse(versionResult.content[0].text).id;
		
		await new Promise((resolve) => setTimeout(resolve, 1000));
		
		const versionBuffer = await client.callTool({
			name: "terminal",
			arguments: {
				args: {
					action: "stdout",
					id: versionId,
					raw: false,
				},
			},
		});
		console.log("Buffer length:", versionBuffer.content[0].text.length);
		console.log("Buffer first 200 chars:", versionBuffer.content[0].text.substring(0, 200));
		
		const versionRaw = await client.callTool({
			name: "terminal",
			arguments: {
				args: {
					action: "stdout",
					id: versionId,
					raw: true,
				},
			},
		});
		console.log("Raw output:", JSON.stringify(versionRaw.content[0].text));

		// Let's also check the raw bytes
		console.log("\n=== Raw bytes of claude output ===");
		const rawBytes = Buffer.from(versionRaw.content[0].text);
		console.log("First 100 bytes (hex):", rawBytes.slice(0, 100).toString('hex'));
		console.log("First 100 bytes (with escape codes visible):");
		let visibleEscapes = versionRaw.content[0].text.substring(0, 100)
			.replace(/\x1b/g, '\\x1b')
			.replace(/\r/g, '\\r')
			.replace(/\n/g, '\\n\n');
		console.log(visibleEscapes);

		// Cleanup
		await client.callTool({ name: "terminal", arguments: { args: { action: "stop", id: echoId } } });
		await client.callTool({ name: "terminal", arguments: { args: { action: "stop", id: ansiId } } });
		await client.callTool({ name: "terminal", arguments: { args: { action: "stop", id: versionId } } });

		console.log("\n✅ Debug tests completed!");
	} catch (error) {
		console.error("❌ Test failed:", error);
		process.exit(1);
	} finally {
		await client.close();
	}
}

debugOutput().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});