# 制度維護協議

本 repository 維護的是會改變 agent 決策的最小工作制度，不保存為了完整感而存在的規則集合。

## 權威邊界

- Repository 維護 intent 路由與生命週期：`AGENTS.md`。
- Skill 的建立、保留、合併、重製與淘汰證據：`docs/evaluation-contract.md`。
- PLAN、委派 BUILD、module isolation、Task Packet、測試狀態與流程評估：`docs/build-execution-contract.md`。
- 可重複且 deterministic 的限制：scripts 與 CI。
- 外接能力與安裝方式：`mcp/MCP_SETUP.md`。

同一規則只留一個原文位置。其他檔案只保留足以正確路由的摘要與連結；發現第二份規則逐漸分歧時，修正權威來源並刪除複本。

## 修改流程

1. 先查現有 skills、未提交修改與上述權威文件，確認不是重複能力。
2. 將問題分類為 routing、behavior、cost、tooling 或 project-local convention；不要用新 skill 修補其實屬於腳本或專案契約的問題。
3. 依 evaluation contract 建立或更新案例，再修改最小 owner。
4. 跑 deterministic validation；有行為主張時另做 baseline/treatment，不以 CI 綠燈代替效果證據。
5. 更新目前狀態與發布 metadata。歷史留給 Git，不在現行規則內追加「新決策否定舊決策」。

發布前另執行 `gh skill publish --dry-run`，以 Agent Skills 官方規格交叉驗證來源 skills。此命令需要 GitHub CLI 與 repository 存取，因此不併入零網路的 `npm run validate`；其 warning 與本機 validator 結果都要留在 release evidence。

## 膨脹訊號

行數不是品質門檻，但下列情況必須檢查是否混入重複或低產值內容：

- `SKILL.md` 接近 200 行，或主要內容只在單一模式下需要。
- 一個 skill 同時擁有多個不相關 intent，或與另一個 description 會競爭相同請求。
- 正常任務需要預載多份 skills 才能開始。
- 規則重述平台能力、通用常識或另一權威文件，卻沒有改變決策。
- examples、例外與失敗故事多於核心判準。

優先刪除重複內容、收窄 description，或把條件性細節移入按需 reference。不要為了縮短主檔而建立沒有獨立檢索價值的碎片。

## Skill 退役

退役前確認仍有價值的方法已移到新的唯一 owner。然後同一變更中移除 skill 目錄、安裝與模板引用、legacy eval、文件宣告及 CI 假設。Git 已保存歷史，不在可載入 skills 目錄保留備份。

## 專案回流

只有跨技術棧仍成立、並有重複案例或比較證據的教訓才回流本 repository。專案架構、工具路徑、產品決策與單次 bug 留在專案的 current spec、module `architecture.md` 或問題證據中。
