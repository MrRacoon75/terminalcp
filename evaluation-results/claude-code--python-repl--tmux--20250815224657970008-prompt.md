## Task

Start a Python REPL and complete these steps:

1. Calculate 42 * 17 and verify the result appears
2. Import math module and calculate math.factorial(10)
3. Create list comprehension: [x**2 for x in range(10)]
4. Define a function that checks if a number is prime (enter it line by line with proper indentation)
5. Test your prime function with the number 97 and report whether it's prime
6. Exit the REPL cleanly

After each input, check the output to confirm your command executed correctly before proceeding to the next step.

Finally, get all the output and summarize the results, including whether 97 is prime.

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