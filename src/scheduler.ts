import type { WorkflowConfig } from "./parser.ts";

// --- Type Definitions ---

export interface ExecutionPlan {
  levels: ExecutionLevel[];
}

export interface ExecutionLevel {
  jobs: string[];
}

// --- Plan Builder ---

export function buildPlan(config: WorkflowConfig): ExecutionPlan {
  const jobIds = Object.keys(config.jobs);

  // 1. Build adjacency list (job -> dependents)
  const graph = new Map<string, string[]>();
  for (const id of jobIds) {
    graph.set(id, []);
  }
  for (const [id, job] of Object.entries(config.jobs)) {
    if (job.needs) {
      for (const dep of job.needs) {
        graph.get(dep)!.push(id);
      }
    }
  }

  // 2. Detect cycles
  if (hasCycle(jobIds, graph, config)) {
    throw new Error("Circular dependency detected");
  }

  // 3. Topological sort with level grouping
  const levels = topoLevels(jobIds, config, graph);
  return { levels };
}

// --- Cycle Detection (DFS) ---

function hasCycle(
  jobIds: string[],
  _graph: Map<string, string[]>,
  config: WorkflowConfig,
): boolean {
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(node: string): boolean {
    if (inStack.has(node)) return true;
    if (visited.has(node)) return false;

    visited.add(node);
    inStack.add(node);

    // Follow dependencies (needs) for cycle detection
    const job = config.jobs[node];
    if (job?.needs) {
      for (const dep of job.needs) {
        if (dfs(dep)) return true;
      }
    }

    inStack.delete(node);
    return false;
  }

  for (const id of jobIds) {
    if (dfs(id)) return true;
  }
  return false;
}

// --- Topological Sort + Level Grouping (Kahn's Algorithm) ---

function topoLevels(
  jobIds: string[],
  config: WorkflowConfig,
  _graph: Map<string, string[]>,
): ExecutionLevel[] {
  // Compute in-degree from needs
  const inDegree = new Map<string, number>();
  for (const id of jobIds) {
    inDegree.set(id, 0);
  }
  for (const [id, job] of Object.entries(config.jobs)) {
    if (job.needs) {
      inDegree.set(id, job.needs.length);
    }
  }

  // Build forward graph (dependency -> dependents)
  const forward = new Map<string, string[]>();
  for (const id of jobIds) {
    forward.set(id, []);
  }
  for (const [id, job] of Object.entries(config.jobs)) {
    if (job.needs) {
      for (const dep of job.needs) {
        forward.get(dep)!.push(id);
      }
    }
  }

  const remaining = new Set(jobIds);
  const levels: ExecutionLevel[] = [];

  while (remaining.size > 0) {
    const ready: string[] = [];
    for (const id of remaining) {
      if (inDegree.get(id) === 0) {
        ready.push(id);
      }
    }

    if (ready.length === 0) {
      throw new Error("Circular dependency in subgraph");
    }

    levels.push({ jobs: ready });

    for (const id of ready) {
      remaining.delete(id);
      for (const dependent of forward.get(id) ?? []) {
        if (remaining.has(dependent)) {
          inDegree.set(dependent, (inDegree.get(dependent) ?? 1) - 1);
        }
      }
    }
  }

  return levels;
}
