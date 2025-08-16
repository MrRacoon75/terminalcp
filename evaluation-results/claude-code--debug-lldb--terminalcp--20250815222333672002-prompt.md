## Task

The program `evaluation-results/demo-buggy` crashes when executed. Use LLDB to:
- Start the program under the debugger
- Identify where and why it crashes
- Examine variables, memory, and call stack
- Report the root cause of the crash

## Tool

You must use **Terminalcp** to complete this task.

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

## Completion

Complete the task using only the tool specified above.
- If successful, output: TASK_COMPLETE
- If unsuccessful, output: TASK_FAILED and explain what went wrong