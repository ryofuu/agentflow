import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { executeStep, StepError } from "../src/runner.ts";

const tmpDir = join(import.meta.dir, ".tmp-runner");

beforeEach(() => {
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("runner", () => {
  test("executes a simple command", async () => {
    await executeStep(
      { run: "echo hello" },
      {
        workspace: tmpDir,
        jobName: "test",
        stepName: "step-0",
        iteration: 1,
      },
    );
    // Should not throw
  });

  test("writes output to file (tee)", async () => {
    await executeStep(
      { run: "echo tee-test", output: "out.txt" },
      {
        workspace: tmpDir,
        jobName: "test",
        stepName: "step-0",
        iteration: 1,
      },
    );

    const content = readFileSync(join(tmpDir, "out.txt"), "utf-8");
    expect(content.trim()).toBe("tee-test");
  });

  test("throws StepError on non-zero exit", async () => {
    try {
      await executeStep(
        { run: "exit 42" },
        {
          workspace: tmpDir,
          jobName: "myjob",
          stepName: "mystep",
          iteration: 1,
        },
      );
      expect(true).toBe(false); // Should not reach
    } catch (err) {
      expect(err).toBeInstanceOf(StepError);
      expect((err as StepError).jobName).toBe("myjob");
      expect((err as StepError).stepName).toBe("mystep");
      expect((err as StepError).exitCode).toBe(42);
    }
  });

  test("sets environment variables", async () => {
    await executeStep(
      {
        run: 'echo "$WORKSPACE|$JOB_NAME|$STEP_NAME|$ITERATION"',
        output: "env.txt",
      },
      {
        workspace: tmpDir,
        jobName: "j1",
        stepName: "s1",
        iteration: 3,
      },
    );

    const content = readFileSync(join(tmpDir, "env.txt"), "utf-8").trim();
    expect(content).toBe(`${tmpDir}|j1|s1|3`);
  });

  test("step env overrides job env", async () => {
    await executeStep(
      {
        run: 'echo "$MY_VAR"',
        output: "env.txt",
        env: { MY_VAR: "step-val" },
      },
      {
        workspace: tmpDir,
        jobName: "test",
        stepName: "step-0",
        iteration: 1,
        jobEnv: { MY_VAR: "job-val" },
      },
    );

    const content = readFileSync(join(tmpDir, "env.txt"), "utf-8").trim();
    expect(content).toBe("step-val");
  });

  test("timeout kills long-running process", async () => {
    const start = Date.now();
    try {
      await executeStep(
        { run: "sleep 30", timeout: 1 },
        {
          workspace: tmpDir,
          jobName: "test",
          stepName: "timeout-step",
          iteration: 1,
        },
      );
    } catch (err) {
      // Expected - process was killed
      expect(err).toBeInstanceOf(StepError);
    }
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5000); // Should not have waited 30s
  });
});
