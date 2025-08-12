# Demo Recording Guide for terminalcp

## Setup for Screen Recording

### Terminal Setup
1. **Clean terminal** - Clear history, use a clean prompt
2. **Font size** - Larger than normal (16-18pt) for video clarity
3. **Color scheme** - High contrast (Dracula, One Dark, or similar)
4. **Window size** - 1920x1080 or 16:9 aspect ratio

### Recording Tools
- **macOS**: QuickTime Player, OBS, or ScreenFlow
- **Command**: `Cmd+Shift+5` for built-in recorder

## Recording Sequence

### Take 1: Problem Statement (10 seconds)
```bash
# Show a failed attempt to interact with Python REPL
$ python3
>>> print("AI agents can't do this interactively")
# Manually type and show the limitation
```

### Take 2: Start terminalcp + Interactive Debugging (30 seconds)
**Terminal 1 (left side):**
```bash
# Show the MCP server starting
$ npx @mariozechner/terminalcp@latest
terminalcp MCP server running on stdio
```

**Terminal 2 (right side):**
```bash
# Simulate AI agent sending commands
$ echo '{"action": "start", "command": "python3 -i"}' | send-to-mcp
# Show response: {"id": "proc-abc123", "status": "started"}

$ echo '{"action": "stdin", "id": "proc-abc123", "data": "def fibonacci(n):", "submit": true}' | send-to-mcp
$ echo '{"action": "stdin", "id": "proc-abc123", "data": "    if n <= 1: return n", "submit": true}' | send-to-mcp
$ echo '{"action": "stdin", "id": "proc-abc123", "data": "    return fibonacci(n-1) + fibonacci(n-2)", "submit": true}' | send-to-mcp
$ echo '{"action": "stdin", "id": "proc-abc123", "data": "", "submit": true}' | send-to-mcp
$ echo '{"action": "stdin", "id": "proc-abc123", "data": "fibonacci(10)", "submit": true}' | send-to-mcp

$ echo '{"action": "stdout", "id": "proc-abc123"}' | send-to-mcp
# Show the Python REPL with the function defined and result
```

### Take 3: Build Process with Stream (20 seconds)
```bash
# Create a simple build script that outputs over time
$ cat > build-demo.sh << 'EOF'
#!/bin/bash
echo "🔨 Starting build..."
sleep 1
echo "📦 Installing dependencies..."
sleep 1
echo "🔧 Compiling TypeScript..."
sleep 1
echo "✅ Build complete!"
EOF

$ chmod +x build-demo.sh

# Start the build
$ echo '{"action": "start", "command": "./build-demo.sh"}' | send-to-mcp

# Monitor with stream
$ echo '{"action": "stream", "id": "proc-xyz", "since_last": true}' | send-to-mcp
# Shows: "🔨 Starting build..."

$ sleep 2
$ echo '{"action": "stream", "id": "proc-xyz", "since_last": true}' | send-to-mcp
# Shows: "📦 Installing dependencies..."
# Shows: "🔧 Compiling TypeScript..."

$ sleep 2
$ echo '{"action": "stream", "id": "proc-xyz", "since_last": true}' | send-to-mcp
# Shows: "✅ Build complete!"
```

### Take 4: TUI Application (20 seconds)
```bash
# Start htop
$ echo '{"action": "start", "command": "htop"}' | send-to-mcp

# Get the clean output
$ echo '{"action": "stdout", "id": "proc-htop"}' | send-to-mcp
# Shows beautiful formatted htop output

# Or use a simpler TUI like vim
$ echo '{"action": "start", "command": "vim test.txt"}' | send-to-mcp
$ echo '{"action": "stdin", "id": "proc-vim", "data": "iHello from terminalcp!", "submit": false}' | send-to-mcp
$ echo '{"action": "stdin", "id": "proc-vim", "data": "\x1b:wq\r"}' | send-to-mcp
$ echo '{"action": "stdout", "id": "proc-vim"}' | send-to-mcp
```

## Simpler Demo Option: Use a Test Script

Create a demo client that pretty-prints the commands:

```bash
#!/bin/bash
# demo.sh

function demo_command() {
    echo -e "\n\033[36m→ Sending:\033[0m $1"
    echo "$1" | jq .
    sleep 1
    # Actually send to MCP and show response
    response=$(echo "$1" | nc localhost 3000)  # or however you connect
    echo -e "\033[32m← Response:\033[0m"
    echo "$response" | jq .
    sleep 1
}

# Demo sequence
demo_command '{"action": "start", "command": "python3 -i"}'
demo_command '{"action": "stdin", "id": "proc-123", "data": "2 + 2", "submit": true}'
demo_command '{"action": "stdout", "id": "proc-123"}'
```

## Even Simpler: Use Two Terminal Windows

**Window 1:** Run an AI agent (Claude, ChatGPT with MCP)
**Window 2:** Show the actual terminal being controlled

This would be the most visual and impressive - showing the AI actually controlling a real terminal in real-time.

## Post-Production Tips
1. **Speed up** repetitive parts (2x speed)
2. **Add annotations** to highlight key commands
3. **Use transitions** between demos
4. **Add background music** (optional)
5. **Include captions** for commands being executed

## Quick Test Commands
```bash
# Test that everything works first
npx @mariozechner/terminalcp@latest &
MCP_PID=$!

# Quick test
curl -X POST http://localhost:3000/terminal \
  -H "Content-Type: application/json" \
  -d '{"action": "start", "command": "echo Hello World"}'

kill $MCP_PID
```