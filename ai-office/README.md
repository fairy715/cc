# AI Agent 虛擬辦公室

浮島上的 3D 辦公室：每個專案一間房，AI 成員（總指揮、Fable、Opus、Sonnet、Haiku、Gemini、Codex）在房間之間走動。單一檔案 `index.html`，用 Three.js 基本幾何體畫成，沒有外部素材。

## 三種資料來源

| 怎麼開 | 看到什麼 |
|---|---|
| 直接開 `index.html`，或任何靜態伺服器 | 示範資料，進度是頁面自己模擬的 |
| `node ai-office/serve.mjs` | 這台電腦上的 Claude Code 工作階段 |
| 在 claude.ai 發佈成 Artifact，並允許 Claude Code Remote 連接器 | 你的雲端工作階段（含用 Remote Control 連上的本機工作階段） |

左上角的標籤會顯示目前是「示範資料」「本機即時」還是「雲端即時」。

### 本機工作階段

```bash
node ai-office/serve.mjs
```

然後開 `http://localhost:8787`。需要 Node 18 以上，不用安裝任何套件。

- 掃描 `~/.claude/projects` 的工作階段紀錄，每 15 秒更新一次
- 每個專案資料夾一間房，顯示該資料夾最新的工作階段：用哪個模型、最後一句指令、多久前更新
- 只綁 `127.0.0.1`，資料不會離開這台電腦
- 狀態是用紀錄檔的更新時間推估的：90 秒內有寫入算「工作中」，3 小時內停下來算「等你回覆」，更久算「已完成」。紀錄裡沒有「正在等你按允許」這種明確訊號，所以這只是近似
- `--port 9000` 換連接埠，`--dir <資料夾>` 換紀錄位置，`--print` 只印出資料

### 雲端工作階段

頁面在 claude.ai 的 Artifact 裡會透過 Claude Code Remote 連接器讀工作階段清單，每分鐘更新一次，最多顯示最近更新的 12 個未封存工作階段。狀態來自工作階段本身（工作中、等你回覆、已完成、失敗），詳情卡有連結可以直接開啟該工作階段。這個模式是唯讀的，不會對工作階段送出任何指令。

## 操作

- 拖曳旋轉、滾輪或雙指縮放、Shift＋拖曳（或右鍵拖曳）平移
- 點房間、角色、名牌或左側清單看詳情
- 「等你批准」可按批准，「卡住」可重試，「閒置／排隊」可派新任務
- 右上切換白天／夜晚、暫停動態

## 自訂資料

`office-data.json` 的格式（`serve.mjs` 產生的就是這個）：

```json
{
  "live": true,
  "source": "本機即時",
  "agents": [
    { "id": "sonnet", "name": "Sonnet", "role": "claude-sonnet-5-5", "color": "#2f74d0", "gear": "antenna" }
  ],
  "projects": [
    { "id": "token-meter", "name": "token-meter", "status": "build", "task": "外援 AI 用量併入 HUD", "members": ["sonnet"], "updated": "2026-11-12T10:00:00Z" }
  ]
}
```

- `live: true` 會關掉模擬並隱藏進度條與批准按鈕；省略則當成示範資料繼續模擬
- `status`：`build`、`plan`、`review`、`wait`、`stuck`、`queue`、`idle`
- `gear`：`antenna`、`cap`、`glasses`、`phones`、`visor`、`bow`、`leaf`
- 最多 12 間房
