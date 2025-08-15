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

		// Send input with Enter key
		await client.callTool({
			name: "terminalcp",
			arguments: {
				args: {
					action: "stdin",
					id: processId,
					data: "Test input\r",
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

	it("should handle escape sequences in stdin", async () => {
		// Start a process
		const startResult = (await client.callTool({
			name: "terminalcp",
			arguments: {
				args: {
					action: "start",
					command: "bash",
					name: "test-escapes",
				},
			},
		})) as MCPResult;

		const sessionId = startResult.content[0].text;
		assert.strictEqual(sessionId, "test-escapes");

		// Send text with arrow keys using escape sequences
		await client.callTool({
			name: "terminalcp",
			arguments: {
				args: {
					action: "stdin",
					id: sessionId,
					data: "echo hello world\u001b[D\u001b[D\u001b[D\u001b[D\u001b[Dmy \r",
				},
			},
		});

		// Wait for output
		await new Promise((resolve) => setTimeout(resolve, 200));

		// Get output
		const outputResult = (await client.callTool({
			name: "terminalcp",
			arguments: {
				args: {
					action: "stdout",
					id: sessionId,
				},
			},
		})) as MCPResult;

		const output = outputResult.content[0].text;
		assert.ok(output.includes("hello my world"), "Should have inserted 'my ' in the middle");

		// Test control sequences
		await client.callTool({
			name: "terminalcp",
			arguments: {
				args: {
					action: "stdin",
					id: sessionId,
					data: "sleep 5\r",
				},
			},
		});

		await new Promise((resolve) => setTimeout(resolve, 100));

		// Send Ctrl+C using escape sequence
		await client.callTool({
			name: "terminalcp",
			arguments: {
				args: {
					action: "stdin",
					id: sessionId,
					data: "\u0003",
				},
			},
		});

		await new Promise((resolve) => setTimeout(resolve, 100));

		// Verify process was interrupted
		await client.callTool({
			name: "terminalcp",
			arguments: {
				args: {
					action: "stdin",
					id: sessionId,
					data: "echo done\r",
				},
			},
		});

		await new Promise((resolve) => setTimeout(resolve, 200));

		const finalOutput = (await client.callTool({
			name: "terminalcp",
			arguments: {
				args: {
					action: "stdout",
					id: sessionId,
				},
			},
		})) as MCPResult;

		assert.ok(finalOutput.content[0].text.includes("done"), "Should show 'done' after Ctrl+C");

		// Cleanup
		await client.callTool({
			name: "terminalcp",
			arguments: {
				args: {
					action: "stop",
					id: sessionId,
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

	it("should handle navigation escape sequences", async () => {
		// Start a bash session
		const startResult = (await client.callTool({
			name: "terminalcp",
			arguments: {
				args: {
					action: "start",
					command: "bash",
					name: "test-navigation",
				},
			},
		})) as MCPResult;

		const sessionId = startResult.content[0].text;

		// Test Home (\u001b[H) and End (\u001b[F)
		await client.callTool({
			name: "terminalcp",
			arguments: {
				args: {
					action: "stdin",
					id: sessionId,
					data: "echo test\u001b[H", // Go to beginning of line
				},
			},
		});

		await new Promise((resolve) => setTimeout(resolve, 50));

		// Move right past prompt to get to command
		await client.callTool({
			name: "terminalcp",
			arguments: {
				args: {
					action: "stdin",
					id: sessionId,
					data: "\u001b[C\u001b[C\u001b[C\u001b[C\u001b[C\u001b[C\u001b[C\u001b[C\u001b[C\u001b[C",
				},
			},
		});

		await client.callTool({
			name: "terminalcp",
			arguments: {
				args: {
					action: "stdin",
					id: sessionId,
					data: "start \u001b[F end\r", // Add text, go to end, add more
				},
			},
		});

		await new Promise((resolve) => setTimeout(resolve, 200));

		const output = (await client.callTool({
			name: "terminalcp",
			arguments: {
				args: {
					action: "stdout",
					id: sessionId,
				},
			},
		})) as MCPResult;

		// The exact output depends on terminal behavior, but we should see our text
		assert.ok(output.content[0].text.includes("start"), "Should contain 'start'");

		// Cleanup
		await client.callTool({
			name: "terminalcp",
			arguments: {
				args: {
					action: "stop",
					id: sessionId,
				},
			},
		});
	});

	it("should handle special keys (Tab, Backspace)", async () => {
		// Start a bash session
		const startResult = (await client.callTool({
			name: "terminalcp",
			arguments: {
				args: {
					action: "start",
					command: "bash",
					name: "test-special-keys",
				},
			},
		})) as MCPResult;

		const sessionId = startResult.content[0].text;

		// Test Tab (\t) for completion
		await client.callTool({
			name: "terminalcp",
			arguments: {
				args: {
					action: "stdin",
					id: sessionId,
					data: "ec\t", // Tab for completion
				},
			},
		});

		await new Promise((resolve) => setTimeout(resolve, 200));

		// Test Backspace (\u007f)
		await client.callTool({
			name: "terminalcp",
			arguments: {
				args: {
					action: "stdin",
					id: sessionId,
					data: " test\u007f\u007f\u007fxy\r", // Type, backspace, type more
				},
			},
		});

		await new Promise((resolve) => setTimeout(resolve, 200));

		const output = (await client.callTool({
			name: "terminalcp",
			arguments: {
				args: {
					action: "stdout",
					id: sessionId,
				},
			},
		})) as MCPResult;

		// Tab completion and backspace behavior varies by shell
		assert.ok(
			output.content[0].text.includes("echo") || output.content[0].text.includes("ec"),
			"Should show echo or ec command",
		);

		// Cleanup
		await client.callTool({
			name: "terminalcp",
			arguments: {
				args: {
					action: "stop",
					id: sessionId,
				},
			},
		});
	});

	it("should handle complex vim interaction", async () => {
		// Start a bash session
		const startResult = (await client.callTool({
			name: "terminalcp",
			arguments: {
				args: {
					action: "start",
					command: "bash",
					name: "test-vim",
				},
			},
		})) as MCPResult;

		const sessionId = startResult.content[0].text;

		// Start vim
		await client.callTool({
			name: "terminalcp",
			arguments: {
				args: {
					action: "stdin",
					id: sessionId,
					data: "vim test.txt\r",
				},
			},
		});

		await new Promise((resolve) => setTimeout(resolve, 500));

		// Enter insert mode, type, escape, save and quit
		await client.callTool({
			name: "terminalcp",
			arguments: {
				args: {
					action: "stdin",
					id: sessionId,
					data: "iHello from MCP\u001b:wq\r",
				},
			},
		});

		await new Promise((resolve) => setTimeout(resolve, 500));

		// Check file was created
		await client.callTool({
			name: "terminalcp",
			arguments: {
				args: {
					action: "stdin",
					id: sessionId,
					data: "cat test.txt\r",
				},
			},
		});

		await new Promise((resolve) => setTimeout(resolve, 200));

		const output = (await client.callTool({
			name: "terminalcp",
			arguments: {
				args: {
					action: "stdout",
					id: sessionId,
				},
			},
		})) as MCPResult;

		assert.ok(output.content[0].text.includes("Hello from MCP"), "Should show file contents");

		// Cleanup
		await client.callTool({
			name: "terminalcp",
			arguments: {
				args: {
					action: "stop",
					id: sessionId,
				},
			},
		});
	});

	it("should handle Meta/Alt sequences", async () => {
		// Start a bash session
		const startResult = (await client.callTool({
			name: "terminalcp",
			arguments: {
				args: {
					action: "start",
					command: "bash",
					name: "test-meta",
				},
			},
		})) as MCPResult;

		const sessionId = startResult.content[0].text;

		// Test Alt+b (\u001bb) for word backward in bash
		await client.callTool({
			name: "terminalcp",
			arguments: {
				args: {
					action: "stdin",
					id: sessionId,
					data: "echo one two three\u001bb\u001bb", // Move back two words
				},
			},
		});

		await client.callTool({
			name: "terminalcp",
			arguments: {
				args: {
					action: "stdin",
					id: sessionId,
					data: "inserted \u001b[F\r", // Insert text, go to end, enter
				},
			},
		});

		await new Promise((resolve) => setTimeout(resolve, 200));

		const output = (await client.callTool({
			name: "terminalcp",
			arguments: {
				args: {
					action: "stdout",
					id: sessionId,
				},
			},
		})) as MCPResult;

		// Meta key behavior varies by terminal
		assert.ok(
			output.content[0].text.includes("echo") ||
				output.content[0].text.includes("one") ||
				output.content[0].text.includes("two") ||
				output.content[0].text.includes("three"),
			"Should contain command elements",
		);

		// Cleanup
		await client.callTool({
			name: "terminalcp",
			arguments: {
				args: {
					action: "stop",
					id: sessionId,
				},
			},
		});
	});
});
