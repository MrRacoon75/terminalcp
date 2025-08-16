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