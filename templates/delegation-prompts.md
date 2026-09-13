# Task Packet 模板

只在任務值得承擔重新建立上下文的成本時委派。主 agent 一次派發完整 Task Packet；worker 在預先定義的小階段完成時回報 checkpoint，不進行無 evidence 的例行進度對話。

```text
task_id: <穩定識別碼>
goal: <本 slice 的單一可觀察成果>
module_root: <worker 唯一可操作的 module root>
architecture_path: <module_root>/architecture.md
architecture_revision: <revision 或 hash>

read_paths:
- <完成任務所需的最小來源>

write_paths:
- <module_root 內允許修改的精確路徑或 pattern>

forbidden_paths:
- <module_root>/architecture.md
- <test-owned paths>
- <其他 module 與 repository 管理檔>

contract_excerpts:
- <本 slice 實際需要的共通介面與不變量；不要轉貼整份人類討論>

acceptance:
- <deterministic code evidence>
- <若有感官成果：只要求產出 artifact，標為 human-pending，不替人類評分>

test_state:
- red: <已知可重現失敗，沒有則寫 none>
- yellow: <本 revision 改動與直接受影響範圍>
- green: <已有通過證據且未改動的範圍>

estimate:
- basis: <historical|cold-start>
- reference_task_ids: <可比較歷史 task；cold-start 可為空>
- expected_total_tokens: <low..high>
- expected_elapsed_seconds: <low..high，dispatch 到 final>
- assumptions: <model、reasoning、tools、task complexity>

milestones:
- id: <M1>
  outcome: <完成後可觀察的小階段成果>
  evidence: <如何證明完成>
  expected_cumulative_tokens: <上界>
  expected_cumulative_seconds: <上界>
  anomaly_threshold: <何時交 Process Evaluator 立即修正流程>

experiment:
- id: <沒有 A/B 則為 none>
- variant: <A|B>
- hypothesis: <只改變一個流程因素>

final_report:
- changed_paths
- acceptance_evidence
- unresolved_blockers
- scope_gate_result
```

## Milestone checkpoint

```text
CHECKPOINT <milestone_id>
evidence: <最小證據>
changed_paths: <清單>
actual_cumulative_tokens: <provider usage；估算時註明方法>
actual_elapsed_seconds: <dispatch 起算>
estimate_deviation: <within-range|over|under + 數值>
next_milestone: <id>
```

Checkpoint 是單向狀態證據，不是請求逐步核准。Process Evaluator 只檢查流程；沒有 anomaly 時主 agent 不回覆，worker 直接進下一 milestone。

## 唯一允許的中途 blocker

只有缺少會改變驗收的決策、需要修改 forbidden path、共通契約不足、或需要未授權的外部副作用時，worker 才送出一次結構化 blocker：說明卡點、證據、最小所需決策與不擴張時可完成的範圍。派工者更新權威檔案與 revision 後，重新發出 Task Packet；不要用聊天補丁否定舊決策。
