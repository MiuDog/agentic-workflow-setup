#!/usr/bin/env node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { finalizeTask, ingestSummary, validateRegistry } from "./lib/task-registry.mjs";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));
const workspace = mkdtempSync(join(tmpdir(), "task-registry-test-"));
const registryDirectory = join(workspace, "registry");
const outputDirectory = join(workspace, "results");
const cohortPath = join(workspace, "cohort.json");

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

function writeJson(path, value) {
	// 建立測試輸入，不使用真實模型、credential 或使用者 registry。
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

try {
	writeJson(cohortPath, {
		schema_version: 1,
		defaults: {
			cohort: {
				task_type: "skill-evaluation",
				product_stage: "DEFINE",
				complexity_band: "s",
				module: "skills/spec-driven-development"
			},
			experiment: null
		},
		tasks: {}
	});

	// 步驟 1：透過公開 runner 入口建立 baseline／treatment candidates。
	const runner = spawnSync(process.execPath, [
		join(ROOT, "scripts", "run-evals.mjs"),
		"--adapter",
		join(ROOT, "evals", "fixtures", "runner", "protocol-adapter.mjs"),
		"--case",
		"SDD-P1",
		"--out",
		outputDirectory,
		"--registry-dir",
		registryDirectory,
		"--cohort",
		cohortPath
	], { cwd: ROOT, encoding: "utf8" });
	assert(runner.status === 0, `runner integration failed:\n${runner.stdout}\n${runner.stderr}`);

	const summaryPath = join(outputDirectory, "summary.json");
	const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
	const taskIds = [summary.pairs[0].baseline.task_id, summary.pairs[0].treatment.task_id];

	// 步驟 2：相同來源再次 ingest 必須保持冪等。
	const repeated = ingestSummary({ registryDirectory, summaryPath, cohortPath, projectRoot: ROOT });
	assert(repeated.every((outcome) => outcome.status === "unchanged"), "repeated ingest was not idempotent");

	// 步驟 3：獨立 evaluation 只補 result 與 anomalies，逐筆 finalize。
	for (const taskId of taskIds) {
		const evaluationPath = join(workspace, `${encodeURIComponent(taskId)}.evaluation.json`);
		writeJson(evaluationPath, {
			schema_version: 1,
			task_id: taskId,
			result: {
				status: "completed",
				acceptance_passed: true,
				scope_violation_count: 0,
				rework_count: 0
			},
			anomalies: []
		});
		finalizeTask({ registryDirectory, evaluationPath, projectRoot: ROOT });
	}

	// 步驟 4：validator 重建 view，且 analyzer 能直接讀取 finalized history。
	const validation = validateRegistry({ registryDirectory, projectRoot: ROOT });
	assert(validation.errors.length === 0, validation.errors.join("\n"));
	assert(validation.finalized_tasks === 2, "expected two finalized tasks");
	assert(validation.pending_candidates === 0, "expected no pending candidates");
	const registry = JSON.parse(readFileSync(validation.view_path, "utf8"));
	assert(registry.schema_version === 3 && registry.tasks.length === 2, "generated registry view is invalid");

	const analyzer = spawnSync(process.execPath, [
		join(ROOT, "scripts", "analyze-task-registry.mjs"),
		"summary",
		"--registry",
		validation.view_path
	], { cwd: ROOT, encoding: "utf8" });
	assert(analyzer.status === 0, `analyzer integration failed:\n${analyzer.stderr}`);

	// 步驟 5：evidence 被修改時，validator 必須拒絕更新 generated view。
	const requestPath = join(outputDirectory, summary.pairs[0].baseline.request_path);
	const requestText = readFileSync(requestPath, "utf8");
	writeFileSync(requestPath, `${requestText}\n`);
	const tampered = validateRegistry({ registryDirectory, projectRoot: ROOT });
	assert(tampered.errors.some((error) => error.includes("evidence SHA-256 不符")), "tampered evidence was not detected");
	writeFileSync(requestPath, requestText);
	const restored = validateRegistry({ registryDirectory, projectRoot: ROOT });
	assert(restored.errors.length === 0, "registry did not recover after evidence restoration");

	// 步驟 6：相同 task id 若來自不同 summary digest，必須拒絕覆寫。
	const conflictingSummaryPath = join(outputDirectory, "conflicting-summary.json");
	writeJson(conflictingSummaryPath, { ...summary, created_at: new Date(Date.parse(summary.created_at) + 1000).toISOString() });
	let conflictRejected = false;
	try {
		ingestSummary({ registryDirectory, summaryPath: conflictingSummaryPath, cohortPath, projectRoot: ROOT });
	}
	catch (error) {
		conflictRejected = String(error.message).includes("拒絕覆寫");
	}
	assert(conflictRejected, "conflicting task source was not rejected");
	console.log("task registry integration test passed");
}
finally {
	// 測試使用隔離暫存目錄，結束後不留下本機 registry 或 runner evidence。
	rmSync(workspace, { recursive: true, force: true });
}
