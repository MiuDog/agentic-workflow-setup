#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { ingestSummary } from "./lib/task-registry.mjs";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));
const WORKER = join(ROOT, "scripts", "eval-adapter-worker.mjs");
const DEFAULT_SUITE = join(ROOT, "evals", "cases", "spec-driven-development.json");
const SAFE_ENV_KEYS = ["PATH", "Path", "PATHEXT", "SystemRoot", "WINDIR", "COMSPEC", "TEMP", "TMP", "LANG", "LC_ALL"];

function fail(message) {
	console.error(message);
	process.exit(1);
}

function parseArgs(argv) {
	const options = {
		suite: DEFAULT_SUITE,
		adapter: null,
		out: null,
		caseIds: [],
		passEnv: [],
		registryDir: null,
		cohort: null,
		runs: 1
	};

	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index];
		const value = argv[index + 1];
		if (["--suite", "--adapter", "--out", "--case", "--runs", "--pass-env", "--registry-dir", "--cohort"].includes(arg) && !value) {
			fail(`${arg} 缺少值`);
		}

		if (arg === "--suite") options.suite = value;
		else if (arg === "--adapter") options.adapter = value;
		else if (arg === "--out") options.out = value;
		else if (arg === "--case") options.caseIds.push(value);
		else if (arg === "--pass-env") options.passEnv.push(value);
		else if (arg === "--registry-dir") options.registryDir = value;
		else if (arg === "--cohort") options.cohort = value;
		else if (arg === "--runs") options.runs = Number(value);
		else fail(`未知參數：${arg}`);

		index++;
	}

	if (!options.adapter) fail("缺少 --adapter <module.mjs>；runner 不會自行選擇或付費呼叫模型");
	if (!Number.isInteger(options.runs) || options.runs < 1) fail("--runs 必須是大於 0 的整數");
	if (Boolean(options.registryDir) !== Boolean(options.cohort)) {
		fail("--registry-dir 與 --cohort 必須一起提供，避免產生沒有 cohort 的歷史資料");
	}
	return options;
}

function readJson(path) {
	// 讀取 suite 或 adapter 結果，解析失敗時保留實際路徑。
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	}
	catch (error) {
		throw new Error(`JSON 解析失敗 ${path}：${error.message}`);
	}
}

function readSkillCatalog(skillsDir) {
	const catalog = [];
	for (const name of readdirSync(skillsDir).sort()) {
		const skillPath = join(skillsDir, name, "SKILL.md");
		if (!statSync(join(skillsDir, name)).isDirectory() || !existsSync(skillPath)) continue;

		const skillText = readFileSync(skillPath, "utf8");
		const description = skillText.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? "";
		catalog.push({ name, description, skillText });
	}
	return catalog;
}

function writeJson(path, value) {
	// 建立結果目錄並保存可重跑的 request、response 與 summary。
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256(value) {
	return createHash("sha256").update(value).digest("hex");
}

function buildChildEnv(passEnv) {
	const env = {};
	for (const key of SAFE_ENV_KEYS) if (process.env[key] !== undefined) env[key] = process.env[key];
	for (const key of passEnv) {
		if (process.env[key] === undefined) fail(`--pass-env 指定的環境變數不存在：${key}`);
		env[key] = process.env[key];
	}
	return env;
}

function copyFixture(caseDefinition, suiteDir, projectDir) {
	if (!caseDefinition.fixture) {
		mkdirSync(projectDir, { recursive: true });
		return;
	}

	const source = resolve(suiteDir, caseDefinition.fixture);
	if (!existsSync(source)) throw new Error(`fixture 不存在：${source}`);

	// 將 fixture 複製到一次性 project root，避免各次評估共享可變狀態。
	cpSync(source, projectDir, { recursive: true });
}

function collectArtifacts(response, projectDir, resultDir) {
	const collected = [];
	for (const artifact of response.artifacts ?? []) {
		if (typeof artifact !== "string" || isAbsolute(artifact)) throw new Error(`artifact 必須是相對路徑：${artifact}`);

		const source = resolve(projectDir, artifact);
		const relativeSource = relative(projectDir, source);
		if (relativeSource.startsWith(`..${sep}`) || relativeSource === "..") throw new Error(`artifact 超出 workspace：${artifact}`);
		if (!existsSync(source)) throw new Error(`adapter 宣告的 artifact 不存在：${artifact}`);

		const destination = join(resultDir, "artifacts", artifact);
		// 保存 adapter 明示的產物，隨後才清理暫存 workspace。
		mkdirSync(dirname(destination), { recursive: true });
		cpSync(source, destination, { recursive: true });
		const savedPath = join("artifacts", artifact).replaceAll("\\", "/");
		const artifactRecord = { path: artifact, saved_path: savedPath };
		collected.push(artifactRecord);
	}
	return collected;
}

function removeWorkspace(workspace) {
	const resolvedTemp = resolve(tmpdir());
	const resolvedWorkspace = resolve(workspace);
	const withinTemp = resolvedWorkspace.startsWith(`${resolvedTemp}${sep}`);
	if (!withinTemp || !basename(resolvedWorkspace).startsWith("skill-eval-")) {
		throw new Error(`拒絕清理未驗證的 workspace：${resolvedWorkspace}`);
	}

	// 僅刪除本次由 mkdtemp 建立且已驗證位於系統 temp 的工作區。
	rmSync(resolvedWorkspace, { recursive: true, force: true });
}

function evaluateChecks(caseDefinition, response, targetSkill) {
	return caseDefinition.checks.map((check) => {
		if (check.type !== "routing") {
			return { ...check, status: "pending", evidence: null };
		}

		const actual = response.selected_skill ?? null;
		let passed = actual === caseDefinition.expected_owner;
		if (caseDefinition.selection_rule === "exclude-target") passed = actual !== targetSkill;
		return {
			...check,
			status: passed ? "pass" : "fail",
			evidence: { expected_owner: caseDefinition.expected_owner, selected_skill: actual }
		};
	});
}

function evaluationStatus(checks, executionParity) {
	if (executionParity.status === "fail") return "fail";
	if (checks.some((check) => check.required && check.status === "fail")) return "fail";
	if (checks.some((check) => check.status === "pending")) return "pending";
	return "pass";
}

function normalizeExecution(execution) {
	if (!execution) return null;
	return {
		provider: execution.provider,
		model: execution.model,
		reasoning: execution.reasoning,
		tools: [...execution.tools].sort(),
		permissions: [...execution.permissions].sort()
	};
}

function compareExecution(baseline, treatment) {
	const baselineExecution = normalizeExecution(baseline.execution);
	const treatmentExecution = normalizeExecution(treatment.execution);
	const passed = JSON.stringify(baselineExecution) === JSON.stringify(treatmentExecution);
	return {
		status: passed ? "pass" : "fail",
		baseline: baselineExecution,
		treatment: treatmentExecution
	};
}

function actualTotalTokens(metrics) {
	if (Number.isFinite(metrics?.total_tokens)) return metrics.total_tokens;
	if (Number.isFinite(metrics?.input_tokens) && Number.isFinite(metrics?.output_tokens)) {
		return metrics.input_tokens + metrics.output_tokens;
	}
	return null;
}

function rangeStatus(actual, range) {
	if (!Number.isFinite(actual) || !range) return "unknown";
	if (actual < range.low) return "under";
	if (actual > range.high) return "over";
	return "within-range";
}

function compareBudget(response) {
	const estimate = response.estimate ?? null;
	const totalTokens = actualTotalTokens(response.metrics);
	const durationMs = response.timing?.task_duration_ms ?? null;
	return {
		estimate,
		actual: {
			total_tokens: totalTokens,
			duration_ms: durationMs
		},
		status: {
			tokens: rangeStatus(totalTokens, estimate?.expected_total_tokens),
			duration: rangeStatus(durationMs, estimate?.expected_duration_ms)
		}
	};
}

function runVariant(context, caseDefinition, iteration, variant) {
	const workspace = mkdtempSync(join(tmpdir(), `skill-eval-${caseDefinition.id.toLowerCase()}-${variant}-`));
	const projectDir = join(workspace, "project");
	const resultDir = join(context.outDir, caseDefinition.id, String(iteration), variant);
	const requestPath = join(workspace, "request.json");
	const responsePath = join(workspace, "response.json");

	try {
		copyFixture(caseDefinition, context.suiteDir, projectDir);
		const visibleCatalog = context.skillCatalog.filter((skill) => {
			return variant === "treatment" || skill.name !== context.suite.skill.name;
		});
		const skills = [];
		for (const skill of visibleCatalog) {
			const installedSkill = join(workspace, "skills", skill.name, "SKILL.md");
			mkdirSync(dirname(installedSkill), { recursive: true });
			writeFileSync(installedSkill, skill.skillText);
			const installedSkillRecord = {
				name: skill.name,
				description: skill.description,
				path: installedSkill,
				preload: variant === "treatment" && skill.name === context.suite.skill.name && caseDefinition.mode === "behavior"
			};
			skills.push(installedSkillRecord);
		}

		const request = {
			protocol_version: 2,
			task_id: `${caseDefinition.id}-${iteration}-${variant}`,
			case_id: caseDefinition.id,
			mode: caseDefinition.mode,
			variant,
			prompt: caseDefinition.prompt,
			workspace: projectDir,
			skills
		};
		writeJson(requestPath, request);

		const startedAtIso = new Date().toISOString();
		const startedAt = Date.now();
		// 以獨立 Node process 執行 adapter，隔離 baseline 與 treatment 的 module state。
		const childArgs = [WORKER, context.adapterPath, requestPath, responsePath];
		const childOptions = {
			cwd: workspace,
			encoding: "utf8",
			env: context.childEnv,
			maxBuffer: 10 * 1024 * 1024
		};
		const child = spawnSync(process.execPath, childArgs, childOptions);
		const processDurationMs = Date.now() - startedAt;
		const completedAtIso = new Date().toISOString();
		const response = existsSync(responsePath) ? readJson(responsePath) : {
			response: "",
			selected_skill: null,
			artifacts: [],
			error: child.stderr || `adapter process exited ${child.status}`
		};
		const artifacts = collectArtifacts(response, projectDir, resultDir);
		const record = {
			status: child.status === 0 ? "completed" : "failed",
			task_id: request.task_id,
			started_at: startedAtIso,
			completed_at: completedAtIso,
			duration_ms: response.timing?.task_duration_ms ?? null,
			process_duration_ms: processDurationMs,
			skill_bytes: variant === "treatment" ? Buffer.byteLength(context.skillText) : 0,
			selected_skill: response.selected_skill ?? null,
			execution: response.execution ?? null,
			metrics: response.metrics ?? {},
			milestones: response.milestones ?? [],
			budget: compareBudget(response),
			artifacts,
			request_path: relative(context.outDir, join(resultDir, "request.json")).replaceAll("\\", "/"),
			response_path: relative(context.outDir, join(resultDir, "response.json")).replaceAll("\\", "/"),
			error: response.error ?? null
		};

		writeJson(join(resultDir, "request.json"), request);
		writeJson(join(resultDir, "response.json"), response);
		return { record, response };
	}
	finally {
		removeWorkspace(workspace);
	}
}

const options = parseArgs(process.argv.slice(2));
const suitePath = resolve(options.suite);
const adapterPath = resolve(options.adapter);
if (!existsSync(suitePath)) fail(`suite 不存在：${suitePath}`);
if (!existsSync(adapterPath)) fail(`adapter 不存在：${adapterPath}`);

const suite = readJson(suitePath);
const suiteDir = dirname(suitePath);
const skillPath = resolve(ROOT, suite.skill.path);
if (!existsSync(skillPath)) fail(`skill 不存在：${skillPath}`);

// 只讀目標 skill；baseline request 永遠不包含下列內容或路徑。
const skillText = readFileSync(skillPath, "utf8");
const skillDescription = skillText.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? "";
const skillCatalog = readSkillCatalog(join(ROOT, "skills"));
if (!skillCatalog.some((skill) => skill.name === suite.skill.name)) fail(`skill catalog 缺少目標：${suite.skill.name}`);
const timestamp = new Date().toISOString().replaceAll(":", "-").replace(".", "-");
const outDir = resolve(options.out ?? join(ROOT, "evals", "results", `${suite.skill.name}-${timestamp}`));
const selectedCases = suite.cases.filter((item) => !options.caseIds.length || options.caseIds.includes(item.id));
if (!selectedCases.length) fail("沒有符合 --case 的案例");

const context = {
	suite,
	suiteDir,
	adapterPath,
	outDir,
	skillText,
	skillDescription,
	skillCatalog,
	childEnv: buildChildEnv(options.passEnv)
};
const pairs = [];
let executionFailures = 0;

for (const caseDefinition of selectedCases) {
	for (let iteration = 1; iteration <= options.runs; iteration++) {
		console.log(`[eval] ${caseDefinition.id} run ${iteration}: baseline`);
		const baseline = runVariant(context, caseDefinition, iteration, "baseline");
		console.log(`[eval] ${caseDefinition.id} run ${iteration}: treatment`);
		const treatment = runVariant(context, caseDefinition, iteration, "treatment");
		const checks = evaluateChecks(caseDefinition, treatment.response, suite.skill.name);
		const executionParity = compareExecution(baseline.response, treatment.response);
		if (baseline.record.status === "failed" || treatment.record.status === "failed") executionFailures++;

		const pair = {
			case_id: caseDefinition.id,
			kind: caseDefinition.kind,
			mode: caseDefinition.mode,
			iteration,
			baseline: baseline.record,
			treatment: treatment.record,
			execution_parity: executionParity,
			checks,
			evaluation_status: evaluationStatus(checks, executionParity)
		};
		pairs.push(pair);
	}
}

const summary = {
	protocol_version: 2,
	created_at: new Date().toISOString(),
	suite: relative(ROOT, suitePath).replaceAll("\\", "/"),
	adapter: {
		path: adapterPath,
		sha256: sha256(readFileSync(adapterPath))
	},
	passed_environment_keys: Object.keys(context.childEnv).sort(),
	skill: {
		name: suite.skill.name,
		path: suite.skill.path,
		sha256: sha256(skillText),
		bytes: Buffer.byteLength(skillText)
	},
	skill_catalog: {
		installed_names: skillCatalog.map((skill) => skill.name),
		description_characters: skillCatalog.reduce((total, skill) => total + skill.description.length, 0)
	},
	runs_per_case: options.runs,
	pairs,
	execution_failures: executionFailures,
	retention_decision: "pending-independent-evaluation"
};

const summaryPath = join(outDir, "summary.json");
writeJson(summaryPath, summary);
console.log(`[eval] 結果：${summaryPath}`);
if (options.registryDir && options.cohort) {
	// 將 runner 可判定資料寫成 pending candidates，acceptance 仍交由獨立 evaluator。
	const outcomes = ingestSummary({
		registryDirectory: resolve(options.registryDir),
		summaryPath,
		cohortPath: resolve(options.cohort),
		projectRoot: ROOT
	});
	console.log(`[eval] registry candidates：${outcomes.filter((outcome) => outcome.status === "created").length} created`);
}
console.log(`[eval] execution failures: ${executionFailures}; retention decision: pending-independent-evaluation`);
if (executionFailures) process.exitCode = 1;
