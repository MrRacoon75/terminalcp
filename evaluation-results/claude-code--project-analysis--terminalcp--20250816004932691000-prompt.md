## Task

Start opencode with the anthropic/claude-sonnet-4-20250514 model, switch to GPT OSS 120B using the /models command, and ask it to analyze the project. You MUST capture the COMPLETE response.

1. Start opencode with the specified model:
   ```
   opencode --model anthropic/claude-sonnet-4-20250514
   ```

2. Once opencode is running, use the /models slash command to switch to GPT OSS 120B:
   ```
   /models
   ```
   When the models dialog opens, type "GPT OSS 120B" to filter the list, then select GPT OSS 120B by pressing enter.

3. After successfully switching models, prompt it to analyze the project:
   ```
   Read README.md explain what this project does
   ```

4. Capture the model's COMPLETE response. This will require scrolling upwards to capture all output using stdout with sufficient lines parameter.

5. Report the full summary provided by the model.

IMPORTANT: If you cannot successfully switch to GPT OSS 120B, the task has failed. Report that the model switching failed and do not proceed with the analysis.

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