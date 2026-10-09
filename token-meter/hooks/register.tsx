import { atom, read, update } from 'claude-code'
import type { EngineInterface, ModelUsage, Register } from 'claude-code'

import type { Send } from '../types'

const history = atom({ plugin: 'token-meter', key: 'history' } as const, [])
const sessionUsd = atom({ plugin: 'token-meter', key: 'sessionUsd' } as const, null)

const zero = (): ModelUsage => ({
  input_tokens: 0,
  output_tokens: 0,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
})

const add = (a: ModelUsage, b: ModelUsage): ModelUsage => ({
  input_tokens: a.input_tokens + b.input_tokens,
  output_tokens: a.output_tokens + b.output_tokens,
  cache_read_input_tokens: a.cache_read_input_tokens + b.cache_read_input_tokens,
  cache_creation_input_tokens: a.cache_creation_input_tokens + b.cache_creation_input_tokens,
})

export const num = (n: number): string => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

export const usd = (n: number | null): string => (n === null ? 'US$—' : `US$${n.toFixed(4)}`)

export const totalIn = (s: Send): number => s.input + s.cacheRead + s.cacheWrite

export const line = (s: Send): string =>
  `輸入 ${num(totalIn(s))}（快取讀 ${num(s.cacheRead)}／寫 ${num(s.cacheWrite)}）· 輸出 ${num(s.output)} · ${usd(s.usd)}`

const costNow = async ($: EngineInterface): Promise<number | null> => (await $.session.usage()).cost?.usd ?? null

export const register: Register = on => {
  let baseUsd: number | null = null
  let startedAt = 0
  let acc = zero()
  let subagentTurns = 0

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'tokens',
      description: '列出最近 10 次送出的 token 用量與費用',
    })

    return next(e)
  })

  on('command.run', { command: 'tokens' }, async $ => {
    const list = await read($, history)
    const total = await read($, sessionUsd)

    if (list.length === 0) {
      return { text: '還沒有紀錄：送出一則訊息後再試。' }
    }

    const rows = list.slice(-10).map((s, i) => `${i + 1}. ${line(s)} · ${s.seconds}s · ${s.model}`)

    return { text: [...rows, `本 session 累計：${usd(total)}`].join('\n') }
  })

  on('prompt.submit', async ($, e, next) => {
    // A prompt delivered into a running turn belongs to that turn's tally.
    if (e.turnId === undefined) {
      acc = zero()
      subagentTurns = 0
      await Promise.all([costNow($), $.clock.now()])
        .then(([usd, now]) => {
          baseUsd = usd
          startedAt = now
        })
        .catch(() => {
          baseUsd = null
          startedAt = 0
        })
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)

    if (e.usage) {
      acc = add(acc, e.usage)
    }

    if (e.agentId !== undefined) {
      subagentTurns += 1
      return done
    }

    const now = await costNow($)
    const send: Send = {
      at: await $.clock.now(),
      model: e.usage?.model ?? '',
      input: acc.input_tokens,
      cacheRead: acc.cache_read_input_tokens,
      cacheWrite: acc.cache_creation_input_tokens,
      output: acc.output_tokens,
      usd: now !== null && baseUsd !== null ? Math.max(0, now - baseUsd) : null,
      seconds: startedAt > 0 ? Math.round(((await $.clock.now()) - startedAt) / 1000) : 0,
      subagentTurns,
    }

    await update($, history, list => [...list, send].slice(-200))
    await update($, sessionUsd, () => now)
    $.ui.status(`本次 ${usd(send.usd)} ｜ 累計 ${usd(now)}`)

    baseUsd = now
    acc = zero()
    subagentTurns = 0

    return done
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, history)
    const last = list[list.length - 1]

    if (e.props.hasSurvey || last === undefined) {
      return next(e)
    }

    const total = await read($, sessionUsd)
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text dimColor>
          上次送出：{line(last)}
          {last.subagentTurns > 0 ? `（含子代理 ${last.subagentTurns} 回合）` : ''} ｜ 累計 {usd(total)}
        </Text>
      </Box>
    )
  })
}
