#!/usr/bin/env node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));
const CHECKER = join(ROOT, "skills", "incremental-implementation", "scripts", "check-task-scope.mjs");
const workspace = mkdtempSync(join(tmpdir(), "task-scope-test-"));
const repo = join(workspace, "worktree");
const packetPath = join(workspace, "task-packet.json");

function run(command, args, options = {}) {
	// 在隔離暫存 repository 執行 Git 與 scope checker，不接觸使用者 worktree。
	return spawnSync(command, args, { cwd: options.cwd ?? repo, encoding: "utf8" });
}

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

function write(path, content) {
	// 建立測試 repository 與 Task Packet 的最小固定 fixture。
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content);
}

try {
	// 步驟 1：建立乾淨 base revision 與 module contract。
	mkdirSync(repo, { recursive: true });
	assert(run("git", ["init", "--initial-branch=main"]).status === 0, "git init failed");
	assert(run("git", ["config", "user.email", "scope-test@example.invalid"]).status === 0, "git email config failed");
	assert(run("git", ["config", "user.name", "Scope Test"]).status === 0, "git name config failed");
	write(join(repo, "src", "game", "architecture.md"), "# Game architecture\n");
	write(join(repo, "src", "game", "engine.js"), "export const value = 1;\n");
	write(join(repo, "README.md"), "# Fixture\n");
	assert(run("git", ["add", "."]).status === 0, "git add failed");
	assert(run("git", ["commit", "-m", "fixture"]).status === 0, "git commit failed");
	const baseRevision = run("git", ["rev-parse", "HEAD"]).stdout.trim();

	const packet = {
		schema_version: 1,
		task_id: "SCOPE-TEST-1",
		goal: "Update the isolated game engine behavior.",
		module_root: "src/game",
		architecture_path: "src/game/architecture.md",
		architecture_revision: baseRevision,
		base_revision: baseRevision,
		allowed_read: ["src/game/**"],
		allowed_write: ["src/game/**"],
		forbidden: ["src/game/architecture.md", "src/game/tests/**"],
		contract_excerpts: [{ source: "src/game/architecture.md", revision: baseRevision, content: "engine.js owns the behavior" }],
		acceptance: ["Scope checker observes only allowed engine changes."],
		test_state: { red: [], yellow: ["src/game/engine.js"], green: [] },
		estimate: {
			basis: "cold-start",
			reference_task_ids: [],
			expected_total_tokens: { low: 0, high: 1000 },
			expected_duration_ms: { low: 0, high: 60000 },
			assumptions: ["deterministic fixture"]
		},
		milestones: [{
			id: "M1",
			outcome: "engine updated",
			evidence: "scope command",
			expected_cumulative_tokens: 1000,
			expected_cumulative_duration_ms: 60000,
			anomaly_threshold: "any forbidden path"
		}],
		experiment: null
	};
	write(packetPath, `${JSON.stringify(packet, null, 2)}\n`);

	// 步驟 2：module 內非 protected 變更必須通過。
	write(join(repo, "src", "game", "engine.js"), "export const value = 2;\n");
	const allowed = run(process.execPath, [CHECKER, "--packet", packetPath, "--repo", repo], { cwd: ROOT });
	assert(allowed.status === 0, `allowed change failed:\n${allowed.stdout}\n${allowed.stderr}`);

	// 步驟 3：module 外變更必須是 hard failure。
	write(join(repo, "outside.txt"), "unexpected\n");
	const outside = run(process.execPath, [CHECKER, "--packet", packetPath, "--repo", repo], { cwd: ROOT });
	assert(outside.status === 1 && outside.stdout.includes("outside-module-root"), "outside-module change was not rejected");
	rmSync(join(repo, "outside.txt"));

	// 步驟 4：即使位於 allowed tree，architecture.md 仍必須被 forbidden 規則拒絕。
	write(join(repo, "src", "game", "architecture.md"), "# Modified architecture\n");
	const protectedResult = run(process.execPath, [CHECKER, "--packet", packetPath, "--repo", repo], { cwd: ROOT });
	assert(protectedResult.status === 1 && protectedResult.stdout.includes("forbidden-path"), "protected architecture change was not rejected");
	console.log("task scope integration test passed");
}
finally {
	// 測試只刪除本次建立且位於系統 temp 下的明確 workspace。
	rmSync(workspace, { recursive: true, force: true });
}
