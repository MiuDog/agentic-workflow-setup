# Build Execution Contract

本文件是 delegated BUILD 的單一現行契約，定義模組邊界、角色、資訊暴露、agent 通訊與流程評估。未來的 BUILD skills、agent profiles、task templates 與 enforcement scripts 必須引用本文件，不得各自重寫一套規則。

## 約束層級

1. `AGENTS.md` 與 skills 負責路由及決策原則，不能被當成檔案權限機制。
2. machine gate 負責檢查實際 diff、依賴方向、受保護測試與 task manifest。
3. sandbox 或裁切後的工作區負責真正的讀寫邊界。若環境沒有提供此能力，必須明示只有行為規範，不能宣稱已限制讀取。

## 單一現行來源

- Human Spec：給人類審閱的單一 module 產品責任、跨 module 公開接口、P1–P3 與 capability horizon；不包含 module 內部架構。
- Module Contract：每個 module root 的 `architecture.md`，保存該模組架構、任務邊界與允許依賴的單一現行定義。
- Task Packet：由 Planner 或 Architecture Steward 從 Human Spec 與 module `architecture.md` 轉譯而成，只包含 worker 完成本次 slice 所需資訊。
- Eval Evidence：保留每次執行的客觀證據，不作為下一位 worker 的預設閱讀來源。

決策改變時直接更新權威檔案的現行內容，並重新產生 Task Packet。不得在文件尾端追加「新決策否定舊決策」讓 agent 自行裁決；歷史由版本控制保存。Task Packet 必須記錄來源 revision 或 content hash，過期封包不得執行。

## PLAN 產物與 module root

- Planner 一次只維護一個 module 與一個 target stage。在 BUILD 前建立已接受的實體目錄架構，例如 `src/game/`，並在 module root 建立 `architecture.md`。Capability horizon 只用來辨認變化軸，不建立未來版本的預留 module、空白層或 slices。
- module root 是該 BUILD subagent 的預設工作目錄與最大操作邊界。嚴格讀取環境只暴露這個 root、明示的共通 contract 與必要 build artifact。
- `architecture.md` 至少保存 module purpose／non-goals、current target stage、capability horizon、owned paths、public interface、internal responsibility map、選用模式及取捨、共通 spec revision、允許與禁止依賴、資料與生命週期不變量、目前 slices、acceptance criteria、test state，以及 tests／fixtures 等 protected paths。
- `architecture.md` 是未來維護此 module 的第一讀取來源。維護 agent 不預設讀取 Human Spec、歷史計畫、對話紀錄或其他 module 內部來源。
- 初次建立與一般計畫更新由 Planner 寫入；跨 module 或架構調整由 Architecture Steward 更新。BUILD Worker、Test Author 與 Process Evaluator 一律唯讀，不得修改、補充或格式化此檔。
- 決策更新直接替換 `architecture.md` 的現行段落並產生新 revision；Planner 或 Architecture Steward 隨後重新簽發 Task Packet。BUILD 期間若需要修改此檔，必須依 Architecture Change Request 停止並退回。

## Task Packet

每個 BUILD worker 只接收一個有界封包，至少包含：

- `task_id`、目標與目前 slice。
- `module_root`、`architecture_path`、`architecture_revision` 與唯一責任邊界。
- `allowed_read`、`allowed_write` 與 `forbidden` 路徑；未列出的路徑預設禁止。
- 所需 `architecture.md` 與共通 contract 的精簡摘錄及 revision，不附完整人類討論、替代方案或已被取代的決策。
- 可觀察 acceptance criteria、`test_state`、必要程式碼檢查、獨立的 human acceptance 狀態與完成證據格式。
- 派工前完成的 token／elapsed-time 預估區間、歷史參考 task IDs、模型與工具假設；沒有可比較歷史時標成 `cold-start`，不得偽造精準度。
- 預先定義的 milestones；每個 milestone 包含可觀察 outcome、evidence、預期累積 token／時間與 anomaly threshold。
- 可回報 blocker 的條件，以及超出邊界時的停止方式。

轉譯必須保留可觀察行為、明示限制與尚未決定的事項。不得把人類對話原文、完整規格庫或另一個 module 的實作來源直接交給 worker，期待它自行找出哪些內容有效。

## 模組隔離

- BUILD 預設只允許修改 Task Packet 指定的單一 module root，且明確排除其中的 `architecture.md` 與 test-owned protected paths。共通 spec、build 設定與其他 module 均不因「完成工作所需」而自動取得寫入權。
- 跨 module 溝通必須先存在於各自 `architecture.md` 引用的共通 contract。worker 只能使用公開 contract 或已提供的 build artifact，不得閱讀另一個 module 的內部實作來推導隱含協議。
- 發現 contract 不足、循環依賴或必須修改其他 module 時，worker 停止越界工作並回傳 Architecture Change Request，內容只包含衝突、所需能力、受影響 contract 與可重現證據。
- Architecture Change Request 由 Architecture Steward 統一裁決。它先更新 Human Spec、Module Contract、module graph 與 Task Packet，之後才重新派發 BUILD。
- 工作完成後，scope gate 必須以實際 changed paths 對照 `allowed_write`。任何範圍外修改都是 hard failure，不能用文字解釋豁免。

## 角色與模型

### 主 agent／PM orchestrator

- DEFINE 時作為產品 PM，與人類確認 stage、target release、P1–P3 與 99% readiness evidence；只有接受且 READY 的 Human Spec 能進 PLAN。
- PLAN 時作為技術 PM，保留產品優先級並把已接受內容轉成 Task Packet；不得自行把 P2／P3 升成 P1，或用技術偏好改寫 release condition。
- 不把完整討論上下文傳給 subagent，也不要求 subagent重新進行產品決策。
- 只在任務可獨立、有界且協調成本低於收益時派工。

### Planner

- 把已接受且 READY 的系統規格轉成 module tree、垂直 slices 與每個 module root 的 `architecture.md`；每個 P1 必須映射到 owner、slice 與 acceptance evidence，完成後才允許進入 BUILD。
- 發現 P1 產品決策缺失時退回 DEFINE；發現 P1 跨 module 架構問題時交 Architecture Steward。Planner 不自行補產品需求或重新排序優先級。
- 根據 module 的具體變更原因、不變量、公開邊界、使用者慣例與已接受 capability horizon，評估封裝性、可讀性、擴充壓力、測試接點與遷移成本。設計模式必須解決已知問題；不得以領域名稱套用固定分層。
- 只規劃 current target stage。後續版本能力可以影響 seam 選擇，但不能變成此次 slices、預建抽象或空白檔案。
- PLAN 的 99% readiness 同樣是可稽核 gate，不是主觀分數：所有 P1 都有 slice、module owner、公開 contract、直接 acceptance evidence，且下一個 slice 沒有未解 P1 架構依賴時才標 `READY`；否則列出 blocking P1 IDs 並保持 `NOT READY`。
- 確認 module 之間只透過已定義的共通 contract 溝通，並把 BUILD、test 與 protected paths 分開交付。
- 不撰寫產品實作；若計畫需要跨 module 架構裁決，交由 Architecture Steward 處理。

### Architecture Steward

- 使用 `gpt-5.6-sol`、`high` 或更高能力組合作為最低預設，唯一可規劃跨 module 變更並維護 Module Contract 與 module graph 的開發角色。
- 多來源規格需要蒸餾、存在高影響矛盾，或架構判斷的不確定性會污染多個 task 時，使用 `gpt-6-astra`。例行摘要、搜尋與單一明確 contract 更新不使用 Astra。
- 不把架構探索交給 BUILD worker，也不以 worker 的越界 patch 反推架構決策。

### BUILD Worker

- 對清楚、狹窄且已定義 contract 的 slice，預設使用 `gpt-5.6-luna`、`high`。
- 只能在 `allowed_write` 內修改，不得更新架構決策、Module Contract、測試要求或其他 module。
- 任務封包不足時依 blocker protocol 回報，不能透過擴大搜尋或修改鄰近 module 自行補完架構。

### Test Author

- 必須是 fresh-context 的獨立非實作角色，不能由 BUILD Worker 撰寫或修改必要測試。
- 只讀已接受的行為規格、公開 Module Contract、必要的測試介面與既有測試慣例；預設不讀本次產品實作內部。
- 只寫 Task Packet 指定的程式碼檢查，例如 deterministic unit、integration、contract 或必要的 end-to-end behavior tests；不得修改產品程式與 acceptance criteria。
- 不為視覺品質、動畫體感、操作感受、UX 語意或其他感官成果設計 snapshot、golden、影像評分或 LLM judge。可以產生 screenshot、錄影、可執行產物與重現步驟供人類審核，但不能代替人類判定通過。
- 「非開發者模型」以角色、上下文與工具權限落實，不依賴未被平台保證的模型標籤。模型依測試複雜度選擇，但必須與實作者隔離。

## 測試狀態與路由

紅、黃、綠是由目前 revision、changed paths 與程式碼測試證據計算的診斷狀態，不由人類指定或驗收。狀態綁定 content hash；程式碼一旦改變，原有 Green 證據失效並回到 Yellow。編譯、靜態分析、runtime、程式測試與 human acceptance 仍分開記錄。

| 狀態 | 定義 | 測試動作 |
| --- | --- | --- |
| Red | 已有可重現的失敗、regression 或失敗中的必要 code check | 最優先執行最小重現與直接保護該行為的測試；修正後重跑同一失敗範圍 |
| Yellow | 本次新增或修改、尚未取得對應 revision 通過證據的 module、contract 或直接受影響路徑 | Red 排除後，執行受影響 test file、module 公開入口及必要 lint、typecheck 或 build；通過後自動轉為 Green |
| Green | 目前 revision 已有通過證據且本次未修改的穩定範圍 | 預設完全不測，也不納入例行 suite；只有 Red 與 Yellow 路徑已排查仍無法解決錯誤時，才測試最小可疑 Green 依賴 |

- 路由順序固定為 Red → Yellow → Green fallback。沒有 Red 就從 Yellow 開始；Red 與 Yellow 已通過且沒有未解錯誤時立即停止，不為確認 Green 而追加測試。
- 進入 Green fallback 前，必須記錄已排除的 Red／Yellow 範圍、仍存在的錯誤證據，以及指向特定 Green dependency 的理由。不得直接跑全部 Green 或全 repository suite。
- Green 的診斷測試失敗後，該最小範圍自動轉為 Red，再依 Red 流程修復；通過則停止擴張並回到剩餘假設，不以更多 Green 測試取代根因分析。
- BUILD Worker 可以依實際測試結果更新狀態，但不能手動把 Yellow／Red 宣告為 Green、修改必要測試，或以人類觀感作為狀態轉換證據。
- 完整 suite 只在既有 release／CI gate、使用者明確要求，或 Green fallback 已提供證據顯示影響無法被 module boundary 界定時執行。
- 感官成果維持獨立 `human-pending`，由人類在實際產物上驗收。其通過或退回不改變程式碼測試燈號；若人類回報可重現的程式錯誤，才建立 Red code-check case。

### Process Evaluator

- 使用 fresh context 且預設 read-only。主 agent 只有在未參與產品實作時才能兼任；否則使用獨立 evaluator。
- 只做流程檢查，不評判產品方向、架構品味、程式碼語意或測試是否正確；這些由 Human Spec、Architecture Steward、deterministic checks 與人類驗收負責。
- 在每個 milestone checkpoint 只讀 Task Packet、預估與實際 token／時間、changed paths、machine-check 結果與最小通訊紀錄，不採信 worker 的自我評分。
- 發現 scope、permission、protected path、contract 或 test-state 違規時立即停止 task，修正權威流程檔與 Task Packet 後重新派發。預算超出上界、checkpoint 缺證據或通訊膨脹時，在下一 milestone 前縮小範圍或修正流程；不得改產品需求來讓指標通過。

## 通訊協議

- 主 agent 派發一次完整 Task Packet，subagent 之後自行完成預先定義的 milestones；禁止例行詢問、逐檔確認與沒有 milestone evidence 的進度訊息。
- 實作 subagent 在每個小階段完成時送一次 `CHECKPOINT`，只含 milestone ID、完成 evidence、changed paths、累積 token／elapsed time、與預估偏差及下一 milestone。主 agent 不需回覆，除非 Process Evaluator 發現 anomaly 或需要重發 Task Packet。
- 中途遇到明定 blocker 時可送一則結構化 `BLOCKED`；最後另送一次 final result。Checkpoint 數由 PLAN 的實際 slices 決定，不以固定高頻率回報。
- 若目標或決策改變，終止舊 task，更新權威檔案與 revision，再建立新 Task Packet；不得用連續訊息修補舊封包。
- final result 只回報 changed paths、acceptance evidence、驗證結果與尚存 blocker，不重述完整規格或工作日誌。

## 評估與滾動改良

Process Evaluator 至少檢查：

- `allowed_write` 外修改數；必須為零。
- module root 是否由 Planner 預先建立、`architecture.md` 是否存在且 revision 相符，以及任何非授權角色是否修改該檔。
- 未由 Module Contract 授權的跨 module dependency；必須為零。
- worker 是否取得未列於 `allowed_read` 的來源；能被環境觀察時必須為零。
- dispatch、checkpoint、blocker 與 follow-up 次數；checkpoint 只能對應預先定義的 milestone，無 anomaly 或 blocker 時不得有中途協調或回覆。
- 每個 task 的預估與實際 input／output／total tokens、dispatch-to-final elapsed time，以及各 milestone 的累積偏差；無 provider usage 時必須標示估算方法。
- 測試作者是否與產品實作者隔離，以及受保護測試是否被後者修改。
- test-state 是否有 revision 與程式碼證據、是否依 Red → Yellow → Green fallback 路由、是否過早測試 Green 或執行全庫測試，以及感官成果是否被錯誤地納入燈號。
- Task Packet 是否足以讓 worker 不擴大搜尋仍能完成 acceptance criteria。
- 實際成功率、驗證證據、時間與 token／工具成本。

eval evidence 可逐次保存以供比較；影響下一次工作的決策只能寫回單一現行 spec、contract、template 或 skill。更新時替換過時內容並控制篇幅，不把歷次檢討追加到 agent 的預設上下文。單次低影響異常先修 fixture 或 task packet；重複或高影響失敗才修改共通制度。

## 跨任務 A/B 流程實驗

- A/B variant 只能跨不同但可比較的 tasks 分配，不為同一使用者成果重複實作兩次。每次 task 只使用一個預先登記的流程 variant。
- 實驗開始前記錄 hypothesis、唯一改變的流程因素、適用 task cohort、主要成功指標、token／elapsed-time 指標、停止條件與失敗保護。模型、工具、權限與任務複雜度差異必須記錄，不能把它們誤算成流程效果。
- Process Evaluator 只收集流程與成本證據。單一 task 可以揭露異常但不能宣告 winner；跨足夠的相似 tasks 比較成功率、scope violations、返工、token 與時間後，才更新預設流程。
- 執行中若因異常修正 variant，該 task 標成 protocol deviation，不納入原 variant 的勝負統計；安全與正確性優先於維持實驗純度。

## Enforcement 工具順序

1. 先建立可機讀 Task Packet schema 與 changed-path scope gate；本機與 CI 使用同一檢查器。
2. 以獨立工作區執行 BUILD：指定 module 可寫、contract 與必要依賴唯讀、其他來源不掛載。網路預設關閉，只開 Task Packet 宣告的工具。
3. 依技術棧加入 dependency boundary checker。Nx workspace 可使用 `@nx/enforce-module-boundaries`；一般 JavaScript／TypeScript repository 可評估 dependency-cruiser。
4. 當條件多到單一 validator 難以測試與維護時，再引入 OPA／Conftest；初期不為簡單路徑白名單增加此依賴。
5. eval runner 最後加入，記錄 scope、通訊、驗證與成本，並與 `docs/evaluation-contract.md` 的 baseline／treatment 規則整合。

Codex custom agent profile 可固定 model、reasoning effort、`sandbox_mode`、MCP 與 skill surface。`read-only` 適合 evaluator；BUILD 必須在已裁切的 workspace root 使用 `workspace-write`。Codex worktree 只隔離 mutable Git state，nested `AGENTS.md` 只提供較近的指令，Git sparse-checkout 只減少預設呈現檔案；三者都不能單獨當成嚴格讀取 ACL。

## 參考

- [OpenAI：Codex subagents 與 custom agent profiles](https://learn.chatgpt.com/docs/agent-configuration/subagents)
- [OpenAI：Codex sandbox 與 writable roots](https://learn.chatgpt.com/docs/sandboxing)
- [OpenAI：AGENTS.md discovery 與 nested overrides](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [OpenAI：multi-agent 適用邊界](https://developers.openai.com/api/docs/guides/responses-multi-agent)
- [Docker：read-only bind mounts](https://docs.docker.com/engine/storage/bind-mounts/)
- [Git：sparse-checkout](https://git-scm.com/docs/git-sparse-checkout)
- [Nx：enforce module boundaries](https://nx.dev/docs/guides/enforce-module-boundaries)
- [Open Policy Agent：CI/CD policy-as-code](https://www.openpolicyagent.org/docs/cicd)
