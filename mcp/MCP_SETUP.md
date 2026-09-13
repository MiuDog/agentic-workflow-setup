# External Tool Setup

外接工具只補足 agent 與目標環境之間缺少的能力，不用來重複模型推理、保存 repository 已有資訊，或取代專案既有的 formatter、linter 與測試命令。

## 目前支援

目前唯一提供的可選工具是 Microsoft Playwright MCP，供 UI 工作取得：

- accessibility snapshot 與可靠的 element refs。
- viewport、element 與 full-page screenshot。
- browser console 與 network request 證據。
- resize、navigate、click、type 等互動能力。

需要取得 rendered result 的 deterministic evidence 時適用。若 agent 已有等價的 browser／computer-use 工具，應沿用既有能力，不要重複安裝 Playwright MCP。

官方文件：

- [Playwright MCP installation](https://playwright.dev/mcp/installation)
- [Playwright MCP screenshots](https://playwright.dev/mcp/tools/screenshots)
- [Playwright MCP capabilities](https://playwright.dev/mcp/capabilities)

## 為何不預設安裝

MCP 的 tool schemas 會增加上下文與選擇成本，瀏覽器程序也會消耗本機資源。`lean-development` 與 `personal-code-style` 可以直接使用目標 repository 已有的 Git、formatter、linter、compiler 與 test commands，不需要額外 MCP。

舊版提供的 `sequential-thinking`、`memory` 與 `context7` 已退出預設工具組：

- 推理 server 不提供新的外部能力。
- repository truth 應存在 Git 追蹤的文件，不另建跨 session memory source。
- 外部 library 文件應使用 agent 已有的官方文件或網路檢索能力；特定 skill 確有需求時再個別宣告。

## 安裝器選用

在目標專案執行：

```text
node <本-repository>/setup.mjs --tools playwright
```

也可以與平台選擇組合：

```text
node <本-repository>/setup.mjs --platforms codex,claude,gemini,antigravity --tools playwright
```

沒有 `--tools` 時，安裝器不建立或修改 MCP 設定。選用後仍採非破壞性合併：只新增不存在的 `playwright` key，不覆蓋同名既有設定。

配置使用已驗證的 `@playwright/mcp@0.0.80`，並啟用：

- `--isolated`：不同 session 不保留登入與 local storage。
- `--timeout-idle=300000`：閒置五分鐘後關閉 browser，降低持續資源成本。

版本最後核對日期：2026-09-13。升級時先查詢 npm 版本，在隔離專案驗證啟動、snapshot 與 screenshot，再更新兩份配置與驗證器的 pinned version。

## 各平台設定位置

安裝器只在明確指定 `--tools playwright` 時修改 project scope：

- Codex：`.codex/config.toml`。
- Claude Code：`.mcp.json`。
- Gemini CLI：`.gemini/settings.json`。
- Antigravity：`.agents/mcp_config.json`。

Codex desktop、CLI 與 IDE 共用 Codex host 的設定。若不使用安裝器，也可由使用者明確執行：

```text
codex mcp add playwright -- npx -y @playwright/mcp@0.0.80 --isolated --timeout-idle=300000
```

Codex desktop 也可在 Settings → MCP servers 新增；Antigravity IDE 可在 agent side panel → MCP Servers 安裝。完整平台與 UI 步驟見 [安裝與平台指南](../docs/installation.md)。

## Windows

JSON 型 MCP client 在 Windows 上使用 `cmd /c npx` 包裝，範例位於 `mcp-config.windows.example.json`。POSIX 範例位於 `mcp-config.example.json`。

首次使用需要網路下載 npm package 與 browser。啟動失敗時只重試一次；條件沒有改變時停止重試並回報原始錯誤。

Playwright MCP 不是安全邊界。只開啟任務範圍內的 URL，不把憑證或既有登入狀態帶進隔離 browser，也不以 browser 工具繞過 agent 原有的網路與操作權限。

## 後續工具准入條件

新增外接工具前必須同時回答：

1. 哪一個 skill 的哪個必要行為沒有它就無法可靠完成？
2. 是否已有 agent 內建能力或目標專案命令可完成？
3. 能否限制為個別 skill 或明確選用，而不是全域注入？
4. 如何檢查版本、啟動、輸出與失敗停止條件？
5. 行為收益是否足以抵銷 tool schema、安裝與維護成本？

沒有具體答案的工具不進入配置。
