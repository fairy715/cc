import { expect, mock, test } from 'claude-code/testing'

const usage = (input: number, output: number, read: number, write: number, model = 'claude-test') => ({
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: read,
  cache_creation_input_tokens: write,
  model,
})

test('每次送出記錄 token 與費用差額，子代理一併加總', async ($, on) => {
  let usd = 1.5
  const clock = mock.clock(on, { now: 1000 })
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000 }, rateLimits: [], cost: { usd } } }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('turn.complete', ($, e) => ({ text: e.answer, usage: e.usage }))

  await $.prompt.submit({ text: 'hi', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete({
    answer: '', durationMs: 1, isAborted: false, turnId: 'a', agentId: 'sub-1',
    reason: 'answer', usage: usage(10, 20, 0, 0),
  })
  usd = 1.75
  await clock.advance(3000)
  await $.turn.complete({
    answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1',
    reason: 'answer', usage: usage(100, 50, 1000, 200),
  })

  const out = await $.command.run({
    command: 'tokens', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 },
  })
  expect(out.text).toContain('輸入 1,310（快取讀 1,000／寫 200）· 輸出 70 · US$0.2500')
  expect(out.text).toContain('累計：US$1.7500')
})
