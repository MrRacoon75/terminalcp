import assert from "node:assert";
import { after, before, describe, it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

interface MCPResult {
	content: Array<{ type: string; text: string }>;
}

describe("MCP Server", () => {
	let client: Client;
	let transport: StdioClientTransport;

	// Setup before all tests
	before(async () => {
		// Create client and connect
		transport = new StdioClientTransport({
			command: "npx",
			args: ["tsx", "src/index.ts", "--mcp"],
			env: process.env as Record<string, string>,
		});

		client = new Client(
			{
				name: "test-client",
				version: "1.0.0",
			},
			{
				capabilities: {},
			},
		);

		await client.connect(transport);
	});

	// Cleanup after all tests
	after(async () => {
		// Stop all processes first
		try {
			await client.callTool({
				name: "terminalcp",
				arguments: {
					args: { action: "stop" },
				},
			});
		} catch (_err) {
			// Ignore errors during cleanup
		}

		// Close client connection
		await client.close();
	});

	it("should list available tools", async () => {
		const tools = await client.listTools();
		assert.ok(tools.tools.length > 0, "Should have at least one tool");

		const terminalTool = tools.tools.find((t) => t.name === "terminalcp");
		assert.ok(terminalTool, "Should have terminal tool");
	});

	it("should start a process", async () => {
		const result = (await client.callTool({
			name: "terminalcp",
			arguments: {
				args: {
					action: "start",
					command: "echo 'Hello from MCP test'",
					name: "test-echo",
				},
			},
		})) as MCPResult;

		const processId = result.content[0].text;
		assert.strictEqual(processId, "test-echo", "Should return the process ID");
	});

	it("should get process output", async () => {
		// Start a process first
		const startResult = (await client.callTool({
			name: "terminalcp",
			arguments: {
				args: {
					action: "start",
					command: "echo 'Test output'",
				},
			},
		})) as MCPResult;
		const processId = startResult.content[0].text;

		// Wait for output
		await new Promise((resolve) => setTimeout(resolve, 500));

		// Get output
		const outputResult = (await client.callTool({
			name: "terminalcp",
			arguments: {
				args: {
					action: "stdout",
					id: processId,
				},
			},
		})) as MCPResult;

		const output = outputResult.content[0].text;
		assert.ok(output.includes("Test output"), "Output should contain the echoed text");
	});

	it("should list processes", async () => {
		const result = (await client.callTool({
			name: "terminalcp",
			arguments: {
				args: { action: "list" },
			},
		})) as MCPResult;

		const processList = result.content[0].text;
		assert.ok(typeof processList === "string", "Should return a string of processes");
	});

	it("should handle interactive process", async () => {
		// Start interactive process
		const startResult = (await client.callTool({
			name: "terminalcp",
			arguments: {
				args: {
					action: "start",
					command: "cat",
					name: "interactive-cat",
				},
			},
		})) as MCPResult;
		const processId = startResult.content[0].text;

		// Send input
		await client.callTool({
			name: "terminalcp",
			arguments: {
				args: {
					action: "stdin",
					id: processId,
					data: "Test input",
					submit: true,
				},
			},
		});

		// Wait for echo
		await new Promise((resolve) => setTimeout(resolve, 200));

		// Get output
		const outputResult = (await client.callTool({
			name: "terminalcp",
			arguments: {
				args: {
					action: "stdout",
					id: processId,
				},
			},
		})) as MCPResult;

		const output = outputResult.content[0].text;
		assert.ok(output.includes("Test input"), "Should echo the input");

		// Stop the process
		await client.callTool({
			name: "terminalcp",
			arguments: {
				args: {
					action: "stop",
					id: processId,
				},
			},
		});
	});

	it("should stop a specific process", async () => {
		// Start a process
		const _startResult = await client.callTool({
			name: "terminalcp",
			arguments: {
				args: {
					action: "start",
					command: "sleep 60",
					name: "test-stop",
				},
			},
		});

		// Stop it
		const stopResult = (await client.callTool({
			name: "terminalcp",
			arguments: {
				args: {
					action: "stop",
					id: "test-stop",
				},
			},
		})) as MCPResult;

		const result = stopResult.content[0].text;
		assert.ok(result.includes("stopped"), "Should confirm process stopped");
	});

	it("should get terminal size", async () => {
		// Start a process
		const _startResult = await client.callTool({
			name: "terminalcp",
			arguments: {
				args: {
					action: "start",
					command: "bash",
					name: "test-size",
				},
			},
		});

		// Get terminal size
		const sizeResult = (await client.callTool({
			name: "terminalcp",
			arguments: {
				args: {
					action: "term-size",
					id: "test-size",
				},
			},
		})) as MCPResult;

		const sizeText = sizeResult.content[0].text;
		const [rows, cols] = sizeText.split(" ").map(Number);
		assert.strictEqual(rows, 24, "Default rows should be 24");
		assert.strictEqual(cols, 80, "Default cols should be 80");

		// Cleanup
		await client.callTool({
			name: "terminalcp",
			arguments: {
				args: {
					action: "stop",
					id: "test-size",
				},
			},
		});
	});

	it("should check version", async () => {
		const result = (await client.callTool({
			name: "terminalcp",
			arguments: {
				args: { action: "version" },
			},
		})) as MCPResult;

		const version = result.content[0].text;
		assert.ok(version.match(/^\d+\.\d+\.\d+$/), "Should return a valid version string");
	});
});
