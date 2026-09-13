#!/usr/bin/env node
// 對 task registry 產生描述統計，或依可比較歷史建立事前成本範圍。
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const command = args[0];
const option = (name) => {
	const index = args.indexOf(`--${name}`);
	return index >= 0 ? args[index + 1] : undefined;
};
const listOption = (name) => String(option(name) ?? "")
	.split(",")
	.map((value) => value.trim())
	.filter(Boolean);

function fail(message) {
	console.error(message);
	process.exit(1);
}

function loadRegistry() {
	const path = option("registry") ?? join(".agentic-workflow", "registry", "task-registry.json");
	const registry = JSON.parse(readFileSync(resolve(path), "utf8"));
	if (!Array.isArray(registry.tasks) || !Array.isArray(registry.experiments)) {
		fail("registry 必須包含 tasks 與 experiments arrays。");
	}
	if (registry.schema_version !== 3) fail("registry schema_version 必須為 3；請先執行 npm run registry -- validate。");
	return registry;
}

function totalTokens(task) {
	if (Number.isInteger(task.actual?.total_tokens)) return task.actual.total_tokens;
	if (Number.isInteger(task.actual?.input_tokens) && Number.isInteger(task.actual?.output_tokens)) {
		return task.actual.input_tokens + task.actual.output_tokens;
	}
	return null;
}

function hardAnomalyCount(task) {
	return (task.anomalies ?? []).filter((anomaly) => anomaly.severity === "hard").length;
}

function eligible(task) {
	return task.result?.status === "completed"
		&& task.result?.acceptance_passed === true
		&& task.result?.scope_violation_count === 0
		&& hardAnomalyCount(task) === 0
		&& task.execution !== null
		&& totalTokens(task) !== null
		&& Number.isFinite(task.actual?.duration_ms);
}

function quantile(values, probability) {
	if (!values.length) return null;
	const sorted = [...values].sort((left, right) => left - right);
	const position = (sorted.length - 1) * probability;
	const lowerIndex = Math.floor(position);
	const upperIndex = Math.ceil(position);
	if (lowerIndex === upperIndex) return sorted[lowerIndex];
	const weight = position - lowerIndex;
	return sorted[lowerIndex] * (1 - weight) + sorted[upperIndex] * weight;
}

function median(values) {
	return quantile(values, 0.5);
}

function ratio(numerator, denominator) {
	return denominator ? numerator / denominator : null;
}

function round(value, digits = 4) {
	return value === null ? null : Number(value.toFixed(digits));
}

function rangeFor(values) {
	if (!values.length) return null;
	return {
		low: Math.floor(quantile(values, 0.1)),
		high: Math.ceil(quantile(values, 0.9)),
		median: round(median(values), 2)
	};
}

function calibration(tasks, actualValue, expectedRange) {
	const records = [];
	for (const task of tasks) {
		const actual = actualValue(task);
		const expected = expectedRange(task);
		if (!Number.isFinite(actual) || !Number.isFinite(expected?.low) || !Number.isFinite(expected?.high)) continue;
		const midpoint = (expected.low + expected.high) / 2;
		records.push({
			covered: expected.low <= actual && actual <= expected.high ? 1 : 0,
			midpointApe: Math.abs(actual - midpoint) / Math.max(actual, 1),
			relativeWidth: (expected.high - expected.low) / Math.max(midpoint, 1)
		});
	}
	return {
		n: records.length,
		coverage: round(ratio(records.reduce((sum, record) => sum + record.covered, 0), records.length)),
		median_midpoint_ape: round(median(records.map((record) => record.midpointApe))),
		median_relative_width: round(median(records.map((record) => record.relativeWidth)))
	};
}

function summarizeTasks(tasks) {
	const successful = tasks.filter((task) => task.result?.status === "completed" && task.result?.acceptance_passed === true);
	const scopeSafe = tasks.filter((task) => task.result?.scope_violation_count === 0);
	const hardAnomalyFree = tasks.filter((task) => hardAnomalyCount(task) === 0);
	const eligibleTasks = tasks.filter(eligible);
	return {
		tasks: tasks.length,
		eligible_tasks: eligibleTasks.length,
		success_rate: round(ratio(successful.length, tasks.length)),
		scope_safe_rate: round(ratio(scopeSafe.length, tasks.length)),
		hard_anomaly_free_rate: round(ratio(hardAnomalyFree.length, tasks.length)),
		eligible_total_tokens: rangeFor(eligibleTasks.map(totalTokens)),
		eligible_duration_ms: rangeFor(eligibleTasks.map((task) => task.actual.duration_ms)),
		calibration: {
			total_tokens: calibration(
				tasks,
				totalTokens,
				(task) => task.estimate?.expected_total_tokens
			),
			duration_ms: calibration(
				tasks,
				(task) => task.actual?.duration_ms,
				(task) => task.estimate?.expected_duration_ms
			)
		}
	};
}

function summarizeRegistry(registry) {
	const stages = [...new Set(registry.tasks.map((task) => task.cohort?.product_stage).filter(Boolean))].sort();
	const experiments = registry.experiments.map((experiment) => ({
		experiment_id: experiment.experiment_id,
		status: experiment.status,
		variants: experiment.variants.map((variant) => {
			const tasks = registry.tasks.filter((task) => task.experiment?.experiment_id === experiment.experiment_id
				&& task.experiment?.variant_id === variant.id);
			return { id: variant.id, ...summarizeTasks(tasks) };
		})
	}));
	return {
		schema_version: registry.schema_version,
		overall: summarizeTasks(registry.tasks),
		by_stage: Object.fromEntries(stages.map((stage) => [
			stage,
			summarizeTasks(registry.tasks.filter((task) => task.cohort.product_stage === stage))
		])),
		experiments
	};
}

function jaccardDistance(left, right) {
	const leftSet = new Set(left ?? []);
	const rightSet = new Set(right ?? []);
	const union = new Set([...leftSet, ...rightSet]);
	if (!union.size) return 0;
	let intersection = 0;
	for (const value of leftSet) if (rightSet.has(value)) intersection++;
	return 1 - intersection / union.size;
}

const complexityIndex = { xs: 0, s: 1, m: 2, l: 3, xl: 4 };
function distance(task, query) {
	const complexityDistance = Math.abs(
		complexityIndex[task.cohort.complexity_band] - complexityIndex[query.complexity_band]
	);
	return 2 * complexityDistance
		+ 2 * Number(task.execution.model !== query.model)
		+ Number(task.execution.provider !== query.provider)
		+ Number(task.execution.reasoning !== query.reasoning)
		+ Number((task.cohort.module ?? null) !== (query.module ?? null))
		+ jaccardDistance(task.execution.tools, query.tools)
		+ jaccardDistance(task.execution.permissions, query.permissions);
}

function estimateRegistry(registry, query) {
	const comparable = registry.tasks
		.filter(eligible)
		.filter((task) => task.cohort.product_stage === query.product_stage)
		.filter((task) => task.cohort.task_type === query.task_type)
		.map((task) => ({ task, distance: distance(task, query) }))
		.sort((left, right) => left.distance - right.distance || left.task.task_id.localeCompare(right.task.task_id))
		.slice(0, 20);
	const ready = comparable.length >= 5;
	return {
		basis: ready ? "historical" : "cold-start",
		ready,
		method: "same-stage-task-type; weighted-distance; nearest-20; linear Q10/Q50/Q90",
		comparable_history_count: comparable.length,
		reference_task_ids: comparable.map(({ task }) => task.task_id),
		expected_total_tokens: ready ? rangeFor(comparable.map(({ task }) => totalTokens(task))) : null,
		expected_duration_ms: ready ? rangeFor(comparable.map(({ task }) => task.actual.duration_ms)) : null,
		warning: ready ? null : "少於 5 筆 eligible history；planner 必須提供 cold-start 範圍與假設。"
	};
}

function queryFromArguments() {
	const query = {
		product_stage: option("stage"),
		task_type: option("task-type"),
		complexity_band: option("complexity"),
		module: option("module") ?? null,
		provider: option("provider"),
		model: option("model"),
		reasoning: option("reasoning"),
		tools: listOption("tools"),
		permissions: listOption("permissions")
	};
	for (const key of ["product_stage", "task_type", "complexity_band", "provider", "model", "reasoning"]) {
		if (!query[key]) fail(`estimate 缺少 ${key} 參數。`);
	}
	if (!(query.complexity_band in complexityIndex)) fail("--complexity 必須是 xs、s、m、l 或 xl。");
	return query;
}

function selfTest() {
	const makeTask = (index, token, duration) => ({
		task_id: `T-${index}`,
		cohort: { product_stage: "PLAN", task_type: "module-plan", complexity_band: "m", module: "game" },
		execution: { provider: "test", model: "model", reasoning: "high", tools: [], permissions: ["read"] },
		estimate: { expected_total_tokens: { low: 90, high: 210 }, expected_duration_ms: { low: 900, high: 2100 } },
		actual: { total_tokens: token, duration_ms: duration },
		result: { status: "completed", acceptance_passed: true, scope_violation_count: 0 },
		anomalies: [],
		experiment: null
	});
	const registry = { schema_version: 3, tasks: [
		makeTask(1, 100, 1000),
		makeTask(2, 120, 1200),
		makeTask(3, 140, 1400),
		makeTask(4, 160, 1600),
		makeTask(5, 200, 2000)
	], experiments: [] };
	const estimate = estimateRegistry(registry, {
		product_stage: "PLAN",
		task_type: "module-plan",
		complexity_band: "m",
		module: "game",
		provider: "test",
		model: "model",
		reasoning: "high",
		tools: [],
		permissions: ["read"]
	});
	const summary = summarizeRegistry(registry);
	if (!estimate.ready || estimate.reference_task_ids.length !== 5) fail("self-test: historical estimate failed");
	if (summary.overall.eligible_tasks !== 5 || summary.overall.calibration.total_tokens.coverage !== 1) {
		fail("self-test: registry summary failed");
	}
	console.log("task registry analyzer self-test passed");
}

if (command === "summary") console.log(JSON.stringify(summarizeRegistry(loadRegistry()), null, 2));
else if (command === "estimate") console.log(JSON.stringify(estimateRegistry(loadRegistry(), queryFromArguments()), null, 2));
else if (command === "self-test") selfTest();
else fail("用法：analyze-task-registry.mjs <summary|estimate|self-test> [options]");
