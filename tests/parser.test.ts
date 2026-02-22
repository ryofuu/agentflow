import { describe, expect, test } from "bun:test";
import { loadConfig } from "../src/parser.ts";
import { join } from "node:path";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";

const tmpDir = join(import.meta.dir, ".tmp-parser");

function writeYaml(name: string, content: string): string {
  mkdirSync(tmpDir, { recursive: true });
  const path = join(tmpDir, name);
  writeFileSync(path, content);
  return path;
}

function cleanup() {
  rmSync(tmpDir, { recursive: true, force: true });
}

describe("parser", () => {
  test("parses minimal on: run workflow", async () => {
    const path = writeYaml(
      "minimal.yaml",
      `
name: test
on: run
jobs:
  hello:
    steps:
      - run: echo hello
`,
    );
    try {
      const config = await loadConfig(path);
      expect(config.name).toBe("test");
      expect(config.on).toBe("run");
      expect(config.workspace).toBe(".agentflow");
      expect(Object.keys(config.jobs)).toEqual(["hello"]);
      expect(config.jobs.hello.steps).toHaveLength(1);
      expect(config.jobs.hello.steps[0].run).toBe("echo hello");
    } finally {
      cleanup();
    }
  });

  test("parses on: loop workflow", async () => {
    const path = writeYaml(
      "loop.yaml",
      `
name: loop-test
workspace: .workspace
on:
  loop:
    max: 5
    until: test -f done.txt
jobs:
  step1:
    steps:
      - run: echo iteration
`,
    );
    try {
      const config = await loadConfig(path);
      expect(config.on).toEqual({ loop: { max: 5, until: "test -f done.txt" } });
      expect(config.workspace).toBe(".workspace");
    } finally {
      cleanup();
    }
  });

  test("parses jobs with needs, if, env, output", async () => {
    const path = writeYaml(
      "full.yaml",
      `
name: full
on: run
jobs:
  lint:
    env:
      NODE_ENV: test
    steps:
      - name: lint-step
        run: npm run lint
        timeout: 60
  build:
    needs: [lint]
    if: "[ -f package.json ]"
    steps:
      - run: npm run build
        output: build-log.txt
        env:
          BUILD: production
        working-directory: ./app
`,
    );
    try {
      const config = await loadConfig(path);
      expect(config.jobs.lint.env).toEqual({ NODE_ENV: "test" });
      expect(config.jobs.lint.steps[0].name).toBe("lint-step");
      expect(config.jobs.lint.steps[0].timeout).toBe(60);
      expect(config.jobs.build.needs).toEqual(["lint"]);
      expect(config.jobs.build.if).toBe('[ -f package.json ]');
      expect(config.jobs.build.steps[0].output).toBe("build-log.txt");
      expect(config.jobs.build.steps[0]["working-directory"]).toBe("./app");
    } finally {
      cleanup();
    }
  });

  test("rejects missing on", async () => {
    const path = writeYaml(
      "no-on.yaml",
      `
name: bad
jobs:
  a:
    steps:
      - run: echo
`,
    );
    try {
      await expect(loadConfig(path)).rejects.toThrow("'on' is required");
    } finally {
      cleanup();
    }
  });

  test("rejects invalid on value", async () => {
    const path = writeYaml(
      "bad-on.yaml",
      `
name: bad
on: trigger
jobs:
  a:
    steps:
      - run: echo
`,
    );
    try {
      await expect(loadConfig(path)).rejects.toThrow("'on' must be 'run' or");
    } finally {
      cleanup();
    }
  });

  test("rejects loop.max < 1", async () => {
    const path = writeYaml(
      "bad-max.yaml",
      `
name: bad
on:
  loop:
    max: 0
jobs:
  a:
    steps:
      - run: echo
`,
    );
    try {
      await expect(loadConfig(path)).rejects.toThrow("loop.max must be >= 1");
    } finally {
      cleanup();
    }
  });

  test("rejects no jobs", async () => {
    const path = writeYaml(
      "no-jobs.yaml",
      `
name: bad
on: run
jobs: {}
`,
    );
    try {
      await expect(loadConfig(path)).rejects.toThrow("No jobs defined");
    } finally {
      cleanup();
    }
  });

  test("rejects empty steps", async () => {
    const path = writeYaml(
      "no-steps.yaml",
      `
name: bad
on: run
jobs:
  a:
    steps: []
`,
    );
    try {
      await expect(loadConfig(path)).rejects.toThrow("Job a: no steps defined");
    } finally {
      cleanup();
    }
  });

  test("rejects unknown dependency", async () => {
    const path = writeYaml(
      "bad-dep.yaml",
      `
name: bad
on: run
jobs:
  a:
    needs: [nonexistent]
    steps:
      - run: echo
`,
    );
    try {
      await expect(loadConfig(path)).rejects.toThrow(
        "Job a: unknown dependency 'nonexistent'",
      );
    } finally {
      cleanup();
    }
  });

  test("rejects step without run", async () => {
    const path = writeYaml(
      "no-run.yaml",
      `
name: bad
on: run
jobs:
  a:
    steps:
      - name: oops
`,
    );
    try {
      await expect(loadConfig(path)).rejects.toThrow(
        "Job a, step 0: run is required",
      );
    } finally {
      cleanup();
    }
  });
});
