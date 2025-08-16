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

You must use **Terminalcp Cli** to complete this task.

### Quick Start (Typical Workflow)
1. `npx tsx src/index.ts start NAME command args` - Start session
2. `npx tsx src/index.ts stdin NAME "input" ::Enter` - Send input
3. `npx tsx src/index.ts stdout NAME` - Get current viewport (clean, rendered)
4. `npx tsx src/index.ts stop NAME` - Clean up when done

### Core Commands

- **Start session**: `npx tsx src/index.ts start NAME command args`
  - Returns session ID (the NAME you provided)
  - Example: `npx tsx src/index.ts start repl python3 -i`

- **List sessions**: `npx tsx src/index.ts ls`
  - Shows: ID, status (running/stopped), working directory, command

- **Send input**: `npx tsx src/index.ts stdin NAME "input" ::Enter`
  - Batch multiple: `npx tsx src/index.ts stdin NAME "cmd1" ::Enter "cmd2" ::Enter "cmd3" ::Enter`
  - Special keys: `::C-c` (Ctrl+C), `::Up`/`::Down`/`::Right`/`::Left` (arrows), `::PageUp`/`::PageDown`
  - Example: `npx tsx src/index.ts stdin repl "2+2" ::Enter`
  - **Multiline (Python auto-indents)**: `npx tsx src/index.ts stdin repl "def greet(name):" ::Enter "return f'Hello {name}'" ::Enter ::Enter`

- **Get output**:
  - **Current viewport** (RECOMMENDED - clean, rendered view): `npx tsx src/index.ts stdout NAME`
  - **Last N lines**: `npx tsx src/index.ts stdout NAME N`
  - **Full scrollback**: `npx tsx src/index.ts stdout NAME 10000` (up to 10,000 lines max)

- **Stop session**: `npx tsx src/index.ts stop NAME`

### Important Notes
- **Only stop sessions you started by name**
- **stdout = viewport + scrollback**: Shows clean rendered terminal (up to 10,000 lines)
- **stdout N = last N lines**: Efficient for checking recent output
- **TIP**: For interactive programs, use stdout after operations complete for clean view

You are free to run `npx tsx src/index.ts --help` if you require more information on the tool.

## Completion

Complete the task using only the tool specified above.
- If successful, output: TASK_COMPLETE
- If unsuccessful, output: TASK_FAILED and explain what went wrong