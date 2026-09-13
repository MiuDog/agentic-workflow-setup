# CONTRIBUTING

## 改動前

- 讀 `docs/maintenance.md`：權限分級與膨脹上限在那裡，對人和對 agent 同樣適用。
- 一條規則只准有一個活的原文位置；發現第二處在「複述」而非「引用」，就地改成指針。

## 提交檢查（PR 前本地跑）

```bash
npm run validate                # skill、case、manifest、連結與 MCP 契約
npm run test:registry           # recorder／validator 整合流程
npm run test:scope              # BUILD module write boundary 整合流程
node scripts/analyze-task-registry.mjs self-test
node setup.mjs --target <臨時目錄> --platforms codex,claude,gemini,antigravity --verify
gh skill publish --dry-run      # 需要 GitHub CLI 與 repository 存取
```

CI 會跑同一組檢查；紅燈不收。

## 改規則的特別要求

- 行為規則的修改附動機：踩了什麼坑、原措辭怎麼被誤讀（格式照 CHANGELOG 的「對使用者的影響」）。
- 修改後跑一遍 `evals/scenarios.md` 對應場景（至少人工過一次），在 PR 描述貼結果。
- 版本：規則語義變更 +Minor、錯字/連結修正 +Patch；同步 `package.json` 與 CHANGELOG，
  skills frontmatter 的 `metadata.version` 由發版時統一批次更新。

## Commit

conventional 格式（`feat:` `fix:` `docs:` `chore:`），一個 commit 一個意圖。
