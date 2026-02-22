#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { join } from "node:path";
import { type ExecuteOptions, execute } from "./engine.ts";
import { loadConfig } from "./parser.ts";
import { buildPlan } from "./scheduler.ts";

const AGENTFLOW_HOME = join(process.env.HOME ?? "", ".agentflow");

// --- CLI Args ---

interface CliArgs {
  command: "run";
  workflowPath: string;
  dryRun: boolean;
  workspaceOverride?: string;
  maxOverride?: number;
  verbose: boolean;
}

function parseArgs(args: string[]): CliArgs {
  const command = args[0];
  if (command !== "run") {
    console.error("Usage: agentflow run <workflow.yaml> [options]");
    console.error();
    console.error("Options:");
    console.error("  --dry-run        Show execution plan without running");
    console.error("  --workspace DIR  Override workspace directory");
    console.error("  --max N          Override loop.max");
    console.error("  --verbose        Show detailed state transitions");
    process.exit(1);
  }

  const workflowPath = args[1];
  if (!workflowPath) {
    console.error("Error: workflow file path is required");
    console.error("Usage: agentflow run <workflow.yaml>");
    process.exit(1);
  }

  let dryRun = false;
  let workspaceOverride: string | undefined;
  let maxOverride: number | undefined;
  let verbose = false;

  for (let i = 2; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--dry-run":
        dryRun = true;
        break;
      case "--workspace":
        workspaceOverride = args[++i];
        break;
      case "--max": {
        const val = args[++i];
        if (val) maxOverride = parseInt(val, 10);
        break;
      }
      case "--verbose":
        verbose = true;
        break;
      default:
        console.error(`Unknown option: ${arg}`);
        process.exit(1);
    }
  }

  return { command: "run", workflowPath, dryRun, workspaceOverride, maxOverride, verbose };
}

function resolveWorkflowPath(input: string): string {
  // 1. As-is (relative or absolute)
  if (existsSync(input)) return input;
  // 2. ~/.agentflow/workflows/{input}
  const inHome = join(AGENTFLOW_HOME, "workflows", input);
  if (existsSync(inHome)) return inHome;
  // 3. ~/.agentflow/workflows/{input}.yaml
  const withExt = `${inHome}.yaml`;
  if (existsSync(withExt)) return withExt;

  // Fall through — let loadConfig report the error
  return input;
}

// --- Main ---

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  try {
    const config = await loadConfig(resolveWorkflowPath(args.workflowPath));
    const plan = buildPlan(config);
    const options: ExecuteOptions = {
      dryRun: args.dryRun,
      workspaceOverride: args.workspaceOverride,
      maxOverride: args.maxOverride,
      verbose: args.verbose,
    };
    const result = await execute(config, plan, options);
    process.exit(result.success ? 0 : 1);
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main();
