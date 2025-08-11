# tuicp

MCP server for spawning and controlling background processes with virtual terminals.

## What it solves

tuicp enables AI agents to spawn long-running processes in the background and interact with them through a virtual terminal interface. This solves the problem of agents needing to manage interactive processes, monitor their output, and send input - all while maintaining the full terminal context including ANSI escape sequences. Each process runs in a headless xterm.js terminal, preserving complete terminal state and scrollback buffer.

## Installation

Install globally:
```bash
npm install -g @mariozechner/tuicp
```

Or run directly with npx:
```bash
npx @mariozechner/tuicp
```

## How it works

tuicp exposes a single MCP tool called `terminal` that accepts JSON commands. The server uses stdio transport exclusively and manages multiple background processes, each with its own virtual terminal powered by xterm.js headless.

### Tool: `terminal`

The terminal tool accepts a JSON object with different action types:

#### Start a process
```json
{
  "action": "start",
  "command": "npm run dev"
}
```
**Returns**: Process ID (e.g., `"proc-abc123"`)

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