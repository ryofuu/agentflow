import type { JobConfig } from "./parser.ts";

// --- Type Definitions ---

export interface WorkflowState {
  iteration: number;
  jobs: Record<string, JobState>;
  history: IterationResult[];
}

export interface JobState {
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  exitCode?: number;
  duration?: number;
  error?: string;
}

export interface IterationResult {
  iteration: number;
  duration: number;
  result: "continue" | "satisfied" | "max_reached";
}

// --- Functions ---

export function initState(jobs: Record<string, JobConfig>): WorkflowState {
  const jobStates: Record<string, JobState> = {};
  for (const id of Object.keys(jobs)) {
    jobStates[id] = { status: "pending" };
  }
  return {
    iteration: 0,
    jobs: jobStates,
    history: [],
  };
}

export function resetJobStates(state: WorkflowState): void {
  for (const id of Object.keys(state.jobs)) {
    state.jobs[id] = { status: "pending" };
  }
}

export function updateJobState(
  state: WorkflowState,
  jobId: string,
  update: Partial<JobState>,
): void {
  const current = state.jobs[jobId];
  if (current) {
    Object.assign(current, update);
  }
}
