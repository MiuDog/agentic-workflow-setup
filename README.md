# Agentic Workflow Setup

一套正在重製的可攜式 Agent 工作制度。它把使用者決策轉成精簡、可交接的現行規格，並以明確的模組邊界、角色隔離與按風險擴張的驗證尺度支援後續開發。

0.3.0 提供可用的 DEFINE → PLAN → BUILD → VERIFY 生命週期，以及跨階段的低上下文管理。七個舊版 catch-all skills 已退出安裝內容；每個新版 skill 只有一個可辨識 owner，並以案例與本機 registry 累積後續保留證據。

## 安裝

需求：Node.js 18 或以上。Standalone 與 plugin 擇一，避免同名 skill 重複出現。

```bash
# 在目標專案根目錄安裝 Codex、Claude Code、Gemini CLI 與 Antigravity
npx --yes github:MiuDog/agentic-workflow-setup -- --platforms codex,claude,gemini,antigravity --verify

# UI 工作確實需要瀏覽器證據時才選用 Playwright MCP
npx --yes github:MiuDog/agentic-workflow-setup -- --tools playwright

# 安裝到個人 scope，不建立專案入口檔
npx --yes github:MiuDog/agentic-workflow-setup -- --scope user --platforms codex,claude,gemini,antigravity --verify
```

安裝器把 Codex、Gemini CLI 與 Antigravity 的專案 skills 共用於 `.agents/skills/`，Claude Code 使用 `.claude/skills/`。入口檔只在不存在時建立；lockfile 讓升級與移除保留專案自行修改的檔案。`--tools playwright` 只支援 project scope，會依平台非破壞性更新正確的 MCP 設定位置；未指定時不修改 MCP。

OpenAI 與 Claude 的 CLI／UI plugin 安裝、Windows 路徑、使用者 scope、Gemini 與 Antigravity 差異，見 [安裝與平台指南](docs/installation.md)。

常用參數：`--scope project|user`、`--dry-run`、`--verify`、`--uninstall`、`--platforms codex,claude,gemini,antigravity`、`--tools playwright`、`--force`。舊 `agents` 名稱只保留為 `codex` 相容別名。

## 目前內容

| 路徑 | 狀態與用途 |
| --- | --- |
| `skills/spec-driven-development/` | 已發行；以產品 PM 角色將簡略想法轉成 P1–P3 規格表並套用 99% readiness gate |
| `skills/planning-and-task-breakdown/` | 已發行；以技術 PM 角色維護單一 module 架構並只拆解目前 stage |
| `skills/incremental-implementation/` | 已發行；只在 Task Packet 的單一 module write boundary 內完成目前 BUILD slice |
| `skills/test-driven-development/` | 已發行；由獨立 Test Author 只為具體風險撰寫必要 deterministic code checks |
| `skills/debugging-and-error-recovery/` | 已發行；已有 failure 時依 Red → Yellow → 最小 Green fallback 診斷與修復 |
| `skills/lean-development/` | 已發行；只在長 session、交接或流程成本問題出現時管理上下文、協調與驗證尺度 |
| `AGENTS.md` | 維護本 repository 的 intent 路由、生命週期與 anti-rationalization 規則，不複製到消費專案 |
| `docs/build-execution-contract.md` | PLAN 與委派 BUILD 的模組邊界、角色、Task Packet、測試狀態與評估契約 |
| `docs/evaluation-contract.md` | 判定 skill 新增、重製、合併、保留或淘汰所需的路由、行為與成本證據 |
| `evals/case.schema.json`、`evals/cases/` | 可機讀的 skill identity、routing、behavior 與 rubric 定義 |
| `evals/task-registry.schema.json` | 本機歷史 task、事前預估、實際成本、milestones、流程異常與跨任務 A/B 的資料契約；不保存原始 prompt |
| `scripts/run-evals.mjs` | 透過明確提供的 adapter 在隔離 workspace 產生 baseline／treatment 證據 |
| `scripts/task-registry.mjs` | 將 runner summary 轉成 pending candidate，由獨立 evaluator finalize，驗證後重建不可變歷史 view |
| `scripts/analyze-task-registry.mjs` | 計算 eligible tasks、估算校準、stage 分布與 experiment variant 描述統計；以相同 stage／task type 的鄰近歷史建立 Q10–Q90 預估 |
| `templates/` | 跨平台入口與 Task Packet 模板 |
| `mcp/` | 唯一預備外接工具 Playwright；需要 rendered evidence 時才明確選用 |
| `plugin.json`、`.codex-plugin/`、`.claude-plugin/` | OpenAI portable／compatibility 與 Claude plugin 分發入口 |

## 目標生命週期

只在進入對應階段時載入該 skill，不在 session 開始時預載整套流程。

| 階段 | Skill | 發行狀態 |
| --- | --- | --- |
| DEFINE | `spec-driven-development` | 已建立 |
| PLAN | `planning-and-task-breakdown` | 已建立 |
| BUILD | `incremental-implementation`；風險成立時由隔離角色使用 `test-driven-development` | 已建立 |
| VERIFY | 一般 deterministic checks；失敗後才用 `debugging-and-error-recovery` | 已建立 |

`lean-development` 是跨階段、按需載入的成本管理者，不取代 phase owner，也不應因普通小修改自動載入。

## 核心界線

- 人類討論先轉譯成一份現行規格；worker 不直接承接原始對話與失效決策。
- P1 是 target release blocker；P2 是不阻擋目標發布的重要後續；P3 是預設不進目前計畫的延後項。99% readiness 以無未解 P1 與可觀察證據判定，不由 agent 自報機率。
- 0→1 階段只定義可完成的核心流程，不主動討論視覺品味、動畫手感或其他感官 polish；必要操作狀態與 accessibility 仍屬功能要求。
- DEFINE 固定單一 owning module、跨 module 公開接口與完整版本 capability horizon；PLAN 只把目前 stage 轉成架構與 slices，後續版本只作為避免封死接口的設計壓力。
- Parser、DTO、entity、repository 等角色不是固定層級；只有存在不同變更原因、不變量或已接受擴充需求時才分離。
- PLAN 建立實際 module root 與受保護的 `architecture.md`；BUILD worker 只能在指定 module 內工作，且不能改 architecture 或測試擁有者的路徑。
- 每個實作 task 在派發前依可比較的歷史資料預估 token／完成時間範圍，並定義少量可觀察 milestones；worker 只在 milestone 完成時回報結構化 checkpoint。
- Process Evaluator 只檢查流程、範圍、權限、checkpoint 與成本偏差；hard anomaly 立即停下並修正權威流程。不同流程可跨可比較 tasks 做預先登記的 A/B，但單次結果不宣告勝負。
- Agent 只判定 deterministic code evidence。視覺品質、互動手感、易用性等感官成果只能整理證據交由人類接受。
- 測試依 Red → Yellow → Green fallback 擴張：先重現已知失敗，再檢查本次變更；已有有效證據且未改動的 Green 範圍預設不測。
- 同一規則只有一個權威位置。可機械執行的限制進腳本或隔離環境，不靠重複文字提醒。

## 維護與評估

任何 skill 的新增或保留都必須依 [evaluation contract](docs/evaluation-contract.md) 準備正向路由、負向路由、碰撞案例、baseline/treatment 行為及成本資料。CI 通過只表示格式與安裝流程有效，不表示 skill 有實際產值。

本機 runner 不會自行選擇或付費呼叫模型。使用 `npm run eval -- --adapter <adapter-module.mjs>` 明確提供 adapter；adapter 必須先以 `estimate(request)` 回報事前 token／時間範圍，再以 `run(request, estimate)` 執行。結果按單一 task 寫入已忽略版控的 `evals/results/`，保存實際偏差與 milestones，等待獨立 evaluator 判讀 semantic checks。

本機 recorder／validator 的 pending → finalized 流程見 [本機 Task Registry](docs/task-registry.md)。形式化成熟度、cohort 距離、預估校準、routing confusion matrix、skill 增量與 A/B 樣本規則，見 [研究依據與形式化路線](docs/research-and-formalization.md)。完成 registry 驗證後可直接產生描述統計：

```bash
npm run registry -- validate
npm run analyze:tasks -- summary
```

License: MIT。
