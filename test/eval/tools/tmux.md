---
{
  "type": "cli",
  "cleanup": "tmux kill-server || true"
}
---

You must use **tmux** to complete the following task.

## Core Commands

- **Start session**: `tmux new-session -d -s NAME command args`
  - `-d` detached mode, `-s` session name
  - Example: `tmux new-session -d -s repl python3 -i`
  
- **List sessions**: `tmux list-sessions` or `tmux ls`
  
- **Send input**: `tmux send-keys -t NAME "input" Enter`
  - Enter key: `Enter` or `C-m`
  - Ctrl+C: `C-c`
  - Arrow keys: `Up` `Down` `Right` `Left`
  - Page Up/Down: `PageUp` `PageDown`
  - Example: `tmux send-keys -t repl "2+2" Enter`
  
- **Get output**:
  - **Current pane**: `tmux capture-pane -t NAME -p`
  - **With scrollback**: `tmux capture-pane -t NAME -p -S -` (full history)
  - **Last N lines**: `tmux capture-pane -t NAME -p -S -N`
  - **Specific range**: `tmux capture-pane -t NAME -p -S -100 -E -50` (lines -100 to -50)
  
- **Stream output** (must be set up at session start):
  ```bash
  tmux pipe-pane -t NAME -o "cat >> output.log"
  tail -f output.log
  ```
  - **Warning**: Output between session creation and pipe-pane activation is lost
  - Contains raw character-by-character redraws with ANSI codes
  
- **Process lifecycle**:
  - **Check if alive**: `tmux list-panes -t NAME -F "#{pane_dead}"`
  - **Get exit code** (requires `set remain-on-exit on`):
    ```bash
    tmux new-session -d -s NAME "command" \; set remain-on-exit on
    tmux list-panes -t NAME -F "#{pane_dead} #{pane_dead_status}"
    ```
  
- **Kill session**: `tmux kill-session -t NAME`
  
- **Kill all sessions**: `tmux kill-server`

## Important Notes

- **Clean rendered output**: Use `capture-pane` for clean terminal view without ANSI pollution
- **No incremental reading**: Cannot easily get "only new output since last check"
- **Sessions auto-close**: When the command exits, session closes unless `remain-on-exit` is set
- **Initial output loss**: With pipe-pane, any output before activation is lost

You are free to run `tmux --help` if you require more information on the tool.