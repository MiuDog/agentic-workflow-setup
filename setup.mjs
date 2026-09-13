#!/usr/bin/env node
// setup.mjs — 跨 Agent 平台的零依賴安裝器（Node >=18）。
//
// 用法：node setup.mjs [--target <專案目錄>] [--scope project|user]
//                     [--platforms codex,claude,gemini,antigravity]
//                     [--tools playwright] [--dry-run] [--uninstall] [--verify] [--force]
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmdirSync,
	rmSync,
	statSync,
	writeFileSync
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const SRC = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name) => {
	const index = args.indexOf(`--${name}`);
	return index >= 0 ? (args[index + 1] ?? true) : undefined;
};
const flag = (name) => args.includes(`--${name}`);
const splitList = (value) => String(value ?? "")
	.split(",")
	.map((item) => item.trim())
	.filter(Boolean);

const PROJECT_TARGET = resolve(String(option("target") ?? process.cwd()));
const SCOPE = String(option("scope") ?? "project");
const INSTALL_BASE = SCOPE === "user" ? resolve(homedir()) : PROJECT_TARGET;
const DRY = flag("dry-run");
const FORCE = flag("force");
const VERSION = JSON.parse(readFileSync(join(SRC, "package.json"), "utf8")).version;
const LOCK = SCOPE === "user"
	? join(INSTALL_BASE, ".agentic-workflow", "lock.json")
	: join(INSTALL_BASE, ".agentic-workflow.lock.json");
const IS_WIN = process.platform === "win32";
const log = (...message) => console.log(DRY ? "[dry-run]" : "[setup]", ...message);
const hashFile = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const safeManagedPath = (path) => {
	const absolutePath = resolve(INSTALL_BASE, path);
	if (!absolutePath.startsWith(`${INSTALL_BASE}${sep}`)) throw new Error(`lockfile 路徑超出安裝範圍：${path}`);
	return absolutePath;
};

if (!["project", "user"].includes(SCOPE)) {
	console.error("--scope 只接受 project 或 user。");
	process.exit(1);
}
if (SCOPE === "project" && PROJECT_TARGET === resolve(SRC)) {
	console.error("請在消費專案執行，或用 --target 指定；不能把 standalone 安裝進套組 repo 自己。");
	process.exit(1);
}
if (SCOPE === "user" && option("target") !== undefined) {
	console.error("--scope user 固定安裝到使用者目錄，不能同時指定 --target。");
	process.exit(1);
}

const requestedTools = splitList(option("tools"));
const unknownTools = requestedTools.filter((name) => name !== "playwright");
if (unknownTools.length) {
	console.error(`不支援的外接工具：${unknownTools.join(", ")}。目前支援：playwright`);
	process.exit(1);
}
if (SCOPE === "user" && requestedTools.length) {
	console.error("--tools 目前只支援 --scope project，以避免無意修改全域 MCP 設定。");
	process.exit(1);
}

// `agents` 是 0.2.x 的 Codex 別名；保留相容但不再當成平台名稱。
const aliases = { agents: "codex" };
const supportedPlatforms = ["codex", "claude", "gemini", "antigravity"];
const rawWanted = splitList(option("platforms"));
const normalizedWanted = rawWanted.map((name) => aliases[name] ?? name);
const unknownPlatforms = normalizedWanted.filter((name) => !supportedPlatforms.includes(name));
if (unknownPlatforms.length) {
	console.error(`不支援的平台：${unknownPlatforms.join(", ")}。目前支援：${supportedPlatforms.join(", ")}`);
	process.exit(1);
}
if (rawWanted.includes("agents")) console.warn("`agents` 已改名為 `codex`；本次仍依相容別名處理。");

const detected = SCOPE === "user" ? [] : [
	...(existsSync(join(INSTALL_BASE, ".agents")) ? ["codex"] : []),
	...(existsSync(join(INSTALL_BASE, ".claude")) ? ["claude"] : []),
	...(existsSync(join(INSTALL_BASE, ".gemini")) ? ["gemini"] : [])
];
const platforms = [...new Set(
	normalizedWanted.length
		? normalizedWanted
		: (detected.length ? detected : ["codex", "claude"])
)];

log(`範圍：${SCOPE}`);
log(`目標：${INSTALL_BASE}`);
log(`平台：${platforms.join(", ")}${detected.length ? `（偵測到：${detected.join(", ")}）` : ""}`);
log(`外接工具：${requestedTools.length ? requestedTools.join(", ") : "無（使用 --tools 明確選用）"}`);

function* sourceFiles(directory, base = directory) {
	for (const entry of readdirSync(directory)) {
		const path = join(directory, entry);
		if (statSync(path).isDirectory()) yield* sourceFiles(path, base);
		else yield relative(base, path).replaceAll("\\", "/");
	}
}

const planByDestination = new Map();
const addFile = (source, destination) => planByDestination.set(resolve(destination), { source, destination });
const addTree = (sourceRoot, destinationRoot) => {
	for (const path of sourceFiles(sourceRoot)) addFile(join(sourceRoot, path), join(destinationRoot, path));
};

const sharedAgentSkills = platforms.some((name) => ["codex", "gemini", "antigravity"].includes(name));
if (sharedAgentSkills) addTree(join(SRC, "skills"), join(INSTALL_BASE, ".agents", "skills"));
if (platforms.includes("claude")) addTree(join(SRC, "skills"), join(INSTALL_BASE, ".claude", "skills"));
if (SCOPE === "user" && platforms.includes("antigravity")) {
	addTree(join(SRC, "skills"), join(INSTALL_BASE, ".gemini", "config", "skills"));
}

if (SCOPE === "project") {
	if (sharedAgentSkills) {
		addFile(join(SRC, "templates", "delegation-prompts.md"), join(INSTALL_BASE, ".agents", "delegation-prompts.md"));
	}
	if (platforms.includes("claude")) {
		addFile(join(SRC, "templates", "delegation-prompts.md"), join(INSTALL_BASE, ".claude", "docs", "delegation-prompts.md"));
	}
}

const entryTemplates = [];
if (SCOPE === "project") {
	if (platforms.includes("codex")) entryTemplates.push(["AGENTS.md.template", "AGENTS.md"]);
	if (platforms.includes("claude")) entryTemplates.push(["CLAUDE.md.template", "CLAUDE.md"]);
	if (platforms.some((name) => ["gemini", "antigravity"].includes(name))) {
		entryTemplates.push(["GEMINI.md.template", "GEMINI.md"]);
	}
}

if (flag("uninstall")) {
	if (!existsSync(LOCK)) {
		console.error(`找不到 lockfile：${LOCK}`);
		process.exit(1);
	}

	const lock = JSON.parse(readFileSync(LOCK, "utf8"));
	let removed = 0;
	let kept = 0;
	const touchedDirectories = new Set();
	for (const [path, hash] of Object.entries(lock.files)) {
		const absolutePath = safeManagedPath(path);
		if (!existsSync(absolutePath)) continue;
		if (hashFile(absolutePath) !== hash) {
			console.warn(`保留（本地已修改）：${path}`);
			kept++;
			continue;
		}

		if (!DRY) rmSync(absolutePath);
		removed++;
		for (let directory = dirname(absolutePath); directory.length > INSTALL_BASE.length; directory = dirname(directory)) {
			touchedDirectories.add(directory);
		}
	}

	if (!DRY) {
		for (const directory of [...touchedDirectories].sort((left, right) => right.length - left.length)) {
			if (existsSync(directory) && readdirSync(directory).length === 0) rmdirSync(directory);
		}
		rmSync(LOCK);
	}
	log(`移除 ${removed} 檔，保留 ${kept} 檔。入口檔與非破壞性 MCP 合併項未動。`);
	process.exit(0);
}

const oldLock = existsSync(LOCK) ? JSON.parse(readFileSync(LOCK, "utf8")) : null;
const newFiles = {};
let copied = 0;
let skippedLocal = 0;
let retired = 0;
const plannedPaths = new Set([...planByDestination.values()].map(({ destination }) =>
	relative(INSTALL_BASE, destination).replaceAll("\\", "/")));
for (const [path, hash] of Object.entries(oldLock?.files ?? {})) {
	if (plannedPaths.has(path)) continue;
	const absolutePath = safeManagedPath(path);
	if (!existsSync(absolutePath)) continue;
	if (hashFile(absolutePath) !== hash) {
		console.warn(`保留已退役但被本地修改的檔案：${path}`);
		newFiles[path] = hashFile(absolutePath);
		continue;
	}
	if (!DRY) rmSync(absolutePath);
	log(`移除已退役的受管檔案：${path}`);
	retired++;
}
for (const { source, destination } of planByDestination.values()) {
	const path = relative(INSTALL_BASE, destination).replaceAll("\\", "/");
	const sourceHash = hashFile(source);
	if (existsSync(destination)) {
		const destinationHash = hashFile(destination);
		const knownHash = oldLock?.files?.[path];
		if (destinationHash === sourceHash) {
			newFiles[path] = sourceHash;
			continue;
		}
		if (knownHash && destinationHash !== knownHash && !FORCE) {
			console.warn(`保留本地修改（--force 可覆蓋）：${path}`);
			newFiles[path] = destinationHash;
			skippedLocal++;
			continue;
		}
	}

	if (!DRY) {
		mkdirSync(dirname(destination), { recursive: true });
		copyFileSync(source, destination);
	}
	newFiles[path] = sourceHash;
	copied++;
}

for (const [template, filename] of entryTemplates) {
	const destination = join(INSTALL_BASE, filename);
	if (existsSync(destination)) continue;
	if (!DRY) copyFileSync(join(SRC, "templates", template), destination);
	log(`建立入口檔 ${filename}（只建立一次，請填〈〉佔位符）`);
}

function mergeJsonMcp(path, selectedServers) {
	let config = {};
	if (existsSync(path)) {
		try {
			config = JSON.parse(readFileSync(path, "utf8"));
		}
		catch {
			console.warn(`略過（JSON 解析失敗，不動它）：${path}`);
			return;
		}
	}
	config.mcpServers ??= {};
	let added = 0;
	for (const [name, server] of Object.entries(selectedServers)) {
		if (config.mcpServers[name]) continue;
		config.mcpServers[name] = server;
		added++;
	}
	if (added && !DRY) {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, `${JSON.stringify(config, null, "\t")}\n`);
	}
	log(`MCP ${relative(INSTALL_BASE, path)}：補 ${added} 個 server（既有 key 未動）`);
}

function mergeCodexToml(path, selectedServers) {
	let config = existsSync(path) ? readFileSync(path, "utf8") : "";
	let added = 0;
	for (const [name, server] of Object.entries(selectedServers)) {
		const escapedName = name.replaceAll(".", "\\.");
		if (new RegExp(`^\\[mcp_servers\\.${escapedName}\\]\\s*$`, "m").test(config)) continue;
		const command = JSON.stringify(server.command);
		const argumentsValue = server.args.map((argument) => JSON.stringify(argument)).join(", ");
		const prefix = config.length && !config.endsWith("\n") ? "\n" : "";
		config += `${prefix}\n[mcp_servers.${name}]\ncommand = ${command}\nargs = [${argumentsValue}]\n`;
		added++;
	}
	if (added && !DRY) {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, config);
	}
	log(`MCP ${relative(INSTALL_BASE, path)}：補 ${added} 個 server（既有 section 未動）`);
}

if (requestedTools.length) {
	const platformConfig = JSON.parse(readFileSync(join(SRC, IS_WIN
		? "mcp/mcp-config.windows.example.json"
		: "mcp/mcp-config.example.json"), "utf8"));
	const selectedServers = Object.fromEntries(
		requestedTools.map((name) => [name, platformConfig.mcpServers[name]])
	);
	if (platforms.includes("codex")) mergeCodexToml(join(INSTALL_BASE, ".codex", "config.toml"), selectedServers);
	if (platforms.includes("claude")) mergeJsonMcp(join(INSTALL_BASE, ".mcp.json"), selectedServers);
	if (platforms.includes("gemini")) mergeJsonMcp(join(INSTALL_BASE, ".gemini", "settings.json"), selectedServers);
	if (platforms.includes("antigravity")) mergeJsonMcp(join(INSTALL_BASE, ".agents", "mcp_config.json"), selectedServers);
}

if (!DRY) {
	mkdirSync(dirname(LOCK), { recursive: true });
	writeFileSync(LOCK, `${JSON.stringify({
		version: VERSION,
		scope: SCOPE,
		platforms,
		installedAt: new Date().toISOString(),
		files: newFiles
	}, null, 2)}\n`);
}
log(`完成：複製 ${copied} 檔、移除退役 ${retired} 檔、保留本地修改 ${skippedLocal} 檔、lockfile v${VERSION}。`);

if (flag("verify")) {
	const { spawnSync } = await import("node:child_process");
	const roots = new Set();
	if (sharedAgentSkills) roots.add(join(INSTALL_BASE, ".agents"));
	if (platforms.includes("claude")) roots.add(join(INSTALL_BASE, ".claude"));
	if (SCOPE === "user" && platforms.includes("antigravity")) roots.add(join(INSTALL_BASE, ".gemini", "config"));
	for (const root of roots) {
		const result = spawnSync(process.execPath, [join(SRC, "scripts", "validate.mjs"), root], { encoding: "utf8" });
		console.log(`--- verify ${root} ---\n${result.stdout}${result.stderr}`);
		if (result.status !== 0) process.exitCode = 1;
	}
}
