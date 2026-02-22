import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
	printDryRun,
	printError,
	printHeader,
	printIterationHeader,
	printJobSkipped,
	printParallelHeader,
	printStateChange,
	printSummary,
	printUntilResult,
} from "./formatter.ts";
import type { WorkflowConfig } from "./parser.ts";
import { executeStep, type StepContext, StepError } from "./runner.ts";
import type { ExecutionPlan } from "./scheduler.ts";
import {
	initState,
	resetJobStates,
	updateJobState,
	type WorkflowState,
} from "./state.ts";

// --- Type Definitions ---

export interface ExecuteOptions {
	dryRun?: boolean;
	workspaceOverride?: string;
	maxOverride?: number;
	verbose?: boolean;
}

export interface ExecuteResult {
	success: boolean;
	jobsExecuted: number;
	iterationsCompleted: number;
	earlyExit: boolean;
	duration: number;
}

// --- Main Execute ---

export async function execute(
	config: WorkflowConfig,
	plan: ExecutionPlan,
	options?: ExecuteOptions,
): Promise<ExecuteResult> {
	const workspace = resolve(options?.workspaceOverride ?? config.workspace);
	const isLoop = typeof config.on !== "string";
	const max = isLoop
		? (options?.maxOverride ??
			(config.on as { loop: { max: number } }).loop.max)
		: 1;
	const until = isLoop
		? (config.on as { loop: { until?: string } }).loop.until
		: undefined;

	// --dry-run
	if (options?.dryRun) {
		printDryRun(plan, config);
		return {
			success: true,
			jobsExecuted: 0,
			iterationsCompleted: 0,
			earlyExit: false,
			duration: 0,
		};
	}

	mkdirSync(workspace, { recursive: true });
	printHeader(config.name, workspace);

	const state = initState(config.jobs);
	let jobsExecuted = 0;
	let earlyExit = false;
	let failed = false;
	const startTime = Date.now();

	for (let iteration = 1; iteration <= max; iteration++) {
		if (isLoop) {
			printIterationHeader(iteration, max);
		}

		resetJobStates(state);
		state.iteration = iteration;
		const iterStartTime = Date.now();

		for (const level of plan.levels) {
			if (failed) break;

			const isParallel = level.jobs.length > 1;
			if (isParallel) {
				printParallelHeader(level.jobs);
			}

			const results = await runLevel(
				level.jobs,
				config,
				workspace,
				iteration,
				state,
				isParallel,
				options?.verbose ?? false,
			);
			jobsExecuted += results.executed;
			if (results.failed) {
				failed = true;
				break;
			}
		}

		if (failed) break;

		const iterDuration = Date.now() - iterStartTime;
		state.history.push({
			iteration,
			duration: iterDuration,
			result: "continue",
		});

		// until check (loop only)
		if (until) {
			const satisfied = await checkUntil(until, workspace, iteration);
			printUntilResult(satisfied);
			if (satisfied) {
				const lastEntry = state.history[state.history.length - 1];
				if (lastEntry) lastEntry.result = "satisfied";
				earlyExit = true;
				break;
			}
		}

		if (!isLoop) break;

		// Check max reached
		if (iteration === max && isLoop) {
			const lastEntry = state.history[state.history.length - 1];
			if (lastEntry) lastEntry.result = "max_reached";
		}
	}

	const totalDuration = Date.now() - startTime;
	printSummary(state.history.length, jobsExecuted, totalDuration);

	return {
		success: !failed,
		jobsExecuted,
		iterationsCompleted: state.history.length,
		earlyExit,
		duration: totalDuration,
	};
}

// --- Level Execution ---

async function runLevel(
	jobIds: string[],
	config: WorkflowConfig,
	workspace: string,
	iteration: number,
	state: WorkflowState,
	isParallel: boolean,
	verbose: boolean,
): Promise<{ executed: number; failed: boolean }> {
	let executed = 0;
	let hasFailed = false;

	const promises = jobIds.map(async (jobId) => {
		const job = config.jobs[jobId];
		if (!job) return;

		// if condition check
		if (job.if) {
			const shouldRun = await checkCondition(job.if, workspace, iteration);
			if (!shouldRun) {
				updateJobState(state, jobId, { status: "skipped" });
				if (verbose) {
					printStateChange(jobId, "pending", "skipped");
				}
				printJobSkipped(jobId);
				return;
			}
		}

		updateJobState(state, jobId, { status: "running" });
		if (verbose) {
			printStateChange(jobId, "pending", "running");
		}

		const startTime = Date.now();

		try {
			// Run all steps sequentially
			for (const [i, step] of job.steps.entries()) {
				const stepName = step.name ?? `step-${i}`;

				if (isParallel) {
					// For parallel, step start is shown via prefix
				} else {
					// Sequential: step start already printed by runner
				}

				const context: StepContext = {
					workspace,
					jobName: jobId,
					stepName,
					iteration,
					jobEnv: job.env,
					parallel: isParallel,
				};

				await executeStep(step, context);
			}

			const duration = (Date.now() - startTime) / 1000;
			updateJobState(state, jobId, {
				status: "completed",
				exitCode: 0,
				duration,
			});

			if (verbose) {
				printStateChange(jobId, "running", "completed", duration);
			}

			executed++;
		} catch (err) {
			const duration = (Date.now() - startTime) / 1000;

			if (err instanceof StepError) {
				updateJobState(state, jobId, {
					status: "failed",
					exitCode: err.exitCode,
					duration,
					error: err.message,
				});
				printError(jobId, err.stepName, err.exitCode);
				if (verbose) {
					printStateChange(jobId, "running", "failed", duration);
				}
			} else {
				updateJobState(state, jobId, {
					status: "failed",
					duration,
					error: String(err),
				});
			}

			hasFailed = true;
		}
	});

	// Wait for all parallel jobs to complete (even if one fails)
	await Promise.allSettled(promises);

	return { executed, failed: hasFailed };
}

// --- Condition Checks ---

async function checkCondition(
	command: string,
	workspace: string,
	iteration: number,
): Promise<boolean> {
	const proc = Bun.spawn(["sh", "-c", command], {
		env: {
			...Object.fromEntries(
				Object.entries(process.env).filter(
					(entry): entry is [string, string] => entry[1] !== undefined,
				),
			),
			WORKSPACE: workspace,
			ITERATION: String(iteration),
		},
		stdout: "ignore",
		stderr: "ignore",
	});
	const exitCode = await proc.exited;
	return exitCode === 0;
}

async function checkUntil(
	command: string,
	workspace: string,
	iteration: number,
): Promise<boolean> {
	return checkCondition(command, workspace, iteration);
}
