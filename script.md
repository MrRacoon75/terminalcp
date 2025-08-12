# terminalcp Demo Script

## Introduction (5 seconds)
**Screen:** Show terminalcp logo/title
**Narration:** "terminalcp - Let AI agents control interactive command-line tools like a human would."

## Problem Statement (10 seconds)
**Screen:** Show Claude/ChatGPT failing to interact with interactive tools
**Narration:** "AI agents can't interact with debuggers, REPLs, or other CLI tools that need human input. Until now."

## Demo 1: Interactive Debugging (30 seconds)
**Screen:** Split view - AI agent code on left, terminal on right

```json
// Start debugger
{"action": "start", "command": "lldb ./myapp"}

// Set breakpoint
{"action": "stdin", "id": "proc-123", "data": "break main", "submit": true}

// Run program
{"action": "stdin", "id": "proc-123", "data": "run", "submit": true}

// Get debugger interface
{"action": "stdout", "id": "proc-123"}
```

**Narration:** "Agents can now debug code step-by-step, set breakpoints, inspect variables - just like a developer would."

## Demo 2: AI-to-AI Collaboration (25 seconds)
**Screen:** Show one AI controlling another

```json
// Start Claude CLI
{"action": "start", "command": "claude"}

// Send a prompt
{"action": "stdin", "id": "proc-456", "data": "Write a Python function to calculate fibonacci", "submit": true}

// Get Claude's response
{"action": "stdout", "id": "proc-456"}
```

**Narration:** "Even more powerful - AI agents can collaborate by running other AI tools as subprocesses."

## Demo 3: Build Monitoring (20 seconds)
**Screen:** Show incremental build output

```json
// Start build
{"action": "start", "command": "npm run build"}

// Monitor progress (multiple times)
{"action": "stream", "id": "proc-789", "since_last": true}
// ... returns only new output ...

{"action": "stream", "id": "proc-789", "since_last": true}
// ... returns updates since last check ...
```

**Narration:** "For streaming output like builds and logs, use stream mode for efficient incremental monitoring."

## Demo 4: TUI Applications (20 seconds)
**Screen:** Show htop running

```json
// Start htop
{"action": "start", "command": "htop"}

// Get the formatted display
{"action": "stdout", "id": "proc-abc"}
```

**Show clean htop output**

**Narration:** "Terminal applications render perfectly - colors, layouts, everything preserved."

## Key Features (15 seconds)
**Screen:** Bullet points appearing

- ✅ Multiple processes simultaneously
- ✅ Full terminal emulation with xterm.js
- ✅ Two output modes: Terminal (TUIs) & Stream (logs)
- ✅ Processes persist after exit for debugging
- ✅ Works with any MCP-compatible AI tool

**Narration:** "Non-blocking, proper PTY support, and smart output handling."

## Installation (10 seconds)
**Screen:** Show installation commands

```bash
# VS Code / Cursor
npx @mariozechner/terminalcp@latest

# Claude Code
claude mcp add -s user terminalcp npx @mariozechner/terminalcp@latest
```

**Narration:** "Install in seconds with any MCP client."

## Closing (5 seconds)
**Screen:** GitHub repo and npm package links
**Text overlay:** 
- github.com/badlogic/terminalcp
- npm: @mariozechner/terminalcp

**Narration:** "terminalcp - Give your AI agents terminal superpowers."

---

## Total Duration: ~2 minutes

## Key Visual Elements:
1. **Split-screen layouts** showing agent commands and terminal output
2. **Smooth transitions** between demos
3. **Syntax highlighting** for JSON commands
4. **Real terminal output** showing the actual results
5. **Before/After comparison** for the problem/solution

## Technical Setup:
1. Pre-record terminal sessions for smooth playback
2. Use a clean terminal theme with good contrast
3. Show actual process IDs and realistic output
4. Include subtle animations for command execution

## Alternative Shorter Version (30 seconds):
1. Problem: "AI agents can't use interactive CLIs" (3s)
2. Solution: Show debugger control (7s)
3. Show AI-to-AI collaboration (7s)
4. Show build monitoring with stream (7s)
5. Installation & links (6s)