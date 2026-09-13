#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const [adapterPath, requestPath, responsePath] = process.argv.slice(2);
if (!adapterPath || !requestPath || !responsePath) {
	console.error("用法：node eval-adapter-worker.mjs <adapter> <request.json> <response.json>");
	process.exit(1);
}

function validateRange(range, name) {
	if (!range || typeof range !== "object") throw new Error(`${name} 必須是範圍物件`);
	for (const key of ["low", "high"]) {
		if (!Number.isFinite(range[key]) || range[key] < 0) throw new Error(`${name}.${key} 必須是非負數`);
	}
	if (range.low > range.high) throw new Error(`${name}.low 不得大於 high`);
}

function validateEstimate(estimate) {
	if (!estimate || typeof estimate !== "object") throw new Error("adapter.estimate 必須回傳預估資料");
	if (!["historical", "cold-start"].includes(estimate.basis)) {
		throw new Error("estimate.basis 必須是 historical 或 cold-start");
	}
	if (!Array.isArray(estimate.reference_task_ids) || estimate.reference_task_ids.some((value) => typeof value !== "string")) {
		throw new Error("estimate.reference_task_ids 必須是字串陣列");
	}
	if (estimate.basis === "historical" && estimate.reference_task_ids.length === 0) {
		throw new Error("historical estimate 必須至少引用一個過往 task id");
	}
	if (!Array.isArray(estimate.assumptions) || estimate.assumptions.some((value) => typeof value !== "string")) {
		throw new Error("estimate.assumptions 必須是字串陣列");
	}
	validateRange(estimate.expected_total_tokens, "estimate.expected_total_tokens");
	validateRange(estimate.expected_duration_ms, "estimate.expected_duration_ms");
}

function validateMilestones(milestones) {
	if (!Array.isArray(milestones)) throw new Error("adapter 必須回報 milestones 陣列；非實作任務可為空陣列");
	for (const [index, milestone] of milestones.entries()) {
		const name = `milestones[${index}]`;
		if (!milestone || typeof milestone !== "object") throw new Error(`${name} 必須是物件`);
		if (typeof milestone.id !== "string" || !milestone.id) throw new Error(`${name}.id 必須是非空字串`);
		if (!["completed", "blocked", "skipped"].includes(milestone.status)) {
			throw new Error(`${name}.status 必須是 completed、blocked 或 skipped`);
		}
		for (const key of ["evidence", "changed_paths"]) {
			if (!Array.isArray(milestone[key]) || milestone[key].some((value) => typeof value !== "string")) {
				throw new Error(`${name}.${key} 必須是字串陣列`);
			}
		}
		for (const key of ["actual_cumulative_tokens", "elapsed_ms"]) {
			const value = milestone[key];
			if (value !== null && (!Number.isFinite(value) || value < 0)) throw new Error(`${name}.${key} 必須是非負數或 null`);
		}
		if (typeof milestone.deviation !== "string") throw new Error(`${name}.deviation 必須是字串`);
	}
}

try {
	// 載入單次評估 adapter；每個 variant 都由獨立 process 執行，避免共享 context。
	const adapterUrl = pathToFileURL(adapterPath);
	const adapter = await import(`${adapterUrl.href}?run=${Date.now()}`);
	if (typeof adapter.estimate !== "function") throw new Error("adapter 必須 export async function estimate(request)");
	if (typeof adapter.run !== "function") throw new Error("adapter 必須 export async function run(request, estimate)");

	// 讀取不含 rubric 或預期答案的執行請求。
	const request = JSON.parse(readFileSync(requestPath, "utf8"));
	const estimateStartedAt = Date.now();
	const estimate = await adapter.estimate(request);
	const estimateDurationMs = Date.now() - estimateStartedAt;
	validateEstimate(estimate);

	const taskStartedAt = Date.now();
	const response = await adapter.run(request, estimate);
	const taskDurationMs = Date.now() - taskStartedAt;
	if (!response || typeof response !== "object" || typeof response.response !== "string") {
		throw new Error("adapter 回傳值必須包含字串 response");
	}
	if (response.selected_skill !== null && response.selected_skill !== undefined && typeof response.selected_skill !== "string") {
		throw new Error("selected_skill 必須是字串或 null");
	}
	if (response.artifacts !== undefined && !Array.isArray(response.artifacts)) {
		throw new Error("artifacts 必須是相對於 request.workspace 的路徑陣列");
	}
	if (!response.execution || typeof response.execution !== "object") {
		throw new Error("adapter 必須回報 execution：provider、model、reasoning、tools、permissions");
	}
	for (const key of ["provider", "model", "reasoning"]) {
		if (typeof response.execution[key] !== "string") throw new Error(`execution.${key} 必須是字串`);
	}
	for (const key of ["tools", "permissions"]) {
		if (!Array.isArray(response.execution[key])) throw new Error(`execution.${key} 必須是陣列`);
		if (response.execution[key].some((value) => typeof value !== "string")) throw new Error(`execution.${key} 只能包含字串`);
	}
	if (!response.metrics || typeof response.metrics !== "object") {
		throw new Error("adapter 必須回報 metrics");
	}
	for (const key of ["turns", "tool_calls", "user_questions", "files_changed", "out_of_scope_changes", "input_tokens", "output_tokens", "total_tokens"]) {
		const value = response.metrics[key];
		if (value !== null && (!Number.isFinite(value) || value < 0)) throw new Error(`metrics.${key} 必須是非負數或 null`);
	}
	if (!["provider", "estimated", "unavailable"].includes(response.metrics.token_measurement)) {
		throw new Error("metrics.token_measurement 必須是 provider、estimated 或 unavailable");
	}
	const hasTotalTokens = Number.isFinite(response.metrics.total_tokens)
		|| (Number.isFinite(response.metrics.input_tokens) && Number.isFinite(response.metrics.output_tokens));
	if (response.metrics.token_measurement !== "unavailable" && !hasTotalTokens) {
		throw new Error("provider 或 estimated token measurement 必須提供 total_tokens，或同時提供 input_tokens 與 output_tokens");
	}
	if (response.metrics.token_measurement === "estimated" && !response.metrics.token_estimation_method) {
		throw new Error("estimated token measurement 必須說明 token_estimation_method");
	}
	if (response.metrics.token_estimation_method !== null && typeof response.metrics.token_estimation_method !== "string") {
		throw new Error("metrics.token_estimation_method 必須是字串或 null");
	}
	validateMilestones(response.milestones);

	// 保存結構化結果，讓 runner 能在清理隔離工作區前收集證據。
	const result = {
		...response,
		estimate,
		timing: {
			estimate_duration_ms: estimateDurationMs,
			task_duration_ms: taskDurationMs
		}
	};
	writeFileSync(responsePath, `${JSON.stringify(result, null, 2)}\n`);
}
catch (error) {
	const failure = {
		response: "",
		selected_skill: null,
		artifacts: [],
		execution: null,
		metrics: null,
		error: error instanceof Error ? error.message : String(error)
	};

	writeFileSync(responsePath, `${JSON.stringify(failure, null, 2)}\n`);
	console.error(failure.error);
	process.exitCode = 1;
}
