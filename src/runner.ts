import { resolve, join, dirname } from "node:path";
import { mkdirSync, openSync, writeSync, closeSync } from "node:fs";
import type { StepConfig } from "./parser.ts";
import { printStepStart, printStepEnd, prefixOutput } from "./formatter.ts";

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

  if (step.output || context.parallel) {
    // Pipe stdout so we can tee or prefix
    const proc = Bun.spawn(["sh", "-c", step.run], {
      env,
      cwd,
      stdout: "pipe",
      stderr: "inherit",
    });

    let outputFd: number | undefined;
    if (step.output) {
      const outputPath = join(context.workspace, step.output);
      mkdirSync(dirname(outputPath), { recursive: true });
      outputFd = openSync(outputPath, "w");
    }

    const reader = proc.stdout.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          if (context.parallel) {
            const prefixed = prefixOutput(context.jobName, value);
            process.stdout.write(prefixed);
          } else {
            process.stdout.write(value);
          }
          if (outputFd !== undefined) {
            writeSync(outputFd, value);
          }
        }
      }
    } finally {
      reader.releaseLock();
      if (outputFd !== undefined) {
        closeSync(outputFd);
      }
    }

    // Timeout
    let timer: Timer | undefined;
    if (step.timeout) {
      timer = setTimeout(() => proc.kill(), step.timeout * 1000);
    }

    const exitCode = await proc.exited;
    if (timer) clearTimeout(timer);

    const duration = (Date.now() - startTime) / 1000;
    if (!context.parallel) {
      printStepEnd(context.jobName, context.stepName, duration);
    }

    if (exitCode !== 0) {
      throw new StepError(context.jobName, context.stepName, exitCode);
    }
  } else {
    // No output capture, no parallel - inherit stdout directly
    const proc = Bun.spawn(["sh", "-c", step.run], {
      env,
      cwd,
      stdout: "inherit",
      stderr: "inherit",
    });

    let timer: Timer | undefined;
    if (step.timeout) {
      timer = setTimeout(() => proc.kill(), step.timeout * 1000);
    }

    const exitCode = await proc.exited;
    if (timer) clearTimeout(timer);

    const duration = (Date.now() - startTime) / 1000;
    printStepEnd(context.jobName, context.stepName, duration);

    if (exitCode !== 0) {
      throw new StepError(context.jobName, context.stepName, exitCode);
    }
  }
}
