---
{
  "type": "mcp",
  "mcpServers": {
    "terminalcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "src/mcp-server.ts"]
    }
  }
}
---

You must use the terminalcp MCP tool to complete the following task.

IMPORTANT: When sending input with terminalcp:
- Send input with Enter: terminalcp stdin "input\r"
- The MCP tool interprets \r as carriage return (Enter key)
- Without \r, your input will not be processed by the program