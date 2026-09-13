# Skill 行為案例索引

各 skill 的現行案例放在可機讀的 [`cases/`](cases/)；結構由 [`case.schema.json`](case.schema.json) 定義。本檔不複製案例內容，避免人工表格與 runner 輸入分歧。

## 本機執行

```bash
node scripts/run-evals.mjs \
  --suite evals/cases/spec-driven-development.json \
  --adapter <adapter-module.mjs>
```

Adapter 必須 export `async function estimate(request)` 與 `async function run(request, estimate)`。Runner 會為每個 case 建立互不共享的 baseline 與 treatment process／workspace，把事前估計、request 與 response 保存至 `evals/results/`，並將 semantic behavior checks 留給 fresh-context evaluator。

只檢查 runner protocol、不呼叫模型：

```bash
node scripts/run-evals.mjs \
  --case SDD-B1 \
  --adapter evals/fixtures/runner/protocol-adapter.mjs
```

Protocol fixture 只能證明 runner 的隔離、紀錄與 adapter contract；不能證明 skill 有效，也不能用來作 retain／revise 決策。
