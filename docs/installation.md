# 安裝與平台指南

本套組有兩種分發型態：standalone 會把 skills 安裝進指定 scope，適合專案內明確版本控制；plugin 由平台的插件目錄管理，適合 UI 安裝與跨專案使用。兩者同時安裝會產生重複 skill，請擇一。

## 支援矩陣

| 平台 | Standalone skill 路徑 | 入口檔 | Plugin／UI 路徑 | Playwright MCP 專案設定 |
| --- | --- | --- | --- | --- |
| Codex CLI、IDE、桌面版 | `.agents/skills/` | `AGENTS.md` | Codex CLI `/plugins` 或桌面版 Plugins | `.codex/config.toml` |
| Claude Code | `.claude/skills/` | `CLAUDE.md` | `/plugin` 的 Discover 頁面 | `.mcp.json` |
| Gemini CLI | `.agents/skills/` | `GEMINI.md` | `/skills` 是終端互動管理器；無此 repo 的 GUI marketplace | `.gemini/settings.json` |
| Antigravity IDE | `.agents/skills/` | `GEMINI.md` | 檔案式 discovery；MCP 可由 IDE 的 MCP Servers UI 管理 | `.agents/mcp_config.json` |

Gemini CLI 與 Codex 都支援 `.agents/skills/`，因此同一專案選兩者時只保存一份 skill。Antigravity 的全域 skill 路徑不同，使用者範圍會另外安裝到 `~/.gemini/config/skills/`。

## Standalone CLI 安裝

需求為 Node.js 18 以上。下列命令在 PowerShell、macOS 與 Linux shell 均可使用。

安裝到目前專案：

```bash
npx --yes github:MiuDog/agentic-workflow-setup -- --platforms codex,claude,gemini,antigravity --verify
```

安裝到指定專案：

```bash
npx --yes github:MiuDog/agentic-workflow-setup -- --target /path/to/project --platforms codex,claude --verify
```

PowerShell 的 Windows 路徑可以直接加引號：

```powershell
npx --yes github:MiuDog/agentic-workflow-setup -- --target "D:\Projects\my-app" --platforms codex,antigravity --verify
```

安裝到使用者範圍：

```bash
npx --yes github:MiuDog/agentic-workflow-setup -- --scope user --platforms codex,claude,gemini,antigravity --verify
```

`--scope user` 不建立 `AGENTS.md`、`CLAUDE.md` 或 `GEMINI.md`，也不接受 `--tools`，避免一次命令改動所有專案的工具權限。專案入口檔只在不存在時建立，升級不會覆蓋；受 lockfile 管理的 skill 若被專案修改，升級也會保留，除非明確使用 `--force`。

常用操作：

```bash
# 預覽，不寫入
npx --yes github:MiuDog/agentic-workflow-setup -- --target /path/to/project --platforms codex --dry-run

# 安全移除仍未被本地修改的受管檔案
npx --yes github:MiuDog/agentic-workflow-setup -- --target /path/to/project --uninstall
```

舊版 `--platforms agents` 仍可使用，但只作為 `codex` 的相容別名。

### GitHub CLI 的 skill-only 安裝

若只要 skills，不需要入口模板、Task Packet 文件或 Playwright MCP，GitHub CLI 可直接處理來源追蹤、版本 pin 與更新：

```bash
# Codex；Gemini CLI 與 Antigravity 的 project scope 會共用同一 .agents/skills
gh skill install MiuDog/agentic-workflow-setup --all --agent codex --scope project

# Claude Code
gh skill install MiuDog/agentic-workflow-setup --all --agent claude-code --scope project

# 全域 Gemini CLI 或 Antigravity 時分別指定 agent 與 user scope
gh skill install MiuDog/agentic-workflow-setup --all --agent gemini-cli --scope user
gh skill install MiuDog/agentic-workflow-setup --all --agent antigravity --scope user
```

更新用 `gh skill update --all`。GitHub CLI 會在已安裝 skill frontmatter 加入 provenance metadata；這是安裝副本，不應回寫本 repo 的來源檔。

## OpenAI plugin：Codex CLI 與桌面 UI

此 repo 同時是可攜式 Agent Plugin，並在 `.agents/plugins/marketplace.json` 提供 marketplace。先登錄來源：

```bash
codex plugin marketplace add MiuDog/agentic-workflow-setup
```

CLI 使用者接著在 Codex 輸入 `/plugins`，選擇 `Agentic Workflow` 來源並安裝 `Agentic Workflow Setup`。桌面版使用者重新啟動 ChatGPT desktop，開啟 Plugins，切到 `Agentic Workflow` 來源後安裝。安裝後開新 task，讓新的 skill catalog 生效。

這條 UI 路徑目前適用 ChatGPT desktop 內的 Codex；Codex IDE extension 不支援 plugins，IDE 請使用 standalone 安裝。

## Claude Code plugin：CLI 與互動 UI

先登錄 marketplace，再安裝：

```bash
claude plugin marketplace add MiuDog/agentic-workflow-setup
claude plugin install agentic-workflow-setup@agentic-workflow --scope user
```

也可啟動 Claude Code、輸入 `/plugin`，在 Discover 頁面選 `agentic-workflow` marketplace 與安裝 scope。開發本 repo 時可跳過安裝，直接執行：

```bash
claude --plugin-dir /path/to/agentic-workflow-setup
```

Plugin skill 會帶 namespace，例如 `/agentic-workflow-setup:spec-driven-development`；standalone skill 則維持 `/spec-driven-development`。不要同時保留兩種安裝。

## Gemini CLI 與 Antigravity

Gemini CLI 採 standalone 安裝後，啟動新 session 並輸入 `/skills list` 確認 discovery；`/skills reload` 可重新載入。這個 repo 是多 skill 套組，因此用本 repo 的安裝器比逐一執行 `gemini skills install` 更可預期。

Antigravity IDE 對 workspace 的 `.agents/skills/` 進行 discovery；使用 `--platforms antigravity` 安裝後重新載入 workspace。若只要全域使用，改用 `--scope user`，安裝器會寫到官方全域路徑 `~/.gemini/config/skills/`。

## 可選 Playwright MCP

只有驗證 rendered UI 確實需要瀏覽器操作時才安裝：

```bash
npx --yes github:MiuDog/agentic-workflow-setup -- --target /path/to/project --platforms codex,claude,gemini,antigravity --tools playwright
```

安裝器固定 `@playwright/mcp` 版本、使用 isolated profile 與 idle timeout，只補不存在的 server，不覆蓋同名設定。Windows 會使用 `cmd /c`。感官品質仍由人類接受；Playwright 只提供可重現的 DOM、狀態與流程證據。

平台原生 UI 也可建立 MCP：Codex desktop 使用 Settings → MCP servers；Antigravity IDE 使用 agent side panel → MCP Servers。若已用 UI 設定同名 server，不必再執行 `--tools playwright`。

## 驗證來源

- [OpenAI skills discovery 與安裝](https://learn.chatgpt.com/docs/build-skills)
- [OpenAI plugin 打包、marketplace 與本機測試](https://developers.openai.com/plugins/build/plugins)
- [OpenAI plugin 支援介面](https://learn.chatgpt.com/docs/plugins)
- [Claude Code skills](https://code.claude.com/docs/en/skills)
- [Claude Code plugin 建立與測試](https://code.claude.com/docs/en/plugins)
- [Claude Code marketplace](https://code.claude.com/docs/en/plugin-marketplaces)
- [Gemini CLI Agent Skills](https://geminicli.com/docs/cli/using-agent-skills/)
- [Antigravity skills](https://antigravity.google/docs/skills)
- [Antigravity MCP](https://antigravity.google/docs/ide-mcp)
- [GitHub CLI `gh skill install`](https://cli.github.com/manual/gh_skill_install)
