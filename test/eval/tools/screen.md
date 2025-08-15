---
{
  "type": "cli",
  "cleanup": "for session in $(screen -ls | grep -o \"[0-9]*\\\\.[^ ]*\"); do screen -S \"$session\" -X quit; done || true"
}
---

You must use **screen** to complete the following task.

## Core Commands

- **Start session**: `screen -dmS NAME -L program args`
  - `-d` detached mode, `-m` force new session, `-S` session name, `-L` enable logging
  - Example: `screen -dmS repl -L python3 -i`
  
- **List sessions**: `screen -ls`
  
- **Send input**: `screen -S NAME -X stuff $'input\n'`
  - REQUIRED: Use $'...' syntax for proper escape sequences
  - Enter key: `screen -S NAME -X stuff $'\n'`
  - Ctrl+C: `screen -S NAME -X stuff $'\003'`
  - Arrow keys: Up=$'\e[A' Down=$'\e[B' Right=$'\e[C' Left=$'\e[D'
  - Example: `screen -S repl -X stuff $'2+2\n'`
  
- **Get output**:
  - **Hardcopy workaround for v4.0.3 bug** (do once per session):
    ```bash
    # Run this once after starting the session
    expect -c 'spawn screen -r NAME; send "\001d"; expect eof' >/dev/null 2>&1
    # Then hardcopy works normally for the rest of the session
    screen -S NAME -p 0 -X hardcopy output.txt
    cat output.txt
    ```
  - **From screenlog**: `cat screenlog.0` (contains all output since -L flag)
  - **Last N lines**: `tail -N screenlog.0`
  
- **Monitor output**: `tail -f screenlog.0`
  
- **Kill session**: `screen -S NAME -X quit`
  
- **Kill all sessions**: 
  ```bash
  screen -ls | grep -E "^\s+[0-9]+\." | awk '{print $1}' | while read s; do screen -S "${s%%.*}" -X quit; done
  ```

## Important Notes

- **v4.0.3 hardcopy bug**: Common on macOS, hardcopy produces incomplete output unless session is attached first
- **screenlog.0**: Contains raw output with ANSI escape sequences from session start
- **File paths**: Use absolute paths or ./ prefix for hardcopy files
- **No incremental reading**: Cannot easily get "only new output since last check"
- **Character-by-character logging**: Interactive tools log every character redraw in screenlog

You are free to run `screen --help` if you require more information on the tool.