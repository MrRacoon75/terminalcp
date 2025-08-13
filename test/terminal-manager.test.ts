import assert from "node:assert";
import { afterEach, beforeEach, describe, it } from "node:test";
import { TerminalManager } from "../src/terminal-manager.js";

describe("TerminalManager", () => {
	let manager: TerminalManager;

	// Create fresh manager for each test
	beforeEach(() => {
		manager = new TerminalManager();
	});

	// Clean up after each test
	afterEach(async () => {
		await manager.stopAll();
	});

	it("should start a simple process", async () => {
		const id = await manager.start("echo 'Hello from test'");
		assert.ok(id, "Process should have an ID");

		// Wait for process to complete
		await new Promise((resolve) => setTimeout(resolve, 500));

		// Check if process is in list
		const processes = manager.listProcesses();
		const proc = processes.find((p) => p.id === id);
		assert.ok(proc, "Process should be in list");
		assert.strictEqual(proc.running, false, "Echo process should have stopped");
	});

	it("should start process with custom name", async () => {
		const name = "test-session";
		const id = await manager.start("cat", { name });
		assert.strictEqual(id, name, "Process ID should match the custom name");

		// Stop it
		await manager.stop(id);

		// Verify it's no longer in the list (stop removes it completely)
		const processes = manager.listProcesses();
		const proc = processes.find((p) => p.id === id);
		assert.strictEqual(proc, undefined, "Process should be removed after stop");
	});

	it("should handle interactive process with input/output", async () => {
		const id = await manager.start("cat");

		// Send input
		await manager.sendInput(id, "Test input line\n");

		// Wait for output
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Get output
		const output = await manager.getOutput(id);
		assert.ok(output.includes("Test input line"), "Output should contain input text");

		// Stop the process
		await manager.stop(id);
	});

	it("should track process status correctly", async () => {
		const id = await manager.start("sleep 0.5");

		// Check initial status
		let processes = manager.listProcesses();
		let proc = processes.find((p) => p.id === id);
		assert.strictEqual(proc?.running, true, "Process should be running initially");

		// Wait for it to exit
		await new Promise((resolve) => setTimeout(resolve, 700));

		// Check status after exit
		processes = manager.listProcesses();
		proc = processes.find((p) => p.id === id);
		assert.strictEqual(proc?.running, false, "Process should be stopped after exit");
	});

	it("should resize terminal", async () => {
		const id = await manager.start("bash");

		// Get initial size
		const initialSize = manager.getTerminalSize(id);
		assert.strictEqual(initialSize.cols, 80, "Initial cols should be 80");
		assert.strictEqual(initialSize.rows, 24, "Initial rows should be 24");

		// Resize
		manager.resizeTerminal(id, 120, 40);

		// Get new size
		const newSize = manager.getTerminalSize(id);
		assert.strictEqual(newSize.cols, 120, "Cols should be 120 after resize");
		assert.strictEqual(newSize.rows, 40, "Rows should be 40 after resize");

		// Cleanup
		await manager.stop(id);
	});

	it("should handle stream output with since_last", async () => {
		const id = await manager.start("bash -c 'echo Line1; sleep 0.2; echo Line2; sleep 0.2; echo Line3'");

		// Wait for first line
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Get first stream WITHOUT since_last (gets everything)
		const stream1 = await manager.getStream(id, { since_last: false });
		assert.ok(stream1.includes("Line1"), "First stream should contain Line1");

		// Now read with since_last to establish position
		const _stream2 = await manager.getStream(id, { since_last: true });

		// Wait for more output
		await new Promise((resolve) => setTimeout(resolve, 300));

		// Get only new output since last read
		const stream3 = await manager.getStream(id, { since_last: true });

		// Stream3 should NOT contain Line1 (that was before our last since_last read)
		assert.ok(!stream3.includes("Line1"), "Incremental read should not contain old output");

		// Should have some new content
		assert.ok(stream3.length > 0, "Should have new output in incremental read");
	});

	it("should stop all processes", async () => {
		// Start multiple processes
		const _id1 = await manager.start("sleep 10", { name: "sleep1" });
		const _id2 = await manager.start("sleep 10", { name: "sleep2" });
		const _id3 = await manager.start("sleep 10", { name: "sleep3" });

		// Verify they're running
		let processes = manager.listProcesses();
		assert.strictEqual(processes.filter((p) => p.running).length, 3, "Should have 3 running processes");

		// Stop all
		await manager.stopAll();

		// Verify all are stopped
		processes = manager.listProcesses();
		const runningCount = processes.filter((p) => p.running).length;
		assert.strictEqual(runningCount, 0, "All processes should be stopped");
	});
});
