import { describe, expect, test } from "bun:test";
import type { WorkflowConfig } from "../src/parser.ts";
import { buildPlan } from "../src/scheduler.ts";

function makeConfig(
  jobs: WorkflowConfig["jobs"],
): WorkflowConfig {
  return {
    name: "test",
    workspace: ".agentflow",
    on: "run",
    jobs,
  };
}

describe("scheduler", () => {
  test("single job produces single level", () => {
    const plan = buildPlan(
      makeConfig({
        a: { steps: [{ run: "echo a" }] },
      }),
    );
    expect(plan.levels).toEqual([{ jobs: ["a"] }]);
  });

  test("independent jobs are grouped in one level", () => {
    const plan = buildPlan(
      makeConfig({
        a: { steps: [{ run: "echo a" }] },
        b: { steps: [{ run: "echo b" }] },
        c: { steps: [{ run: "echo c" }] },
      }),
    );
    expect(plan.levels).toHaveLength(1);
    expect(plan.levels[0].jobs.sort()).toEqual(["a", "b", "c"]);
  });

  test("linear dependency creates sequential levels", () => {
    const plan = buildPlan(
      makeConfig({
        a: { steps: [{ run: "echo a" }] },
        b: { needs: ["a"], steps: [{ run: "echo b" }] },
        c: { needs: ["b"], steps: [{ run: "echo c" }] },
      }),
    );
    expect(plan.levels).toEqual([
      { jobs: ["a"] },
      { jobs: ["b"] },
      { jobs: ["c"] },
    ]);
  });

  test("diamond dependency: a -> {b, c} -> d", () => {
    const plan = buildPlan(
      makeConfig({
        a: { steps: [{ run: "echo a" }] },
        b: { needs: ["a"], steps: [{ run: "echo b" }] },
        c: { needs: ["a"], steps: [{ run: "echo c" }] },
        d: { needs: ["b", "c"], steps: [{ run: "echo d" }] },
      }),
    );
    expect(plan.levels).toHaveLength(3);
    expect(plan.levels[0].jobs).toEqual(["a"]);
    expect(plan.levels[1].jobs.sort()).toEqual(["b", "c"]);
    expect(plan.levels[2].jobs).toEqual(["d"]);
  });

  test("mixed independent and dependent jobs", () => {
    const plan = buildPlan(
      makeConfig({
        lint: { steps: [{ run: "npm run lint" }] },
        test: { steps: [{ run: "npm test" }] },
        typecheck: { steps: [{ run: "tsc --noEmit" }] },
        build: {
          needs: ["lint", "test", "typecheck"],
          steps: [{ run: "npm run build" }],
        },
      }),
    );
    expect(plan.levels).toHaveLength(2);
    expect(plan.levels[0].jobs.sort()).toEqual([
      "lint",
      "test",
      "typecheck",
    ]);
    expect(plan.levels[1].jobs).toEqual(["build"]);
  });

  test("detects circular dependency", () => {
    expect(() =>
      buildPlan(
        makeConfig({
          a: { needs: ["b"], steps: [{ run: "echo" }] },
          b: { needs: ["a"], steps: [{ run: "echo" }] },
        }),
      ),
    ).toThrow("Circular dependency");
  });

  test("detects circular dependency in larger graph", () => {
    expect(() =>
      buildPlan(
        makeConfig({
          a: { steps: [{ run: "echo" }] },
          b: { needs: ["a"], steps: [{ run: "echo" }] },
          c: { needs: ["b"], steps: [{ run: "echo" }] },
          d: { needs: ["c"], steps: [{ run: "echo" }] },
          e: { needs: ["d"], steps: [{ run: "echo" }] },
          // create cycle: a depends on e
        }),
      ),
    ).not.toThrow(); // No cycle here

    expect(() =>
      buildPlan(
        makeConfig({
          a: { needs: ["c"], steps: [{ run: "echo" }] },
          b: { needs: ["a"], steps: [{ run: "echo" }] },
          c: { needs: ["b"], steps: [{ run: "echo" }] },
        }),
      ),
    ).toThrow("Circular dependency");
  });
});
