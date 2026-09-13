# 本機 Task Registry

Task registry 將 runner 的 token、時間與 milestone 結果累積為可稽核的本機歷史。Runner 只能建立 `pending` candidate；只有獨立流程 evaluator 能補上 acceptance、scope violation、rework 與 anomaly，並將紀錄 finalize。

## 資料流

```text
runner summary
  -> pending candidate
  -> independent process evaluation
  -> immutable finalized task
  -> generated task-registry.json
  -> historical estimate / cross-task experiment analysis
```

本機來源放在 `.agentic-workflow/registry/`，已排除版本控制：

```text
.agentic-workflow/registry/
├─ candidates/          # 尚未獨立判讀
├─ tasks/               # finalized，不可覆寫
├─ experiments/         # 事前登記的 experiment 定義
└─ task-registry.json   # validate 後重建的唯讀 view
```

## 步驟 1：初始化

```bash
npm run registry -- init
```

## 步驟 2：準備 cohort packet

Cohort 必須在 ingest 時明確提供，不從 prompt 或結果事後猜測。`tasks` 可覆寫單一 task；experiment assignment 也應在任務開始前決定。

```json
{
	"schema_version": 1,
	"defaults": {
		"cohort": {
			"task_type": "skill-evaluation",
			"product_stage": "DEFINE",
			"complexity_band": "s",
			"module": "skills/spec-driven-development"
		},
		"experiment": null
	},
	"tasks": {}
}
```

契約位於 `evals/cohort-packet.schema.json`。

## 步驟 3：執行並 ingest

Runner 可以在完成 summary 後直接建立 candidates：

```bash
npm run eval -- \
	--adapter ./local-adapter.mjs \
	--registry-dir ./.agentic-workflow/registry \
	--cohort ./evals/local/cohort.json
```

也可以對既有 summary 執行冪等 ingest：

```bash
npm run registry -- ingest \
	--summary ./evals/results/run-id/summary.json \
	--cohort ./evals/local/cohort.json
```

相同 `task_id` 與相同 summary SHA-256 會回報 `unchanged`；相同 ID 但來源不同會被拒絕，不會覆寫歷史。

## 步驟 4：獨立判讀並 finalize

Evaluator packet 不得改寫 runner 的 execution、estimate、actual 或 milestone：

```json
{
	"schema_version": 1,
	"task_id": "SDD-POS-01-1-treatment",
	"result": {
		"status": "completed",
		"acceptance_passed": true,
		"scope_violation_count": 0,
		"rework_count": 0
	},
	"anomalies": []
}
```

```bash
npm run registry -- finalize \
	--task SDD-POS-01-1-treatment \
	--evaluation ./evals/local/SDD-POS-01-1-treatment.evaluation.json
```

Finalized task 不可再次 finalize。需要修正時必須保留原始證據並以新的 task ID 重跑；不可就地改寫觀測結果。

## 步驟 5：驗證與讀取

```bash
npm run registry -- validate
npm run analyze:tasks -- summary
```

Validator 會檢查來源 SHA-256、時間順序、token 加總、milestone 單調性、historical references 是否為事前且 eligible，以及 experiment／variant 引用。只有驗證成功才重建 `task-registry.json`。

目前 recorder 已完成可信寫入閉環；experiment assignment 與 fixed-horizon A/B 推論仍是下一個獨立實作階段。
