#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	defaultRegistryDirectory,
	finalizeTask,
	ingestSummary,
	initializeRegistry,
	validateRegistry
} from "./lib/task-registry.mjs";

const args = process.argv.slice(2);
const command = args[0];

function option(name) {
	const index = args.indexOf(`--${name}`);
	return index >= 0 ? args[index + 1] : undefined;
}

function fail(message) {
	console.error(message);
	process.exit(1);
}

function registryDirectory() {
	return resolve(option("registry-dir") ?? defaultRegistryDirectory());
}

function runInit() {
	const paths = initializeRegistry(registryDirectory());
	console.log(`registry 已初始化：${paths.root}`);
}

function runIngest() {
	const summaryPath = option("summary");
	const cohortPath = option("cohort");
	if (!summaryPath || !cohortPath) fail("ingest 需要 --summary <summary.json> 與 --cohort <cohort.json>");
	const outcomes = ingestSummary({ registryDirectory: registryDirectory(), summaryPath, cohortPath });
	for (const outcome of outcomes) console.log(`${outcome.status}: ${outcome.task_id}`);
}

function runFinalize() {
	const taskId = option("task");
	const evaluationPath = option("evaluation");
	if (!taskId || !evaluationPath) fail("finalize 需要 --task <task-id> 與 --evaluation <evaluation.json>");
	// 先讀回 evaluation task id，避免使用錯誤的 --task 完成其他紀錄。
	const evaluation = JSON.parse(readFileSync(resolve(evaluationPath), "utf8"));
	if (evaluation.task_id !== taskId) fail(`--task 與 evaluation.task_id 不一致：${taskId}`);
	const record = finalizeTask({ registryDirectory: registryDirectory(), evaluationPath });
	console.log(`finalized: ${record.task.task_id}`);
}

function runValidate() {
	const result = validateRegistry({ registryDirectory: registryDirectory() });
	for (const warning of result.warnings) console.log(`WARN: ${warning}`);
	if (result.errors.length) {
		for (const error of result.errors) console.error(`ERROR: ${error}`);
		process.exitCode = 1;
		return;
	}
	console.log(`registry 驗證通過：${result.finalized_tasks} finalized、${result.pending_candidates} pending、${result.experiments} experiments`);
	console.log(`generated view：${result.view_path}`);
}

try {
	if (command === "init") runInit();
	else if (command === "ingest") runIngest();
	else if (command === "finalize") runFinalize();
	else if (command === "validate") runValidate();
	else fail("用法：task-registry.mjs <init|ingest|finalize|validate> [options]");
}
catch (error) {
	fail(error instanceof Error ? error.message : String(error));
}
