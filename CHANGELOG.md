# Changelog

本套組遵循 [SemVer](https://semver.org/lang/zh-TW/)。每節寫「對使用者的影響」，不是 commit 清單。

## [Unreleased]

## [0.3.0] - 2026-09-14

### Added
- OpenAI portable plugin、Codex compatibility manifest、repo marketplace、Claude Code plugin 與 marketplace，可由 CLI 或支援的 Plugins UI 安裝同一套 skills。
- `docs/installation.md`：Codex、Claude Code、Gemini CLI、Antigravity，以及 Windows／macOS／Linux 的 project/user scope、CLI/UI 與 MCP 安裝指南。
- `docs/research-and-formalization.md`：F0–F4 成熟度、eligible cohort、歷史距離、Q10–Q90 預估、校準、routing、skill 增量、A/B power 與採用 gate。
- `scripts/analyze-task-registry.mjs`：零依賴 task registry 描述統計、校準與 historical estimate 工具。
- GitHub CLI `gh skill install` 的跨 agent skill-only 路徑，以及 `gh skill publish --dry-run` 發行 preflight。
- Task registry schema v3，把 A/B assignment、alpha、power、minimum practical effect、樣本數依據、fixed-horizon bootstrap、effect interval、執行時間邊界與失敗紀錄變成可驗證欄位。
- `scripts/task-registry.mjs`：將 runner summary 冪等轉成 pending candidates，由獨立 evaluator finalize；以 evidence SHA-256、時間順序、token 加總、milestone 與歷史引用規則重建本機 registry view。
- `evals/task-registry.schema.json`：以單一 task 保存 cohort、執行環境、事前預估、實際 token／時間、milestones、anomalies 與流程實驗 variant，並要求 A/B 預先登記單一變因與停止條件。
- 單一 task 的事前 token／完成時間預估、milestone checkpoint、流程異常分級及跨任務 A/B 實驗契約；Process Evaluator 僅檢查流程，不介入產品與程式語意。
- 結構化 eval case schema、`spec-driven-development` case suite，以及 provider-neutral baseline／treatment 本機 runner；模型或 credential 必須透過 adapter 明確提供。
- `docs/evaluation-contract.md`：以 baseline、行為改善、成本及 machine／human 分工決定 skill 的新增與保留。
- Repository `AGENTS.md`：提供精確 intent-to-skill 路由、可縮放生命週期、執行模型與 anti-rationalization，不作為安裝模板。
- `skills/spec-driven-development`：新版 DEFINE 入口，將簡略想法轉為經人類接受、可供後續 agent 使用的單一現行規格。
- `skills/planning-and-task-breakdown`：新版 PLAN 入口，以 capability horizon 指導單一 module 的架構取捨，但一次只規劃 current target stage。
- `skills/incremental-implementation`：新版 BUILD worker，只在接受的 Task Packet 與單一 module write boundary 內完成目前 slice。
- `skills/test-driven-development`：獨立 Test Author，只為明示或高風險行為撰寫必要 deterministic code checks，不把感官成果轉成測試。
- `skills/debugging-and-error-recovery`：已有可重現 failure 後才進入，依 Red → Yellow → 最小 Green fallback 診斷與修復。
- `skills/lean-development`：跨階段管理 current-truth capsule、按需檢索、低溝通派工與按證據擴張的驗證成本。
- `docs/build-execution-contract.md`：定義 module root、受保護的 `architecture.md`、Task Packet、角色隔離與 Red → Yellow → Green fallback。
- `setup.mjs --tools playwright`：明確選用 Microsoft Playwright MCP，提供 UI snapshot、screenshot 與互動證據。
- Windows installer CI，驗證 MCP 的 `cmd /c` 包裝、skill 安裝與安全移除。

### Changed
- 版本提升至 `0.3.0`；安裝平台改為 `codex`、`claude`、`gemini`、`antigravity`，並保留 `agents` 作為 `codex` 的相容別名。
- Codex Playwright MCP 改寫入官方 `.codex/config.toml`；`.agents/mcp_config.json` 明確歸屬 Antigravity。Gemini 與 Codex 的專案 skills 共用 `.agents/skills/`。
- 安裝器新增 `--scope project|user`；user scope 不修改入口檔或全域 MCP。
- DEFINE 與 PLAN skill descriptions 移除重複措辭並保留互斥觸發邊界，降低未載入 skill 前的 catalog context 成本。
- Routing eval 的 baseline 現在保留非目標 skills，treatment 使用完整 skill catalog；碰撞與誤觸發不再於只有單一候選的人工環境中測量。
- Eval adapter 改為先執行 `estimate(request)` 再執行 `run(request, estimate)`；runner 保存 task-level token、duration、range status 與 milestone evidence。
- DEFINE 改由 agent 以產品 PM 角色產出 P1–P3 規格表；以可稽核 checklist 落實 99% readiness，並在 0→1 排除非必要感官 polish 討論。
- DEFINE 增加 owning module、跨 module 公開接口與完整版本 capability horizon；PLAN 依具體責任與變化壓力選擇或合併 parser、DTO、entity、repository 等角色，不套用固定分層。
- 外接工具不再預設注入；沒有 `--tools` 時，安裝器不建立或修改 MCP 設定。
- 移除 `sequential-thinking`、`memory` 與 `context7` 預備配置，只保留與 `ui-convergence` 有直接能力缺口的 Playwright。
- repository 與安裝指令更新為目前的 `MiuDog` owner。
- 七個舊版 skills、舊入口路由與 legacy eval 已退出發行；模板改為完整生命週期路由與 Task Packet 邊界。
- Skill 行數由硬性 120 行上限改為 200 行膨脹警示；實際保留仍以行為與成本證據決定。

## [0.2.1] - 2026-07-06

### Fixed
- `setup.mjs --uninstall` 現在會清除因移除而空掉的目錄（CI 端到端測試抓到的漏洞；
  根因是 rmSync 對目錄拋錯被空 catch 吞掉——已改為 rmdirSync + 顯式空目錄檢查）。

## [0.2.0] - 2026-07-06

### Added
- `setup.mjs`：零依賴 Node 安裝器——偵測平台（.claude/.agents/.gemini）、複製 skills、
  非破壞性合併 MCP 配置（自動填 `MEMORY_FILE_PATH`、Windows 自動加 `cmd /c`）、
  入口檔不存在才建立、寫入 lockfile（版本+檔案 hash）；支援 `--dry-run` / `--uninstall` / `--verify`。
- `scripts/validate.mjs`：frontmatter 合規、SKILL.md ≤120 行、markdown 相對連結存在性檢查（CI 與本地共用）。
- GitHub Actions CI（validate + setup 自測）。
- `templates/AGENTS.md.template`：Codex 等讀 AGENTS.md 的工具用；平台矩陣入 README。
- `evals/scenarios.md`：8 個行為場景（模糊需求→批次提問、二連敗→停手等），供人工或 agent 回歸驗證。
- CONTRIBUTING.md、.gitignore；七個 SKILL.md frontmatter 補 `license` 與 `metadata.version`。

### Changed
- README 安裝節改為腳本安裝為主、手動 `cp` 為備援；平台矩陣加 Codex（借道 `.agents/skills`）。
- MCP_SETUP 加「最後實測可用版本」欄與更新程序（回應 supply-chain/漂移風險）。
- maintenance.md 新增「上游↔專案更新通道」（lockfile 三方合併規則）。

## [0.1.0] - 2026-07-05

初版：7 個模型中立 skills、3 份入口/派工模板、MCP 配置指南、維護協議。
經一輪 fresh-context 對抗審查修復 13 項問題。
