# terminalcp

https://github.com/user-attachments/assets/e19a83da-e446-4ccd-9028-9c1cc0e09a5e

Let AI agents control interactive command-line tools like a human would.

## What it does

terminalcp enables AI agents to spawn and interact with any CLI tool in real-time - from debuggers like LLDB and GDB to other AI coding assistants like Claude Code, Gemini CLI, and Codex. Think of it as Playwright for the terminal: your agent can start processes, send keystrokes, read output, and maintain full interactive sessions with tools that normally require human input.

Key capabilities:
- Debug code step-by-step using command-line debuggers (LLDB, GDB, pdb)
- Collaborate with other AI tools by running them as subprocesses
- Interact with REPLs (Python, Node, Ruby), database shells, and system monitors
- Control any interactive CLI that expects human input
- Run multiple processes simultaneously without blocking the agent

Each process runs in a proper pseudo-TTY with full terminal emulation, preserving colors, cursor movement, and special key sequences - exactly as if a human were typing at the keyboard. Processes run in the background, so your agent stays responsive while managing long-running tools.

## Requirements
- Node.js 18 or newer
- VS Code, Cursor, Windsurf, Claude Desktop, Goose or any other MCP client

## Getting Started

First, install the terminalcp MCP server with your client.

**Standard config** works in most tools:

```json
{
  "mcpServers": {
    "terminalcp": {
      "command": "npx",
      "args": ["@mariozechner/terminalcp@latest"]
    }
  }
}
```

<details>
<summary>Claude Code</summary>

Use the Claude Code CLI to add the terminalcp server:

```bash
claude mcp add -s user terminalcp npx @mariozechner/terminalcp@latest
```
</details>

<details>
<summary>Claude Desktop</summary>

Follow the MCP install [guide](https://modelcontextprotocol.io/quickstart/user), use the standard config above.

</details>

<details>
<summary>Cursor</summary>

Go to `Cursor Settings` -> `MCP` -> `Add new MCP Server`. Name it "terminalcp", use `command` type with the command `npx @mariozechner/terminalcp@latest`.

</details>

<details>
<summary>VS Code</summary>

Follow the MCP install [guide](https://code.visualstudio.com/docs/copilot/chat/mcp-servers#_add-an-mcp-server), use the standard config above. You can also install using the VS Code CLI:

```bash
# For VS Code
code --add-mcp '{"name":"terminalcp","command":"npx","args":["@mariozechner/terminalcp@latest"]}'
```

After installation, the terminalcp server will be available for use with your GitHub Copilot agent in VS Code.
</details>

<details>
<summary>Windsurf</summary>

Follow Windsurf MCP [documentation](https://docs.windsurf.com/windsurf/cascade/mcp). Use the standard config above.

</details>

<details>
<summary>Other MCP Clients</summary>

For other MCP clients, use the standard config above or install globally:

```bash
npm install -g @mariozechner/terminalcp
```

Then use this config:
```json
{
  "mcpServers": {
    "terminalcp": {
      "command": "terminalcp"
    }
  }
}
```
</details>

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

// Get the full terminal output from the process
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
- **Automatic cleanup**: When the MCP server stops, all managed processes are automatically terminated

## How it works

terminalcp exposes a single MCP tool called `terminal` that accepts JSON commands. The server uses stdio transport and manages multiple background processes, each running in a pseudo-TTY (via node-pty) with its own virtual terminal powered by xterm.js headless. Commands are executed through `bash -c` for proper PTY handling.

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
