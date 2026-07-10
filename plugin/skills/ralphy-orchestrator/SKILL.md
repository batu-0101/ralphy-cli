---
name: ralphy-orchestrator
description: "Run a PRD or task list through the Ralphy autonomous coding CLI. Use for: run ralphy, execute this PRD autonomously, iterate through this task list, use Grok or Claude for a Ralphy loop."
---

# Ralphy Orchestrator

Ralphy executes a PRD or task list one item at a time with a fresh coding-agent
process for each iteration. It can create commits, so establish the target and
verification criteria before launching it.

## Workflow

1. Confirm `ralphy --version` and `ralphy --help` work.
2. Inspect the target repository's instructions and `git status --short`.
3. Read the requested PRD/task file. If none was named, use `PRD.md` only when it
   exists; otherwise ask for or create an explicit task source.
4. Preview selection and parsing with `ralphy --prd <path> --dry-run`.
5. Select the requested engine:
   - Claude Code: default engine or `--claude`
   - Grok Build: `--grok`
   - Other supported engines: follow `ralphy --help`
6. Run the loop, then verify the repository status, commits, and project tests.

Examples:

```powershell
ralphy --prd PRD.md --dry-run
ralphy --claude --prd PRD.md
ralphy --grok --prd PRD.md
```

When this skill is loaded by Beyond Ollama, Beyond remains the coordinating
agent and can launch the installed Ralphy CLI through `run_powershell`; choose a
supported Ralphy engine explicitly. Never claim a run completed from process
startup alone—inspect its exit code and the resulting repository state.
