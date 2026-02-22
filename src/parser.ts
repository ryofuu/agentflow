import { parse } from "yaml";

// --- Type Definitions ---

export interface WorkflowConfig {
	name: string;
	workspace: string;
	on: OnConfig;
	jobs: Record<string, JobConfig>;
}

export type OnConfig = "run" | { loop: LoopConfig };

export interface LoopConfig {
	max: number;
	until?: string;
}

export interface JobConfig {
	name?: string;
	needs?: string[];
	if?: string;
	env?: Record<string, string>;
	steps: StepConfig[];
}

export interface StepConfig {
	name?: string;
	run: string;
	output?: string;
	env?: Record<string, string>;
	timeout?: number;
	"working-directory"?: string;
}

// --- Loader ---

export async function loadConfig(path: string): Promise<WorkflowConfig> {
	const text = await Bun.file(path).text();
	const raw = parse(text);

	// Apply defaults
	const config: WorkflowConfig = {
		name: raw.name ?? "workflow",
		workspace: raw.workspace ?? ".agentflow",
		on: raw.on,
		jobs: raw.jobs ?? {},
	};

	validate(config);
	return config;
}

// --- Validation ---

function validate(config: WorkflowConfig): void {
	if (config.on === undefined || config.on === null) {
		throw new Error("'on' is required");
	}

	if (config.on !== "run") {
		if (
			typeof config.on !== "object" ||
			!("loop" in config.on) ||
			typeof config.on.loop !== "object"
		) {
			throw new Error("'on' must be 'run' or { loop: { max, until? } }");
		}
		const loop = config.on.loop;
		if (typeof loop.max !== "number" || loop.max < 1) {
			throw new Error("loop.max must be >= 1");
		}
	}

	const jobIds = Object.keys(config.jobs);
	if (jobIds.length === 0) {
		throw new Error("No jobs defined");
	}

	for (const [id, job] of Object.entries(config.jobs)) {
		if (!job.steps || job.steps.length === 0) {
			throw new Error(`Job ${id}: no steps defined`);
		}

		if (job.needs) {
			for (const dep of job.needs) {
				if (!config.jobs[dep]) {
					throw new Error(`Job ${id}: unknown dependency '${dep}'`);
				}
			}
		}

		for (let i = 0; i < job.steps.length; i++) {
			const step = job.steps[i]!;
			if (!step.run) {
				throw new Error(`Job ${id}, step ${i}: run is required`);
			}
		}
	}
}
