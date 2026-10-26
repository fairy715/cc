import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { expect, mock, test } from 'claude-code/testing'

import { bar, hudSvg, lastNo, replyLine, report, skillName } from '../hooks/hud'
import { mercsIn, noMercs, readCodex, readGemini, usageTokens } from '../hooks/mercs'

const usage = (input: number, output: number, read: number, write: number, model = 'claude-test') => ({
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: read,
  cache_creation_input_tokens: write,
  model,
})

const composer = { kind: 'composer' } as const
const presentation = { isFullscreen: false, columns: 120 }
const view = { scroll: { offset: 0, bodyRows: 40 }, view: {} }

type World = { usd: number; contextPercent?: number; fiveHourUsed?: number; twd: number | null; opened?: string[]; closed?: string[] }

const engine = (on: On, world: World) => {
  mock.clock(on, { now: 1000 })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.open', ($, e) => (world.opened?.push(e.id), { value: { isPlaced: true as const } }))
  on('ui.close', ($, e) => (world.closed?.push(e.id), { value: undefined }))
  on('tool.list', () => ({
    value: [
      { name: 'Bash', description: '', mcp: false },
      { name: 'mcp__Google_Drive__search', description: '', mcp: true },
      { name: 'mcp__Notion__fetch', description: '', mcp: true },
    ],
  }))
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { window: 200000, percent: world.contextPercent },
      rateLimits: world.fiveHourUsed === undefined ? [] : [{ kind: 'five_hour', percentUsed: world.fiveHourUsed }],
      cost: { usd: world.usd },
    },
  }))
  on('http.fetch', () => ({
    value:
      world.twd === null
        ? { status: 503, ok: false, headers: {}, text: '' }
        : { status: 200, ok: true, headers: {}, text: JSON.stringify({ rates: { TWD: world.twd } }) },
  }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('tool.call', () => ({ result: {} }) as never)
  on('turn.complete', ($, e) => ({ text: e.answer, usage: e.usage }))
}

const start = ($: Engine) =>
  $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

test('每次送出記錄 token 與費用差額，子代理一併加總，台幣用設定匯率', { options: { liveRate: false, twdRate: 32 } }, async ($, on) => {
  const world: World = { usd: 1.5, twd: null }
  engine(on, world)

  await start($)
  await $.prompt.submit({ text: 'hi', wait: false, origin: composer })
  await $.turn.complete({
    answer: '', durationMs: 1, isAborted: false, turnId: 'a', agentId: 'sub-1',
    reason: 'answer', usage: usage(10, 20, 0, 0),
  })
  world.usd = 1.75
  await $.turn.complete({
    answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1',
    reason: 'answer', usage: usage(100, 50, 1000, 200),
  })

  const out = await $.command.run({ command: 'tokens', args: '', origin: composer, presentation })
  expect(out.text).toContain('| 1 | 1.3K | 76% | 70 | `██████████` | **$0.2500** | NT$8.00 | 0s +1子 |')
  expect(out.text).toContain('累計 **US$1.7500** · **NT$56.00**')
  expect(out.text).toContain('匯率 1 USD = 32.00 TWD（設定值）')
})

test('開啟即時匯率時用抓到的匯率', async ($, on) => {
  const world: World = { usd: 0, twd: 30 }
  engine(on, world)

  await start($)
  await $.prompt.submit({ text: 'hi', wait: false, origin: composer })
  world.usd = 0.1
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', usage: usage(1, 1, 0, 0) })

  const out = await $.command.run({ command: 'tokens', args: '', origin: composer, presentation })
  expect(out.text).toContain('| **$0.1000** | NT$3.00 |')
  expect(out.text).toContain('匯率 1 USD = 30.00 TWD（即時）')
})

test('即時匯率抓取失敗時退回設定值', { options: { twdRate: 31 } }, async ($, on) => {
  engine(on, { usd: 0, twd: null })

  await start($)
  await $.prompt.submit({ text: 'hi', wait: false, origin: composer })
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', usage: usage(1, 1, 0, 0) })

  const out = await $.command.run({ command: 'tokens', args: '', origin: composer, presentation })
  expect(out.text).toContain('匯率 1 USD = 31.00 TWD（設定值）')
})

test('回覆下方自動顯示燒掉的 token、紅藍球剩餘與這次用的技能', { options: { liveRate: false, twdRate: 32 } }, async ($, on) => {
  const world: World = { usd: 0, contextPercent: 38, fiveHourUsed: 20, twd: null }
  engine(on, world)

  await start($)
  await $.prompt.submit({ text: 'hi', wait: false, origin: composer })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'b1', command: 'ls' } as never)
  await $.tool.call({ tool: 'Bash', tool_use_id: 'b2', command: 'pwd' } as never)
  world.usd = 0.25
  const done = await $.turn.complete({
    answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', usage: usage(100, 50, 900, 0),
  })

  expect(done.text).toBe('🔥 本次 1.0K token · NT$8.00 · 🔴 上下文剩 62% · 🔵 5 小時額度剩 80% · 💰 累計 NT$8.00 · ⚔ ⚡Bash×2')
})

test('關掉 replyLine 時回覆不變', { options: { liveRate: false, replyLine: false } }, async ($, on) => {
  engine(on, { usd: 0, twd: null })

  await start($)
  await $.prompt.submit({ text: 'hi', wait: false, origin: composer })
  const done = await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', usage: usage(1, 1, 0, 0) })

  expect(done.text).toBe('ok')
})

test('輸入框上方：桌面版畫精簡 SVG HUD，其他畫文字', { options: { liveRate: false, twdRate: 32 } }, async ($, on) => {
  const world: World = { usd: 0, contextPercent: 38, twd: null }
  engine(on, world)

  await start($)
  await $.prompt.submit({ text: 'hi', wait: false, origin: composer })
  world.usd = 0.25
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', usage: usage(100, 50, 900, 0) })

  for (const surface of ['terminal', 'desktop', 'mobile'] as const) {
    const ui = await $.ui.mount({
      plugin: 'token-meter', surface, component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 3, bodyColumns: 120, ...view },
    })
    const drawn = JSON.stringify(await ui.drawn())
    expect(drawn).toContain('NT$8.00')
    if (surface === 'desktop') {
      expect(drawn).toContain('"type":"Svg"')
      expect(drawn).toContain('>62%<')
    } else {
      expect(drawn).toContain('"62%"')
    }
    await ui.unmount()
  }
})

test('HUD 面板：桌面與手機畫 SVG 紅藍球，終端機畫文字', { options: { liveRate: false, twdRate: 32, budgetTwd: 100 } }, async ($, on) => {
  const world: World = { usd: 0, contextPercent: 38, fiveHourUsed: 20, twd: null }
  engine(on, world)

  await start($)
  await $.prompt.submit({ text: 'hi', wait: false, origin: composer })
  await $.tool.call({ tool: 'Grep', tool_use_id: 'g1', pattern: 'x' } as never)
  world.usd = 0.25
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', usage: usage(100, 50, 900, 0) })

  const pane = { title: 'Token HUD', isFocused: false, bodyColumns: 100, placement: 'dock' as const, ...view }
  for (const surface of ['desktop', 'mobile'] as const) {
    const ui = await $.ui.mount({ plugin: 'token-meter', surface, component: 'Pane', requestId: 'token-hud', props: pane } as never)
    const drawn = JSON.stringify(await ui.drawn())
    expect(drawn).toContain('"type":"Svg"')
    expect(drawn).toContain('上下文剩餘')
    expect(drawn).toContain('5 小時額度剩餘')
    expect(drawn).toContain('MCP×2')
    await ui.unmount()
  }

  const term = await $.ui.mount({ plugin: 'token-meter', surface: 'terminal', component: 'Pane', requestId: 'token-hud', props: pane } as never)
  const text = JSON.stringify(await term.drawn())
  expect(text).toContain('[1 Grep×1]')
  expect(text).toContain('Google Drive、Notion')
  await term.unmount()
})

test('技能列名稱：Skill 用技能名、MCP 用伺服器名', () => {
  expect(skillName('Skill', 'anthropic-skills:pdf')).toBe('✨pdf')
  expect(skillName('mcp__Google_Drive__search_files')).toBe('🔮Google Drive')
  expect(skillName('Bash')).toBe('Bash')
})

test('長條圖與 SVG 填滿比例', () => {
  expect(bar(5, 10)).toBe('█████░░░░░')
  expect(bar(0, 0)).toBe('░░░░░░░░░░')
  const svg = hudSvg({
    history: [], total: null, rate: { twdPerUsd: 32, isLive: false }, skills: [],
    gear: { model: '', mcp: [] }, vitals: { contextLeft: 50, quotaLeft: null, quotaLabel: '額度' }, budgetTwd: 300, mercs: noMercs(),
  })
  expect(svg.startsWith('<svg')).toBe(true)
  expect(svg).toContain('>50%<')
})

test('/hud off 關閉面板，autoOpen 關掉時不自動打開', { options: { autoOpen: false } }, async ($, on) => {
  const opened: string[] = []
  const closed: string[] = []
  engine(on, { usd: 0, twd: null, opened, closed })

  await start($)
  expect(opened).toEqual([])

  const off = await $.command.run({ command: 'hud', args: 'off', origin: composer, presentation })
  expect(closed).toEqual(['token-hud'])
  expect(off.text).toContain('已關閉')

  await $.command.run({ command: 'hud', args: '', origin: composer, presentation })
  expect(opened).toEqual(['token-hud'])
})

test('/hud 在對話裡畫出 SVG HUD（桌面、手機），/hud off 不畫', { options: { liveRate: false, twdRate: 32 } }, async ($, on) => {
  const world: World = { usd: 0, contextPercent: 8, fiveHourUsed: 16, twd: null }
  engine(on, world)
  on('ui.render', { component: 'CommandOutput' }, () => ({ type: 'Text', children: ['engine row'] }) as never)

  await start($)
  await $.prompt.submit({ text: 'hi', wait: false, origin: composer })
  world.usd = 0.4244
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', usage: usage(100, 50, 379500, 0) })

  const row = (args: string) => ({ command: 'hud', args, text: 'Token HUD', isErrored: false })
  for (const surface of ['desktop', 'mobile'] as const) {
    const ui = await $.ui.mount({ plugin: 'token-meter', surface, component: 'CommandOutput', props: row('') } as never)
    const drawn = JSON.stringify(await ui.drawn())
    expect(drawn).toContain('"type":"Svg"')
    expect(drawn).toContain('>92%<')
    expect(drawn).toContain('>84%<')
    await ui.unmount()
  }

  const off = await $.ui.mount({ plugin: 'token-meter', surface: 'desktop', component: 'CommandOutput', props: row('off') } as never)
  expect(JSON.stringify(await off.drawn())).toContain('engine row')
  await off.unmount()
})

test('回覆下方的技能次數只算這一次，不是整個 session 累計', { options: { liveRate: false } }, async ($, on) => {
  engine(on, { usd: 0, twd: null })
  await start($)

  await $.prompt.submit({ text: 'one', wait: false, origin: composer })
  for (const id of ['a', 'b', 'c']) await $.tool.call({ tool: 'Bash', tool_use_id: id, command: 'ls' } as never)
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', usage: usage(1, 1, 0, 0) })

  await $.prompt.submit({ text: 'two', wait: false, origin: composer })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'd', command: 'ls' } as never)
  await $.tool.call({ tool: 'Read', tool_use_id: 'e', file_path: '/x' } as never)
  await $.tool.call({ tool: 'Read', tool_use_id: 'f', file_path: '/y' } as never)
  const done = await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer', usage: usage(1, 1, 0, 0) })

  expect(done.text).toContain('⚔ 👁Read×2 ⚡Bash×1')
  expect(done.text).not.toContain('Bash×4')
})

test('超過 200 筆後，序號繼續往上數，金框只亮最新一次用過的技能', () => {
  const send = (no: number) => ({
    at: 0, model: 'm', input: 1, cacheRead: 0, cacheWrite: 0, output: 1, usd: 0.01, seconds: 1, subagentTurns: 0, no,
  })
  const history = Array.from({ length: 200 }, (_, i) => send(102 + i))
  const d = {
    history, total: 2, rate: { twdPerUsd: 32, isLive: false },
    skills: [
      { name: 'Bash', count: 50, lastSend: 301, lastCount: 2 },
      { name: 'Read', count: 80, lastSend: 250, lastCount: 5 },
    ],
    gear: { model: 'm', mcp: [] }, vitals: { contextLeft: 50, quotaLeft: null, quotaLabel: '額度' }, budgetTwd: 300, mercs: noMercs(),
  }

  expect(lastNo(history)).toBe(301)
  expect(report(d)).toContain('| 301 |')
  expect(report(d)).toContain('共 200 次送出')
  expect(replyLine(d)).toContain('⚔ ⚡Bash×2')
  expect(replyLine(d)).not.toContain('Read')
  expect(hudSvg(d)).toContain('第 301 次燒掉')
})

const CODEX_STDERR = [
  'reading prompt from stdin...',
  '<stdin>',
  '   88\t  // retry on 429 or quota errors',
  '</stdin>',
  'codex',
  '{"summary":"發現 4 個問題","findings":[]}',
  'tokens used',
  '36,176',
].join('\n')

test('偵測派工指令：agy -p 是 Gemini，codex exec 是 Codex', () => {
  expect(mercsIn('cd "$RUN/gemini" && agy -p "$(cat prompt.md)" --output-format json > result.json')).toEqual(['gemini'])
  expect(mercsIn('cd "$RUN/codex" && codex exec --sandbox read-only --skip-git-repo-check -o answer.md "x"')).toEqual(['codex'])
  expect(mercsIn('(cd a && agy -p "q" > r.json) & (cd b && codex exec "q") ; wait')).toEqual(['gemini', 'codex'])
  expect(mercsIn('agy models')).toEqual([])
  expect(mercsIn('echo "agy -p 寫在引號裡的字" | grep codex')).toEqual([])
  expect(mercsIn('codex login status')).toEqual([])
})

test('讀 Codex 的 tokens used；輸入裡的 429、quota 字樣不算額度不足', () => {
  expect(readCodex(CODEX_STDERR, true, 1)).toEqual({ tokens: 36176, status: 'ok', at: 1 })
  expect(readCodex('ERROR: You have hit your usage limit. Try again later.', false, 2)).toEqual({ tokens: null, status: 'quota', at: 2 })
  expect(readCodex('error: something broke', false, 3)?.status).toBe('fail')
  expect(readCodex(null, false, 4)).toBeNull()
})

test('Gemini 的 usage：認得常見的 token 欄位寫法，認不出來就留空', () => {
  expect(usageTokens({ totalTokens: 100 })).toBe(100)
  expect(usageTokens({ input_tokens: 10, output_tokens: 5 })).toBe(15)
  expect(usageTokens({ promptTokenCount: 4, candidatesTokenCount: 6 })).toBe(10)
  expect(usageTokens({ models: { a: { total: 7 }, b: { total: 3 } } })).toBe(10)
  expect(usageTokens({ requests: 'x' })).toBeNull()
  expect(readGemini(JSON.stringify({ status: 'SUCCESS', usage: { total_tokens: 1234 } }), null, 5)).toEqual({ tokens: 1234, status: 'ok', at: 5 })
  expect(readGemini(JSON.stringify({ status: 'ERROR' }), 'RESOURCE_EXHAUSTED: quota exceeded', 6)?.status).toBe('quota')
})

test('派工後：回覆下方、/tokens、HUD 都顯示傭兵；額度不足跳一次通知', { options: { liveRate: false } }, async ($, on) => {
  const home = '/home/u'
  const runs = home + '/ai-dispatch/runs'
  const files = new Map<string, string>([
    [runs + '/20261026-143110-review/codex/stderr.log', CODEX_STDERR],
    [runs + '/20261026-143110-review/codex/answer.md', '{"summary":"ok"}'],
    [runs + '/20261026-150000-research/gemini/result.json', JSON.stringify({ status: 'ERROR' })],
    [runs + '/20261026-150000-research/gemini/stderr.log', 'quota exceeded (429)'],
  ])
  const toasts: string[] = []
  engine(on, { usd: 0, twd: null })
  mock.env(on, { HOME: home })
  mock.store(on)
  on('ui.toast', ($, e) => (toasts.push(e.text), { value: undefined }))
  on('fs.exists', ($, e) => ({ value: e.path === runs || files.has(e.path) }))
  on('fs.read', ($, e) => ({ value: files.get(e.path) ?? '' }))
  on('fs.list', () => ({
    value: [
      { name: '20261026-143110-review', kind: 'dir' as const, size: 0, mtimeMs: 5000, isLink: false },
      { name: '20261026-150000-research', kind: 'dir' as const, size: 0, mtimeMs: 6000, isLink: false },
      { name: 'old-run', kind: 'dir' as const, size: 0, mtimeMs: -1, isLink: false },
    ],
  }))

  await start($)
  await $.prompt.submit({ text: '派工', wait: false, origin: composer })
  await $.tool.call({ tool: 'Bash', tool_use_id: 'c1', command: 'cd "$RUN/codex" && codex exec --sandbox read-only -o answer.md "q"' } as never)
  await $.tool.call({ tool: 'Bash', tool_use_id: 'g1', command: 'cd "$RUN/gemini" && agy -p "q" --output-format json > result.json' } as never)
  const done = await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer', usage: usage(1, 1, 0, 0) })

  expect(done.text).toContain('🤝 Gemini×1 Codex×1（Gemini 額度不足）')
  expect(toasts).toEqual(['Gemini 額度不足，今天先讓它休息'])

  const out = await $.command.run({ command: 'tokens', args: '', origin: composer, presentation })
  expect(out.text).toContain('| G1 C1 |')

  const ui = await $.ui.mount({ plugin: 'token-meter', surface: 'desktop', component: 'CommandOutput', props: { command: 'hud', args: '', text: '', isErrored: false } } as never)
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('Codex 1 次 · 36.2K token · 正常')
  expect(drawn).toContain('Gemini 1 次 · 額度不足 💤 休息中')
  await ui.unmount()

  await $.prompt.submit({ text: '再一次', wait: false, origin: composer })
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer', usage: usage(1, 1, 0, 0) })
  expect(toasts).toHaveLength(1)
})
