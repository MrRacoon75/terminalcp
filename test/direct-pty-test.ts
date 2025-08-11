#!/usr/bin/env node
import * as pty from "node-pty";

async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testDirectPty() {
	console.log("Testing PTY directly with Claude...\n");
	
	// Test 1: Send complete string with \r
	console.log("=== Test 1: Direct PTY - 'say hello\\r' ===");
	let proc = pty.spawn("/bin/bash", ["-c", "CI=false /Users/badlogic/.claude/local/node_modules/.bin/claude"], {
		name: "xterm-256color",
		cols: 80,
		rows: 24,
		cwd: process.cwd(),
		env: process.env as { [key: string]: string },
	});
	
	let output1 = "";
	proc.onData((data) => {
		output1 += data;
	});
	
	await sleep(3000);
	proc.write("say hello\r");
	await sleep(5000);
	
	console.log("Got response:", output1.includes("How can I help") ? "✅ Yes" : "❌ No");
	proc.kill();
	await sleep(1000);
	
	// Test 2: Send string then \r separately  
	console.log("\n=== Test 2: Direct PTY - 'say hello' then '\\r' ===");
	proc = pty.spawn("/bin/bash", ["-c", "CI=false /Users/badlogic/.claude/local/node_modules/.bin/claude"], {
		name: "xterm-256color",
		cols: 80,
		rows: 24,
		cwd: process.cwd(),
		env: process.env as { [key: string]: string },
	});
	
	let output2 = "";
	proc.onData((data) => {
		output2 += data;
	});
	
	await sleep(3000);
	proc.write("say hello");
	await sleep(100);
	proc.write("\r");
	await sleep(5000);
	
	console.log("Got response:", output2.includes("How can I help") ? "✅ Yes" : "❌ No");
	proc.kill();
	await sleep(1000);
	
	// Test 3: Char by char
	console.log("\n=== Test 3: Char by char + \\r ===");
	proc = pty.spawn("/bin/bash", ["-c", "CI=false /Users/badlogic/.claude/local/node_modules/.bin/claude"], {
		name: "xterm-256color",
		cols: 80,
		rows: 24,
		cwd: process.cwd(),
		env: process.env as { [key: string]: string },
	});
	
	let output3 = "";
	proc.onData((data) => {
		output3 += data;
	});
	
	await sleep(3000);
	for (const char of "say hello") {
		proc.write(char);
		await sleep(20);
	}
	proc.write("\r");
	await sleep(5000);
	
	console.log("Got response:", output3.includes("How can I help") ? "✅ Yes" : "❌ No");
	if (output3.includes("How can I help")) {
		console.log("\nShowing part of output with response:");
		const lines = output3.split('\n');
		const relevantLines = lines.filter(line => 
			line.includes("say hello") || 
			line.includes("How can I help") || 
			line.includes("Hello"));
		console.log(relevantLines.join('\n'));
	}
	proc.kill();
}

testDirectPty().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});