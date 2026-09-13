#!/usr/bin/env node
// validate.mjs — 套組自檢：skill 結構、eval case、markdown 連結與 MCP 配置。
// 用法：node scripts/validate.mjs [repo 根目錄，預設為本腳本上一層]
// 規則來源：docs/maintenance.md 與 docs/evaluation-contract.md。
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), ".."));
const errors = [];
const warnings = [];

function readJson(path) {
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	}
	catch (error) {
		errors.push(`JSON 解析失敗 ${path}：${error.message}`);
		return null;
	}
}

function validateSkills() {
	const skillsDir = join(ROOT, "skills");
	if (!existsSync(skillsDir)) {
		errors.push("缺少 skills 目錄");
		return;
	}

	for (const name of readdirSync(skillsDir)) {
		const skillDir = join(skillsDir, name);
		if (!statSync(skillDir).isDirectory()) continue;

		const skillPath = join(skillDir, "SKILL.md");
		if (!existsSync(skillPath)) {
			errors.push(`skills/${name}/ 缺 SKILL.md`);
			continue;
		}

		const text = readFileSync(skillPath, "utf8");
		const lines = text.split(/\r?\n/);
		const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
		if (!frontmatter) {
			errors.push(`skills/${name}/SKILL.md 缺 YAML frontmatter`);
			continue;
		}

		const field = (key) => frontmatter[1].match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1]?.trim();
		const frontmatterName = field("name");
		const description = field("description");
		if (frontmatterName !== name) errors.push(`skills/${name}: frontmatter name「${frontmatterName}」≠ 目錄名`);
		if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(frontmatterName ?? "")) errors.push(`skills/${name}: name 非小寫連字號格式`);
		if ((frontmatterName?.length ?? 0) > 64) errors.push(`skills/${name}: name 超過 Agent Skills 規格的 64 字元`);
		if (!description || description.length < 20) errors.push(`skills/${name}: description 缺失或過短（要寫觸發時機）`);
		if ((description?.length ?? 0) > 1024) errors.push(`skills/${name}: description 超過 Agent Skills 規格的 1024 字元`);
		if (description && description.length > 500) warnings.push(`skills/${name}: description 超過 500 字元，浪費技能清單 token`);
		if (lines.length >= 200) warnings.push(`skills/${name}/SKILL.md ${lines.length} 行，請檢查是否混入條件性或重複內容`);

		const referencesDirectory = join(skillDir, "references");
		if (existsSync(referencesDirectory)) {
			for (const filename of readdirSync(referencesDirectory).filter((entry) => entry.endsWith(".json"))) {
				readJson(join(referencesDirectory, filename));
			}
		}
	}
}

function validateDistribution() {
	const packagePath = join(ROOT, "package.json");
	if (!existsSync(packagePath)) return;
	const packageJson = readJson(packagePath);
	if (!packageJson) return;

	const manifests = [
		["plugin.json", join(ROOT, "plugin.json")],
		[".codex-plugin/plugin.json", join(ROOT, ".codex-plugin", "plugin.json")],
		[".claude-plugin/plugin.json", join(ROOT, ".claude-plugin", "plugin.json")]
	];
	for (const [label, path] of manifests) {
		if (!existsSync(path)) {
			errors.push(`缺少分發 manifest：${label}`);
			continue;
		}
		const manifest = readJson(path);
		if (!manifest) continue;
		if (manifest.name !== packageJson.name) errors.push(`${label}: name 必須與 package.json 一致`);
		if (manifest.version !== packageJson.version) errors.push(`${label}: version 必須與 package.json 一致`);
	}

	const openAiMarketplace = readJson(join(ROOT, ".agents", "plugins", "marketplace.json"));
	const claudeMarketplace = readJson(join(ROOT, ".claude-plugin", "marketplace.json"));
	for (const [label, marketplace] of [["OpenAI", openAiMarketplace], ["Claude", claudeMarketplace]]) {
		if (!marketplace) continue;
		const entry = marketplace.plugins?.find((plugin) => plugin.name === packageJson.name);
		if (!entry) errors.push(`${label} marketplace 缺 ${packageJson.name} entry`);
		if (entry?.version && entry.version !== packageJson.version) errors.push(`${label} marketplace version 與 package.json 不一致`);
	}

	const descriptions = [];
	for (const name of readdirSync(join(ROOT, "skills"))) {
		const text = readFileSync(join(ROOT, "skills", name, "SKILL.md"), "utf8");
		const description = text.match(/^description:\s*(.+)$/m)?.[1]?.trim();
		if (description) descriptions.push(description);
		const agentManifest = join(ROOT, "skills", name, "agents", "openai.yaml");
		if (!existsSync(agentManifest)) errors.push(`skills/${name}: 缺 agents/openai.yaml UI metadata`);
	}
	const catalogCharacters = descriptions.reduce((sum, description) => sum + description.length, 0);
	if (catalogCharacters > 8000) errors.push(`skill description catalog 共 ${catalogCharacters} 字元，超過 OpenAI 初始 catalog 上限 8000`);
}

function validateCaseCheck(caseId, check, seenCheckIds) {
	if (!check || typeof check !== "object") {
		errors.push(`${caseId}: check 必須是 object`);
		return;
	}

	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(check.id ?? "")) errors.push(`${caseId}: check id 格式錯誤`);
	if (seenCheckIds.has(check.id)) errors.push(`${caseId}: check id 重複 → ${check.id}`);
	seenCheckIds.add(check.id);
	if (!["routing", "behavior"].includes(check.type)) errors.push(`${caseId}/${check.id}: type 必須是 routing 或 behavior`);
	if (!["machine", "evaluator", "human"].includes(check.verifier)) errors.push(`${caseId}/${check.id}: verifier 無效`);
	if (typeof check.required !== "boolean") errors.push(`${caseId}/${check.id}: required 必須是 boolean`);
	if (typeof check.criterion !== "string" || check.criterion.length < 10) errors.push(`${caseId}/${check.id}: criterion 缺失或過短`);
	if (check.type === "routing" && check.verifier !== "machine") errors.push(`${caseId}/${check.id}: routing check 必須由 machine 驗證`);
	if (check.type === "behavior" && check.verifier === "machine") errors.push(`${caseId}/${check.id}: 尚未定義 behavior machine checker，不得假稱自動驗證`);
}

function validateCaseDefinition(caseDefinition, seenCaseIds) {
	if (!caseDefinition || typeof caseDefinition !== "object") {
		errors.push("case 必須是 object");
		return;
	}

	const caseId = caseDefinition.id ?? "<missing-id>";
	if (!/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(caseId)) errors.push(`${caseId}: case id 格式錯誤`);
	if (seenCaseIds.has(caseId)) errors.push(`${caseId}: case id 重複`);
	seenCaseIds.add(caseId);
	if (!["positive", "negative", "collision", "behavior"].includes(caseDefinition.kind)) errors.push(`${caseId}: kind 無效`);
	if (!["routing", "behavior"].includes(caseDefinition.mode)) errors.push(`${caseId}: mode 無效`);
	if (typeof caseDefinition.prompt !== "string" || caseDefinition.prompt.length < 10) errors.push(`${caseId}: prompt 缺失或過短`);
	if (caseDefinition.expected_owner !== null && typeof caseDefinition.expected_owner !== "string") errors.push(`${caseId}: expected_owner 必須是字串或 null`);
	if (!["exact", "exclude-target"].includes(caseDefinition.selection_rule)) errors.push(`${caseId}: selection_rule 無效`);
	if (!Array.isArray(caseDefinition.checks) || !caseDefinition.checks.length) {
		errors.push(`${caseId}: 至少需要一個 check`);
		return;
	}

	const seenCheckIds = new Set();
	for (const check of caseDefinition.checks) validateCaseCheck(caseId, check, seenCheckIds);
	if (caseDefinition.mode === "routing" && !caseDefinition.checks.some((check) => check.type === "routing")) {
		errors.push(`${caseId}: routing case 缺 routing check`);
	}
	if (caseDefinition.mode === "behavior" && caseDefinition.checks.some((check) => check.type === "routing")) {
		errors.push(`${caseId}: 預載 skill 的 behavior case 不得用 routing check 冒充選擇結果`);
	}
}

function validateEvalSuites() {
	const isRepositoryRoot = existsSync(join(ROOT, "package.json")) && existsSync(join(ROOT, "scripts", "validate.mjs"));
	if (!isRepositoryRoot) return;

	const schemaPath = join(ROOT, "evals", "case.schema.json");
	if (!existsSync(schemaPath)) {
		errors.push("缺少 evals/case.schema.json");
		return;
	}
	readJson(schemaPath);
	for (const schemaName of [
		"task-registry.schema.json",
		"task-record.schema.json",
		"cohort-packet.schema.json",
		"task-evaluation.schema.json"
	]) {
		const schemaPath = join(ROOT, "evals", schemaName);
		if (!existsSync(schemaPath)) errors.push(`缺少 evals/${schemaName}`);
		else readJson(schemaPath);
	}

	const casesDir = join(ROOT, "evals", "cases");
	if (!existsSync(casesDir)) {
		errors.push("缺少 evals/cases 目錄");
		return;
	}

	const suiteSkillNames = new Set();
	for (const filename of readdirSync(casesDir).filter((name) => name.endsWith(".json"))) {
		const suitePath = join(casesDir, filename);
		const suite = readJson(suitePath);
		if (!suite) continue;

		if (suite.$schema !== "../case.schema.json") errors.push(`${filename}: $schema 必須指向 ../case.schema.json`);
		if (suite.schema_version !== 1) errors.push(`${filename}: schema_version 必須為 1`);
		if (!suite.skill || typeof suite.skill.name !== "string" || typeof suite.skill.path !== "string") {
			errors.push(`${filename}: skill identity 不完整`);
			continue;
		}

		const expectedFilename = `${suite.skill.name}.json`;
		if (filename !== expectedFilename) errors.push(`${filename}: 檔名必須是 ${expectedFilename}`);
		suiteSkillNames.add(suite.skill.name);
		const skillPath = resolve(ROOT, suite.skill.path);
		if (!existsSync(skillPath)) {
			errors.push(`${filename}: skill path 不存在 → ${suite.skill.path}`);
		}
		else {
			const skillText = readFileSync(skillPath, "utf8");
			const skillName = skillText.match(/^name:\s*(.+)$/m)?.[1]?.trim();
			if (skillName !== suite.skill.name) errors.push(`${filename}: skill.name 與 frontmatter 不一致`);
		}
		if (typeof suite.purpose !== "string" || suite.purpose.length < 20) errors.push(`${filename}: purpose 缺失或過短`);
		if (typeof suite.owner !== "string" || suite.owner.length < 10) errors.push(`${filename}: owner 缺失或過短`);
		if (!Array.isArray(suite.non_goals) || !suite.non_goals.length) errors.push(`${filename}: non_goals 不得為空`);
		if (!Array.isArray(suite.cases)) {
			errors.push(`${filename}: cases 必須是 array`);
			continue;
		}

		const seenCaseIds = new Set();
		for (const caseDefinition of suite.cases) {
			validateCaseDefinition(caseDefinition, seenCaseIds);
			if (caseDefinition.fixture && !existsSync(resolve(casesDir, caseDefinition.fixture))) {
				errors.push(`${caseDefinition.id}: fixture 不存在 → ${caseDefinition.fixture}`);
			}
		}
		const count = (kind) => suite.cases.filter((item) => item.kind === kind).length;
		if (count("positive") < 3) errors.push(`${filename}: 至少需要 3 個 positive cases`);
		if (count("negative") < 2) errors.push(`${filename}: 至少需要 2 個 negative cases`);
		if (count("collision") < 1) errors.push(`${filename}: 至少需要 1 個 collision case`);
		if (!suite.cases.some((item) => item.mode === "behavior")) errors.push(`${filename}: 至少需要 1 個 behavior case`);
	}

	const skillsDir = join(ROOT, "skills");
	for (const skillName of readdirSync(skillsDir)) {
		if (!statSync(join(skillsDir, skillName)).isDirectory()) continue;
		if (!suiteSkillNames.has(skillName)) errors.push(`skills/${skillName}: 缺少 evals/cases/${skillName}.json`);
	}
}

function* markdownFiles(directory) {
	for (const entry of readdirSync(directory)) {
		if ([".git", "node_modules", "results"].includes(entry)) continue;
		const path = join(directory, entry);
		if (statSync(path).isDirectory()) yield* markdownFiles(path);
		else if (/\.(md|template)$/.test(entry)) yield path;
	}
}

function validateMarkdownLinks() {
	for (const file of markdownFiles(ROOT)) {
		const text = readFileSync(file, "utf8");
		const relativeFile = file.slice(ROOT.length + 1).replaceAll("\\", "/");
		for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
			const target = match[1].split("#")[0].trim();
			if (!target || /^(https?|mailto):/.test(target)) continue;
			if (target.includes("<") || target.includes("〔")) continue;
			if (!existsSync(resolve(dirname(file), target))) errors.push(`${relativeFile}: 壞連結 → ${target}`);
		}
	}
}

function validateMcp() {
	const posixPath = join(ROOT, "mcp", "mcp-config.example.json");
	if (!existsSync(posixPath)) return;

	const windowsPath = join(ROOT, "mcp", "mcp-config.windows.example.json");
	const posix = readJson(posixPath);
	const windows = readJson(windowsPath);
	if (!posix || !windows) return;

	const keys = (config) => Object.keys(config.mcpServers).sort().join(",");
	if (keys(posix) !== keys(windows)) errors.push("mcp 兩份範例的 server 清單不一致");
	if (keys(posix) !== "playwright") errors.push("mcp 預備工具只能包含明確選用的 playwright");

	const expectedPackage = "@playwright/mcp@0.0.80";
	for (const [platform, server] of [["POSIX", posix.mcpServers.playwright], ["Windows", windows.mcpServers.playwright]]) {
		if (!server?.args?.includes(expectedPackage)) errors.push(`${platform} playwright 未固定為 ${expectedPackage}`);
		if (!server?.args?.includes("--isolated")) errors.push(`${platform} playwright 缺 --isolated`);
		if (!server?.args?.includes("--timeout-idle=300000")) errors.push(`${platform} playwright 缺 idle timeout`);
	}
	if (posix.mcpServers.playwright?.command !== "npx") errors.push("POSIX playwright command 必須為 npx");
	if (windows.mcpServers.playwright?.command !== "cmd" || windows.mcpServers.playwright?.args?.[0] !== "/c") {
		errors.push("Windows playwright 必須使用 cmd /c");
	}
}

validateSkills();
validateDistribution();
validateEvalSuites();
validateMarkdownLinks();
validateMcp();

for (const warning of warnings) console.log("WARN:", warning);
if (errors.length) {
	for (const error of errors) console.error("ERROR:", error);
	console.error(`\n驗證失敗：${errors.length} 個錯誤`);
	process.exit(1);
}
console.log(`驗證通過（${warnings.length} 個警告）`);
