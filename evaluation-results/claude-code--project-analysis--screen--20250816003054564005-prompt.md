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

You must use **Screen** to complete this task.

### Quick Start (Typical Workflow)
1. `rm -f screenlog.0 && screen -dmS NAME -L command args` - Start session
2. `expect -c 'spawn screen -r NAME; send "\001d"; expect eof' >/dev/null 2>&1` - Enable hardcopy (once per session)
3. `screen -S NAME -X stuff $'input\n'` - Send input
4. `screen -S NAME -p 0 -X hardcopy output.txt && cat output.txt` - Get current viewport (clean, rendered)
5. `screen -S NAME -X quit` - Clean up when done

### Core Commands

- **Start session**: `screen -dmS NAME -L program args`
  - `-d` detached mode, `-m` force new session, `-S` session name, `-L` enable logging
  - **IMPORTANT**: Remove old `screenlog.0` first: `rm -f screenlog.0`
  - Example: `rm -f screenlog.0 && screen -dmS repl -L python3 -i`

- **List sessions**: `screen -ls`

- **Send input**: `screen -S NAME -X stuff $'input\n'`
  - REQUIRED: Use $'...' syntax for proper escape sequences
  - Batch multiple: `screen -S NAME -X stuff $'cmd1\ncmd2\ncmd3\n'`
  - Special keys: `$'\003'` (Ctrl+C), `$'\e[A]'/`$'\e[B]'/`$'\e[C]'/`$'\e[D]'` (Up/Down/Right/Left arrows)
  - Example: `screen -S repl -X stuff $'2+2\n'`
  - **Multiline (Python auto-indents)**: `screen -S repl -X stuff $'def greet(name):\nreturn f\'Hello {name}\'\n\n'`

- **Get output**:
  - **Current viewport** (RECOMMENDED - clean, rendered view):
    ```bash
    # First time per session (v4.0.3 bug workaround):
    expect -c 'spawn screen -r NAME; send "\001d"; expect eof' >/dev/null 2>&1
    # Then use hardcopy normally:
    screen -S NAME -p 0 -X hardcopy output.txt && cat output.txt
    ```
  - **Last N lines** (raw with ANSI codes): `tail -N screenlog.0`
  - **Full scrollback** (raw with ANSI codes): `cat screenlog.0`

- **Kill session**: `screen -S NAME -X quit`

### Important Notes
- **Only kill sessions you started by name**
- **hardcopy = viewport only**: Shows current screen (clean, rendered), perfect for TUIs/REPLs
- **screenlog.0 = full raw output**: Contains all ANSI codes since session start
- **v4.0.3 hardcopy bug**: Run expect workaround once per session
- **TIP**: For interactive programs, use hardcopy after operations complete for clean view

You are free to run `screen --help` if you require more information on the tool.

## Completion

Complete the task using only the tool specified above.
- If successful, output: TASK_COMPLETE
- If unsuccessful, output: TASK_FAILED and explain what went wrong