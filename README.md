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
- Users can attach to AI-spawned processes from their own terminal, similar to screen/tmux. Watch what the AI is doing in real-time or jump in to help!

Two output modes for different use cases:
- **Terminal mode (stdout)**: Returns the rendered screen with full scrollback - perfect for TUIs like vim, htop, or interactive debuggers where visual layout matters
- **Stream mode**: Returns raw output with optional ANSI stripping and incremental reading - ideal for build processes, server logs, and high-volume output where you only need new data

Each process runs in a proper pseudo-TTY with full terminal emulation, preserving colors, cursor movement, and special key sequences - exactly as if a human were typing at the keyboard. Processes run in the background, so your agent stays responsive while managing long-running tools.

## Architecture

terminalcp uses a centralized server architecture inspired by tmux:
- **Single server process** manages all terminal sessions (auto-spawns when needed)
- **Sessions persist** across MCP server restarts and client disconnections
- **Multiple clients** can connect to the same session simultaneously
- **Full CLI interface** for direct terminal management outside of MCP
- **Unix domain sockets** enable direct terminal attachment from any client

## Requirements
- Node.js 20 or newer
- An MCP client (VS Code, Cursor, Windsurf, Claude Desktop, etc.)

## Getting Started

First, install the terminalcp MCP server with your client.

**Standard config** works in most tools:

```json
{
  "mcpServers": {
    "terminalcp": {
      "command": "npx",
      "args": ["@mariozechner/terminalcp@latest", "--mcp"]
    }
  }
}
```

<details>
<summary>Claude Code</summary>

Use the Claude Code CLI to add the terminalcp server:

```bash
claude mcp add -s user terminalcp npx @mariozechner/terminalcp@latest --mcp
```
</details>

<details>
<summary>Claude Desktop</summary>

Follow the MCP install [guide](https://modelcontextprotocol.io/quickstart/user), use the standard config above.

</details>

<details>
<summary>Cursor</summary>

Go to `Cursor Settings` -> `MCP` -> `Add new MCP Server`. Name it "terminalcp", use `command` type with the command `npx @mariozechner/terminalcp@latest --mcp`.

</details>

<details>
<summary>VS Code</summary>

Follow the MCP install [guide](https://code.visualstudio.com/docs/copilot/chat/mcp-servers#_add-an-mcp-server), use the standard config above. You can also install using the VS Code CLI:

```bash
# For VS Code
code --add-mcp '{"name":"terminalcp","command":"npx","args":["@mariozechner/terminalcp@latest","--mcp"]}'
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

## MCP Usage Examples

### Starting and Managing Processes

```json
// Start with auto-generated ID
{"action": "start", "command": "python3 -i"}
// Returns: "proc-3465b9b687af"

// Start with custom name (becomes the ID)
{"action": "start", "command": "npm run dev", "name": "dev-server"}
// Returns: "dev-server"

// Start in specific directory
{"action": "start", "command": "python3 script.py", "cwd": "/path/to/project", "name": "analyzer"}
// Returns: "analyzer"
```

### Interacting with Running Sessions

```json
// Send input with automatic Enter key
{"action": "stdin", "id": "dev-server", "data": "npm test", "submit": true}
// Returns: ""

// Send input without Enter (for building up commands)
{"action": "stdin", "id": "analyzer", "data": "import numpy as np"}
{"action": "stdin", "id": "analyzer", "data": "\r"}  // Manual Enter

// Get terminal output (rendered screen)
{"action": "stdout", "id": "dev-server"}
// Returns: Full terminal screen with colors and formatting

// Get last N lines only
{"action": "stdout", "id": "dev-server", "lines": 50}
```

### Monitoring Long-Running Processes

```json
// Get all output as raw stream
{"action": "stream", "id": "dev-server"}

// Get only new output since last check
{"action": "stream", "id": "dev-server", "since_last": true}

// Keep ANSI color codes
{"action": "stream", "id": "dev-server", "since_last": true, "strip_ansi": false}
```

### Process Management

```json
// List all sessions
{"action": "list"}
// Returns: "dev-server running /Users/you/project npm run dev\nanalyzer stopped /path/to/project python3 script.py"

// Stop specific process
{"action": "stop", "id": "dev-server"}
// Returns: "stopped dev-server"

// Stop ALL processes
{"action": "stop"}
// Returns: "stopped 3 processes"

// Check version compatibility
{"action": "version"}
// Returns: "1.2.2"
```

### Interactive AI Agents Example

```json
// Start Claude with a memorable name
{"action": "start", "command": "/Users/username/.claude/local/claude --dangerously-skip-permissions", "name": "claude"}

// Send a prompt
{"action": "stdin", "id": "claude", "data": "Write a test for main.py", "submit": true}

// Get the response
{"action": "stdout", "id": "claude"}

// Clean up when done
{"action": "stop", "id": "claude"}
```

### Debugging with LLDB

```json
{"action": "start", "command": "lldb ./myapp", "name": "debugger"}
{"action": "stdin", "id": "debugger", "data": "break main", "submit": true}
{"action": "stdin", "id": "debugger", "data": "run", "submit": true}
{"action": "stdout", "id": "debugger"}  // Get the formatted debugger interface
{"action": "stdin", "id": "debugger", "data": "bt", "submit": true}  // Backtrace
{"action": "stdout", "id": "debugger"}
```

### Build Process Monitoring

```json
{"action": "start", "command": "npm run build", "name": "build"}
// Monitor build progress
{"action": "stream", "id": "build", "since_last": true}
// ... wait a bit ...
{"action": "stream", "id": "build", "since_last": true}  // Get only new output
```

## CLI Usage

terminalcp can also be used as a standalone CLI tool:

```bash
# List all active sessions
terminalcp ls

# Start a new session with a custom name
terminalcp start my-app "npm run dev"

# Attach to a session interactively (Ctrl+B to detach)
terminalcp attach my-app

# Get output from a session
terminalcp stdout my-app
terminalcp stdout my-app 50  # Last 50 lines

# Send input to a session
terminalcp stdin my-app "echo hello"
terminalcp stdin my-app "npm test\r" # Auto-press Enter

# Monitor logs
terminalcp stream my-app --since-last

# Stop sessions
terminalcp stop my-app
terminalcp stop  # Stop all

# Maintenance
terminalcp version
terminalcp kill-server
```

## Important Usage Notes

- **Interactive CLIs**: Use `"submit": true` to automatically append Enter key, or send `\r` separately for manual control
- **Aliases don't work**: Commands run via `bash -c`, so use absolute paths or commands in PATH
- **Process persistence**: Sessions persist across MCP server restarts - manually stop them when done
- **Named sessions**: Use the `name` parameter when starting to create human-readable session IDs

## Attaching to AI-Spawned Sessions

You can attach to any session from your terminal to watch or interact with AI-spawned processes:

1. **AI spawns a process with a name**:
```json
{"action": "start", "command": "python3 -i", "name": "python-debug"}
```

2. **Attach from your terminal**:
```bash
terminalcp attach python-debug
```

3. **Interact directly**:
- Type commands as normal
- Terminal resizing is automatically synchronized
- Press **Ctrl+B** to detach (session continues running)
- Multiple users can attach to the same session simultaneously

This is perfect for debugging what the AI is doing, jumping in to help, or monitoring long-running processes.

## How it works

terminalcp exposes a single MCP tool called `terminal` that accepts JSON commands. The server uses stdio transport and manages multiple background processes through a centralized server architecture. Each process runs in a pseudo-TTY (via node-pty) with its own virtual terminal powered by xterm.js headless. Commands are executed through `bash -c` for proper PTY handling.

### Tool: `terminal`

The terminal tool accepts a JSON object with different action types:

#### Start a process
```json
{
  "action": "start",
  "command": "npm run dev",
  "cwd": "/path/to/project",  // optional
  "name": "dev-server"  // optional: becomes the session ID
}
```
**Returns**: Session ID string (either the provided name or auto-generated like "proc-3465b9b687af")

#### Stop a process
```json
// Stop a specific process
{
  "action": "stop",
  "id": "proc-abc123"
}

// Stop ALL processes
{
  "action": "stop"
}
```
**Returns**: Confirmation of termination

#### Get terminal screen output (stdout)
```json
{
  "action": "stdout",
  "id": "proc-abc123",
  "lines": 50  // Optional: limit to last N lines
}
```
**Returns**: Rendered terminal buffer with up to 10,000 lines of scrollback history

Use `stdout` for:
- TUI applications (vim, htop, less)
- Interactive debuggers (gdb, lldb)
- REPLs with formatted output
- Any tool where visual formatting matters

Note: If scrollback exceeds viewport, the TUI may handle scrolling internally - try sending Page Up/Down (`\u001b[5~` / `\u001b[6~`) via stdin to navigate.

#### Get raw stream output
```json
{
  "action": "stream",
  "id": "proc-abc123",
  "since_last": true,  // Optional: only new output since last read (default: false)
  "strip_ansi": false  // Optional: keep ANSI escape codes (default: true, codes are stripped)
}
```
**Returns**: Raw output stream with ANSI codes stripped by default (set strip_ansi: false to keep them)

Use `stream` for:
- Incremental log monitoring (with `since_last: true`)
- Build processes and compilation output
- High-volume streaming data
- When you need clean text output without terminal control codes
- Set `strip_ansi: false` only if you need the raw ANSI sequences

#### Send input to a process
```json
{
  "action": "stdin",
  "id": "dev-server",
  "data": "ls -la",
  "submit": true  // Optional: automatically append Enter key (\r)
}
```
**Returns**: Empty string

**Options**:
- `submit`: (optional, boolean) When `true`, automatically appends Enter key (`\r`) to the input. Defaults to `false`.

For interactive CLIs, use `submit: true` for convenience, or send text and Enter separately for manual control.

Send ANSI sequences like Ctrl+C:
```json
{
  "action": "stdin",
  "id": "proc-abc123",
  "data": "\x03"
}
```

#### Get terminal size
```json
{
  "action": "term-size",
  "id": "dev-server"
}
```
**Returns**: String like "24 80 150" (rows, columns, scrollback lines)

#### List all processes
```json
{
  "action": "list"
}
```
**Returns**: Newline-separated list of sessions with format: "id status cwd command"

#### Check server version
```json
{
  "action": "version"
}
```
**Returns**: Version string (e.g., "1.2.2")

#### Kill the terminal server
```json
{
  "action": "kill-server"
}
```
**Returns**: "shutting down"

## Development

```bash
# Install dependencies
npm install

# Build for production
npm run build

# Run tests
npm test

# Run checks (linting, formatting, type checking)
npm run check
```

## Comparison with screen/tmux

### Can you use screen?

Technically yes, but it's significantly more complex and limited. Here's how Claude would try to emulate terminalcp with screen:

#### Starting a process
```bash
# terminalcp
{"action": "start", "command": "lldb myapp", "name": "debug"}
# Returns: "debug"

# screen equivalent
screen -dmS debug -L lldb myapp
# No feedback on success/failure
```

#### Sending input
```bash
# terminalcp
{"action": "stdin", "id": "debug", "data": "b main", "submit": true}
# Returns: ""

# screen equivalent
screen -S debug -X stuff $'b main\n'
# No confirmation the command was received
```

#### Getting output
```bash
# terminalcp
{"action": "stdout", "id": "debug"}
# Returns: Clean, rendered terminal output as string

# screen equivalent
screen -S debug -X hardcopy /tmp/output.txt
cat /tmp/output.txt
# Returns: Raw terminal buffer with ANSI codes, timing issues
```

#### Monitoring changes
```bash
# terminalcp
{"action": "stream", "id": "debug", "since_last": true}
# Returns: Only new output since last check

# screen equivalent
# No built-in way - must diff files or parse screenlog manually
tail -f screenlog.0 | grep "pattern"  # Crude approximation
```

### Key limitations of screen/tmux

1. **No structured responses** - Everything is text in files or stdout
2. **No reliable output retrieval** - Must use hardcopy or logging with timing guesswork
3. **ANSI escape sequence pollution** - Output full of terminal control codes clogging up the agent's context
4. **No incremental reading** - Can't easily get "what's new since last check"
6. **No process lifecycle info** - Don't know when processes exit or their exit codes
7. **Timing issues** - Must guess when commands complete with sleep
8. **Not great for modern TUIs** - Tools like Claude CLI that constantly redraw their interface produce massive amounts of escape sequences in screen logs, making output practically unusable

## License

MIT