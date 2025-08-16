# Evaluation Framework

A streamlined evaluation system for testing terminal multiplexer tools with various AI coding agents.

## Structure

```
test/eval/
├── tasks/              # Task descriptions (markdown files)
│   ├── debug-lldb.md
│   ├── python-repl.md
│   └── project-analysis.md
├── tools/              # Tool instructions with MCP/CLI config
│   ├── terminalcp.md   # MCP tool
│   ├── terminalcp-cli.md # CLI tool
│   ├── tmux.md         # CLI tool
│   └── screen.md       # CLI tool
├── agents.ts           # Agent definitions and detection
├── runner.ts           # Core evaluation runner using TerminalManager
├── run.ts              # Main CLI entry point
├── stats.ts            # Statistics generator with Claude judging
└── analyze.ts          # Legacy results analyzer (use stats.ts instead)
```

## Key Design Decisions

1. **Uses TerminalManager directly** instead of CLI for better performance
2. **Tasks and tools are markdown files** - easy to add/modify without code changes
3. **Agent detection** based on unique UI markers (e.g., "esc to interrupt")
4. **Automatic prompt structuring** - Task → Tool → Completion sections
5. **MCP configuration management** - Creates config files for MCP-enabled agents
6. **Repetition support** - Run same evaluation multiple times for consistency testing
7. **Parallel execution** - Run multiple evaluations concurrently for faster results

## Usage

### Run with various options:
```bash
# Run all tasks/tools with default agent (claude)
npx tsx test/eval/run.ts

# Specify agents, tasks, and tools
npx tsx test/eval/run.ts --agents claude gemini --tasks python-repl --tools tmux screen

# Run each evaluation 3 times
npx tsx test/eval/run.ts --repeat 3

# Run 4 evaluations in parallel
npx tsx test/eval/run.ts --parallel 4

# Combine repeat and parallel
npx tsx test/eval/run.ts --repeat 3 --parallel 2

# Use file paths for custom tasks/tools
npx tsx test/eval/run.ts --tasks ./my-task.md --tools ~/custom-tool.md

# Get help
npx tsx test/eval/run.ts --help
```

### Command-line options:
- `--agents <items...>` - Agent names (default: claude)
- `--tasks <items...>` - Task names or file paths (default: all in test/eval/tasks/)
- `--tools <items...>` - Tool names or file paths (default: all in test/eval/tools/)
- `--repeat <n>` - Number of times to repeat each evaluation (default: 1)
- `--parallel <n>` - Number of evaluations to run in parallel (default: 1)
- `--help, -h` - Show help

### Generate statistics and judge results:
```bash
# Analyze all results in evaluation-results/ with Claude judging
npx tsx test/eval/stats.ts

# Analyze results in a specific directory
npx tsx test/eval/stats.ts /path/to/results
```

This will:
1. Extract statistics from all evaluation runs
2. Use Claude to judge each agent/task/tool combination
3. Compare tool performance for each task
4. Output judge notes to console and save to files
5. Generate `evaluation-summary.json` with all results and judgments

## How it works

1. **Loads tasks and tools from markdown files**
   - Tasks from `test/eval/tasks/*.md` or custom paths
   - Tools from `test/eval/tools/*.md` or custom paths
   - Tools can specify MCP servers or CLI cleanup commands

2. **Constructs structured prompts:**
   - **Task section**: What needs to be done
   - **Tool section**: Which tool to use and how
   - **Completion section**: Success/failure reporting instructions

3. **For each combination of agent × task × tool × repetition:**
   - Creates MCP config files if needed (for MCP-enabled agents)
   - Starts the agent using TerminalManager
   - Waits for initialization (3 seconds)
   - Sends: `Read {promptFile} and follow the instructions.`
   - Monitors for the agent's "working" marker (30s timeout)
   - If no response, sends nudge to proceed
   - Waits for completion (5 minute timeout)
   - Requests cost/token information
   - Captures output in multiple formats (scrollbuffer, stream, stream-ansi)
   - Saves to `evaluation-results/{agent}-{task}-{tool}-{timestamp}.log`
   - Runs tool-specific cleanup commands

4. **Agent detection markers:**
   - Claude Code: "esc to interrupt"
   - OpenCode: "esc interrupt"  
   - Gemini: "esc to cancel"

5. **Output files (with timestamps):**
   - `{agent}--{task}--{tool}--{timestamp}.log` - Error log (if failed)
   - `{agent}--{task}--{tool}--{timestamp}-prompt.md` - Full prompt sent
   - `{agent}--{task}--{tool}--{timestamp}-scrollbuffer.txt` - Terminal viewport
   - `{agent}--{task}--{tool}--{timestamp}-stream.txt` - Raw output (no ANSI)
   - `{agent}--{task}--{tool}--{timestamp}-stream-ansi.txt` - Raw output with ANSI
   - `{agent}--{task}--{tool}--judge.md` - Judge prompt and response (after stats.ts)
   - `{agent}--{task}--overall--judge.md` - Task-level tool comparison (after stats.ts)

## Adding new content

### Add a new task
Create a markdown file in `test/eval/tasks/`:
```markdown
Your task description here...
Step-by-step instructions...

After each step, verify the output before proceeding.
Finally, get all output and summarize the results.
```
Note: Completion instructions (TASK_COMPLETE/TASK_FAILED) are added automatically.

### Add a new tool

#### CLI Tool
Create a markdown file in `test/eval/tools/`:
```markdown
---
{
  "type": "cli",
  "cleanup": "cleanup command here"
}
---

### Core Commands

- **Start**: `command to start`
- **Send input**: `command to send input`
...
```

#### MCP Tool
```markdown
---
{
  "type": "mcp",
  "mcpServers": {
    "toolname": {
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "path/to/server.ts"]
    }
  }
}
---

### Important Notes
- Instructions for using the MCP tool...
```

### Add a new agent
Edit `agents.ts`:
```typescript
newagent: {
  name: "New Agent",
  command: "newagent-cli",
  workingMarker: "unique text when processing",
  costCommand: "/command-for-costs",
  initDelay: 3000,  // milliseconds
  supportsMcp: false,  // or true with configFiles
  configFiles: [{
    path: "config.json",
    template: (mcpServers) => ({ mcpServers: mcpServers || {} })
  }]
}
```

## Output

Results are saved in `evaluation-results/` with timestamps:
- Format: `{agent}--{task}--{tool}--{yyyymmddhhmmssSSS}{runcount}.{extension}`
- Example: `claude-code--python-repl--tmux--20250815153045123000-scrollbuffer.txt`

The timestamp includes milliseconds and a run counter to ensure uniqueness even when running in parallel.

### Tool Instructions

All tools follow a standardized structure for efficiency:

#### Quick Start Section
Each tool has a Quick Start workflow showing the typical usage pattern:
1. Start session
2. Send input  
3. Get current viewport (clean, rendered)
4. Clean up when done

#### Optimized for Efficiency
- **Batching**: Send multiple commands before checking output
- **Smart output retrieval**: Use viewport methods (hardcopy/capture-pane/stdout) for clean rendered views
- **Consistent patterns**: All tools have similar command structures for easy comparison

### Statistics and Judging

After running evaluations, use `stats.ts` to:

1. **Extract metrics** from each run:
   - Success/failure (based on TASK_COMPLETE marker)
   - Total cost and duration
   - Token usage by model

2. **Judge performance** using Claude:
   - Individual tool assessment for each agent/task/tool combination
   - Comparative analysis when multiple tools tested on same task
   - Rankings based on success rate, efficiency, ease of use

3. **Output structure** in `evaluation-summary.json`:
```json
{
  "agent": {
    "task": {
      "judgeNotes": "Comparative analysis of tools",
      "tool1": {
        "judgeNotes": "Individual assessment",
        "runs": [array of evaluation results]
      }
    }
  }
}
```