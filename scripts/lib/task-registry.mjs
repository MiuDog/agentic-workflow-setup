import {
	closeSync,
	existsSync,
	fsyncSync,
	mkdirSync,
	openSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, relative, resolve } from "node:path";

export const REGISTRY_SCHEMA_VERSION = 3;
export const RECORD_SCHEMA_VERSION = 1;

const RECORD_STATUSES = new Set(["pending", "finalized"]);
const TASK_STATUSES = new Set(["completed", "failed", "blocked", "protocol-deviation"]);
const PRODUCT_STAGES = new Set(["DEFINE", "PLAN", "BUILD", "VERIFY", "OTHER"]);
const COMPLEXITY_BANDS = new Set(["xs", "s", "m", "l", "xl"]);
const TOKEN_MEASUREMENTS = new Set(["provider", "estimated", "unavailable"]);
const MILESTONE_STATUSES = new Set(["completed", "blocked", "skipped"]);
const DEVIATIONS = new Set(["under", "within-range", "over", "unknown"]);
const ANOMALY_SEVERITIES = new Set(["hard", "soft"]);
const EXPERIMENT_STATUSES = new Set(["draft", "active", "stopped", "concluded"]);
const EXPERIMENT_METRICS = new Set([
	"total_tokens",
	"duration_ms",
	"success_rate",
	"scope_violation_count",
	"rework_count",
	"hard_anomaly_rate"
]);
const VARIANTS = ["baseline", "treatment"];

export function defaultRegistryDirectory(projectRoot = process.cwd()) {
	return resolve(projectRoot, ".agentic-workflow", "registry");
}

export function initializeRegistry(registryDirectory) {
	const paths = registryPaths(registryDirectory);

	// 建立本機 registry 的固定目錄，不覆寫既有紀錄。
	mkdirSync(paths.tasks, { recursive: true });
	mkdirSync(paths.candidates, { recursive: true });
	mkdirSync(paths.experiments, { recursive: true });
	if (!existsSync(paths.view)) writeJsonExclusive(paths.view, emptyRegistry());
	return paths;
}

export function ingestSummary(options) {
	const projectRoot = resolve(options.projectRoot ?? process.cwd());
	const registryDirectory = resolve(options.registryDirectory ?? defaultRegistryDirectory(projectRoot));
	const summaryPath = resolve(options.summaryPath);
	const cohortPath = resolve(options.cohortPath);
	const summaryText = readFile(summaryPath);
	const summary = parseJson(summaryText, summaryPath);
	const cohortPacket = readJson(cohortPath);
	const paths = initializeRegistry(registryDirectory);
	const sourceDigest = sha256(summaryText);
	const records = candidateRecords(summary, cohortPacket, {
		projectRoot,
		summaryPath,
		sourceDigest
	});
	const validation = validateCandidateRecords(records, { projectRoot });
	if (validation.errors.length) throw new Error(formatValidationErrors(validation.errors));

	return withRegistryLock(paths, () => {
		const outcomes = [];
		for (const record of records) outcomes.push(storeCandidate(paths, record));
		return outcomes;
	});
}

export function finalizeTask(options) {
	const projectRoot = resolve(options.projectRoot ?? process.cwd());
	const registryDirectory = resolve(options.registryDirectory ?? defaultRegistryDirectory(projectRoot));
	const evaluationPath = resolve(options.evaluationPath);
	const evaluation = readJson(evaluationPath);
	const paths = initializeRegistry(registryDirectory);
	validateEvaluationPacket(evaluation);

	return withRegistryLock(paths, () => {
		const candidatePath = recordPath(paths.candidates, evaluation.task_id);
		const finalizedPath = recordPath(paths.tasks, evaluation.task_id);
		if (existsSync(finalizedPath)) throw new Error(`task 已 finalized，不可覆寫：${evaluation.task_id}`);
		if (!existsSync(candidatePath)) throw new Error(`找不到 pending candidate：${evaluation.task_id}`);

		const candidate = readJson(candidatePath);
		if (candidate.record_status !== "pending") throw new Error(`candidate 狀態不是 pending：${evaluation.task_id}`);
		if (candidate.task.result.status !== "completed" && evaluation.result.status === "completed") {
			throw new Error(`runner 未完成的 task 不得由 evaluator 升級為 completed：${evaluation.task_id}`);
		}
		const finalized = {
			...candidate,
			record_status: "finalized",
			task: {
				...candidate.task,
				result: evaluation.result,
				anomalies: [...candidate.task.anomalies, ...evaluation.anomalies]
			}
		};
		const records = [...readRecordDirectory(paths.tasks), finalized];
		const experiments = readExperimentDirectory(paths.experiments);
		const validation = validateRecords(records, experiments, { projectRoot });
		if (validation.errors.length) throw new Error(formatValidationErrors(validation.errors));

		// 先建立不可變 finalized record，再移除已消費的 candidate。
		writeJsonExclusive(finalizedPath, finalized);
		rmSync(candidatePath);
		writeRegistryView(paths.view, records, experiments);
		return finalized;
	});
}

export function validateRegistry(options = {}) {
	const projectRoot = resolve(options.projectRoot ?? process.cwd());
	const registryDirectory = resolve(options.registryDirectory ?? defaultRegistryDirectory(projectRoot));
	const paths = initializeRegistry(registryDirectory);

	return withRegistryLock(paths, () => {
		const finalized = readRecordDirectory(paths.tasks);
		const candidates = readRecordDirectory(paths.candidates);
		const experiments = readExperimentDirectory(paths.experiments);
		const finalizedValidation = validateRecords(finalized, experiments, { projectRoot });
		const candidateValidation = validateCandidateRecords(candidates, { projectRoot });
		const errors = [...finalizedValidation.errors, ...candidateValidation.errors];
		const warnings = [...finalizedValidation.warnings, ...candidateValidation.warnings];
		if (!errors.length) writeRegistryView(paths.view, finalized, experiments);
		return {
			errors,
			warnings,
			finalized_tasks: finalized.length,
			pending_candidates: candidates.length,
			experiments: experiments.length,
			view_path: paths.view
		};
	});
}

export function emptyRegistry() {
	return { schema_version: REGISTRY_SCHEMA_VERSION, tasks: [], experiments: [] };
}

function registryPaths(registryDirectory) {
	const root = resolve(registryDirectory);
	return {
		root,
		tasks: resolve(root, "tasks"),
		candidates: resolve(root, "candidates"),
		experiments: resolve(root, "experiments"),
		view: resolve(root, "task-registry.json"),
		lock: resolve(root, "registry.lock")
	};
}

function withRegistryLock(paths, action) {
	let descriptor;
	try {
		// 以 exclusive create 防止兩個 recorder 同時更新相同 task 或聚合 view。
		descriptor = openSync(paths.lock, "wx");
		writeFileSync(descriptor, `${JSON.stringify({ pid: process.pid, created_at: new Date().toISOString() })}\n`);
		fsyncSync(descriptor);
		return action();
	}
	catch (error) {
		if (error?.code === "EEXIST") {
			throw new Error(`registry 正被另一程序使用；確認程序結束後再移除 ${paths.lock}`);
		}
		throw error;
	}
	finally {
		if (descriptor !== undefined) closeSync(descriptor);
		if (descriptor !== undefined && existsSync(paths.lock)) rmSync(paths.lock);
	}
}

function candidateRecords(summary, cohortPacket, source) {
	if (summary.protocol_version !== 2 || !Array.isArray(summary.pairs)) {
		throw new Error("runner summary 必須是 protocol_version 2 並包含 pairs");
	}
	if (cohortPacket.schema_version !== 1 || !cohortPacket.defaults?.cohort) {
		throw new Error("cohort packet 必須是 schema_version 1 並包含 defaults.cohort");
	}

	const records = [];
	for (const pair of summary.pairs) {
		for (const variant of VARIANTS) {
			const runnerRecord = pair[variant];
			if (!runnerRecord?.task_id) throw new Error(`${pair.case_id}/${variant} 缺少 task_id`);
			const assignment = resolveAssignment(cohortPacket, runnerRecord.task_id);
			records.push(buildCandidate(summary, pair, variant, runnerRecord, assignment, source));
		}
	}
	return records;
}

function resolveAssignment(packet, taskId) {
	const defaults = packet.defaults;
	const override = packet.tasks?.[taskId] ?? {};
	return {
		cohort: { ...defaults.cohort, ...(override.cohort ?? {}) },
		experiment: override.experiment === undefined ? defaults.experiment ?? null : override.experiment
	};
}

function buildCandidate(summary, pair, variant, runnerRecord, assignment, source) {
	const summaryDirectory = dirname(source.summaryPath);
	const evidencePaths = [source.summaryPath];
	for (const key of ["request_path", "response_path"]) {
		if (runnerRecord[key]) evidencePaths.push(resolve(summaryDirectory, runnerRecord[key]));
	}
	const resultDirectory = runnerRecord.request_path
		? dirname(resolve(summaryDirectory, runnerRecord.request_path))
		: summaryDirectory;
	for (const artifact of runnerRecord.artifacts ?? []) {
		evidencePaths.push(resolve(resultDirectory, artifact.saved_path ?? artifact.path ?? artifact));
	}
	const uniqueEvidencePaths = [...new Set(evidencePaths)];

	const metrics = runnerRecord.metrics ?? {};
	const machineAnomalies = [];
	if (runnerRecord.status !== "completed" || runnerRecord.error) {
		machineAnomalies.push({
			severity: "hard",
			type: "runner-execution-failure",
			detected_at_milestone: null,
			evidence: runnerRecord.error ?? "runner record status was not completed",
			process_action: "修正 adapter 或 runner protocol 後，以新的 task id 重跑。"
		});
	}

	return {
		schema_version: RECORD_SCHEMA_VERSION,
		record_status: "pending",
		source: {
			summary_path: portablePath(source.summaryPath, source.projectRoot),
			summary_sha256: source.sourceDigest,
			evidence: uniqueEvidencePaths.map((path) => ({
				path: portablePath(path, source.projectRoot),
				sha256: existsSync(path) ? sha256(readFile(path)) : null
			})),
			case_id: pair.case_id,
			variant,
			iteration: pair.iteration
		},
		task: {
			task_id: runnerRecord.task_id,
			recorded_at: summary.created_at,
			started_at: runnerRecord.started_at ?? summary.created_at,
			completed_at: runnerRecord.completed_at ?? summary.created_at,
			cohort: assignment.cohort,
			execution: runnerRecord.execution ?? null,
			estimate: runnerRecord.budget?.estimate ?? null,
			actual: {
				input_tokens: metrics.input_tokens ?? null,
				output_tokens: metrics.output_tokens ?? null,
				total_tokens: metrics.total_tokens ?? null,
				token_measurement: metrics.token_measurement ?? "unavailable",
				token_estimation_method: metrics.token_estimation_method ?? null,
				duration_ms: runnerRecord.duration_ms ?? runnerRecord.process_duration_ms ?? 0
			},
			result: {
				status: runnerRecord.status === "completed" ? "completed" : "failed",
				acceptance_passed: null,
				scope_violation_count: integerOrZero(metrics.out_of_scope_changes),
				rework_count: 0
			},
			milestones: normalizeMilestones(runnerRecord.milestones),
			anomalies: machineAnomalies,
			experiment: assignment.experiment,
			evidence_paths: uniqueEvidencePaths.map((path) => portablePath(path, source.projectRoot))
		}
	};
}

function normalizeMilestones(milestones = []) {
	return milestones.map((milestone) => ({
		id: milestone.id,
		status: milestone.status,
		evidence: milestone.evidence,
		changed_paths: milestone.changed_paths,
		expected_cumulative_tokens: milestone.expected_cumulative_tokens ?? null,
		expected_cumulative_duration_ms: milestone.expected_cumulative_duration_ms ?? null,
		actual_cumulative_tokens: milestone.actual_cumulative_tokens ?? null,
		elapsed_ms: milestone.elapsed_ms ?? 0,
		deviation: DEVIATIONS.has(milestone.deviation) ? milestone.deviation : "unknown"
	}));
}

function storeCandidate(paths, record) {
	const candidatePath = recordPath(paths.candidates, record.task.task_id);
	const finalizedPath = recordPath(paths.tasks, record.task.task_id);
	for (const existingPath of [finalizedPath, candidatePath]) {
		if (!existsSync(existingPath)) continue;
		const existing = readJson(existingPath);
		if (existing.source?.summary_sha256 === record.source.summary_sha256) {
			return { task_id: record.task.task_id, status: "unchanged", path: existingPath };
		}
		throw new Error(`task_id 與不同來源衝突，拒絕覆寫：${record.task.task_id}`);
	}

	writeJsonExclusive(candidatePath, record);
	return { task_id: record.task.task_id, status: "created", path: candidatePath };
}

function validateCandidateRecords(records, context) {
	const errors = [];
	const warnings = [];
	for (const record of records) {
		validateEnvelope(record, errors, { finalized: false });
		validateSource(record, errors, context.projectRoot);
	}
	return { errors, warnings };
}

function validateRecords(records, experiments, context) {
	const errors = [];
	const warnings = [];
	const taskById = new Map();
	const experimentById = new Map();

	for (const experiment of experiments) validateExperiment(experiment, errors, experimentById);
	for (const record of records) {
		validateEnvelope(record, errors, { finalized: true });
		validateSource(record, errors, context.projectRoot);
		const taskId = record.task?.task_id;
		if (taskById.has(taskId)) errors.push(`${taskId}: task_id 重複`);
		else taskById.set(taskId, record.task);
	}
	for (const record of records) validateTaskReferences(record.task, taskById, experimentById, errors);
	for (const experiment of experiments) validateExperimentReferences(experiment, taskById, errors);
	return { errors, warnings };
}

function validateEnvelope(record, errors, options) {
	const taskId = record?.task?.task_id ?? "<missing-task-id>";
	if (record?.schema_version !== RECORD_SCHEMA_VERSION) errors.push(`${taskId}: record schema_version 必須為 ${RECORD_SCHEMA_VERSION}`);
	if (!RECORD_STATUSES.has(record?.record_status)) errors.push(`${taskId}: record_status 無效`);
	if (options.finalized && record?.record_status !== "finalized") errors.push(`${taskId}: tasks 目錄只能包含 finalized record`);
	if (!options.finalized && record?.record_status !== "pending") errors.push(`${taskId}: candidates 目錄只能包含 pending record`);
	validateTask(record?.task, errors, options);
}

function validateTask(task, errors, options) {
	const id = task?.task_id ?? "<missing-task-id>";
	if (!isNonEmptyString(task?.task_id)) errors.push(`${id}: task_id 必須是非空字串`);
	for (const key of ["recorded_at", "started_at", "completed_at"]) {
		if (!validDateTime(task?.[key])) errors.push(`${id}: ${key} 必須是 ISO date-time`);
	}
	if (validDateTime(task?.started_at) && validDateTime(task?.completed_at)
		&& Date.parse(task.started_at) > Date.parse(task.completed_at)) {
		errors.push(`${id}: started_at 不得晚於 completed_at`);
	}
	validateCohort(task?.cohort, id, errors);
	validateExecution(task?.execution, id, errors);
	validateEstimate(task?.estimate, id, errors);
	validateActual(task?.actual, id, errors);
	validateResult(task?.result, id, errors, options.finalized);
	if (!Array.isArray(task?.milestones)) errors.push(`${id}: milestones 必須是陣列`);
	else validateMilestones(task, errors);
	if (!Array.isArray(task?.anomalies)) errors.push(`${id}: anomalies 必須是陣列`);
	else for (const anomaly of task.anomalies) validateAnomaly(anomaly, id, errors);
	validateExperimentAssignment(task?.experiment, id, errors);
	if (!Array.isArray(task?.evidence_paths) || task.evidence_paths.some((path) => !isNonEmptyString(path))) {
		errors.push(`${id}: evidence_paths 必須是非空字串陣列`);
	}
	if (options.finalized && task?.cohort?.product_stage === "BUILD" && task?.result?.status === "completed"
		&& task.milestones.length === 0) {
		errors.push(`${id}: completed BUILD task 至少需要一個 milestone`);
	}
}

function validateCohort(cohort, id, errors) {
	if (!cohort || typeof cohort !== "object") {
		errors.push(`${id}: cohort 必須是 object`);
		return;
	}
	if (!isNonEmptyString(cohort.task_type)) errors.push(`${id}: cohort.task_type 必須是非空字串`);
	if (!PRODUCT_STAGES.has(cohort.product_stage)) errors.push(`${id}: cohort.product_stage 無效`);
	if (!COMPLEXITY_BANDS.has(cohort.complexity_band)) errors.push(`${id}: cohort.complexity_band 無效`);
	if (cohort.module !== null && typeof cohort.module !== "string") errors.push(`${id}: cohort.module 必須是字串或 null`);
}

function validateExecution(execution, id, errors) {
	if (execution === null) return;
	if (!execution || typeof execution !== "object") {
		errors.push(`${id}: execution 必須是 object 或 null`);
		return;
	}
	for (const key of ["provider", "model", "reasoning"]) {
		if (!isNonEmptyString(execution[key])) errors.push(`${id}: execution.${key} 必須是非空字串`);
	}
	for (const key of ["tools", "permissions"]) {
		if (!isStringArray(execution[key])) errors.push(`${id}: execution.${key} 必須是字串陣列`);
	}
}

function validateEstimate(estimate, id, errors) {
	if (estimate === null) return;
	if (!estimate || typeof estimate !== "object") {
		errors.push(`${id}: estimate 必須是 object 或 null`);
		return;
	}
	if (!["historical", "cold-start"].includes(estimate.basis)) errors.push(`${id}: estimate.basis 無效`);
	if (!isStringArray(estimate.reference_task_ids)) errors.push(`${id}: estimate.reference_task_ids 必須是字串陣列`);
	if (estimate.basis === "historical" && estimate.reference_task_ids?.length === 0) {
		errors.push(`${id}: historical estimate 必須引用歷史 task`);
	}
	if (!isStringArray(estimate.assumptions) || estimate.assumptions.length === 0) {
		errors.push(`${id}: estimate.assumptions 至少需要一項`);
	}
	validateRange(estimate.expected_total_tokens, `${id}: estimate.expected_total_tokens`, errors);
	validateRange(estimate.expected_duration_ms, `${id}: estimate.expected_duration_ms`, errors);
}

function validateActual(actual, id, errors) {
	if (!actual || typeof actual !== "object") {
		errors.push(`${id}: actual 必須是 object`);
		return;
	}
	for (const key of ["input_tokens", "output_tokens", "total_tokens"]) {
		if (!isNullableNonNegativeInteger(actual[key])) errors.push(`${id}: actual.${key} 必須是非負整數或 null`);
	}
	if (!TOKEN_MEASUREMENTS.has(actual.token_measurement)) errors.push(`${id}: actual.token_measurement 無效`);
	if (actual.token_estimation_method !== null && typeof actual.token_estimation_method !== "string") {
		errors.push(`${id}: actual.token_estimation_method 必須是字串或 null`);
	}
	if (!isNonNegativeInteger(actual.duration_ms)) errors.push(`${id}: actual.duration_ms 必須是非負整數`);
	if (actual.input_tokens !== null && actual.output_tokens !== null && actual.total_tokens !== null
		&& actual.input_tokens + actual.output_tokens !== actual.total_tokens) {
		errors.push(`${id}: actual.total_tokens 不等於 input_tokens + output_tokens`);
	}
	if (actual.token_measurement !== "unavailable" && totalTokens(actual) === null) {
		errors.push(`${id}: 可用 token measurement 必須提供 total，或 input 與 output`);
	}
	if (actual.token_measurement === "estimated" && !isNonEmptyString(actual.token_estimation_method)) {
		errors.push(`${id}: estimated token 必須說明 estimation method`);
	}
}

function validateResult(result, id, errors, finalized) {
	if (!result || typeof result !== "object") {
		errors.push(`${id}: result 必須是 object`);
		return;
	}
	if (!TASK_STATUSES.has(result.status)) errors.push(`${id}: result.status 無效`);
	if (finalized && typeof result.acceptance_passed !== "boolean") errors.push(`${id}: finalized acceptance_passed 必須是 boolean`);
	if (!finalized && result.acceptance_passed !== null) errors.push(`${id}: pending acceptance_passed 必須是 null`);
	for (const key of ["scope_violation_count", "rework_count"]) {
		if (!isNonNegativeInteger(result[key])) errors.push(`${id}: result.${key} 必須是非負整數`);
	}
}

function validateMilestones(task, errors) {
	let previousTokens = -1;
	let previousElapsed = -1;
	for (const [index, milestone] of task.milestones.entries()) {
		const label = `${task.task_id}: milestones[${index}]`;
		if (!isNonEmptyString(milestone?.id)) errors.push(`${label}.id 必須是非空字串`);
		if (!MILESTONE_STATUSES.has(milestone?.status)) errors.push(`${label}.status 無效`);
		if (!isStringArray(milestone?.evidence)) errors.push(`${label}.evidence 必須是字串陣列`);
		if (!isStringArray(milestone?.changed_paths)) errors.push(`${label}.changed_paths 必須是字串陣列`);
		for (const key of ["expected_cumulative_tokens", "expected_cumulative_duration_ms"]) {
			if (milestone?.[key] !== null) validateRange(milestone?.[key], `${label}.${key}`, errors);
		}
		if (!isNullableNonNegativeInteger(milestone?.actual_cumulative_tokens)) {
			errors.push(`${label}.actual_cumulative_tokens 必須是非負整數或 null`);
		}
		if (!isNonNegativeInteger(milestone?.elapsed_ms)) errors.push(`${label}.elapsed_ms 必須是非負整數`);
		if (!DEVIATIONS.has(milestone?.deviation)) errors.push(`${label}.deviation 無效`);
		if (milestone?.actual_cumulative_tokens !== null && milestone.actual_cumulative_tokens < previousTokens) {
			errors.push(`${label}.actual_cumulative_tokens 不得遞減`);
		}
		if (milestone?.elapsed_ms < previousElapsed) errors.push(`${label}.elapsed_ms 不得遞減`);
		if (milestone?.actual_cumulative_tokens !== null) previousTokens = milestone.actual_cumulative_tokens;
		previousElapsed = milestone?.elapsed_ms ?? previousElapsed;
	}
}

function validateAnomaly(anomaly, id, errors) {
	if (!anomaly || typeof anomaly !== "object") {
		errors.push(`${id}: anomaly 必須是 object`);
		return;
	}
	if (!ANOMALY_SEVERITIES.has(anomaly.severity)) errors.push(`${id}: anomaly.severity 無效`);
	if (!isNonEmptyString(anomaly.type)) errors.push(`${id}: anomaly.type 必須是非空字串`);
	if (anomaly.detected_at_milestone !== null && typeof anomaly.detected_at_milestone !== "string") {
		errors.push(`${id}: anomaly.detected_at_milestone 必須是字串或 null`);
	}
	if (!isNonEmptyString(anomaly.evidence)) errors.push(`${id}: anomaly.evidence 必須是非空字串`);
	if (!isNonEmptyString(anomaly.process_action)) errors.push(`${id}: anomaly.process_action 必須是非空字串`);
}

function validateExperimentAssignment(assignment, id, errors) {
	if (assignment === null) return;
	if (!assignment || typeof assignment !== "object") {
		errors.push(`${id}: experiment 必須是 object 或 null`);
		return;
	}
	if (!isNonEmptyString(assignment.experiment_id)) errors.push(`${id}: experiment.experiment_id 必須是非空字串`);
	if (!isNonEmptyString(assignment.variant_id)) errors.push(`${id}: experiment.variant_id 必須是非空字串`);
}

function validateSource(record, errors, projectRoot) {
	const id = record?.task?.task_id ?? "<missing-task-id>";
	const source = record?.source;
	if (!source || typeof source !== "object") {
		errors.push(`${id}: source 必須是 object`);
		return;
	}
	if (!isNonEmptyString(source.summary_path)) errors.push(`${id}: source.summary_path 必須是非空字串`);
	if (!/^[a-f0-9]{64}$/.test(source.summary_sha256 ?? "")) errors.push(`${id}: source.summary_sha256 格式無效`);
	if (!Array.isArray(source.evidence) || source.evidence.length === 0) errors.push(`${id}: source.evidence 至少需要一項`);
	if (!isNonEmptyString(source.case_id)) errors.push(`${id}: source.case_id 必須是非空字串`);
	if (!VARIANTS.includes(source.variant)) errors.push(`${id}: source.variant 無效`);
	if (!Number.isInteger(source.iteration) || source.iteration < 1) errors.push(`${id}: source.iteration 必須是正整數`);

	const summaryPath = resolveStoredPath(source.summary_path, projectRoot);
	if (!existsSync(summaryPath)) {
		errors.push(`${id}: summary evidence 不存在 → ${source.summary_path}`);
		return;
	}
	if (sha256(readFile(summaryPath)) !== source.summary_sha256) errors.push(`${id}: summary evidence SHA-256 不符`);
	for (const evidence of source.evidence ?? []) {
		if (!isNonEmptyString(evidence?.path) || !/^[a-f0-9]{64}$/.test(evidence?.sha256 ?? "")) {
			errors.push(`${id}: source evidence path 或 SHA-256 格式無效`);
			continue;
		}
		const evidencePath = resolveStoredPath(evidence.path, projectRoot);
		if (!existsSync(evidencePath)) {
			errors.push(`${id}: evidence 不存在 → ${evidence.path}`);
			continue;
		}
		if (sha256(readFile(evidencePath)) !== evidence.sha256) errors.push(`${id}: evidence SHA-256 不符 → ${evidence.path}`);
	}
}

function validateTaskReferences(task, taskById, experimentById, errors) {
	if (!task) return;
	for (const referenceId of task.estimate?.reference_task_ids ?? []) {
		const reference = taskById.get(referenceId);
		if (!reference) {
			errors.push(`${task.task_id}: estimate 引用不存在的 task → ${referenceId}`);
			continue;
		}
		if (Date.parse(reference.completed_at) >= Date.parse(task.started_at)) {
			errors.push(`${task.task_id}: estimate 引用非事前歷史 task → ${referenceId}`);
		}
		if (!eligible(reference)) errors.push(`${task.task_id}: estimate 引用非 eligible task → ${referenceId}`);
	}
	if (!task.experiment) return;
	const experiment = experimentById.get(task.experiment.experiment_id);
	if (!experiment) {
		errors.push(`${task.task_id}: experiment 不存在 → ${task.experiment.experiment_id}`);
		return;
	}
	if (!experiment.variants.some((variant) => variant.id === task.experiment.variant_id)) {
		errors.push(`${task.task_id}: experiment variant 不存在 → ${task.experiment.variant_id}`);
	}
}

function validateExperiment(experiment, errors, experimentById) {
	const id = experiment?.experiment_id ?? "<missing-experiment-id>";
	if (!isNonEmptyString(experiment?.experiment_id)) errors.push(`${id}: experiment_id 必須是非空字串`);
	if (experimentById.has(id)) errors.push(`${id}: experiment_id 重複`);
	else experimentById.set(id, experiment);
	if (!EXPERIMENT_STATUSES.has(experiment?.status)) errors.push(`${id}: status 無效`);
	if (!isNonEmptyString(experiment?.hypothesis) || experiment.hypothesis.length < 10) errors.push(`${id}: hypothesis 過短`);
	if (!isNonEmptyString(experiment?.single_process_factor) || experiment.single_process_factor.length < 5) {
		errors.push(`${id}: single_process_factor 過短`);
	}
	for (const key of ["cohort_rules", "variables_held_constant"]) {
		if (!isStringArray(experiment?.[key]) || experiment[key].length === 0) errors.push(`${id}: ${key} 至少需要一項`);
	}
	if (!Array.isArray(experiment?.variants) || experiment.variants.length < 2) {
		errors.push(`${id}: 至少需要兩個 experiment variants`);
		return;
	}
	const variantIds = experiment.variants.map((variant) => variant.id);
	if (variantIds.some((variantId) => !isNonEmptyString(variantId))) errors.push(`${id}: variant id 必須是非空字串`);
	if (experiment.variants.some((variant) => !isNonEmptyString(variant.description) || variant.description.length < 5)) {
		errors.push(`${id}: variant description 過短`);
	}
	if (new Set(variantIds).size !== variantIds.length) errors.push(`${id}: variant id 不得重複`);
	if (!EXPERIMENT_METRICS.has(experiment.primary_metric)) errors.push(`${id}: primary_metric 無效`);
	for (const key of ["secondary_metrics", "safety_metrics"]) {
		if (!Array.isArray(experiment[key]) || experiment[key].some((metric) => !EXPERIMENT_METRICS.has(metric))) {
			errors.push(`${id}: ${key} 包含無效 metric`);
		}
		else if (new Set(experiment[key]).size !== experiment[key].length) errors.push(`${id}: ${key} 不得重複`);
	}
	if (!experiment.safety_metrics?.length) errors.push(`${id}: safety_metrics 至少需要一項`);
	if (experiment.assignment_method !== "stratified-random") errors.push(`${id}: assignment_method 必須是 stratified-random`);
	for (const key of ["alpha", "power"]) {
		if (!(experiment[key] > 0 && experiment[key] < 1)) errors.push(`${id}: ${key} 必須介於 0 與 1 之間`);
	}
	if (!(typeof experiment.minimum_practical_effect === "number" && experiment.minimum_practical_effect >= 0)) {
		errors.push(`${id}: minimum_practical_effect 必須是非負數`);
	}
	if (!Number.isInteger(experiment.minimum_tasks_per_variant) || experiment.minimum_tasks_per_variant < 2) {
		errors.push(`${id}: minimum_tasks_per_variant 至少為 2`);
	}
	validateSampleSizeBasis(experiment.sample_size_basis, id, errors);
	if (experiment.analysis_method !== "fixed-horizon-stratified-bootstrap") errors.push(`${id}: analysis_method 無效`);
	if (!Number.isInteger(experiment.bootstrap_iterations) || experiment.bootstrap_iterations < 1000) {
		errors.push(`${id}: bootstrap_iterations 至少為 1000`);
	}
	if (!isNonNegativeInteger(experiment.random_seed)) errors.push(`${id}: random_seed 必須是非負整數`);
	if (!isNonEmptyString(experiment.stopping_rule) || experiment.stopping_rule.length < 10) errors.push(`${id}: stopping_rule 過短`);
	if (["draft", "active"].includes(experiment.status) && experiment.conclusion !== null) {
		errors.push(`${id}: draft/active experiment 不得有 conclusion`);
	}
	if (experiment.status === "concluded") validateConclusion(experiment.conclusion, id, errors);
}

function validateSampleSizeBasis(basis, id, errors) {
	if (!basis || typeof basis !== "object") {
		errors.push(`${id}: sample_size_basis 必須是 object`);
		return;
	}
	if (!["continuous", "binary"].includes(basis.metric_family)) errors.push(`${id}: sample_size_basis.metric_family 無效`);
	if (!isStringArray(basis.historical_task_ids) || basis.historical_task_ids.length === 0) {
		errors.push(`${id}: sample_size_basis.historical_task_ids 至少需要一項`);
	}
	if (basis.metric_family === "continuous") {
		if (!(basis.sigma > 0) || basis.baseline_rate !== null) {
			errors.push(`${id}: continuous sample basis 需要正數 sigma 且 baseline_rate 為 null`);
		}
	}
	if (basis.metric_family === "binary") {
		if (!(basis.baseline_rate >= 0 && basis.baseline_rate <= 1) || basis.sigma !== null) {
			errors.push(`${id}: binary sample basis 需要 0–1 baseline_rate 且 sigma 為 null`);
		}
	}
	if (!isNonEmptyString(basis.calculation) || basis.calculation.length < 10) errors.push(`${id}: sample size calculation 過短`);
}

function validateConclusion(conclusion, id, errors) {
	if (!conclusion || typeof conclusion !== "object") {
		errors.push(`${id}: concluded experiment 必須有 conclusion`);
		return;
	}
	if (!["retain-control", "adopt-treatment", "inconclusive", "stop-for-safety"].includes(conclusion.decision)) {
		errors.push(`${id}: conclusion.decision 無效`);
	}
	const effect = conclusion.effect;
	for (const key of ["estimate", "ci_low", "ci_high"]) {
		if (!Number.isFinite(effect?.[key])) errors.push(`${id}: conclusion.effect.${key} 必須是數字`);
	}
	if (!(effect?.confidence_level > 0 && effect.confidence_level < 1)) errors.push(`${id}: conclusion confidence_level 無效`);
	if (!isStringArray(conclusion.evidence_task_ids) || conclusion.evidence_task_ids.length < 2) {
		errors.push(`${id}: conclusion 至少需要兩個 evidence tasks`);
	}
	if (!isStringArray(conclusion.limitations)) errors.push(`${id}: conclusion.limitations 必須是字串陣列`);
}

function validateExperimentReferences(experiment, taskById, errors) {
	if (!experiment || typeof experiment !== "object") return;
	for (const taskId of experiment.sample_size_basis?.historical_task_ids ?? []) {
		const task = taskById.get(taskId);
		if (!task) errors.push(`${experiment.experiment_id}: sample size history 不存在 → ${taskId}`);
		else if (!eligible(task)) errors.push(`${experiment.experiment_id}: sample size history 非 eligible → ${taskId}`);
	}
	for (const taskId of experiment.conclusion?.evidence_task_ids ?? []) {
		const task = taskById.get(taskId);
		if (!task) {
			errors.push(`${experiment.experiment_id}: conclusion evidence 不存在 → ${taskId}`);
			continue;
		}
		if (task.experiment?.experiment_id !== experiment.experiment_id) {
			errors.push(`${experiment.experiment_id}: conclusion evidence 未分派至此 experiment → ${taskId}`);
		}
	}
}

function validateEvaluationPacket(evaluation) {
	const errors = [];
	if (evaluation?.schema_version !== 1) errors.push("evaluation schema_version 必須為 1");
	if (!isNonEmptyString(evaluation?.task_id)) errors.push("evaluation.task_id 必須是非空字串");
	validateResult(evaluation?.result, evaluation?.task_id ?? "<missing-task-id>", errors, true);
	if (!Array.isArray(evaluation?.anomalies)) errors.push("evaluation.anomalies 必須是陣列");
	else for (const anomaly of evaluation.anomalies) validateAnomaly(anomaly, evaluation.task_id, errors);
	if (errors.length) throw new Error(formatValidationErrors(errors));
}

function eligible(task) {
	return task?.result?.status === "completed"
		&& task.result.acceptance_passed === true
		&& task.result.scope_violation_count === 0
		&& task.execution !== null
		&& task.anomalies.every((anomaly) => anomaly.severity !== "hard")
		&& totalTokens(task.actual) !== null
		&& isNonNegativeInteger(task.actual.duration_ms);
}

function writeRegistryView(path, records, experiments) {
	const registry = {
		schema_version: REGISTRY_SCHEMA_VERSION,
		tasks: records.map((record) => record.task).sort((left, right) => left.task_id.localeCompare(right.task_id)),
		experiments: [...experiments].sort((left, right) => left.experiment_id.localeCompare(right.experiment_id))
	};
	writeJson(path, registry);
}

function readRecordDirectory(directory) {
	return readdirSync(directory)
		.filter((name) => name.endsWith(".json"))
		.sort()
		.map((name) => readJson(resolve(directory, name)));
}

function readExperimentDirectory(directory) {
	return readdirSync(directory)
		.filter((name) => name.endsWith(".json"))
		.sort()
		.map((name) => readJson(resolve(directory, name)));
}

function recordPath(directory, taskId) {
	return resolve(directory, `${encodeURIComponent(taskId)}.json`);
}

function portablePath(path, projectRoot) {
	const relativePath = relative(projectRoot, path);
	if (!relativePath.startsWith("..") && !isAbsolute(relativePath)) return relativePath.replaceAll("\\", "/");
	return resolve(path).replaceAll("\\", "/");
}

function resolveStoredPath(path, projectRoot) {
	return isAbsolute(path) ? path : resolve(projectRoot, path);
}

function readJson(path) {
	return parseJson(readFile(path), path);
}

function readFile(path) {
	// 讀取 registry 輸入與 evidence，呼叫端會保留路徑以供錯誤定位。
	return readFileSync(path, "utf8");
}

function parseJson(text, path) {
	try {
		return JSON.parse(text);
	}
	catch (error) {
		throw new Error(`JSON 解析失敗 ${path}：${error.message}`);
	}
}

function writeJson(path, value) {
	// 將完整 JSON 一次寫入，避免部分物件殘留在 generated view。
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeJsonExclusive(path, value) {
	// 使用 wx 確保既有 candidate 或 finalized record 永不被靜默覆寫。
	mkdirSync(dirname(path), { recursive: true });
	const descriptor = openSync(path, "wx");
	try {
		writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`);
		fsyncSync(descriptor);
	}
	finally {
		closeSync(descriptor);
	}
}

function sha256(value) {
	return createHash("sha256").update(value).digest("hex");
}

function totalTokens(actual) {
	if (isNonNegativeInteger(actual?.total_tokens)) return actual.total_tokens;
	if (isNonNegativeInteger(actual?.input_tokens) && isNonNegativeInteger(actual?.output_tokens)) {
		return actual.input_tokens + actual.output_tokens;
	}
	return null;
}

function integerOrZero(value) {
	return isNonNegativeInteger(value) ? value : 0;
}

function validateRange(range, label, errors) {
	if (!range || !isNonNegativeInteger(range.low) || !isNonNegativeInteger(range.high)) {
		errors.push(`${label} 必須包含非負整數 low/high`);
		return;
	}
	if (range.low > range.high) errors.push(`${label}.low 不得大於 high`);
}

function isStringArray(value) {
	return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isNonEmptyString(value) {
	return typeof value === "string" && value.length > 0;
}

function isNonNegativeInteger(value) {
	return Number.isInteger(value) && value >= 0;
}

function isNullableNonNegativeInteger(value) {
	return value === null || isNonNegativeInteger(value);
}

function validDateTime(value) {
	return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function formatValidationErrors(errors) {
	return `registry 驗證失敗：\n- ${errors.join("\n- ")}`;
}
