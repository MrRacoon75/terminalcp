# Terminal Multiplexer Evaluation - State Machine

## SETUP
```bash
npx tsx test/evaluation.ts
```

## DISCOVER
List files in `evaluation/` directory.
Parse `*-prompt.md` filenames to extract:
- Tasks: {task1, task2, task3, ...}
- Tools: {terminalcp, tmux, screen, "terminalcp CLI", ...}
Read `test/evaluation.ts` to understand what the expected outputs for each task are. Use this knowledge in the EXECUTE phase.

## EXECUTE
Use the terminalcp MCP tool for all actions below.

**IMPORTANT: Process ONE tool at a time. Do NOT parallelize the inner loop.**

```markdown
For each task in discovered_tasks:
  For each tool in discovered_tools (SEQUENTIALLY):

    # CLEAN STATE
    {"action": "stop"}
    tmux kill-server || true
    for session in $(screen -ls | grep -o '[0-9]*\.[^ ]*'); do screen -S "$session" -X quit; done || true

    # START (replace spaces in tool name with underscores for safe process names)
    # NOTE: YOU DO NOT HAVE TO START THE TERMINALCP SERVER, IT STARTS AUTOMATICALLY
    safe_tool_name = {tool}.replace(" ", "_")
    {"action": "start", "command": "npx @mariozechner/claude-trace --log {task}-{tool} --run-with --dangerously-skip-permissions", "name": "claude-{safe_tool_name}-{task}", "cwd": "/Users/badlogic/workspaces/tuicp"}
    {"action": "stdin", "id": "claude-{safe_tool_name}-{task}", "data": "read evaluation/{task}-{tool}-prompt.md", "submit": true}

    # MONITOR LOOP
    while not_complete:
      current_output = {"action": "stdout", "id": "claude-{safe_tool_name}-{task}"}
      if current_output does not contain "esc to interrupt" nor expected output:
        {"action": "stdin", "id": "claude-{safe_tool_name}-{task}", "data": "continue", "submit": true}
      wait 5s before next check

    # NEVER stop evaluation early - continue monitoring until task completion

    # FINISH
    {"action": "stdin", "id": "claude-{safe_tool_name}-{task}", "data": "/cost", "submit": true}
    cost_output = {"action": "stdout", "id": "claude-{safe_tool_name}-{task}"}
    {"action": "stop", "id": "claude-{safe_tool_name}-{task}"}

    # ANALYZE
    Create evaluation/{task}-{tool}-analysis.md:
    # {task} - {tool}
    ## Cost
    {cost_output}
    ## Metrics
    - Total Cost: $X.XX
    - Tool Calls: {count_from_trace}
    - Task Success: YES/NO
    - Completion Time: {from_cost}
    ## Observations
    ### What went well:
    {analyze_performance}
    ### Where Claude struggled:
    {analyze_issues}

    # WAIT FOR COMPLETION
    Wait for this tool to fully complete before starting the next tool.

# CLEANUP
After all tasks and tools complete:
{"action": "stop"}
tmux kill-server || true
for session in $(screen -ls | grep -o '[0-9]*\.[^ ]*'); do screen -S "$session" -X quit; done || true
```

## OUTPUT_CHECK
Expected: 12 prompt files, 12 analysis files, 24 trace files, demo-buggy executable