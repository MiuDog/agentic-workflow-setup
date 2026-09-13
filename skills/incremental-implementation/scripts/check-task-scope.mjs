#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);

function option(name) {
	const index = args.indexOf(`--${name}`);
	return index >= 0 ? args[index + 1] : undefined;
}

function fail(message) {
	console.error(message);
	process.exit(1);
}

function normalizePath(value, label) {
	if (typeof value !== "string" || !value.trim()) throw new Error(`${label} 必須是非空相對路徑`);
	const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, "");
	if (isAbsolute(value) || /^[A-Za-z]:/.test(value) || normalized.split("/").includes("..")) {
		throw new Error(`${label} 不得是絕對路徑或包含 ..：${value}`);
	}
	return normalized;
}

function normalizeRule(value, label) {
	const tree = typeof value === "string" && value.endsWith("/**");
	const path = normalizePath(tree ? value.slice(0, -3) : value, label);
	if (path.includes("*")) throw new Error(`${label} 只支援精確路徑或尾端 /**：${value}`);
	return { path, tree };
}

function matches(path, rule) {
	return path === rule.path || rule.tree && path.startsWith(`${rule.path}/`);
}

function gitLines(repo, commandArgs) {
	// 由 Git 讀取 base revision 與實際 changed paths，不採信 worker 自報清單。
	const result = spawnSync("git", commandArgs, { cwd: repo, encoding: "utf8" });
	if (result.status !== 0) throw new Error(result.stderr.trim() || `git ${commandArgs.join(" ")} failed`);
	return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function readPacket(path) {
	// 讀取 Planner 簽發的 Task Packet，scope checker 只使用可機械驗證的路徑欄位。
	return JSON.parse(readFileSync(path, "utf8"));
}

function validatePacket(packet) {
	if (packet.schema_version !== 1) throw new Error("Task Packet schema_version 必須為 1");
	if (typeof packet.task_id !== "string" || !packet.task_id) throw new Error("Task Packet 缺 task_id");
	if (typeof packet.base_revision !== "string" || !packet.base_revision) throw new Error("Task Packet 缺 base_revision");
	const moduleRoot = normalizePath(packet.module_root, "module_root");
	const architecturePath = normalizePath(packet.architecture_path, "architecture_path");
	if (architecturePath !== `${moduleRoot}/architecture.md`) {
		throw new Error("architecture_path 必須是 module root 內的 architecture.md");
	}
	if (!Array.isArray(packet.allowed_write) || packet.allowed_write.length === 0) {
		throw new Error("allowed_write 至少需要一個路徑");
	}
	if (!Array.isArray(packet.forbidden) || packet.forbidden.length === 0) throw new Error("forbidden 至少需要 architecture path");

	const allowed = packet.allowed_write.map((value, index) => normalizeRule(value, `allowed_write[${index}]`));
	const forbidden = packet.forbidden.map((value, index) => normalizeRule(value, `forbidden[${index}]`));
	for (const rule of allowed) {
		if (!(rule.path === moduleRoot || rule.path.startsWith(`${moduleRoot}/`))) {
			throw new Error(`allowed_write 超出 module root：${rule.path}`);
		}
	}
	if (!forbidden.some((rule) => matches(architecturePath, rule))) throw new Error("forbidden 必須包含 architecture.md");
	return { moduleRoot, architecturePath, allowed, forbidden };
}

function changedPaths(repo, baseRevision) {
	gitLines(repo, ["rev-parse", "--verify", `${baseRevision}^{commit}`]);
	const tracked = gitLines(repo, ["diff", "--name-only", "--diff-filter=ACDMRTUXB", baseRevision, "--"]);
	const untracked = gitLines(repo, ["ls-files", "--others", "--exclude-standard"]);
	return [...new Set([...tracked, ...untracked].map((path) => normalizePath(path, "changed path")))].sort();
}

function evaluateScope(packet, rules, paths) {
	const violations = [];
	for (const path of paths) {
		if (!(path === rules.moduleRoot || path.startsWith(`${rules.moduleRoot}/`))) {
			violations.push({ path, reason: "outside-module-root" });
			continue;
		}
		if (rules.forbidden.some((rule) => matches(path, rule))) {
			violations.push({ path, reason: "forbidden-path" });
			continue;
		}
		if (!rules.allowed.some((rule) => matches(path, rule))) violations.push({ path, reason: "outside-allowed-write" });
	}
	return {
		task_id: packet.task_id,
		base_revision: packet.base_revision,
		changed_paths: paths,
		violations,
		status: violations.length ? "fail" : "pass"
	};
}

try {
	const packetPath = option("packet");
	const repo = resolve(option("repo") ?? process.cwd());
	if (!packetPath) fail("用法：check-task-scope.mjs --packet <task-packet.json> [--repo <worktree>]");
	const packet = readPacket(resolve(packetPath));
	const rules = validatePacket(packet);
	const result = evaluateScope(packet, rules, changedPaths(repo, packet.base_revision));
	console.log(JSON.stringify(result, null, 2));
	if (result.status === "fail") process.exitCode = 1;
}
catch (error) {
	fail(error instanceof Error ? error.message : String(error));
}
