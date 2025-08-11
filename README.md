# tuicp

MCP server for spawning and controlling background processes with virtual terminals.

## What it solves

tuicp enables AI agents to spawn long-running processes in the background and interact with them through a virtual terminal interface. This solves the problem of agents needing to manage interactive processes, monitor their output, and send input - all while maintaining the full terminal context including ANSI escape sequences. Each process runs in a pseudo-TTY with a headless xterm.js terminal, preserving complete terminal state and scrollback buffer.

## Installation

Install globally:
```bash
npm install -g @mariozechner/tuicp
```

Or run directly with npx:
```bash
npx @mariozechner/tuicp
```

## Real-world Examples

### Interactive AI Agents (Claude, Gemini)
```json
// Start Claude (use absolute path - aliases don't work)
{"action": "start", "command": "/Users/username/.claude/local/claude --dangerously-skip-permissions"}

// Start in specific directory
{"action": "start", "command": "gemini", "cwd": "/path/to/project"}

// Send a prompt (MUST be two separate calls!)
{"action": "stdin", "id": "proc-123", "data": "Write a test for main.py"}
{"action": "stdin", "id": "proc-123", "data": "\r"}  // Submit with carriage return

// Get response
{"action": "stdout", "id": "proc-123"}

// Clean up when done
{"action": "stop", "id": "proc-123"}
```

### Python REPL
```json
{"action": "start", "command": "python3 -i"}
{"action": "stdin", "id": "proc-456", "data": "import numpy as np"}
{"action": "stdin", "id": "proc-456", "data": "\r"}
{"action": "stdout", "id": "proc-456"}
```

### LLDB Debugger
```json
{"action": "start", "command": "lldb ./myapp"}
{"action": "stdin", "id": "proc-789", "data": "break main"}
{"action": "stdin", "id": "proc-789", "data": "\r"}
{"action": "stdin", "id": "proc-789", "data": "run"}
{"action": "stdin", "id": "proc-789", "data": "\r"}
```

## Important Usage Notes

- **Interactive CLIs**: Must send text and Enter (`\r`) as separate stdin calls - see examples above
- **Aliases don't work**: Use absolute paths (e.g., `/Users/username/.claude/local/claude`)
- **Process cleanup**: Always stop processes when done with `{"action": "stop", "id": "proc-id"}`

## How it works

tuicp exposes a single MCP tool called `terminal` that accepts JSON commands. The server uses stdio transport and manages multiple background processes, each running in a pseudo-TTY (via node-pty) with its own virtual terminal powered by xterm.js headless. Commands are executed through `bash -c` for proper PTY handling.

### Tool: `terminal`

The terminal tool accepts a JSON object with different action types:

#### Start a process
```json
{
  "action": "start",
  "command": "npm run dev",
  "cwd": "/path/to/project"  // optional
}
```
**Returns**: Process ID, command, status, and working directory

#### Stop a process
```json
{
  "action": "stop",
  "id": "proc-abc123"
}
```
**Returns**: Confirmation of termination

#### Get output from a process
```json
{
  "action": "stdout",
  "id": "proc-abc123",
  "lines": 50
}
```
**Returns**: Last N lines from the terminal buffer (or entire buffer if lines not specified)

#### Send input to a process
```json
{
  "action": "stdin",
  "id": "proc-abc123",
  "data": "ls -la\n"
}
```
**Returns**: Confirmation of input sent

For interactive CLIs, send text and Enter separately (see examples above).

Send ANSI sequences like Ctrl+C:
```json
{
  "action": "stdin",
  "id": "proc-abc123",
  "data": "\x03"
}
```

#### List all processes
```json
{
  "action": "list"
}
```
**Returns**: Array of running processes with their IDs and commands

### MCP Configuration

Add to your MCP settings:

```json
{
  "mcpServers": {
    "tuicp": {
      "command": "npx",
      "args": ["@mariozechner/tuicp"]
    }
  }
}
```

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Run checks (linting, formatting, type checking)
npm run check
```

## License

MIT