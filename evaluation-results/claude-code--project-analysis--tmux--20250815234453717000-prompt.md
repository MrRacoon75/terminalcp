## Task

Start opencode with the groq/openai/gpt-oss-120b model, switch to Claude Sonnet 4 using the /models command, and ask it to analyze the project. You MUST capture the COMPLETE response.

1. Start opencode with the specified model:
   ```
   opencode --model groq/openai/gpt-oss-120b
   ```

2. Once opencode is running, use the /models slash command to switch to Claude Sonnet 4:
   ```
   /models
   ```
   When the models dialog opens, type "Claude Sonnet 4" to filter the list, then select Claude Sonnet 4.

3. After successfully switching models, prompt it to analyze the project:
   ```
   Read all source files in src/ and explain what this project does
   ```

4. Capture the model's COMPLETE response. This will require scrolling upwards to capture all output using stdout with sufficient lines parameter.

5. Report the full summary provided by the model.

IMPORTANT: If you cannot successfully switch to Claude Sonnet 4, the task has failed. Report that the model switching failed and do not proceed with the analysis.

## Tool

You must use **Tmux** to complete this task.

### Quick Start (Typical Workflow)
1. `tmux new-session -d -s NAME "command" \; set remain-on-exit on` - Start session
2. `tmux send-keys -t NAME "input" Enter` - Send input
3. `tmux capture-pane -t NAME -p` - Get current viewport (clean, rendered)
4. `tmux kill-session -t NAME` - Clean up when done

### Core Commands

- **Start session**: `tmux new-session -d -s NAME "command args" \; set remain-on-exit on`
  - `-d` detached mode, `-s` session name
  - **IMPORTANT**: Use `remain-on-exit on` to capture output after process ends
  - Example: `tmux new-session -d -s repl "python3 -i" \; set remain-on-exit on`

- **List sessions**: `tmux list-sessions` or `tmux ls`

- **Send input**: `tmux send-keys -t NAME "input" Enter`
  - Batch multiple: `tmux send-keys -t NAME "cmd1" Enter "cmd2" Enter "cmd3" Enter`
  - Special keys: `C-c` (Ctrl+C), `Up`/`Down`/`Right`/`Left` (arrows), `PageUp`/`PageDown`
  - Example: `tmux send-keys -t repl "2+2" Enter`
  - **Multiline (Python auto-indents)**: `tmux send-keys -t repl "def greet(name):" Enter "return f'Hello {name}'" Enter Enter`

- **Get output**:
  - **Current viewport** (RECOMMENDED - clean, rendered view): `tmux capture-pane -t NAME -p`
  - **Last N lines**: `tmux capture-pane -t NAME -p -S -N`
  - **Full scrollback**: `tmux capture-pane -t NAME -p -S -`

- **Check if alive**: `tmux list-panes -t NAME -F "#{pane_dead}"` (0=alive, 1=dead)

- **Kill session**: `tmux kill-session -t NAME`

### Important Notes
- **Only kill sessions you started by name**
- **capture-pane = viewport only**: Shows current screen (clean, rendered), perfect for TUIs/REPLs
- **capture-pane -S - = full scrollback**: Clean rendered history
- **remain-on-exit on**: Essential for capturing output after process ends
- **TIP**: For interactive programs, use capture-pane after operations complete for clean view

You are free to run `tmux --help` if you require more information on the tool.

## Completion

Complete the task using only the tool specified above.
- If successful, output: TASK_COMPLETE
- If unsuccessful, output: TASK_FAILED and explain what went wrong