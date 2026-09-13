# 研究依據與形式化路線

本專案的價值不以規範數量計算，而以「多少決策能被定義、量測、重播與否證」計算。每個新增機制依序提升成熟度：

| 等級 | 必要證據 | 可宣稱內容 |
| --- | --- | --- |
| F0 Narrative | 只有文字規範 | 方法假設，尚無可驗證價值 |
| F1 Contract | JSON Schema、明確輸入輸出、owner | 資料可交換且缺欄位會失敗 |
| F2 Deterministic | CI checker、隔離、權限或可執行 gate | 規則可機械執行 |
| F3 Measured | 真實 task 的成功、token、時間、異常資料 | 可描述成本與結果分布 |
| F4 Causal | 預先登記、可比 cohort、固定停止規則的對照實驗 | 可判斷流程變更的增量價值 |

Skill 不得因為文件完整就被稱為有效；至少到 F3 才能標記 `retention-candidate`，到 F4 才能宣告某個流程 treatment 優於 control。

## 已採用的研究結論

### Progressive disclosure

Agent Skills 規格把載入分為 metadata、完整 `SKILL.md`、按需 resources 三層，並建議完整 skill 指令低於 5,000 tokens。[Agent Skills specification](https://agentskills.io/specification) 與 [OpenAI skills 文件](https://learn.chatgpt.com/docs/build-skills) 都支持以短 description 路由、命中後才讀全文。本專案因此把跨 lifecycle 的總則放在入口，把階段方法放在獨立 skill，不建立總入口 skill 重複載入。

`Lost in the Middle` 顯示關鍵資訊位於長上下文中段時，模型利用率可能顯著下降。[論文](https://arxiv.org/abs/2307.03172) 支持本專案的單一現行規格、刪除失效決策與限制 worker 可讀內容；它不支持「任意摘要都不會失真」，因此轉譯後規格仍必須有 acceptance evidence。

### Eval-driven development

[OpenAI evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices) 建議 task-specific eval、持續收集 production 與 historical cases、能自動化就自動化，並以 pairwise、分類或明確 criteria 取代開放式印象分。本專案因此分開 routing、behavior、deterministic code evidence 與 human sensory acceptance，不採單一「品質分數」。

[Claude plugin eval](https://code.claude.com/docs/en/plugin-evals) 也使用 fresh isolated sessions、預設三次重跑，以及 with／without plugin baseline。它可作為 Claude adapter 的交叉驗證來源，但其格式不是本專案的權威 schema，避免被單一 provider 綁定。

### 可攜格式與觀測欄位

skills 維持開放的 `SKILL.md` 規格；plugin 同時提供 portable `plugin.json`、OpenAI compatibility manifest 與 Claude manifest。模型、provider、token、duration、tools、permissions 使用固定欄位，未來 exporter 應對齊 [OpenTelemetry GenAI semantic conventions](https://github.com/open-telemetry/semantic-conventions-genai)，但目前不引入 telemetry runtime 或保存原始 prompt。

## Task cohort 與可比較性

每個 task 的 cohort 定義為：

```text
C = (product_stage, task_type, complexity_band, module, provider, model, reasoning, tool_set, permission_set)
```

只有下列 task 進入成本估算或 A/B 勝負統計：

```text
eligible(t) =
  result.status = completed
  AND acceptance_passed = true
  AND scope_violation_count = 0
  AND hard_anomaly_count = 0
  AND total_tokens IS NOT NULL
  AND duration_ms IS NOT NULL
```

Blocked、需求中途改變、protocol deviation 與 scope violation 仍留在稽核資料，但不得被刪除來美化成功率。

## 事前 token 與時間預估

對待估 task `q`，先限定相同 `product_stage` 與 `task_type`，再以距離選歷史鄰居：

```text
d(t, q) =
  2 × |complexity_index(t) - complexity_index(q)|
  + 2 × I(model differs)
  + 1 × I(provider differs)
  + 1 × I(reasoning differs)
  + 1 × I(module differs)
  + J(tool_set_t, tool_set_q)
  + J(permission_set_t, permission_set_q)

J(A, B) = 1 - |A ∩ B| / |A ∪ B|; J(∅, ∅) = 0
```

取距離最小的 `k = min(20, eligible history count)` 筆。少於 5 筆時必須標記 `cold-start`，範圍由 planner 明列假設，不能假稱 historical。至少 5 筆時：

```text
expected point = median(neighbors)
expected range = [Q10(neighbors), Q90(neighbors)]
```

每次完成後計算校準：

```text
coverage = I(low ≤ actual ≤ high)
midpoint_APE = |actual - (low + high) / 2| / max(actual, 1)
relative_width = (high - low) / max((low + high) / 2, 1)
```

每 20 個 eligible tasks 檢查一次 empirical coverage。若 coverage 長期低於 0.80，估算方法需標記 `miscalibrated` 並修訂 cohort 或分位範圍；不得只把範圍無限放寬，因為 `relative_width` 會同步惡化。

## Routing 指標

Positive、negative 與 collision case 分別建立 confusion matrix：

```text
precision = TP / (TP + FP)
recall = TP / (TP + FN)
specificity = TN / (TN + FP)
collision_accuracy = correct_collision_owner / collision_cases
```

分母為零時結果是 `not-applicable`，不可寫成 0 或 1。每個 skill release 必須預先登記門檻；預設門檻是 required cases 全數通過、`recall ≥ 0.90`、`specificity ≥ 0.90`、`collision_accuracy = 1.00`。若 case 數不足以讓比例有意義，仍只標記 structural pass。

## Skill 的增量價值

同一 case 的 baseline 不暴露 target skill；treatment 暴露完整 catalog，只有 behavior case 才預載 target。對每個 case 至少三次獨立 run，再計算：

```text
Δpass = pass_rate_treatment - pass_rate_baseline
Δtokens = median(tokens_treatment) - median(tokens_baseline)
Δtime = median(duration_treatment) - median(duration_baseline)
```

不建立可被任意權重操縱的綜合分數。保留 skill 的 gate 是 Pareto 型：required behavior 不退步、scope violation 為零、routing 達門檻，且至少一個預先登記的主要結果有可重現改善。若 correctness 提升但 token 或時間增加，必須把 trade-off 列為產品決策，不能藏進加權平均。

## 跨 task A/B

A/B 只改一個 `single_process_factor`，以 cohort 分層後隨機分派不同真實 tasks。開始前固定：primary metric、最小實務差異 `δ`、顯著水準 `α`、power `1-β`、樣本數與停止規則。

連續指標的等量雙組粗估樣本數：

```text
n_per_variant = ceil(2 × (z_(1-α/2) + z_(1-β))² × σ² / δ²)
```

二元成功率使用：

```text
n_per_variant = ceil(
  2 × (z_(1-α/2) + z_(1-β))² × p̄ × (1-p̄) / δ²
)
```

`σ` 與 `p̄` 必須來自 pilot 或歷史 cohort；沒有先驗資料就先跑 pilot，不宣告勝負。固定樣本完成前不因暫時領先停止。結論同時報 effect、95% bootstrap confidence interval、兩組 token／時間分布與 safety metrics。只在 CI 全部位於預先定義的有利方向、效果超過 `δ` 且無 safety regression 時採用 treatment。

## 工具採用判斷

| 工具／方法 | 決策 | 理由與接入點 |
| --- | --- | --- |
| JSON Schema + repo validator | 保留，核心 | F1/F2 的零網路契約；cases 與 task registry 已採用 |
| GitHub CLI `gh skill` | 採用為發行 preflight 與 skill-only installer | 官方支援跨 agent path、版本 pin、provenance、update 與 release validation；不取代本 repo 的入口與 MCP 安裝器 |
| Playwright MCP | 條件式保留 | 只在 rendered UI 的 deterministic evidence 需要瀏覽器時啟用，不評分美感或手感 |
| OpenAI Evals／Graders | adapter 候選 | 適合大量 pairwise、pass/fail 與 judge calibration；不得取代本機 schema |
| OpenAI Prompt Optimizer | 延後 treatment generator | 先有穩定 graders 與足量 annotations 才能使用；輸出仍需跑 frozen holdout，不直接覆蓋 skill |
| Claude `plugin eval` | adapter／交叉驗證 | 已有三次重跑與 no-plugin baseline；保留 provider 隔離 |
| OpenTelemetry GenAI | 先對齊欄位，延後 exporter | 避免現在引入 runtime；累積到需要跨工具 trace 時再輸出 |
| Promptfoo | 暫不納入 core | 多 provider 與 CI 很有用，但目前會重複本機 runner；只有新增第二個 production adapter 時再評估 |
| OPA／Conftest、CUE | 後續 boundary 候選 | 適合把複雜 module boundary 與 Task Packet policy 變成 executable policy；目前簡單路徑先由本機 validator 負責 |
| dependency-cruiser／Nx boundaries | 語言 adapter 候選 | 可檢查 import 邊界，但與技術棧綁定，不應成為所有專案的預設依賴 |
| 通用 memory／search MCP | 不採預設 | 會擴大可讀資料與 prompt 污染面；只有 DEFINE 需要特定外部事實時按 task 授權 |

[OpenAI 的 evaluation flywheel 範例](https://github.com/openai/openai-cookbook/blob/main/examples/evaluation/Building_resilient_prompts_using_an_evaluation_flywheel.md) 支持先分類錯誤、建立 graders、再優化 prompt，而不是先讓 optimizer 改寫。外部工具只能產生 treatment，不得同時改 cases、grader 與 treatment，否則無法歸因。

## 下一個可執行順序

1. 以已發行六個 skills 的 case suites 累積 baseline／treatment 重跑，不再因規範完整感新增 skill。
2. 以 task registry 校準 token／時間 cohort，至少取得五筆相同 stage 與 task type 的 eligible history。
3. 把第一個真實失敗分類為 routing、instruction、context、tool、scope 或 evaluator error，只改對應 owner。
4. BUILD 先使用 Task Packet、scope gate 與隔離工作區；只有真實技術棧出現重複缺口時才加入語言特定 boundary adapter。
5. 只有流程變更有足夠 task 流量時才升到 F4 A/B；低樣本時維持 descriptive evidence。
