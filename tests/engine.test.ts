import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execute } from "../src/engine.ts";
import type { WorkflowConfig } from "../src/parser.ts";
import { buildPlan } from "../src/scheduler.ts";

const tmpDir = join(import.meta.dir, ".tmp-engine");

beforeEach(() => {
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function workspace() {
  return join(tmpDir, "ws");
}

describe("engine", () => {
  test("on: run executes jobs once", async () => {
    const config: WorkflowConfig = {
      name: "simple",
      workspace: ".agentflow",
      on: "run",
      jobs: {
        hello: {
          steps: [{ run: "echo hello" }],
        },
      },
    };
    const plan = buildPlan(config);
    const result = await execute(config, plan, {
      workspaceOverride: workspace(),
    });

    expect(result.success).toBe(true);
    expect(result.iterationsCompleted).toBe(1);
    expect(result.jobsExecuted).toBe(1);
    expect(result.earlyExit).toBe(false);
  });

  test("output tees to file", async () => {
    const ws = workspace();
    const config: WorkflowConfig = {
      name: "output-test",
      workspace: ".agentflow",
      on: "run",
      jobs: {
        writer: {
          steps: [{ run: "echo hello-world", output: "result.txt" }],
        },
      },
    };
    const plan = buildPlan(config);
    const result = await execute(config, plan, {
      workspaceOverride: ws,
    });

    expect(result.success).toBe(true);
    const content = readFileSync(join(ws, "result.txt"), "utf-8");
    expect(content.trim()).toBe("hello-world");
  });

  test("parallel jobs all execute", async () => {
    const ws = workspace();
    const config: WorkflowConfig = {
      name: "parallel",
      workspace: ".agentflow",
      on: "run",
      jobs: {
        a: { steps: [{ run: "echo a", output: "a.txt" }] },
        b: { steps: [{ run: "echo b", output: "b.txt" }] },
        c: { steps: [{ run: "echo c", output: "c.txt" }] },
      },
    };
    const plan = buildPlan(config);
    const result = await execute(config, plan, {
      workspaceOverride: ws,
    });

    expect(result.success).toBe(true);
    expect(result.jobsExecuted).toBe(3);
    expect(readFileSync(join(ws, "a.txt"), "utf-8").trim()).toBe("a");
    expect(readFileSync(join(ws, "b.txt"), "utf-8").trim()).toBe("b");
    expect(readFileSync(join(ws, "c.txt"), "utf-8").trim()).toBe("c");
  });

  test("needs enforces order", async () => {
    const ws = workspace();
    const config: WorkflowConfig = {
      name: "ordered",
      workspace: ".agentflow",
      on: "run",
      jobs: {
        first: {
          steps: [{ run: `echo first > ${ws}/order.txt` }],
        },
        second: {
          needs: ["first"],
          steps: [{ run: `echo second >> ${ws}/order.txt` }],
        },
      },
    };
    const plan = buildPlan(config);
    const result = await execute(config, plan, {
      workspaceOverride: ws,
    });

    expect(result.success).toBe(true);
    const lines = readFileSync(join(ws, "order.txt"), "utf-8")
      .trim()
      .split("\n");
    expect(lines).toEqual(["first", "second"]);
  });

  test("on: loop repeats and respects until", async () => {
    const ws = workspace();
    const config: WorkflowConfig = {
      name: "loop-test",
      workspace: ".agentflow",
      on: {
        loop: {
          max: 10,
          until: `[ "$(cat ${ws}/counter.txt 2>/dev/null)" = "3" ]`,
        },
      },
      jobs: {
        counter: {
          steps: [
            {
              run: `
                CURRENT=$(cat ${ws}/counter.txt 2>/dev/null || echo 0)
                echo $((CURRENT + 1)) > ${ws}/counter.txt
              `,
            },
          ],
        },
      },
    };
    const plan = buildPlan(config);
    const result = await execute(config, plan, {
      workspaceOverride: ws,
    });

    expect(result.success).toBe(true);
    expect(result.iterationsCompleted).toBe(3);
    expect(result.earlyExit).toBe(true);
    const counter = readFileSync(join(ws, "counter.txt"), "utf-8").trim();
    expect(counter).toBe("3");
  });

  test("loop stops at max", async () => {
    const ws = workspace();
    const config: WorkflowConfig = {
      name: "max-loop",
      workspace: ".agentflow",
      on: {
        loop: {
          max: 3,
          until: "false",
        },
      },
      jobs: {
        tick: {
          steps: [{ run: "echo tick" }],
        },
      },
    };
    const plan = buildPlan(config);
    const result = await execute(config, plan, {
      workspaceOverride: ws,
    });

    expect(result.success).toBe(true);
    expect(result.iterationsCompleted).toBe(3);
    expect(result.earlyExit).toBe(false);
  });

  test("environment variables are set", async () => {
    const ws = workspace();
    const config: WorkflowConfig = {
      name: "env-test",
      workspace: ".agentflow",
      on: "run",
      jobs: {
        check: {
          steps: [
            {
              run: `echo "ws=$WORKSPACE job=$JOB_NAME step=$STEP_NAME iter=$ITERATION"`,
              output: "env.txt",
              name: "check-env",
            },
          ],
        },
      },
    };
    const plan = buildPlan(config);
    await execute(config, plan, { workspaceOverride: ws });

    const content = readFileSync(join(ws, "env.txt"), "utf-8").trim();
    expect(content).toContain(`ws=${ws}`);
    expect(content).toContain("job=check");
    expect(content).toContain("step=check-env");
    expect(content).toContain("iter=1");
  });

  test("job env and step env are applied", async () => {
    const ws = workspace();
    const config: WorkflowConfig = {
      name: "env-override",
      workspace: ".agentflow",
      on: "run",
      jobs: {
        envjob: {
          env: { FOO: "from-job", BAR: "from-job" },
          steps: [
            {
              run: `echo "$FOO $BAR"`,
              output: "env.txt",
              env: { BAR: "from-step" },
            },
          ],
        },
      },
    };
    const plan = buildPlan(config);
    await execute(config, plan, { workspaceOverride: ws });

    const content = readFileSync(join(ws, "env.txt"), "utf-8").trim();
    expect(content).toBe("from-job from-step");
  });

  test("dry-run does not execute", async () => {
    const ws = workspace();
    const config: WorkflowConfig = {
      name: "dry",
      workspace: ".agentflow",
      on: "run",
      jobs: {
        a: { steps: [{ run: `echo should-not-run > ${ws}/nope.txt` }] },
      },
    };
    const plan = buildPlan(config);
    const result = await execute(config, plan, {
      workspaceOverride: ws,
      dryRun: true,
    });

    expect(result.success).toBe(true);
    expect(result.jobsExecuted).toBe(0);
    expect(existsSync(join(ws, "nope.txt"))).toBe(false);
  });

  test("step failure stops workflow", async () => {
    const config: WorkflowConfig = {
      name: "fail",
      workspace: ".agentflow",
      on: "run",
      jobs: {
        fail: {
          steps: [{ run: "exit 1" }],
        },
      },
    };
    const plan = buildPlan(config);
    const result = await execute(config, plan, {
      workspaceOverride: workspace(),
    });

    expect(result.success).toBe(false);
  });

  test("job if condition skips job", async () => {
    const ws = workspace();
    const config: WorkflowConfig = {
      name: "if-test",
      workspace: ".agentflow",
      on: "run",
      jobs: {
        always: {
          steps: [{ run: `echo ran > ${ws}/always.txt` }],
        },
        skipped: {
          needs: ["always"],
          if: "false",
          steps: [{ run: `echo ran > ${ws}/skipped.txt` }],
        },
      },
    };
    const plan = buildPlan(config);
    const result = await execute(config, plan, {
      workspaceOverride: ws,
    });

    expect(result.success).toBe(true);
    expect(existsSync(join(ws, "always.txt"))).toBe(true);
    expect(existsSync(join(ws, "skipped.txt"))).toBe(false);
  });

  test("maxOverride overrides loop.max", async () => {
    const ws = workspace();
    const config: WorkflowConfig = {
      name: "max-override",
      workspace: ".agentflow",
      on: { loop: { max: 100 } },
      jobs: {
        tick: { steps: [{ run: "echo tick" }] },
      },
    };
    const plan = buildPlan(config);
    const result = await execute(config, plan, {
      workspaceOverride: ws,
      maxOverride: 2,
    });

    expect(result.iterationsCompleted).toBe(2);
  });

  test("ITERATION increments each loop", async () => {
    const ws = workspace();
    const config: WorkflowConfig = {
      name: "iteration-test",
      workspace: ".agentflow",
      on: { loop: { max: 3 } },
      jobs: {
        record: {
          steps: [
            { run: `echo $ITERATION >> ${ws}/iterations.txt` },
          ],
        },
      },
    };
    const plan = buildPlan(config);
    await execute(config, plan, { workspaceOverride: ws });

    const lines = readFileSync(join(ws, "iterations.txt"), "utf-8")
      .trim()
      .split("\n");
    expect(lines).toEqual(["1", "2", "3"]);
  });
});
