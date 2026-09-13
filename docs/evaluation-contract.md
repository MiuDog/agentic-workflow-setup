# Skill Evaluation Contract

本文件定義這個 repository 中每個 skill 在新增、重製、發佈與保留前必須提供的最小證據。
目標不是證明規範寫得完整，而是回答兩個問題：skill 是否改進 agent 的實際行為，以及改善是否值得它帶來的上下文與流程成本。

## 核心原則

1. 比較相同任務在沒有 skill 與載入 skill 時的結果。
2. 優先驗證可觀察產物與不變量，不以特定措辭、章節或自我宣稱作為成功證據。
3. 機器負責客觀且容易漏看的問題；人類負責視覺、互動、UX 與其他主觀品質。
4. 成本與成果一起記錄。沒有行為改善的額外步驟視為負擔。
5. 使用 fresh context 執行各次評估，避免前一次結論污染下一次結果。
6. 評估只授權 fixture 內的操作，不擴張原始任務的權限與範圍。

## 每個 Skill 的最小評估資料

每個 skill 必須擁有一份同名 case file，未來統一放在 `evals/cases/<skill-name>.json`。case file 至少包含以下四部分。

### 1. Identity

- `skill_name`：必須與目錄和 frontmatter `name` 相同。
- `purpose`：一句可被觀察的行為改變，不是內容摘要。
- `owner`：該 skill 唯一負責的能力邊界。
- `non_goals`：最可能與它混淆、但不應由它處理的工作。

### 2. Routing Cases

最低案例數：

- 3 個正向 prompt，使用者沒有直接說出 skill 名稱。
- 2 個負向 prompt，並指出真正應負責的 skill 或「不需要 skill」。
- 1 個 collision prompt，刻意接近最相似的另一個 skill。

路由評估記錄：

- 正向 Top-1 命中率。
- 負向誤觸發率。
- collision 的正確歸屬。
- description 字元數及所有已安裝 skills 的 description 總量。

詞彙相似度只能作為早期警告，不能代替真實 agent 的選擇結果。

### 3. Behavioral Cases

每個 skill 至少需要一個可重現的代表性任務。每個任務都必須包含：

- 相同的 prompt、fixture、模型與工具權限。
- 一次不提供 skill 的 baseline run。
- 一次提供 skill 的 treatment run。
- treatment 不得看到 baseline 的結果或評語。
- 明確的機器檢查與人類驗收項目。
- 可辨認 skill 是否造成範圍外修改、阻塞或不必要提問的紀錄。

若模型輸出波動足以改變結論，增加獨立 runs，而不是挑選最有利的一次結果。

### 4. Cost Record

成本的最小計量單位是一個已派發 task；baseline 與 treatment 各自是獨立 task，不合併成 session 平均值。每次 behavioral run 至少記錄：

- 任務是否成功。
- 派發前預估的 total token 範圍與完成時間範圍。
- 預估依據：可比較的歷史 task IDs、模型、工具與重要假設；無歷史資料時必須標成 `cold-start`，不得假裝精確。
- `SKILL.md` 與實際載入 references 的 bytes。
- 對話 turns。
- 工具呼叫數。
- 使用者被要求回答或核准的次數。
- 修改檔案數與範圍外修改數。
- 從實作派發到 final 的完成時間。
- provider 提供的 input、output 與 total tokens，並以 `provider`、`estimated` 或 `unavailable` 標示量測方式；自行估算時記錄方法，無法取得時保留 `null`，不得把字元數偽裝成精確 token usage。
- 實際值相對事前範圍的 `under`、`within-range`、`over` 或 `unknown`。
- 每個預先定義 milestone 的累積 tokens、elapsed time、證據與偏差說明。

與 retrieval 有關的 skill 另外記錄：

- implementation 前讀取的 source files 數量。
- repository-wide searches 次數。
- 是否在修改前找到正確 owning module。

這些數字用來比較 baseline 與 treatment，不設定跨所有技術棧的單一硬上限。

### 派發前預估與里程碑

預估必須在 worker 開始執行前完成。優先取用相同任務類型、相近複雜度、相同模型層級與工具權限的已完成 task；預估以範圍呈現，不使用單點承諾。歷史資料不足時仍可派發，但要標示 cold-start，並在完成後把這次結果納入後續校準資料。

實作 task 在派發前拆成少量、可觀察且連續的 milestones。Milestone 是一個可驗證的小結果，不是每個檔案或 shell command。Worker 每完成一個 milestone 只送一次結構化 checkpoint，包含 milestone ID、證據、changed paths、累積 tokens、elapsed time、與事前預估的偏差及下一個 milestone。沒有異常時，主 agent 不回覆，worker 直接繼續，以保留自主性並避免頻繁溝通。

## Active Process Evaluation

開發中的 Process Evaluator 與離線 skill behavior judge 是不同角色：

- Process Evaluator 只檢查 scope、讀寫權限、受保護檔案、契約、checkpoint 完整性、測試狀態及 token／時間偏差；不評論產品需求、架構內容、程式語意或測試正確性。
- Skill behavior judge 在 task 結束後用 fresh context 判讀 case rubric；它不介入正在執行的 task，也不修改工作流程。

Hard anomaly，例如越界修改、違反 permission、改動受保護檔案或跳過必要測試狀態，必須立即中止目前 task、修正唯一權威的流程檔或 Task Packet，再重新派發。Soft anomaly，例如超出預估、checkpoint 缺證據或出現不必要對話，應在下一 milestone 前修正流程，但不得藉此改寫產品需求或架構決策。

## Cross-Task Process Experiments

流程 A/B 只能分派到不同且可比較的真實 tasks，不為了實驗重做同一份使用者成果。開始前必須預先登記：假設、唯一變因、納入條件、成功與安全指標、預計樣本與停止條件。模型層級、工具權限、任務類型與複雜度應盡量配對，並以 task-level total tokens、完成時間、anomaly、rework 與成功結果比較。

單一 task 只能指出異常或提供校準資料，不能宣告某個流程勝出。違反 protocol、越界或中途改需求的 task 保留在稽核紀錄，但排除於 variant 勝負統計。Skill baseline/treatment 是同題能力評估；跨任務 A/B 是工作流程實驗，兩者不得合併解讀。

可比較 cohort、eligible task、Q10–Q90 成本範圍、coverage／APE、routing confusion matrix、power 與 treatment adoption 的公式，統一由 [研究依據與形式化路線](research-and-formalization.md) 定義。不得在個別 skill 另寫一套計算方式。

## Verification Ownership

每一項 expectation 必須標記為 machine、evaluator 或 human。Machine 只處理 deterministic checks；fresh-context evaluator 判讀文字或決策是否符合 rubric；human 只負責感官與產品接受。

### Machine Verification

Agent 撰寫的測試只負責 deterministic 程式行為與可機械判定的不變量，不為感官品質設計測試。

適合交給 deterministic checker 的項目包括：

- 編譯、型別、靜態分析與測試結果。
- 資源、記憶體、競態與穩定性問題。
- dependency、ownership 與 architecture boundary。
- serialization、persistence 與資料不變量。
- 效能、allocation、startup、latency 與 memory regression。
- 檔案格式、可解析性、連結與安裝器冪等性。

每個 machine check 必須記錄可重跑的 command 或 script、exit code，以及必要的輸出摘要。

### Human Acceptance

以下項目預設由人類驗收：

- 視覺品質與資訊層級。
- layout、animation 與 interaction feeling。
- UX、usability、workflow quality 與產品語意。

agent 可以準備實際 build、screenshot、錄影、重現步驟與已由人類接受的觀察清單，但不得自行設計 snapshot、golden、影像相似度或 LLM 視覺評分來取代感官驗收，也不得自評為通過。程式互動造成的 deterministic state transition 可以測試；其視覺品質與操作體感仍由人類判定。

## Test-State Routing

產品開發的測試路由以 `docs/build-execution-contract.md` 的 Red／Yellow／Green fallback 定義為唯一權威。燈號只能由目前 revision、changed paths 與 code-check 結果轉換，不使用 human acceptance。每次 behavioral eval 必須記錄各狀態的證據、實際執行命令、是否在非綠範圍尚未排除前測試 Green，以及是否執行了不必要的全庫測試。

## Baseline 與 Regression

能量測修改前後差異時，優先使用相對 baseline：

`regression = (treatment - baseline) / baseline`

門檻由個別 skill 或 fixture 根據風險設定，例如 memory、startup 或檔案探索量的允許增幅。禁止為了讓結果通過而在同一次評估中調寬門檻。

行數、目錄深度、讀取檔案數等 budget 是診斷 signal，不是成功證據。超過 budget 應觸發檢查理由；只有可證明會破壞正確性或維護性的條件才設為 hard gate。

## Release Gate

skill 只有同時滿足下列條件才能新增或發佈：

- 靜態結構與引用驗證通過。
- 正向、負向與 collision cases 已執行並保存結果。
- treatment 沒有比 baseline 增加 correctness、scope 或 permission regression。
- 至少一個代表性案例能證明行為改善，或提供 baseline 無法可靠完成的 deterministic capability。
- 所需 scripts、tools 與 MCP dependencies 已宣告且實際可用。
- 成本已記錄，沒有明顯高於收益的額外流程。

主觀品質尚待人類驗收時，結果必須標成 pending，不得由 agent 自評為通過。

## Retain、Revise、Merge、Retire

- **Retain**：代表性案例持續有可觀察收益，且責任邊界唯一。
- **Revise**：有收益，但誤觸發、成本或阻塞明顯偏高。
- **Merge**：兩個 skills 的案例、觸發詞與成果差異不足以支持分開維護。
- **Retire**：沒有優於 baseline、能力已由 agent 或工具原生提供，或長期沒有實際案例。

任何新增規範都應對應一個真實失敗案例。單次特殊事件優先修正 case、description 或局部指引，不直接擴張成全域硬規則。

## 工具分層

預計採用下列順序實作，不一次建立完整平台：

1. CI 執行免費且確定性的結構、引用、case schema 與安裝器檢查。
2. 本機 runner 在隔離的暫存 Git repository 執行 baseline 與 treatment。
3. 優先以 scripts 檢查實際產物；無法機械判斷時才使用 LLM judge。
4. 視覺與 UX 結果保留給人類驗收，工具只提供 screenshot、trace 與差異證據。
5. MCP 或其他外部 dependency 由真正需要它的 skill 個別宣告，不作為整個套件的預設負擔。

目標檔案配置如下；只有在對應功能開始實作時才建立檔案，避免空目錄與占位工具：

- `evals/cases/<skill-name>.json`：路由、行為與成本契約。
- `evals/task-registry.schema.json`：跨 tasks 的估算校準與流程 A/B 資料契約；實際 registry 屬本機 eval evidence，不納入版本控制。
- `evals/task-record.schema.json`：pending／finalized record envelope、runner evidence 路徑與 SHA-256 契約。
- `evals/cohort-packet.schema.json`、`evals/task-evaluation.schema.json`：事前 cohort assignment 與獨立流程判讀的輸入契約。
- `scripts/task-registry.mjs`：冪等 ingest、不可覆寫 finalize、semantic validation 與 generated registry view。
- `scripts/analyze-task-registry.mjs`：對 registry 計算 eligible、校準與分層描述統計，並依可比較歷史提出事前範圍；少於五筆時只回報 cold-start，不偽造 historical estimate。
- `evals/fixtures/<skill-name>/<case-id>/`：可重現輸入。
- `evals/results/`：本機結果，不納入版本控制。
- `scripts/validate.mjs`：免費 deterministic gates。
- `scripts/run-evals.mjs`：在獨立 process／workspace 中建立 baseline 與 treatment evidence。
- `scripts/eval-adapter-worker.mjs`：每個 variant 的一次性 adapter process。

Adapter module 必須 export `async function estimate(request)` 與 `async function run(request, estimate)`。Runner worker 先取得並驗證 historical 或 cold-start 的 token／時間範圍，才允許 `run` 開始。`run` 回傳 `response`、實際 `selected_skill`、相對 artifact paths、可取得的 metrics、milestone checkpoints，以及 `execution` 中的 provider、model、reasoning、tools 與 permissions。Runner 分別保存預估、實際 total tokens、task duration 與範圍偏差，並自動比較兩個 variants 的 execution metadata；不一致就是失敗。Baseline 暴露除目標以外的現有 skill catalog，treatment 暴露完整 catalog；routing treatment 只將目標 skill 標成 discoverable，behavior treatment 才標成 preload。Baseline 不取得目標 skill 的內容、路徑或 description。Request 不包含 expected owner、rubric、baseline output 或 retention decision。

Runner 預設只繼承啟動 Node 所需的安全環境變數。Adapter 需要 credential 或其他環境值時，操作者必須用重複的 `--pass-env KEY` 明確傳入；建立 runner 本身不授權任何模型呼叫、網路存取或費用。

Runner summary 不可直接成為 historical evidence。提供 `--registry-dir` 與 `--cohort` 時，runner 只建立 pending candidates；cohort 不得從 prompt 或結果事後推測。獨立 evaluator 只能補上 result 與 anomalies，不能改寫 execution、estimate、actual 或 milestones。Finalized record 以 task ID 保持不可變，來源 summary 必須通過 SHA-256 驗證；只有 validator 通過後才重建供 analyzer 使用的 `task-registry.json`。

獨立 process 與 temp workspace 只隔離每次 run 的可變狀態，不是檔案讀取 ACL。需要限制 adapter 能看見的檔案時，必須由 adapter 在 container、sandbox 或裁切後的 workspace 中啟動 agent；runner 不得宣稱僅靠 `cwd` 已完成嚴格讀取隔離。

## 現有內容的遷移狀態

`evals/cases/` 已為目前發行的 DEFINE、PLAN、BUILD、獨立測試、failure recovery 與 lean-context skills 提供正向、負向、collision 與代表性 behavior cases。Runner 能強制 adapter 先預估再執行、保存每個 task 的 token／時間偏差與 milestone 證據，並自動比對 adapter 回報的 Top-1 routing；semantic behavior checks 與 retain／revise 決策仍需 fresh-context evaluator，因此 case 完整與 CI 通過不能單獨證明任一 skill 有效。

`scripts/validate.mjs` 目前負責免費的結構與引用基線。Skill 接近 200 行時只發出膨脹警示；保留或拆分仍由實際 routing、behavior 與 cost evidence 決定，不以行數單獨裁決。
