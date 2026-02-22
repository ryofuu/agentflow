import type { WorkflowConfig } from "./parser.ts";
import type { ExecutionPlan } from "./scheduler.ts";

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

export function printHeader(name: string, workspace: string): void {
	console.log(`\n${BOLD}━━━ AgentFlow: ${name} ━━━${RESET}`);
	console.log(`Workspace: ${workspace}\n`);
}

export function printIterationHeader(iteration: number, max: number): void {
	console.log(
		`${BOLD}── iteration ${iteration}/${max} ──────────────────${RESET}`,
	);
}

export function printJobStart(jobId: string, displayName?: string): void {
	const label =
		displayName && displayName !== jobId ? `${jobId} (${displayName})` : jobId;
	// Printed at step level, not job level for cleaner output
	void label;
}

export function printJobEnd(jobId: string, duration: number): void {
	void jobId;
	void duration;
}

export function printJobSkipped(jobId: string): void {
	console.log(`${DIM}  ⊘ ${jobId} (skipped)${RESET}`);
}

export function printStepStart(jobId: string, stepName: string): void {
	console.log(`${GREEN}▶${RESET} ${BOLD}${jobId}${RESET} > ${stepName}`);
}

export function printStepEnd(
	jobId: string,
	stepName: string,
	duration: number,
): void {
	console.log(`  ${DIM}(${duration.toFixed(1)}s)${RESET}\n`);
	void jobId;
	void stepName;
}

export function printUntilResult(satisfied: boolean): void {
	if (satisfied) {
		console.log(`${GREEN}✓${RESET} until: satisfied → exit\n`);
	} else {
		console.log(`${YELLOW}✓${RESET} until: not satisfied → next iteration\n`);
	}
}

export function printSummary(
	iterations: number,
	jobs: number,
	duration: number,
): void {
	const durationStr = formatDuration(duration);
	console.log(
		`${BOLD}━━━ Done: ${iterations} iteration${iterations !== 1 ? "s" : ""}, ${jobs} job${jobs !== 1 ? "s" : ""}, ${durationStr} ━━━${RESET}\n`,
	);
}

export function printDryRun(plan: ExecutionPlan, config: WorkflowConfig): void {
	console.log(`\n${BOLD}━━━ AgentFlow: ${config.name} (dry-run) ━━━${RESET}\n`);

	// On config
	if (config.on === "run") {
		console.log("On: run\n");
	} else {
		const until = config.on.loop.until
			? `, until: ${config.on.loop.until}`
			: "";
		console.log(`On: loop (max: ${config.on.loop.max}${until})\n`);
	}

	// Execution plan
	console.log("Execution Plan:");
	for (let i = 0; i < plan.levels.length; i++) {
		const level = plan.levels[i]!;
		console.log(`  Level ${i + 1}: ${level.jobs.join(", ")}`);
	}
	console.log();

	// Jobs detail
	console.log("Jobs:");
	for (const [id, job] of Object.entries(config.jobs)) {
		const stepCount = job.steps.length;
		const info: string[] = [];
		info.push(`${stepCount} step${stepCount !== 1 ? "s" : ""}`);

		const outputs = job.steps.filter((s) => s.output).map((s) => s.output);
		if (outputs.length > 0) {
			info.push(`output: ${outputs.join(", ")}`);
		}

		const needs = job.needs ? ` [needs: ${job.needs.join(", ")}]` : "";
		console.log(`  ${id.padEnd(16)}→ ${info.join(", ")}${needs}`);
	}
	console.log();
}

export function printStateChange(
	jobId: string,
	from: string,
	to: string,
	duration?: number,
): void {
	const durationStr =
		duration !== undefined ? ` (${duration.toFixed(1)}s)` : "";
	console.log(`${DIM}[state] ${jobId}: ${from} → ${to}${durationStr}${RESET}`);
}

export function printError(
	jobId: string,
	stepName: string,
	exitCode: number,
): void {
	console.log(
		`${RED}✗${RESET} ${BOLD}${jobId}${RESET} > ${stepName} ${RED}failed${RESET} (exit code ${exitCode})`,
	);
}

export function printParallelHeader(jobIds: string[]): void {
	console.log(`${BOLD}── ${jobIds.join(", ")} ──── (parallel)${RESET}`);
}

export function prefixOutput(jobId: string, chunk: Uint8Array): Uint8Array {
	const text = new TextDecoder().decode(chunk);
	const lines = text.split("\n");
	const prefix = `${CYAN}[${jobId}]${RESET} `;
	const maxIdLen = jobId.length;
	const pad = " ".repeat(maxIdLen + 3); // [id] + space
	void pad;

	const prefixed = lines
		.map((line, i) => {
			if (i === lines.length - 1 && line === "") return "";
			return `${prefix}${line}`;
		})
		.join("\n");

	return new TextEncoder().encode(prefixed);
}

function formatDuration(ms: number): string {
	const seconds = ms / 1000;
	if (seconds < 60) return `${seconds.toFixed(1)}s`;
	const minutes = Math.floor(seconds / 60);
	const remaining = seconds % 60;
	return `${minutes}m ${remaining.toFixed(0)}s`;
}
