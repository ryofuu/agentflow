import { closeSync, mkdirSync, openSync, writeSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawn as ptySpawn } from "bun-pty";
import { prefixOutput, printStepEnd, printStepStart } from "./formatter.ts";
import type { StepConfig } from "./parser.ts";

// --- Type Definitions ---

export class StepError extends Error {
  constructor(
    public jobName: string,
    public stepName: string,
    public exitCode: number,
  ) {
    super(`Step "${jobName} > ${stepName}" failed with exit code ${exitCode}`);
  }
}

export interface StepContext {
  workspace: string;
  jobName: string;
  stepName: string;
  iteration: number;
  jobEnv?: Record<string, string>;
  parallel?: boolean;
}

// --- Step Execution ---

export async function executeStep(
  step: StepConfig,
  context: StepContext,
): Promise<void> {
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    WORKSPACE: context.workspace,
    AGENTFLOW_HOME: join(process.env.HOME ?? "", ".agentflow"),
    JOB_NAME: context.jobName,
    STEP_NAME: context.stepName,
    ITERATION: String(context.iteration),
    ...(context.jobEnv ?? {}),
    ...(step.env ?? {}),
  };

  const cwd = step["working-directory"]
    ? resolve(step["working-directory"])
    : process.cwd();

  const startTime = Date.now();

  if (!context.parallel) {
    printStepStart(context.jobName, context.stepName);
  }

  // Always use PTY so child process sees a real TTY (enables streaming from claude etc.)
  const exitCode = await runWithPty(step, context, env, cwd);

  const duration = (Date.now() - startTime) / 1000;
  if (!context.parallel) {
    printStepEnd(context.jobName, context.stepName, duration);
  }

  if (exitCode !== 0) {
    throw new StepError(context.jobName, context.stepName, exitCode);
  }
}

// --- PTY-based execution (tee + parallel prefix with real TTY) ---

function runWithPty(
  step: StepConfig,
  context: StepContext,
  env: Record<string, string>,
  cwd: string,
): Promise<number> {
  return new Promise((resolvePromise) => {
    const cols = process.stdout.columns || 120;
    const rows = process.stdout.rows || 40;

    const pty = ptySpawn("sh", ["-c", step.run], {
      name: "xterm-256color",
      cols,
      rows,
      cwd,
      env,
    });

    let outputFd: number | undefined;
    if (step.output) {
      const outputPath = join(context.workspace, step.output);
      mkdirSync(dirname(outputPath), { recursive: true });
      outputFd = openSync(outputPath, "w");
    }

    // Timeout
    let timer: Timer | undefined;
    if (step.timeout) {
      timer = setTimeout(() => pty.kill(), step.timeout * 1000);
    }

    pty.onData((data: string) => {
      const bytes = new TextEncoder().encode(data);

      if (context.parallel) {
        const prefixed = prefixOutput(context.jobName, bytes);
        process.stdout.write(prefixed);
      } else {
        process.stdout.write(bytes);
      }

      if (outputFd !== undefined) {
        writeSync(outputFd, bytes);
      }
    });

    pty.onExit(({ exitCode }) => {
      if (timer) clearTimeout(timer);
      if (outputFd !== undefined) {
        closeSync(outputFd);
      }
      resolvePromise(exitCode);
    });
  });
}
