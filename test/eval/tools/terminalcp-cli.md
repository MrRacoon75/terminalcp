---
{
  "type": "cli",
  "cleanup": "npx tsx src/index.ts stop || true"
}
---

You must use **terminalcp CLI** to complete the following task.

## Core Commands

- **Start session**: `npx tsx src/index.ts start NAME command args`
  - Returns session ID (the NAME you provided)
  - Example: `npx tsx src/index.ts start repl python3 -i`
  
- **List sessions**: `npx tsx src/index.ts ls`
  - Shows: ID, status (running/stopped), working directory, command
  
- **Send input**: `npx tsx src/index.ts stdin NAME text/key [text/key ...]`
  - **Text with Enter**: `npx tsx src/index.ts stdin NAME "hello world" Enter`
  - **Just Enter**: `npx tsx src/index.ts stdin NAME Enter`
  - **Arrow keys**: `npx tsx src/index.ts stdin NAME Left Right Up Down`
  - **Special keys**:
    - Control: `C-c` (Ctrl+C), `C-d` (Ctrl+D), `C-z` (Ctrl+Z)
    - Meta/Alt: `M-x`, `M-b`, `M-f`
    - Function: `F1` through `F12`
    - Navigation: `Home`, `End`, `PageUp`, `PageDown`
    - Editing: `Tab`, `Space`, `Escape`, `Delete`, `Insert`, `BSpace`
  - Examples:
    - `npx tsx src/index.ts stdin repl "2+2" Enter`
    - `npx tsx src/index.ts stdin repl "echo test" Left Left Left Left "hi " Enter`
    - `npx tsx src/index.ts stdin repl C-c`
  
- **Get output**:
  - **Full terminal**: `npx tsx src/index.ts stdout NAME`
  - **Last N lines**: `npx tsx src/index.ts stdout NAME N`
  - Returns clean rendered terminal screen with scrollback (up to 10,000 lines)
  
- **Stream output**: `npx tsx src/index.ts stream NAME [options]`
  - **All output**: `npx tsx src/index.ts stream NAME`
  - **New output only**: `npx tsx src/index.ts stream NAME --since-last`
  - **Strip ANSI**: Default behavior (add --no-strip to keep ANSI codes)
  - Returns raw output stream, useful for logs and high-volume data
  
- **Attach interactively**: `npx tsx src/index.ts attach NAME`
  - Enter interactive mode (Ctrl+B to detach)
  - Multiple users can attach simultaneously
  
- **Stop session**: `npx tsx src/index.ts stop NAME`
  - Terminates the process
  
- **Stop all sessions**: `npx tsx src/index.ts stop`
  - Terminates all running processes
  
- **Get version**: `npx tsx src/index.ts version`
  
- **Kill server**: `npx tsx src/index.ts kill-server`
  - Shuts down the background terminal server

## Key Differences from screen/tmux

- **Simple API**: Single tool with consistent command structure
- **Incremental reading**: Built-in `--since-last` for getting only new output
- **Two output modes**: `stdout` for clean rendered view, `stream` for raw data
- **Persistent server**: Auto-spawns and persists across client disconnects
- **No ANSI pollution**: `stdout` returns clean rendered output
- **Process info**: Sessions persist with status tracking even after process exits

You are free to run `npx tsx src/index.ts --help` if you require more information on the tool.