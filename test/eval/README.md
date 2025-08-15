# Evaluation Framework

A streamlined evaluation system for testing terminal multiplexer tools with various AI coding agents.

## Structure

```
test/eval/
├── tasks/              # Task descriptions (markdown files)
│   ├── debug-lldb.md
│   ├── python-repl.md
│   └── project-analysis.md
├── tools/              # Tool instructions (markdown files)
│   ├── terminalcp.md
│   ├── tmux.md
│   └── screen.md
├── agents.ts           # Agent definitions and detection
├── runner.ts           # Core evaluation runner using TerminalManager
├── run.ts              # Main entry point
└── analyze.ts          # Results analyzer
```

## Key Design Decisions

1. **Uses TerminalManager directly** instead of CLI for better performance
2. **Tasks and tools are markdown files** - easy to add/modify without code changes
3. **Agent detection** based on unique UI markers (e.g., "esc to interrupt")
4. **Simple file-based configuration** - no complex abstractions

## Usage

### Run evaluation with specific agents:
```bash
npx tsx test/eval/run.ts claude opencode gemini
```

### Run with default (Claude only):
```bash
npx tsx test/eval/run.ts
```

### Analyze results:
```bash
npx tsx test/eval/analyze.ts
```

## How it works

1. **Loads tasks and tools from markdown files**
   - Tasks from `test/eval/tasks/*.md`
   - Tools from `test/eval/tools/*.md`

2. **For each combination of agent × task × tool:**
   - Starts the agent using TerminalManager (not CLI)
   - Waits for initialization (3 seconds)
   - Sends the task prompt
   - Monitors for the agent's "working" marker
   - Waits for completion
   - Requests cost/token information
   - Saves output to `evaluation-results/`

3. **Agent detection markers:**
   - Claude Code: "esc to interrupt"
   - OpenCode: "esc interrupt"  
   - Gemini: "esc to cancel"

## Adding new content

### Add a new task
Create a markdown file in `test/eval/tasks/`:
```markdown
# Task Name

Task description and instructions...

IMPORTANT: When complete, output exactly "TASK_COMPLETE" on its own line.
If you cannot complete, output exactly "TASK_FAILED" on its own line.
```

### Add a new tool
Create a markdown file in `test/eval/tools/`:
```markdown
You must use **tool-name** to complete the task.

Commands:
- Start: `command to start`
- Send input: `command to send input`
...
```

### Add a new agent
Edit `agents.ts`:
```typescript
newagent: {
  name: "New Agent",
  command: "newagent-cli",
  workingMarker: "unique text when processing",
  costCommand: "/command-for-costs",
}
```

## Output

Results are saved as `{agent}-{task}-{tool}.log` in `evaluation-results/` directory.