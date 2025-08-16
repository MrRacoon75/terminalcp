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