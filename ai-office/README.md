# AI Agent 虛擬辦公室

浮島上的 3D 辦公室：每個專案一間房，AI 成員（總指揮、Fable、Opus、Sonnet、Haiku、Gemini、Codex）在房間之間走動。單一檔案 `index.html`，用 Three.js 基本幾何體畫成，沒有外部素材。

## 怎麼開

用任何靜態伺服器開這個資料夾，例如：

```bash
python3 -m http.server 8000 --directory ai-office
```

然後開 `http://localhost:8000`。

## 操作

- 拖曳旋轉、滾輪或雙指縮放、Shift＋拖曳（或右鍵拖曳）平移
- 點房間、角色、名牌或左側清單看詳情
- 「等你批准」可按批准，「卡住」可重試，「閒置／排隊」可派新任務
- 右上切換白天／夜晚、暫停動態

## 接上自己的資料

同資料夾放一份 `office-data.json` 就會取代示範資料（最多 12 個專案）：

```json
{
  "agents": [
    { "id": "sonnet", "name": "Sonnet", "role": "實作工程師", "color": "#2f74d0", "gear": "antenna" }
  ],
  "projects": [
    { "id": "token-meter", "name": "token-meter", "status": "build", "task": "外援 AI 用量併入 HUD", "members": ["sonnet"], "progress": 42 }
  ]
}
```

- `status`：`build` 實作中、`plan` 計畫中、`review` 審查中、`wait` 等你批准、`stuck` 卡住、`queue` 排隊、`idle` 閒置
- `gear`：`antenna`、`cap`、`glasses`、`phones`、`visor`、`bow`、`leaf`

目前進度是頁面自己模擬的，還沒有接真實的工作階段。
