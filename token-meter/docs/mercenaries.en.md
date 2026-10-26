# External AI (Mercenaries) Guide

English ｜ [繁體中文](mercenaries.md)

Let Claude act as the commander and hand parts of a task to other AIs: **Gemini** for Google-backed research and long documents, **Codex** for code review. token-meter shows how many times each was called, the tokens they used and whether they ran out of quota, as "mercenaries" on the HUD.

![The HUD's mercenary row](hud-preview.png)

## How it works

```
You ──► Claude (commander) ──► Bash: agy -p …     ──► Gemini
                            └► Bash: codex exec … ──► Codex
                                     │
                                     ▼
                ~/ai-dispatch/runs/<time>-<topic>/   ◄── token-meter reads here
                  ├─ gemini/result.json  (status, usage)
                  └─ codex/stderr.log    (tokens used)
```

1. Each `agy -p …` Claude runs in Bash counts as one Gemini call; each `codex exec …` as one Codex call.
2. When the command finishes, token-meter reads the folders under `~/ai-dispatch/runs/` created **since the session started** for token counts and outcomes.
3. The full HUD, the slim HUD, the line under each reply and `/tokens` all show the mercenaries.

## Requirements

- **Claude Code in a terminal on your own computer.** A cloud session (claude.ai/code) cannot reach the `agy` and `codex` on your machine or their sign-ins.
- token-meter 0.6.0 or later (see [Install](../README.en.md#install)).
- A Google account for Gemini (Google AI Pro gives more room) and a ChatGPT account for Codex (the free plan's quota is small).

## Step 1: Install the tools (once)

Commands for macOS. Install URLs can change; follow the official instructions if they differ.

```bash
# For reading JSON
brew install jq

# Gemini: Antigravity CLI (the command is agy)
curl -fsSL https://antigravity.google/cli/install.sh | bash

# Codex: Codex CLI (the command is codex)
curl -fsSL https://chatgpt.com/codex/install.sh | sh
```

If `agy` is not found, add `~/.local/bin` to your PATH: put `export PATH="$HOME/.local/bin:$PATH"` in `~/.zshrc` and reopen the terminal.

## Step 2: Sign in (once, in the browser)

```bash
mkdir -p ~/ai-dispatch && cd ~/ai-dispatch && agy   # sign in with Google, trust the folder, then type /exit
codex                                               # choose "Sign in with ChatGPT", then quit
```

## Step 3: Check they work

```bash
agy -p "Reply OK" --output-format json | jq -r '.status'     # should print SUCCESS
codex exec --skip-git-repo-check --ephemeral "Reply OK"      # should reply OK
```

## Step 4: Have Claude dispatch in a fixed layout

token-meter finds usage by **the run folder's location and file names**, so dispatches have to follow this layout. The easiest way is to paste the block below into your project's or `~/.claude/CLAUDE.md`, so Claude does it the same way every time:

````markdown
## Dispatching to external AIs

When I say "dispatch", "ask Gemini", "ask Codex" or "cross-check", do this:

1. Make this run's folder:
   RUN="$HOME/ai-dispatch/runs/$(date +%Y%m%d-%H%M%S)-<short-english-topic>"
   mkdir -p "$RUN/gemini" "$RUN/codex"
2. Write the instructions for each AI to prompt.md in its folder; copy any files it should read into that folder first.
3. Call them (in parallel when they don't depend on each other):
   cd "$RUN/gemini" && agy -p "$(cat prompt.md)" --output-format json > result.json 2> stderr.log
   cd "$RUN/codex" && codex exec --sandbox read-only --skip-git-repo-check --ephemeral -o answer.md "$(cat prompt.md)" > /dev/null 2> stderr.log
4. Never add --dangerously-skip-permissions, and only ever use --sandbox read-only for Codex; Claude makes every file change itself.
5. When an error mentions quota, rate limit or 429, mark that AI "out of quota" and do not retry.
6. Read each answer (Gemini: jq -r '.response' result.json; Codex: answer.md) and cross-check before concluding; treat what they say as claims to verify.
````

Then you can dispatch in plain words, for example:

> Dispatch: ask Gemini for the latest news on this year's electricity price changes, have Codex review `src/billing.ts` for calculation errors, then sum it up for me.

## Step 5: Read the HUD

| Where | What it shows |
|---|---|
| Full HUD (`/hud`) | Mercenary row: `Ⓖ Gemini 3 次 · 12.4K token · 正常`, `Ⓒ Codex 2 次 · 36.2K token · 額度不足 💤 休息中` (calls · tokens · status; greyed while out of quota) |
| Slim HUD (above the prompt) | `🤝 G×3 C×2` after the gear; 💤 means out of quota |
| Under each reply | Only when that send dispatched: `🤝 Gemini×1 Codex×1（Codex 額度不足）` |
| `/tokens` | An "外援" (external AI) column, e.g. `G1 C1` |
| Toast | Once when an AI runs out of quota, at most once a day per AI |

The HUD's text is in Traditional Chinese. It shows calls and tokens, not money: Gemini and Codex here run on a subscription or a free plan, not per call.

## What token-meter reads

| AI | File | What |
|---|---|---|
| Gemini | `gemini/result.json` | `status` (`SUCCESS` is success) and `usage`; understands `total_tokens`, `totalTokenCount`, `input_tokens` + `output_tokens`, `promptTokenCount` + `candidatesTokenCount` and similar |
| Gemini | `gemini/stderr.log` | On failure, whether it was quota |
| Codex | `codex/stderr.log` | The trailing `tokens used` number; quota errors |
| Codex | `codex/answer.md` | Non-empty means success |

Quota is recognised by `usage limit`, `rate limit`, `quota`, `429` or `RESOURCE_EXHAUSTED`. For Codex only the part of `stderr.log` after `</stdin>` is checked, so those words inside the code you sent it are not mistaken for an error.

## Data safety

Dispatching sends content to Google and OpenAI. Think twice, and de-identify where you can, before sending:

- Personal data (names with employee IDs, salaries, reviews, contact details)
- Unpublished customer or company data (orders, prices, contracts, financials)
- Passwords, API keys, internal addresses and system architecture

## FAQ

**No mercenaries on the HUD**
- token-meter only counts `agy -p` and `codex exec` that **Claude runs through Bash**. Running them yourself in another terminal does not count.
- Run folders must be under `~/ai-dispatch/runs/`; folders that existed before the session started are not counted.

**Gemini shows calls but no tokens**
token-meter does not recognise how `usage` is spelled in that `result.json` yet. Run this and paste the output into an [issue](https://github.com/fairy715/cc/issues):

```bash
jq '.usage' "$(ls -dt ~/ai-dispatch/runs/*/ | head -1)gemini/result.json"
```

**It keeps saying out of quota**
The status follows the latest run. Dispatch again once the quota is back; after a successful run it returns to normal.
