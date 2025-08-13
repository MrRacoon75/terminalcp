# Terminal Control Efficiency Test Plan - Parallel Execution
## Self-Directed Testing: terminal-src vs bash+tmux/screen vs terminalcp CLI

### Overview
This test plan uses parallel sub-agents to compare terminal-src (terminalcp MCP) against bash+tmux, bash+screen, and the terminalcp CLI. For each task, all 4 multiplexer approaches are tested simultaneously using the Task tool to spawn parallel sub-agents. Each sub-agent will use claude-trace to execute the test with their assigned multiplexer.

### Test Setup

#### Prerequisites Check
```bash
# Check for required tools
which claude-trace || echo "Please install: npm install -g @mariozechner/claude-trace"
which tmux || echo "Please install tmux: brew install tmux (macOS) or sudo apt-get install tmux (Linux)"
which screen || echo "Please install screen: brew install screen (macOS) or sudo apt-get install screen (Linux)"
which terminalcp || echo "Please ensure terminalcp CLI is available: npx tsx src/index.ts in this directory"
which lldb || which gdb || echo "Please install a debugger: lldb (macOS) or gdb (Linux)"

# Create test directory structure
mkdir -p test-efficiency
```

#### Parallel Test Execution Strategy
1. For each task, spawn 4 parallel sub-agents using the Task tool
2. Each sub-agent starts Claude via claude-trace with terminal-src
3. Each sub-agent directs their Claude instance to use a specific multiplexer
4. All 4 tests run simultaneously, dramatically reducing total execution time
5. Collect and rename trace files after all parallel agents complete
6. Generate comparative analysis report

## Test Tasks

### Task 1: Debug Analysis with LLDB
**Objective**: Determine why demo-buggy crashes using LLDB debugger (without examining source code)

#### Setup
```bash
# Check if demo-buggy executable exists, if not create it
if [ ! -f demo-buggy ]; then
    cat > demo-buggy.c << 'EOF'
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
    char *name;
    int age;
    float *scores;
    int num_scores;
} Student;

Student* create_student(const char *name, int age) {
    Student *s = malloc(sizeof(Student));
    s->name = malloc(strlen(name) + 1);
    strcpy(s->name, name);
    s->age = age;
    // BUG INTRODUCED: Commenting out scores allocation to cause crash
    // s->scores = malloc(100 * sizeof(float));  // Allocate space for 100 scores
    s->scores = NULL;  // This will cause a segfault when we try to write to it
    s->num_scores = 0;
    return s;
}

void add_score(Student *s, float score) {
    // BUG: Writing to NULL pointer when scores is not allocated
    s->scores[s->num_scores] = score;  // CRASH HERE!
    s->num_scores++;
}

float calculate_average(Student *s) {
    if (s->num_scores == 0) return 0.0;

    float sum = 0;
    for (int i = 0; i <= s->num_scores; i++) {  // BUG: <= should be <
        sum += s->scores[i];
    }
    return sum / s->num_scores;
}

void print_student(Student *s) {
    printf("Student: %s, Age: %d\n", s->name, s->age);
    printf("Average score: %.2f\n", calculate_average(s));
}

int main() {
    printf("=== Student Grade Tracker ===\n");

    // Create some students
    Student *alice = create_student("Alice", 20);
    Student *bob = create_student("Bob", 21);

    printf("Created students successfully\n");

    // Try to add scores - THIS WILL CRASH
    printf("Adding scores for Alice...\n");
    add_score(alice, 95.5);  // SEGFAULT HERE!
    add_score(alice, 87.0);
    add_score(alice, 92.3);

    printf("Adding scores for Bob...\n");
    add_score(bob, 78.5);
    add_score(bob, 82.0);

    // Print results
    print_student(alice);
    print_student(bob);

    // Cleanup (never reached due to crash)
    free(alice->scores);
    free(alice->name);
    free(alice);
    free(bob->scores);
    free(bob->name);
    free(bob);

    return 0;
}
EOF
    gcc -g -o demo-buggy demo-buggy.c
fi
```

### Task 2: OpenCode Interaction
**Objective**: Start opencode (an agentic coding TUI), switch to Sonnet 4, and get full project summary

### Task 3: Python REPL Calculations
**Objective**: Perform a series of calculations in Python REPL

## Parallel Execution Instructions

### Task 1: LLDB Debugging - Parallel Execution

Execute all 4 multiplexer tests simultaneously using the Task tool:

```python
# Launch 4 parallel sub-agents for Task 1
parallel_agents = [
    {
        "subagent_type": "general-purpose",
        "description": "Task1 terminal-src",
        "prompt": """
        Use the terminal MCP tool to:
        1. Start Claude via: {"action": "start", "command": "npx @mariozechner/claude-trace --run-with --dangerously-skip-permissions", "name": "claude-terminalcp-task1", "cwd": "/Users/badlogic/workspaces/tuicp"}
        2. Send instructions: {"action": "stdin", "id": "claude-terminalcp-task1", "data": "You have access to the terminal MCP tool. There's a program called demo-buggy that crashes. Use LLDB to determine why it crashes. Do NOT look at the source code file - only use the debugger to investigate. Find the root cause of the crash and explain what's happening. Report your findings.", "submit": true}
        3. Monitor with periodic stdout checks until task completes
        4. Get cost: {"action": "stdin", "id": "claude-terminalcp-task1", "data": "/cost", "submit": true} then {"action": "stdout", "id": "claude-terminalcp-task1"}
        5. Save the EXACT /cost output
        6. Stop session: {"action": "stdin", "id": "claude-terminalcp-task1", "data": "exit", "submit": true} then {"action": "stop", "id": "claude-terminalcp-task1"}
        7. Rename trace files: mv .claude-trace/*.jsonl test-efficiency/task1-terminalcp.jsonl and mv .claude-trace/*.html test-efficiency/task1-terminalcp.html
        8. Create test-efficiency/task1-terminalcp.md with the cost output and observations

        Return: The exact /cost output and whether the task succeeded.
        """
    },
    {
        "subagent_type": "general-purpose",
        "description": "Task1 tmux",
        "prompt": """
        Use the terminal MCP tool to:
        1. Start Claude via: {"action": "start", "command": "npx @mariozechner/claude-trace --run-with --dangerously-skip-permissions", "name": "claude-tmux-task1", "cwd": "/Users/badlogic/workspaces/tuicp"}
        2. Send instructions: {"action": "stdin", "id": "claude-tmux-task1", "data": "You must use bash commands with tmux for all terminal operations. Do NOT use the terminal MCP tool. There's a program called demo-buggy that crashes. Use LLDB with tmux to determine why it crashes. Do NOT look at the source code file - only use the debugger to investigate. Find the root cause of the crash and explain what's happening. Report your findings.", "submit": true}
        3. Monitor with periodic stdout checks until task completes
        4. Get cost: {"action": "stdin", "id": "claude-tmux-task1", "data": "/cost", "submit": true} then {"action": "stdout", "id": "claude-tmux-task1"}
        5. Save the EXACT /cost output
        6. Stop session: {"action": "stdin", "id": "claude-tmux-task1", "data": "exit", "submit": true} then {"action": "stop", "id": "claude-tmux-task1"}
        7. Rename trace files: mv .claude-trace/*.jsonl test-efficiency/task1-tmux.jsonl and mv .claude-trace/*.html test-efficiency/task1-tmux.html
        8. Create test-efficiency/task1-tmux.md with the cost output and observations

        Return: The exact /cost output and whether the task succeeded.
        """
    },
    {
        "subagent_type": "general-purpose",
        "description": "Task1 screen",
        "prompt": """
        Use the terminal MCP tool to:
        1. Start Claude via: {"action": "start", "command": "npx @mariozechner/claude-trace --run-with --dangerously-skip-permissions", "name": "claude-screen-task1", "cwd": "/Users/badlogic/workspaces/tuicp"}
        2. Send instructions: {"action": "stdin", "id": "claude-screen-task1", "data": "You must use bash commands with GNU screen for all terminal operations. Do NOT use the terminal MCP tool or tmux. There's a program called demo-buggy that crashes. Use LLDB with screen to determine why it crashes. Do NOT look at the source code file - only use the debugger to investigate. Find the root cause of the crash and explain what's happening. Report your findings.", "submit": true}
        3. Monitor with periodic stdout checks until task completes
        4. Get cost: {"action": "stdin", "id": "claude-screen-task1", "data": "/cost", "submit": true} then {"action": "stdout", "id": "claude-screen-task1"}
        5. Save the EXACT /cost output
        6. Stop session: {"action": "stdin", "id": "claude-screen-task1", "data": "exit", "submit": true} then {"action": "stop", "id": "claude-screen-task1"}
        7. Rename trace files: mv .claude-trace/*.jsonl test-efficiency/task1-screen.jsonl and mv .claude-trace/*.html test-efficiency/task1-screen.html
        8. Create test-efficiency/task1-screen.md with the cost output and observations

        Return: The exact /cost output and whether the task succeeded.
        """
    },
    {
        "subagent_type": "general-purpose",
        "description": "Task1 CLI",
        "prompt": """
        Use the terminal MCP tool to:
        1. Start Claude via: {"action": "start", "command": "npx @mariozechner/claude-trace --run-with --dangerously-skip-permissions", "name": "claude-cli-task1", "cwd": "/Users/badlogic/workspaces/tuicp"}
        2. Send instructions: {"action": "stdin", "id": "claude-cli-task1", "data": "You must use bash commands with the terminalcp CLI (npx tsx src/index.ts) for all terminal operations. Do NOT use the terminal MCP tool, tmux, or screen. There's a program called demo-buggy that crashes. Use LLDB with terminalcp CLI to determine why it crashes. Do NOT look at the source code file - only use the debugger to investigate. Find the root cause of the crash and explain what's happening. Report your findings.", "submit": true}
        3. Monitor with periodic stdout checks until task completes
        4. Get cost: {"action": "stdin", "id": "claude-cli-task1", "data": "/cost", "submit": true} then {"action": "stdout", "id": "claude-cli-task1"}
        5. Save the EXACT /cost output
        6. Stop session: {"action": "stdin", "id": "claude-cli-task1", "data": "exit", "submit": true} then {"action": "stop", "id": "claude-cli-task1"}
        7. Rename trace files: mv .claude-trace/*.jsonl test-efficiency/task1-cli.jsonl and mv .claude-trace/*.html test-efficiency/task1-cli.html
        8. Create test-efficiency/task1-cli.md with the cost output and observations

        Return: The exact /cost output and whether the task succeeded.
        """
    }
]
```

### Task 2: OpenCode - Parallel Execution

Execute all 4 multiplexer tests simultaneously:

```python
# Launch 4 parallel sub-agents for Task 2
parallel_agents = [
    {
        "subagent_type": "general-purpose",
        "description": "Task2 terminal-src",
        "prompt": """
        Use the terminal MCP tool to:
        1. Start Claude via: {"action": "start", "command": "npx @mariozechner/claude-trace --run-with --dangerously-skip-permissions", "name": "claude-terminalcp-task2", "cwd": "/Users/badlogic/workspaces/tuicp"}
        2. Send instructions: {"action": "stdin", "id": "claude-terminalcp-task2", "data": "You have access to the terminal MCP tool. Start opencode, switch to the Sonnet 4 model, and ask it to summarize the project in the current working directory. You MUST capture the COMPLETE response - use stdout with sufficient lines parameter. Report the full summary.", "submit": true}
        3. Monitor with periodic stdout checks until task completes
        4. Get cost: {"action": "stdin", "id": "claude-terminalcp-task2", "data": "/cost", "submit": true} then {"action": "stdout", "id": "claude-terminalcp-task2"}
        5. Save the EXACT /cost output
        6. Stop session: {"action": "stdin", "id": "claude-terminalcp-task2", "data": "exit", "submit": true} then {"action": "stop", "id": "claude-terminalcp-task2"}
        7. Rename trace files: mv .claude-trace/*.jsonl test-efficiency/task2-terminalcp.jsonl and mv .claude-trace/*.html test-efficiency/task2-terminalcp.html
        8. Create test-efficiency/task2-terminalcp.md with the cost output and observations

        Return: The exact /cost output and whether the task succeeded.
        """
    },
    {
        "subagent_type": "general-purpose",
        "description": "Task2 tmux",
        "prompt": """
        Use the terminal MCP tool to:
        1. Start Claude via: {"action": "start", "command": "npx @mariozechner/claude-trace --run-with --dangerously-skip-permissions", "name": "claude-tmux-task2", "cwd": "/Users/badlogic/workspaces/tuicp"}
        2. Send instructions: {"action": "stdin", "id": "claude-tmux-task2", "data": "You must use bash commands with tmux for all terminal operations. Do NOT use the terminal MCP tool. Start opencode, switch to the Sonnet 4 model, and ask it to summarize the project in the current working directory. You MUST capture the COMPLETE response - use tmux capture-pane with -S flag for scrollback. Report the full summary.", "submit": true}
        3. Monitor with periodic stdout checks until task completes
        4. Get cost: {"action": "stdin", "id": "claude-tmux-task2", "data": "/cost", "submit": true} then {"action": "stdout", "id": "claude-tmux-task2"}
        5. Save the EXACT /cost output
        6. Stop session: {"action": "stdin", "id": "claude-tmux-task2", "data": "exit", "submit": true} then {"action": "stop", "id": "claude-tmux-task2"}
        7. Rename trace files: mv .claude-trace/*.jsonl test-efficiency/task2-tmux.jsonl and mv .claude-trace/*.html test-efficiency/task2-tmux.html
        8. Create test-efficiency/task2-tmux.md with the cost output and observations

        Return: The exact /cost output and whether the task succeeded.
        """
    },
    {
        "subagent_type": "general-purpose",
        "description": "Task2 screen",
        "prompt": """
        Use the terminal MCP tool to:
        1. Start Claude via: {"action": "start", "command": "npx @mariozechner/claude-trace --run-with --dangerously-skip-permissions", "name": "claude-screen-task2", "cwd": "/Users/badlogic/workspaces/tuicp"}
        2. Send instructions: {"action": "stdin", "id": "claude-screen-task2", "data": "You must use bash commands with GNU screen for all terminal operations. Do NOT use the terminal MCP tool or tmux. Start opencode, switch to the Sonnet 4 model, and ask it to summarize the project in the current working directory. You MUST capture the COMPLETE response - use screen hardcopy or logfile. Report the full summary.", "submit": true}
        3. Monitor with periodic stdout checks until task completes
        4. Get cost: {"action": "stdin", "id": "claude-screen-task2", "data": "/cost", "submit": true} then {"action": "stdout", "id": "claude-screen-task2"}
        5. Save the EXACT /cost output
        6. Stop session: {"action": "stdin", "id": "claude-screen-task2", "data": "exit", "submit": true} then {"action": "stop", "id": "claude-screen-task2"}
        7. Rename trace files: mv .claude-trace/*.jsonl test-efficiency/task2-screen.jsonl and mv .claude-trace/*.html test-efficiency/task2-screen.html
        8. Create test-efficiency/task2-screen.md with the cost output and observations

        Return: The exact /cost output and whether the task succeeded.
        """
    },
    {
        "subagent_type": "general-purpose",
        "description": "Task2 CLI",
        "prompt": """
        Use the terminal MCP tool to:
        1. Start Claude via: {"action": "start", "command": "npx @mariozechner/claude-trace --run-with --dangerously-skip-permissions", "name": "claude-cli-task2", "cwd": "/Users/badlogic/workspaces/tuicp"}
        2. Send instructions: {"action": "stdin", "id": "claude-cli-task2", "data": "You must use bash commands with the terminalcp CLI (npx tsx src/index.ts) for all terminal operations. Do NOT use the terminal MCP tool, tmux, or screen. Start opencode, switch to the Sonnet 4 model, and ask it to summarize the project in the current working directory. You MUST capture the COMPLETE response - use terminalcp stdout command. Report the full summary.", "submit": true}
        3. Monitor with periodic stdout checks until task completes
        4. Get cost: {"action": "stdin", "id": "claude-cli-task2", "data": "/cost", "submit": true} then {"action": "stdout", "id": "claude-cli-task2"}
        5. Save the EXACT /cost output
        6. Stop session: {"action": "stdin", "id": "claude-cli-task2", "data": "exit", "submit": true} then {"action": "stop", "id": "claude-cli-task2"}
        7. Rename trace files: mv .claude-trace/*.jsonl test-efficiency/task2-cli.jsonl and mv .claude-trace/*.html test-efficiency/task2-cli.html
        8. Create test-efficiency/task2-cli.md with the cost output and observations

        Return: The exact /cost output and whether the task succeeded.
        """
    }
]
```

### Task 3: Python REPL - Parallel Execution

Execute all 4 multiplexer tests simultaneously:

```python
# Launch 4 parallel sub-agents for Task 3
parallel_agents = [
    {
        "subagent_type": "general-purpose",
        "description": "Task3 terminal-src",
        "prompt": """
        Use the terminal MCP tool to:
        1. Start Claude via: {"action": "start", "command": "npx @mariozechner/claude-trace --run-with --dangerously-skip-permissions", "name": "claude-terminalcp-task3", "cwd": "/Users/badlogic/workspaces/tuicp"}
        2. Send instructions: {"action": "stdin", "id": "claude-terminalcp-task3", "data": "You have access to the terminal MCP tool. Start a Python REPL and perform these calculations in order: 1. Calculate 42 * 17, 2. Import math and calculate math.factorial(10), 3. Create a list comprehension: [x**2 for x in range(10)], 4. Define a function that checks if a number is prime and test it with 17, 5. Exit the REPL cleanly. Capture all output and report the results.", "submit": true}
        3. Monitor with periodic stdout checks until task completes
        4. Get cost: {"action": "stdin", "id": "claude-terminalcp-task3", "data": "/cost", "submit": true} then {"action": "stdout", "id": "claude-terminalcp-task3"}
        5. Save the EXACT /cost output
        6. Stop session: {"action": "stdin", "id": "claude-terminalcp-task3", "data": "exit", "submit": true} then {"action": "stop", "id": "claude-terminalcp-task3"}
        7. Rename trace files: mv .claude-trace/*.jsonl test-efficiency/task3-terminalcp.jsonl and mv .claude-trace/*.html test-efficiency/task3-terminalcp.html
        8. Create test-efficiency/task3-terminalcp.md with the cost output and observations

        Return: The exact /cost output and whether the task succeeded.
        """
    },
    {
        "subagent_type": "general-purpose",
        "description": "Task3 tmux",
        "prompt": """
        Use the terminal MCP tool to:
        1. Start Claude via: {"action": "start", "command": "npx @mariozechner/claude-trace --run-with --dangerously-skip-permissions", "name": "claude-tmux-task3", "cwd": "/Users/badlogic/workspaces/tuicp"}
        2. Send instructions: {"action": "stdin", "id": "claude-tmux-task3", "data": "You must use bash commands with tmux for all terminal operations. Do NOT use the terminal MCP tool. Start a Python REPL and perform these calculations in order: 1. Calculate 42 * 17, 2. Import math and calculate math.factorial(10), 3. Create a list comprehension: [x**2 for x in range(10)], 4. Define a function that checks if a number is prime and test it with 17, 5. Exit the REPL cleanly. Capture all output and report the results.", "submit": true}
        3. Monitor with periodic stdout checks until task completes
        4. Get cost: {"action": "stdin", "id": "claude-tmux-task3", "data": "/cost", "submit": true} then {"action": "stdout", "id": "claude-tmux-task3"}
        5. Save the EXACT /cost output
        6. Stop session: {"action": "stdin", "id": "claude-tmux-task3", "data": "exit", "submit": true} then {"action": "stop", "id": "claude-tmux-task3"}
        7. Rename trace files: mv .claude-trace/*.jsonl test-efficiency/task3-tmux.jsonl and mv .claude-trace/*.html test-efficiency/task3-tmux.html
        8. Create test-efficiency/task3-tmux.md with the cost output and observations

        Return: The exact /cost output and whether the task succeeded.
        """
    },
    {
        "subagent_type": "general-purpose",
        "description": "Task3 screen",
        "prompt": """
        Use the terminal MCP tool to:
        1. Start Claude via: {"action": "start", "command": "npx @mariozechner/claude-trace --run-with --dangerously-skip-permissions", "name": "claude-screen-task3", "cwd": "/Users/badlogic/workspaces/tuicp"}
        2. Send instructions: {"action": "stdin", "id": "claude-screen-task3", "data": "You must use bash commands with GNU screen for all terminal operations. Do NOT use the terminal MCP tool or tmux. Start a Python REPL and perform these calculations in order: 1. Calculate 42 * 17, 2. Import math and calculate math.factorial(10), 3. Create a list comprehension: [x**2 for x in range(10)], 4. Define a function that checks if a number is prime and test it with 17, 5. Exit the REPL cleanly. Capture all output and report the results.", "submit": true}
        3. Monitor with periodic stdout checks until task completes
        4. Get cost: {"action": "stdin", "id": "claude-screen-task3", "data": "/cost", "submit": true} then {"action": "stdout", "id": "claude-screen-task3"}
        5. Save the EXACT /cost output
        6. Stop session: {"action": "stdin", "id": "claude-screen-task3", "data": "exit", "submit": true} then {"action": "stop", "id": "claude-screen-task3"}
        7. Rename trace files: mv .claude-trace/*.jsonl test-efficiency/task3-screen.jsonl and mv .claude-trace/*.html test-efficiency/task3-screen.html
        8. Create test-efficiency/task3-screen.md with the cost output and observations

        Return: The exact /cost output and whether the task succeeded.
        """
    },
    {
        "subagent_type": "general-purpose",
        "description": "Task3 CLI",
        "prompt": """
        Use the terminal MCP tool to:
        1. Start Claude via: {"action": "start", "command": "npx @mariozechner/claude-trace --run-with --dangerously-skip-permissions", "name": "claude-cli-task3", "cwd": "/Users/badlogic/workspaces/tuicp"}
        2. Send instructions: {"action": "stdin", "id": "claude-cli-task3", "data": "You must use bash commands with the terminalcp CLI (npx tsx src/index.ts) for all terminal operations. Do NOT use the terminal MCP tool, tmux, or screen. Start a Python REPL and perform these calculations in order: 1. Calculate 42 * 17, 2. Import math and calculate math.factorial(10), 3. Create a list comprehension: [x**2 for x in range(10)], 4. Define a function that checks if a number is prime and test it with 17, 5. Exit the REPL cleanly. Capture all output and report the results.", "submit": true}
        3. Monitor with periodic stdout checks until task completes
        4. Get cost: {"action": "stdin", "id": "claude-cli-task3", "data": "/cost", "submit": true} then {"action": "stdout", "id": "claude-cli-task3"}
        5. Save the EXACT /cost output
        6. Stop session: {"action": "stdin", "id": "claude-cli-task3", "data": "exit", "submit": true} then {"action": "stop", "id": "claude-cli-task3"}
        7. Rename trace files: mv .claude-trace/*.jsonl test-efficiency/task3-cli.jsonl and mv .claude-trace/*.html test-efficiency/task3-cli.html
        8. Create test-efficiency/task3-cli.md with the cost output and observations

        Return: The exact /cost output and whether the task succeeded.
        """
    }
]
```

## Execution Steps

1. **Task 1**: Launch 4 parallel sub-agents for LLDB debugging
2. **Task 2**: Launch 4 parallel sub-agents for OpenCode interaction
3. **Task 3**: Launch 4 parallel sub-agents for Python REPL calculations

Each set of 4 agents tests terminal-src, tmux, screen, and CLI approaches simultaneously.

## Expected Output Structure

All files go directly in the test-efficiency/ folder:
- task1-terminalcp.jsonl/html/md
- task1-tmux.jsonl/html/md
- task1-screen.jsonl/html/md
- task1-cli.jsonl/html/md
- task2-terminalcp.jsonl/html/md
- task2-tmux.jsonl/html/md
- task2-screen.jsonl/html/md
- task2-cli.jsonl/html/md
- task3-terminalcp.jsonl/html/md
- task3-tmux.jsonl/html/md
- task3-screen.jsonl/html/md
- task3-cli.jsonl/html/md
- final-report.md

## Final Report Structure

After all tasks complete, create a summary report comparing:
- Token usage and costs for each multiplexer approach
- Success/failure rates
- Which approach is most efficient

The report should be saved as `test-efficiency/final-report.md`