import { atom, read, update } from 'claude-code'
import type { EngineInterface, ModelUsage, Register } from 'claude-code'

import type { Rate, Send } from '../types'

const history = atom({ plugin: 'token-meter', key: 'history' } as const, [])
const sessionUsd = atom({ plugin: 'token-meter', key: 'sessionUsd' } as const, null)
const rate = atom({ plugin: 'token-meter', key: 'rate' } as const, null)

const RATE_URL = 'https://open.er-api.com/v6/latest/USD'
const DEFAULT_TWD_RATE = 31.9

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

export const money = (n: number | null, r: Rate): string =>
  n === null ? 'US$—' : `US$${n.toFixed(4)}（NT$${(n * r.twdPerUsd).toFixed(2)}）`

export const totalIn = (s: Send): number => s.input + s.cacheRead + s.cacheWrite

export const rateNote = (r: Rate): string =>
  `匯率 1 USD = ${r.twdPerUsd.toFixed(2)} TWD（${r.isLive ? '即時' : '設定值'}）`

export const ntd = (n: number | null, r: Rate): string => (n === null ? '—' : `NT$${(n * r.twdPerUsd).toFixed(2)}`)

export const compact = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : String(Math.round(n))

export const bar = (value: number, max: number, width = 10): string => {
  const filled = max > 0 ? Math.round((value / max) * width) : 0

  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

export const hitRate = (s: Send): number => {
  const all = totalIn(s)

  return all > 0 ? s.cacheRead / all : 0
}

// The /tokens report: markdown, which every surface draws as a table.
export const report = (list: readonly Send[], total: number | null, r: Rate): string => {
  const recent = list.slice(-10)
  const first = list.length - recent.length
  const maxUsd = Math.max(0, ...recent.map(s => s.usd ?? 0))
  const priced = list.filter(s => s.usd !== null)
  const sum = priced.reduce((n, s) => n + (s.usd ?? 0), 0)
  const average = priced.length > 0 ? sum / priced.length : null
  const model = recent[recent.length - 1]?.model
  const top = priced.reduce<Send | null>((a, s) => (a === null || (s.usd ?? 0) > (a.usd ?? 0) ? s : a), null)

  const rows = recent.map((s, i) => {
    const sub = s.subagentTurns > 0 ? ` +${s.subagentTurns}子` : ''

    return `| ${first + i + 1} | ${compact(totalIn(s))} | ${Math.round(hitRate(s) * 100)}% | ${compact(s.output)} | \`${bar(s.usd ?? 0, maxUsd)}\` | **${s.usd === null ? '—' : `$${s.usd.toFixed(4)}`}** | ${ntd(s.usd, r)} | ${s.seconds}s${sub} |`
  })

  return [
    `### 💰 本 session 累計 **${total === null ? 'US$—' : `US$${total.toFixed(4)}`}** · **${ntd(total, r)}**`,
    '',
    `共 ${list.length} 次送出 · 平均每次 ${average === null ? '—' : `US$${average.toFixed(4)}（${ntd(average, r)}）`}${top === null ? '' : ` · 最貴第 ${list.indexOf(top) + 1} 次 ${ntd(top.usd, r)}`}`,
    '',
    '| # | 輸入 | 快取命中 | 輸出 | 費用 | USD | 台幣 | 耗時 |',
    '|--:|--:|--:|--:|:--|--:|--:|--:|',
    ...rows,
    '',
    `_${rateNote(r)}${model ? ` · 模型 ${model}` : ''}_`,
  ].join('\n')
}

const costNow = async ($: EngineInterface): Promise<number | null> => (await $.session.usage()).cost?.usd ?? null

const liveTwd = async ($: EngineInterface): Promise<number | null> => {
  const res = await $.http.fetch(RATE_URL)

  if (!res.ok) {
    return null
  }

  const twd: unknown = (JSON.parse(res.text) as { rates?: Record<string, unknown> }).rates?.TWD

  return typeof twd === 'number' && twd > 0 ? twd : null
}

// Until a live rate arrives (or with it switched off) the configured one stands.
const rateOf = async ($: EngineInterface, fallback: number): Promise<Rate> =>
  (await read($, rate)) ?? { twdPerUsd: fallback, isLive: false }

export const register: Register = (on, options) => {
  const configured = Number(options.twdRate)
  const fixedRate = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TWD_RATE
  const isLiveWanted = options.liveRate !== false

  let baseUsd: number | null = null
  let startedAt = 0
  let acc = zero()
  let subagentTurns = 0

  on('session.start', async ($, e, next) => {
    if (isLiveWanted) {
      void liveTwd($)
        .then(twd => (twd === null ? undefined : update($, rate, () => ({ twdPerUsd: twd, isLive: true }))))
        .catch(() => undefined)
    }

    await $.command.register({
      name: 'tokens',
      description: '列出最近 10 次送出的 token 用量與費用（含台幣）',
    })

    return next(e)
  })

  on('command.run', { command: 'tokens' }, async $ => {
    const list = await read($, history)
    const total = await read($, sessionUsd)
    const r = await rateOf($, fixedRate)

    if (list.length === 0) {
      return { text: '還沒有紀錄：送出一則訊息後再試。' }
    }

    return { text: report(list, total, r) }
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
    const r = await rateOf($, fixedRate)
    $.ui.status(`本次 ${money(send.usd, r)} ｜ 累計 ${money(now, r)}`)

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
    const r = await rateOf($, fixedRate)
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="row">
        <Text color="claude">◆ </Text>
        <Text dimColor>上次 </Text>
        <Text>{compact(totalIn(last))}</Text>
        <Text dimColor> 入（快取 {Math.round(hitRate(last) * 100)}%）· </Text>
        <Text>{compact(last.output)}</Text>
        <Text dimColor> 出 · </Text>
        <Text color="success" bold>{ntd(last.usd, r)}</Text>
        <Text dimColor>{last.usd === null ? '' : ` US$${last.usd.toFixed(4)}`}</Text>
        {last.subagentTurns > 0 ? <Text dimColor>（含子代理 {last.subagentTurns} 回合）</Text> : null}
        <Text dimColor>  ｜ 累計 </Text>
        <Text color="warning" bold>{ntd(total, r)}</Text>
        <Text dimColor>  /tokens 看明細</Text>
      </Box>
    )
  })
}
