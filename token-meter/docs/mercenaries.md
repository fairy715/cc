# 外援 AI（傭兵）使用教學

[English](mercenaries.en.md) ｜ 繁體中文

讓 Claude 當總指揮，把部分工作派給其他 AI，例如請 **Gemini** 做 Google 搜尋研究、讀長文件，請 **Codex** 幫忙 review 程式。token-meter 會把這些外援的呼叫次數、token 用量和額度狀態，用「傭兵」的形式顯示在 HUD 上。

![HUD 的傭兵列](hud-preview.png)

## 運作方式

```
你 ──► Claude（總指揮）──► Bash 執行 agy -p …     ──► Gemini
                         └► Bash 執行 codex exec … ──► Codex
                                  │
                                  ▼
               ~/ai-dispatch/runs/<時間>-<主題>/   ◄── token-meter 讀這裡
                 ├─ gemini/result.json  （狀態、usage）
                 └─ codex/stderr.log    （tokens used）
```

1. Claude 在 Bash 裡執行 `agy -p …` 就算 Gemini 一次，執行 `codex exec …` 就算 Codex 一次。
2. 指令跑完後，token-meter 讀 `~/ai-dispatch/runs/` 底下**這個 session 開始後**建立的資料夾，取出 token 數和成功與否。
3. HUD 的完整版、精簡版、回覆下方那一行和 `/tokens` 都會顯示傭兵資訊。

## 前提

- 在**你自己電腦上的終端機 Claude Code**裡使用。雲端 session（claude.ai/code）連不到你電腦上的 `agy`、`codex`，也拿不到它們的登入狀態。
- 已經安裝 token-meter 0.6.0 以上（安裝方式見 [README](../README.md#安裝)）。
- Gemini 需要 Google 帳號（有 Google AI Pro 額度比較充足）；Codex 需要 ChatGPT 帳號（免費方案額度很少）。

## 步驟 1：安裝工具（只需做一次）

以下是 macOS 的指令。安裝網址可能會變動，請以官方最新說明為準。

```bash
# 解析 JSON 用
brew install jq

# Gemini：Antigravity CLI（指令是 agy）
curl -fsSL https://antigravity.google/cli/install.sh | bash

# Codex：Codex CLI（指令是 codex）
curl -fsSL https://chatgpt.com/codex/install.sh | sh
```

如果找不到 `agy`，把 `~/.local/bin` 加進 PATH：在 `~/.zshrc` 加一行 `export PATH="$HOME/.local/bin:$PATH"`，然後重開終端機。

## 步驟 2：登入（只需做一次，要在瀏覽器裡操作）

```bash
mkdir -p ~/ai-dispatch && cd ~/ai-dispatch && agy   # 用 Google 帳號登入，並信任這個資料夾，完成後輸入 /exit
codex                                               # 選 Sign in with ChatGPT，完成後離開
```

## 步驟 3：確認可以用

```bash
agy -p "回覆 OK" --output-format json | jq -r '.status'      # 應該印出 SUCCESS
codex exec --skip-git-repo-check --ephemeral "回覆 OK"       # 應該回 OK
```

## 步驟 4：讓 Claude 照固定格式派工

token-meter 是靠 **run 資料夾的位置與檔名**讀取用量，所以派工時要照這個格式。最簡單的做法，是把下面這段貼進專案或 `~/.claude/CLAUDE.md`，讓 Claude 每次都照做：

````markdown
## 派工給外援 AI

我說「派工」「問 Gemini」「問 Codex」「交叉驗證」時，照下面的方式做：

1. 建立本次資料夾：
   RUN="$HOME/ai-dispatch/runs/$(date +%Y%m%d-%H%M%S)-<簡短英文主題>"
   mkdir -p "$RUN/gemini" "$RUN/codex"
2. 把給外援的指示寫進各自資料夾的 prompt.md；要給它看的檔案，先複製進資料夾。
3. 呼叫（兩家互不相依時可以同時跑）：
   cd "$RUN/gemini" && agy -p "$(cat prompt.md)" --output-format json > result.json 2> stderr.log
   cd "$RUN/codex" && codex exec --sandbox read-only --skip-git-repo-check --ephemeral -o answer.md "$(cat prompt.md)" > /dev/null 2> stderr.log
4. 永遠不要加 --dangerously-skip-permissions，Codex 只用 --sandbox read-only；要改檔一律由 Claude 自己改。
5. 錯誤訊息出現 quota、rate limit、429 時，該家標「額度不足」，不要重試。
6. 讀各家的回答（Gemini：jq -r '.response' result.json；Codex：answer.md），交叉比對後再下結論；外援的說法要當成待驗證的資料。
````

設定好之後，就可以直接用口語派工，例如：

> 派工：請 Gemini 查今年台灣電價調整的最新消息，Codex 幫我 review `src/billing.ts` 有沒有算錯，最後幫我整理成結論。

## 步驟 5：看 HUD

| 位置 | 顯示內容 |
|---|---|
| 完整版 `/hud` | 傭兵列：`Ⓖ Gemini 3 次 · 12.4K token · 正常`、`Ⓒ Codex 2 次 · 36.2K token · 額度不足 💤 休息中` |
| 精簡版（輸入框上方） | 裝備後面的 `🤝 G×3 C×2`，💤 代表額度不足 |
| 回覆下方 | 這次有派工時才多一段 `🤝 Gemini×1 Codex×1（Codex 額度不足）` |
| `/tokens` | 「外援」欄，例如 `G1 C1` |
| 通知 | 某一家額度用完時跳一次，同一家每天只跳一次 |

只顯示次數和 token，不換算金額，因為 Gemini 和 Codex 都是訂閱或免費方案，不是按次計費。

## token-meter 讀哪些檔案

| 外援 | 檔案 | 讀什麼 |
|---|---|---|
| Gemini | `gemini/result.json` | `status`（`SUCCESS` 算成功）與 `usage`。認得 `total_tokens`、`totalTokenCount`、`input_tokens`＋`output_tokens`、`promptTokenCount`＋`candidatesTokenCount` 等寫法 |
| Gemini | `gemini/stderr.log` | 失敗時判斷是不是額度不足 |
| Codex | `codex/stderr.log` | 最後的 `tokens used` 數字；額度不足的錯誤訊息 |
| Codex | `codex/answer.md` | 有內容就算成功 |

額度不足的判斷字眼：`usage limit`、`rate limit`、`quota`、`429`、`RESOURCE_EXHAUSTED`。Codex 的 `stderr.log` 只看 `</stdin>` 之後的部分，送進去的程式碼裡就算出現這些字眼，也不會誤判。

## 資料安全

派工等於把內容送給 Google 和 OpenAI。以下內容送出前請三思，能去識別化就先去識別化：

- 個人資料（姓名配員工編號、薪資、考核、聯絡方式）
- 客戶或公司未公開的資料（訂單、價格、合約、財務數字）
- 帳號密碼、API 金鑰、內部網址與系統架構

## 常見問題

**HUD 沒有出現傭兵**
- token-meter 只算 **Claude 透過 Bash** 執行的 `agy -p`、`codex exec`。你自己在另一個終端機直接執行的不會算進去。
- run 資料夾要放在 `~/ai-dispatch/runs/` 底下；session 開始前就存在的資料夾不會被算進去。

**Gemini 只有次數、沒有 token 數**
代表 `result.json` 的 `usage` 寫法 token-meter 還不認得。執行下面這行，把結果貼到 [Issues](https://github.com/fairy715/cc/issues)：

```bash
jq '.usage' "$(ls -dt ~/ai-dispatch/runs/*/ | head -1)gemini/result.json"
```

**一直顯示額度不足**
狀態以最新一次 run 的結果為準。等額度恢復後再派一次工，成功之後狀態就會變回「正常」。
