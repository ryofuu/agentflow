<p align="center">
  <h1 align="center">AgentFlow</h1>
  <p align="center">
    <strong>Orchestrate AI agents like CI/CD pipelines.</strong>
  </p>
  <p align="center">
    Declarative YAML workflows &bull; DAG-based parallel execution &bull; Real-time PTY streaming
  </p>
</p>

---

AgentFlow turns multi-agent AI development into a **declarative pipeline**. Define your agents, their dependencies, and exit conditions in a single YAML file — AgentFlow handles scheduling, parallelism, and streaming output automatically.

```yaml
name: develop-feature
on:
  loop:
    max: 15
    until: grep -q '^done$' $WORKSPACE/current-ticket-id

jobs:
  planner:
    steps:
      - run: claude -p "$(cat $AGENTFLOW_HOME/agents/planner.md)"

  implementer:
    needs: [planner]
    steps:
      - run: claude -p "$(cat $AGENTFLOW_HOME/agents/implementer.md)"

  reviewer:
    needs: [implementer]
    steps:
      - run: claude -p "$(cat $AGENTFLOW_HOME/agents/reviewer.md)"
```

One command. Multiple agents. Fully autonomous development loop.

```bash
agentflow run dev-cycle
```

## Why AgentFlow?

AI coding agents are powerful individually. But real development needs **coordination** — a planner that breaks down tasks, an implementer that writes code, a reviewer that catches issues, all working in a loop until the feature is done.

AgentFlow gives you:

- **Composability** — Chain any CLI tool. Claude Code, Codex, custom scripts — if it runs in a shell, it runs in AgentFlow.
- **Parallelism for free** — Declare dependencies with `needs`. Everything else runs concurrently.
- **Autonomous loops** — `until` conditions let agents iterate until the job is actually done.
- **Real-time streaming** — PTY-based execution means you see Claude thinking in real time, not after it's done.
- **Zero lock-in** — Pure shell commands. No SDK, no expression language, no runtime magic.

## Install

```bash
git clone https://github.com/yourname/agentflow.git
cd agentflow && bun install

# Make it available globally
ln -s "$(pwd)/src/index.ts" ~/.local/bin/agentflow
```

> Requires [Bun](https://bun.sh) v1.1+

## Quick Start

```bash
# Hello world
agentflow run examples/hello.yaml

# Preview execution plan
agentflow run examples/parallel-test.yaml --dry-run

# Watch a countdown loop
agentflow run examples/countdown.yaml --verbose
```

## Workflow Syntax

```yaml
name: my-workflow
workspace: .agentflow          # Working directory (default: .agentflow)

on: run                         # Single execution
# or
on:
  loop:
    max: 10                     # Maximum iterations
    until: <shell command>      # Exit when exit code = 0

jobs:
  build:
    if: <shell command>         # Conditional execution
    env:
      KEY: value
    steps:
      - name: compile
        run: make build
        output: build.log       # Tee stdout to $WORKSPACE/build.log
        timeout: 300            # Kill after N seconds
        working-directory: ./src

  deploy:
    needs: [build]              # DAG dependency
    steps:
      - run: ./deploy.sh
```

### Built-in Environment Variables

| Variable | Value |
|---|---|
| `$WORKSPACE` | Absolute path to workspace directory |
| `$AGENTFLOW_HOME` | `~/.agentflow` |
| `$JOB_NAME` | Current job ID |
| `$STEP_NAME` | Current step name |
| `$ITERATION` | Loop iteration (1-indexed) |

## How It Works

```
                    ┌─────────┐
                    │  YAML   │
                    └────┬────┘
                         │ parse & validate
                    ┌────▼────┐
                    │Scheduler│  topological sort (Kahn's algorithm)
                    │  (DAG)  │  cycle detection (DFS)
                    └────┬────┘
                         │ execution levels
                    ┌────▼────┐
                    │ Engine  │  loop control / until / dry-run
                    └────┬────┘
                         │
              ┌──────────┼──────────┐
              │          │          │
         ┌────▼──┐ ┌────▼──┐ ┌────▼──┐
         │Job A  │ │Job B  │ │Job C  │  parallel PTY execution
         │(PTY)  │ │(PTY)  │ │(PTY)  │
         └───────┘ └───────┘ └───────┘
```

1. **Parse** — YAML is loaded, validated, and normalized
2. **Schedule** — Jobs are sorted into execution levels by dependency graph
3. **Execute** — Each level runs in parallel; steps within a job run sequentially
4. **Stream** — Every process gets its own PTY for real-time output
5. **Loop** — In `on: loop` mode, the entire DAG repeats until `until` succeeds or `max` is reached

### Parallel Output

Concurrent jobs get prefixed output so you never lose track:

```
── lint, typecheck, test ──── (parallel)
[lint]      All checks passed
[typecheck] No errors found
[test]      43 tests passed
```

## Examples

### CI Pipeline — Parallel jobs with fan-in

```yaml
name: ci-pipeline
on: run

jobs:
  lint:
    steps:
      - run: npm run lint

  typecheck:
    steps:
      - run: tsc --noEmit

  test:
    steps:
      - run: npm test

  build:
    needs: [lint, typecheck, test]
    steps:
      - run: npm run build
```

### Fix Tests — AI repair loop

Let agents fix your failing tests automatically:

```yaml
name: fix-tests
on:
  loop:
    max: 5
    until: npm test

jobs:
  capture:
    steps:
      - run: npm test 2>&1 || true
        output: test-results.txt

  analyze:
    needs: [capture]
    steps:
      - run: claude -p "Analyze $WORKSPACE/test-results.txt. Identify root causes."
        output: analysis.md

  fix:
    needs: [analyze]
    steps:
      - run: codex --prompt "Fix the issues in $WORKSPACE/analysis.md."

  verify:
    needs: [fix]
    steps:
      - run: npm test 2>&1 || true
        output: test-results.txt
```

### Dev Cycle — Autonomous multi-agent development

A planner creates tickets, an implementer writes code, a reviewer checks quality — looping until all work is done:

```yaml
name: develop-feature
workspace: .agentflow

on:
  loop:
    max: 15
    until: grep -q '^done$' $WORKSPACE/current-ticket-id 2>/dev/null

jobs:
  planner:
    steps:
      - run: claude -p "$(cat $AGENTFLOW_HOME/agents/planner.md)"

  implementer:
    needs: [planner]
    steps:
      - run: |
          TICKET=$(cat $WORKSPACE/current-ticket-id | tr -d '[:space:]')
          [ "$TICKET" != "done" ] && claude -p "Implement $WORKSPACE/tickets/${TICKET}.md"

  reviewer:
    needs: [implementer]
    steps:
      - run: |
          TICKET=$(cat $WORKSPACE/current-ticket-id | tr -d '[:space:]')
          [ "$TICKET" != "done" ] && claude -p "Review changes for $WORKSPACE/tickets/${TICKET}.md"
```

## CLI Reference

```
agentflow run <workflow> [options]

Options:
  --dry-run        Show execution plan without running
  --workspace DIR  Override workspace directory
  --max N          Override loop.max
  --verbose        Show detailed state transitions
```

### Workflow Resolution

Workflows are resolved in order:

1. Exact path — `agentflow run ./my-workflow.yaml`
2. Global name — `agentflow run dev-cycle` resolves to `~/.agentflow/workflows/dev-cycle.yaml`

Store your reusable workflows in `~/.agentflow/workflows/` and run them from anywhere.

## Project Structure

```
~/.agentflow/
  agents/              # Reusable agent prompts
    planner.md
    implementer.md
    reviewer.md
  workflows/           # Global workflows (run by name)
    dev-cycle.yaml
    fix-tests.yaml

<your-project>/
  .agentflow/          # Per-project workspace (auto-created)
    tickets/
    current-ticket-id
```

## Design Principles

- **Shell-first** — No DSL, no expression language. If `sh -c` can run it, AgentFlow can orchestrate it.
- **Declarative over imperative** — Describe what you want, not how to execute it. The scheduler figures out parallelism.
- **Streaming by default** — Every child process runs in a real PTY. You see output as it happens.
- **Minimal surface** — ~600 lines of TypeScript. No plugins, no middleware, no configuration framework.

## Development

```bash
bun test              # Run tests (43 tests)
bun run typecheck     # Type check
```

## License

MIT
