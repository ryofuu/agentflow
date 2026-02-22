import { describe, expect, test } from "bun:test";
import { initState, resetJobStates, updateJobState } from "../src/state.ts";

describe("state", () => {
  test("initState creates pending states for all jobs", () => {
    const state = initState({
      a: { steps: [{ run: "echo a" }] },
      b: { steps: [{ run: "echo b" }] },
    });

    expect(state.iteration).toBe(0);
    expect(state.history).toEqual([]);
    expect(state.jobs.a).toEqual({ status: "pending" });
    expect(state.jobs.b).toEqual({ status: "pending" });
  });

  test("resetJobStates resets all jobs to pending", () => {
    const state = initState({
      a: { steps: [{ run: "echo" }] },
      b: { steps: [{ run: "echo" }] },
    });

    updateJobState(state, "a", { status: "completed", exitCode: 0, duration: 1.5 });
    updateJobState(state, "b", { status: "failed", exitCode: 1, error: "oops" });

    resetJobStates(state);

    expect(state.jobs.a).toEqual({ status: "pending" });
    expect(state.jobs.b).toEqual({ status: "pending" });
  });

  test("updateJobState merges partial update", () => {
    const state = initState({
      a: { steps: [{ run: "echo" }] },
    });

    updateJobState(state, "a", { status: "running" });
    expect(state.jobs.a.status).toBe("running");

    updateJobState(state, "a", { status: "completed", exitCode: 0, duration: 2.3 });
    expect(state.jobs.a).toEqual({
      status: "completed",
      exitCode: 0,
      duration: 2.3,
    });
  });

  test("updateJobState ignores unknown job", () => {
    const state = initState({
      a: { steps: [{ run: "echo" }] },
    });

    // Should not throw
    updateJobState(state, "nonexistent", { status: "running" });
    expect(state.jobs.nonexistent).toBeUndefined();
  });
});
