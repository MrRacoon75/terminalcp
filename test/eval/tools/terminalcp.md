---
{
  "type": "mcp",
  "mcpServers": {
    "terminalcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "src/index.ts", "--mcp"]
    }
  }
}
---

### Quick Start (Typical Workflow)
1. Start session: `{"action": "start", "command": "command args", "name": "NAME"}`
2. Send input: `{"action": "stdin", "id": "NAME", "data": "input\r"}`
3. Get current viewport: `{"action": "stdout", "id": "NAME"}`
4. Clean up: `{"action": "stop", "id": "NAME"}`

### Important Notes
- **Only stop sessions you started by name**
- **stdout = viewport + scrollback**: Shows clean rendered terminal
- **stdout with lines**: `{"action": "stdout", "id": "NAME", "lines": N}` for last N lines
- **stream = raw output**: Contains all output since start (avoid for TUIs)
- Use `\r` for Enter, `\u001b[A/B/C/D` for arrows, `\u0003` for Ctrl+C
- **TIP**: For interactive programs, use stdout after operations complete for clean view