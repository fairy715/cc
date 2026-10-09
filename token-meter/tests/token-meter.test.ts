import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const usage = (input: number, output: number, read: number, write: number, model = 'claude-test') => ({
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: read,
  cache_creation_input_tokens: write,
  model,
})

const composer = { kind: 'composer' } as const

const engine = (on: On, cost: { usd: number }, twd: number | null) => {
  mock.clock(on, { now: 1000 })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.status', () => ({ value: undefined }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [], cost: { usd: cost.usd } } }))
  on('http.fetch', () => ({
    value:
      twd === null
        ? { status: 503, ok: false, headers: {}, text: '' }
        : { status: 200, ok: true, headers: {}, text: JSON.stringify({ rates: { TWD: twd } }) },
  }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('turn.complete', ($, e) => ({ text: e.answer, usage: e.usage }))
}

test('每次送出記錄 token 與費用差額，子代理一併加總，台幣用設定匯率', { options: { liveRate: false, twdRate: 32 } }, async ($, on) => {
  const cost = { usd: 1.5 }
  engine(on, cost, null)

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'hi', wait: false, origin: composer })
  await $.turn.complete({
    answer: '', durationMs: 1, isAborted: false, turnId: 'a', agentId: 'sub-1',
    reason: 'answer', usage: usage(10, 20, 0, 0),
  })
  cost.usd = 1.75
  await $.turn.complete({
    answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1',
    reason: 'answer', usage: usage(100, 50, 1000, 200),
  })

  const out = await $.command.run({
    command: 'tokens', args: '', origin: composer, presentation: { isFullscreen: false, columns: 120 },
  })
  expect(out.text).toContain('輸入 1,310（快取讀 1,000／寫 200）· 輸出 70 · US$0.2500（NT$8.00）')
  expect(out.text).toContain('累計：US$1.7500（NT$56.00）')
  expect(out.text).toContain('匯率 1 USD = 32.00 TWD（設定值）')
})

test('開啟即時匯率時用抓到的匯率', async ($, on) => {
  const cost = { usd: 0 }
  engine(on, cost, 30)

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'hi', wait: false, origin: composer })
  cost.usd = 0.1
  await $.turn.complete({
    answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1',
    reason: 'answer', usage: usage(1, 1, 0, 0),
  })

  const out = await $.command.run({
    command: 'tokens', args: '', origin: composer, presentation: { isFullscreen: false, columns: 120 },
  })
  expect(out.text).toContain('US$0.1000（NT$3.00）')
  expect(out.text).toContain('匯率 1 USD = 30.00 TWD（即時）')
})

test('即時匯率抓取失敗時退回設定值', { options: { twdRate: 31 } }, async ($, on) => {
  engine(on, { usd: 0 }, null)

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ text: 'hi', wait: false, origin: composer })
  await $.turn.complete({
    answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1',
    reason: 'answer', usage: usage(1, 1, 0, 0),
  })

  const out = await $.command.run({
    command: 'tokens', args: '', origin: composer, presentation: { isFullscreen: false, columns: 120 },
  })
  expect(out.text).toContain('匯率 1 USD = 31.00 TWD（設定值）')
})
