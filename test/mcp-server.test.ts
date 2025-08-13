import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

describe("MCP Server", () => {
	let client: Client;
	let transport: StdioClientTransport;

	// Setup before all tests
	before(async () => {
		// Create client and connect
		transport = new StdioClientTransport({
			command: "npx",
			args: ["tsx", "src/index.ts"],
			env: process.env,
		});

		client = new Client(
			{
				name: "test-client",
				version: "1.0.0",
			},
			{
				capabilities: {},
			}
		);

		await client.connect(transport);
	});

	// Cleanup after all tests
	after(async () => {
		// Stop all processes first
		try {
			await client.callTool({
				name: "terminal",
				arguments: {
					args: { action: "stop" }
				}
			});
		} catch (err) {
			// Ignore errors during cleanup
		}

		// Close client connection
		await client.close();
	});

	it("should list available tools", async () => {
		const tools = await client.listTools();
		assert.ok(tools.tools.length > 0, "Should have at least one tool");
		
		const terminalTool = tools.tools.find((t) => t.name === "terminal");
		assert.ok(terminalTool, "Should have terminal tool");
	});

	it("should start a process", async () => {
		const result = await client.callTool({
			name: "terminal",
			arguments: {
				args: {
					action: "start",
					command: "echo 'Hello from MCP test'",
					name: "test-echo"
				}
			}
		});

		const processId = result.content[0].text;
		assert.strictEqual(processId, "test-echo", "Should return the process ID");
	});

	it("should get process output", async () => {
		// Start a process first
		const startResult = await client.callTool({
			name: "terminal",
			arguments: {
				args: {
					action: "start",
					command: "echo 'Test output'"
				}
			}
		});
		const processId = startResult.content[0].text;

		// Wait for output
		await new Promise(resolve => setTimeout(resolve, 500));

		// Get output
		const outputResult = await client.callTool({
			name: "terminal",
			arguments: {
				args: {
					action: "stdout",
					id: processId
				}
			}
		});

		const output = outputResult.content[0].text;
		assert.ok(output.includes("Test output"), "Output should contain the echoed text");
	});

	it("should list processes", async () => {
		const result = await client.callTool({
			name: "terminal",
			arguments: {
				args: { action: "list" }
			}
		});

		const processList = result.content[0].text;
		assert.ok(typeof processList === "string", "Should return a string of processes");
	});

	it("should handle interactive process", async () => {
		// Start interactive process
		const startResult = await client.callTool({
			name: "terminal",
			arguments: {
				args: {
					action: "start",
					command: "cat",
					name: "interactive-cat"
				}
			}
		});
		const processId = startResult.content[0].text;

		// Send input
		await client.callTool({
			name: "terminal",
			arguments: {
				args: {
					action: "stdin",
					id: processId,
					data: "Test input",
					submit: true
				}
			}
		});

		// Wait for echo
		await new Promise(resolve => setTimeout(resolve, 200));

		// Get output
		const outputResult = await client.callTool({
			name: "terminal",
			arguments: {
				args: {
					action: "stdout",
					id: processId
				}
			}
		});

		const output = outputResult.content[0].text;
		assert.ok(output.includes("Test input"), "Should echo the input");

		// Stop the process
		await client.callTool({
			name: "terminal",
			arguments: {
				args: {
					action: "stop",
					id: processId
				}
			}
		});
	});

	it("should stop a specific process", async () => {
		// Start a process
		const startResult = await client.callTool({
			name: "terminal",
			arguments: {
				args: {
					action: "start",
					command: "sleep 60",
					name: "test-stop"
				}
			}
		});

		// Stop it
		const stopResult = await client.callTool({
			name: "terminal",
			arguments: {
				args: {
					action: "stop",
					id: "test-stop"
				}
			}
		});

		const result = stopResult.content[0].text;
		assert.ok(result.includes("stopped"), "Should confirm process stopped");
	});

	it("should get terminal size", async () => {
		// Start a process
		const startResult = await client.callTool({
			name: "terminal",
			arguments: {
				args: {
					action: "start",
					command: "bash",
					name: "test-size"
				}
			}
		});

		// Get terminal size
		const sizeResult = await client.callTool({
			name: "terminal",
			arguments: {
				args: {
					action: "term-size",
					id: "test-size"
				}
			}
		});

		const sizeText = sizeResult.content[0].text;
		const [rows, cols] = sizeText.split(" ").map(Number);
		assert.strictEqual(rows, 24, "Default rows should be 24");
		assert.strictEqual(cols, 80, "Default cols should be 80");

		// Cleanup
		await client.callTool({
			name: "terminal",
			arguments: {
				args: {
					action: "stop",
					id: "test-size"
				}
			}
		});
	});

	it("should check version", async () => {
		const result = await client.callTool({
			name: "terminal",
			arguments: {
				args: { action: "version" }
			}
		});

		const version = result.content[0].text;
		assert.ok(version.match(/^\d+\.\d+\.\d+$/), "Should return a valid version string");
	});
});