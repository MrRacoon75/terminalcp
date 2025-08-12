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

// Send a prompt with automatic Enter key
{"action": "stdin", "id": "proc-123", "data": "Write a test for main.py", "submit": true}

// Or manually control submission (two separate calls)
{"action": "stdin", "id": "proc-123", "data": "Write a test for main.py"}
{"action": "stdin", "id": "proc-123", "data": "\r"}  // Submit with carriage return

// Get the full terminal output from the process
{"action": "stdout", "id": "proc-123"}

// Clean up when done
{"action": "stop", "id": "proc-123"}

// Or stop ALL processes at once
{"action": "stop"}
```

### Python REPL
```json
{"action": "start", "command": "python3 -i"}
{"action": "stdin", "id": "proc-456", "data": "import numpy as np", "submit": true}
{"action": "stdout", "id": "proc-456"}
```

### LLDB Debugger
```json
{"action": "start", "command": "lldb ./myapp"}
{"action": "stdin", "id": "proc-789", "data": "break main", "submit": true}
{"action": "stdin", "id": "proc-789", "data": "run", "submit": true}
{"action": "stdout", "id": "proc-789"}  // Get the formatted debugger interface
```

### Build Process Monitoring
```json
{"action": "start", "command": "npm run build"}
{"action": "stream", "id": "proc-456", "since_last": true}  // Get new output only, ANSI codes stripped by default
// ... wait a bit ...
{"action": "stream", "id": "proc-456", "since_last": true}  // Get updates since last check
```

### Server Log Monitoring
```json
{"action": "start", "command": "npm run dev"}
{"action": "stream", "id": "proc-123", "since_last": true}  // Clean text without color codes by default
{"action": "stream", "id": "proc-123", "since_last": true, "strip_ansi": false}  // Keep ANSI codes if needed
```

## Important Usage Notes

- **Interactive CLIs**: Use `"submit": true` to automatically append Enter key, or send `\r` separately for manual control
- **Aliases don't work**: Use absolute paths (e.g., `/Users/username/.claude/local/claude`)
- **Process cleanup**: Stop individual processes with `{"action": "stop", "id": "proc-id"}` or all at once with `{"action": "stop"}`
- **Automatic cleanup**: When the MCP server stops, all managed processes are automatically terminated

## Attaching to AI-Spawned Sessions

terminalcp creates Unix domain sockets for each spawned process, allowing you to attach from your terminal, just like screen or tmux.

### How to Use

1. **AI spawns a process with a name**:
```json
{"action": "start", "command": "python3 -i", "name": "python-debug"}
```

2. **List active sessions from your terminal**:
```bash
terminalcp ls
# Output:
# Active sessions:
# ================
#   python-debug (proc-abc123)
#     Socket: /Users/you/.terminalcp/sessions/python-debug-proc-abc123.sock
#     Started: 1/15/2025, 10:30:45 AM
```

3. **Attach to the session**:
```bash
terminalcp attach python-debug
# OR use the process ID:
terminalcp attach proc-abc123
```

4. **Interact with the process**:
- Type commands as normal
- Terminal resizing is automatically synchronized
- Press **Ctrl+Q** to detach (session continues running)
- Multiple users can attach to the same session

### Use Cases

- **Debugging**: Watch what the AI is doing in real-time
- **Collaboration**: Jump in when the AI needs help
- **Monitoring**: Observe long-running processes
- **Teaching**: See how the AI solves problems step-by-step

### Socket Files

Sessions are stored as Unix domain sockets in `~/.terminalcp/sessions/`. Each socket is named `{name}-{id}.sock` for easy identification. Sockets are automatically cleaned up when processes exit.

## How it works

terminalcp exposes a single MCP tool called `terminal` that accepts JSON commands. The server uses stdio transport and manages multiple background processes, each running in a pseudo-TTY (via node-pty) with its own virtual terminal powered by xterm.js headless. Commands are executed through `bash -c` for proper PTY handling.

### Tool: `terminal`

The terminal tool accepts a JSON object with different action types:

#### Start a process
```json
{
  "action": "start",
  "command": "npm run dev",
  "cwd": "/path/to/project",  // optional
  "name": "dev-server"  // optional: human-readable name for socket attachment
}
```
**Returns**: Process ID, name, command, status, working directory, and socket path

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
  "id": "proc-abc123",
  "data": "ls -la",
  "submit": true  // Optional: automatically append Enter key (\r)
}
```
**Returns**: Confirmation of input sent

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
  "id": "proc-abc123"
}
```
**Returns**: Terminal dimensions and scrollback info as `{"rows": 24, "cols": 80, "scrollback_lines": 150}`

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

## Comparison with screen/tmux

### Can you use screen?

Technically yes, but it's significantly more complex and limited. Here's how Claude would try to emulate terminalcp with screen:

#### Starting a process
```bash
# terminalcp
{"action": "start", "command": "lldb myapp"}
# Returns: {"id": "proc-123", "status": "started"}

# screen equivalent
screen -dmS session-123 -L lldb myapp
# No feedback on success/failure
```

#### Sending input
```bash
# terminalcp
{"action": "stdin", "id": "proc-123", "data": "break main", "submit": true}

# screen equivalent
screen -S session-123 -X stuff $'break main\n'
# No confirmation the command was received
```

#### Getting output
```bash
# terminalcp
{"action": "stdout", "id": "proc-123"}
# Returns: Clean, rendered terminal output

# screen equivalent
screen -S session-123 -X hardcopy /tmp/output.txt
cat /tmp/output.txt
# Returns: Raw terminal buffer with ANSI codes, timing issues
```

#### Monitoring changes
```bash
# terminalcp
{"action": "stream", "id": "proc-123", "since_last": true}
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
