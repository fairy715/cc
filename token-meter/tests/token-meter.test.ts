import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { expect, mock, test } from 'claude-code/testing'

import { bar, hudSvg, skillName } from '../hooks/hud'

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

test('輸入框上方一行在各介面都畫得出', { options: { liveRate: false, twdRate: 32 } }, async ($, on) => {
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
    expect(drawn).toContain('"62%"')
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
    gear: { model: '', mcp: [] }, vitals: { contextLeft: 50, quotaLeft: null, quotaLabel: '額度' }, budgetTwd: 300,
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
