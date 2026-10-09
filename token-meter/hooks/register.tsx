import { atom, read, update } from 'claude-code'
import type { EngineInterface, ModelUsage, Register } from 'claude-code'

import type { Gear, Rate, Send, Skill, Vitals } from '../types'
import { bar, compact, hudAlt, hudSvg, mana, money, ntd, pct, replyLine, report, skillName, topSkills, totalIn } from './hud'
import type { HudData } from './hud'

const history = atom({ plugin: 'token-meter', key: 'history' } as const, [])
const sessionUsd = atom({ plugin: 'token-meter', key: 'sessionUsd' } as const, null)
const rate = atom({ plugin: 'token-meter', key: 'rate' } as const, null)
const skills = atom({ plugin: 'token-meter', key: 'skills' } as const, [])
const gear = atom({ plugin: 'token-meter', key: 'gear' } as const, { model: '', mcp: [] })
const vitals = atom({ plugin: 'token-meter', key: 'vitals' } as const, { contextLeft: null, quotaLeft: null, quotaLabel: '額度' })

const PANE = 'token-hud'
const RATE_URL = 'https://open.er-api.com/v6/latest/USD'
const DEFAULT_TWD_RATE = 31.9
const DEFAULT_BUDGET_TWD = 300
const QUOTA_LABELS: Record<string, string> = { five_hour: '5 小時額度', seven_day: '7 天額度', spend_limit: '花費上限' }

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

const costNow = async ($: EngineInterface): Promise<number | null> => (await $.session.usage()).cost?.usd ?? null

const liveTwd = async ($: EngineInterface): Promise<number | null> => {
  const res = await $.http.fetch(RATE_URL)

  if (!res.ok) {
    return null
  }

  const twd: unknown = (JSON.parse(res.text) as { rates?: Record<string, unknown> }).rates?.TWD

  return typeof twd === 'number' && twd > 0 ? twd : null
}

// The orbs: what is left of the context window and of the tightest rate-limit window.
const measure = async ($: EngineInterface): Promise<Vitals> => {
  const { context, rateLimits } = await $.session.usage()
  const tightest = [...rateLimits].sort((a, b) => b.percentUsed - a.percentUsed)[0]

  return {
    contextLeft: context.percent === undefined ? null : Math.max(0, 100 - context.percent),
    quotaLeft: tightest === undefined ? null : Math.max(0, 100 - tightest.percentUsed),
    quotaLabel: tightest === undefined ? '額度' : (QUOTA_LABELS[tightest.kind] ?? tightest.kind),
  }
}

const mcpServers = async ($: EngineInterface): Promise<string[]> => {
  const names = (await $.tool.list()).filter(t => t.mcp).map(t => /^mcp__(.+?)__/.exec(t.name)?.[1])

  return [...new Set(names.filter((n): n is string => n !== undefined).map(n => n.replace(/_/g, ' ')))]
}

// Until a live rate arrives (or with it switched off) the configured one stands.
const rateOf = async ($: EngineInterface, fallback: number): Promise<Rate> =>
  (await read($, rate)) ?? { twdPerUsd: fallback, isLive: false }

const gather = async ($: EngineInterface, fallback: number, budgetTwd: number): Promise<HudData> => ({
  history: await read($, history),
  total: await read($, sessionUsd),
  rate: await rateOf($, fallback),
  skills: await read($, skills),
  gear: await read($, gear),
  vitals: await read($, vitals),
  budgetTwd,
})

const positive = (value: unknown, fallback: number): number => {
  const n = Number(value)

  return Number.isFinite(n) && n > 0 ? n : fallback
}

export const register: Register = (on, options) => {
  const fixedRate = positive(options.twdRate, DEFAULT_TWD_RATE)
  const budgetTwd = positive(options.budgetTwd, DEFAULT_BUDGET_TWD)
  const isLiveWanted = options.liveRate !== false
  const isReplyLine = options.replyLine !== false
  const isAutoOpen = options.autoOpen !== false

  let baseUsd: number | null = null
  let startedAt = 0
  let acc = zero()
  let subagentTurns = 0
  let used: string[] = []

  on('session.start', async ($, e, next) => {
    if (isLiveWanted) {
      void liveTwd($)
        .then(twd => (twd === null ? undefined : update($, rate, () => ({ twdPerUsd: twd, isLive: true }))))
        .catch(() => undefined)
    }

    void mcpServers($)
      .then(mcp => update($, gear, g => ({ ...g, mcp })))
      .catch(() => undefined)
    void measure($)
      .then(v => update($, vitals, () => v))
      .catch(() => undefined)

    await $.command.register({ name: 'tokens', description: '列出最近 10 次送出的 token 用量與費用（含台幣）' })
    await $.command.register({ name: 'hud', description: '打開 Token HUD 面板；/hud off 關閉' })
    if (isAutoOpen) {
      void $.ui.open({ id: PANE, title: 'Token HUD' }).catch(() => undefined)
    }

    return next(e)
  })

  on('command.run', { command: 'tokens' }, async $ => {
    const d = await gather($, fixedRate, budgetTwd)

    return { text: d.history.length === 0 ? '還沒有紀錄：送出一則訊息後再試。' : report(d) }
  })

  on('command.run', { command: 'hud' }, async ($, e) => {
    if (/^(off|close|關|關閉)$/i.test(e.args.trim())) {
      await $.ui.close({ id: PANE })

      return { text: 'Token HUD 已關閉。輸入 /hud 可以再打開；不想每次自動打開，到 /config 把 token-meter 的 autoOpen 關掉。' }
    }

    const opened = await $.ui.open({ id: PANE, title: 'Token HUD' })

    return { text: opened.isPlaced ? 'Token HUD 已打開。' : 'Token HUD 這個介面放不下面板，改看輸入框上方或每則回覆下方的那一行。' }
  })

  on('prompt.submit', async ($, e, next) => {
    // A prompt delivered into a running turn belongs to that turn's tally.
    if (e.turnId === undefined) {
      acc = zero()
      subagentTurns = 0
      used = []
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

  on('tool.call', ($, e, next) => {
    used.push(skillName(e.tool, e.tool === 'Skill' ? e.skill : undefined))

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

    const list = await update($, history, l => [...l, send].slice(-200))
    const sendNo = list.length
    const tally = used
    await update($, skills, all => {
      const slots: Skill[] = all.map(s => ({ ...s }))
      for (const name of tally) {
        const found = slots.find(s => s.name === name)
        if (found) {
          found.count += 1
          found.lastSend = sendNo
        } else {
          slots.push({ name, count: 1, lastSend: sendNo })
        }
      }
      return slots
    })
    await update($, sessionUsd, () => now)
    if (send.model !== '') {
      await update($, gear, (g: Gear) => ({ ...g, model: send.model }))
    }
    await measure($)
      .then(v => update($, vitals, () => v))
      .catch(() => undefined)

    const d = await gather($, fixedRate, budgetTwd)
    $.ui.status(`本次 ${money(send.usd, d.rate)} ｜ 累計 ${money(now, d.rate)}`)

    baseUsd = now
    acc = zero()
    subagentTurns = 0
    used = []

    if (!isReplyLine || e.reason !== 'answer') {
      return done
    }

    return { ...done, text: replyLine(d) }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const d = await gather($, fixedRate, budgetTwd)
    const last = d.history[d.history.length - 1]

    if (e.props.hasSurvey || last === undefined) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const blue = mana(d)
    const hot = topSkills(d.skills.filter(s => s.lastSend === d.history.length), 4)

    return (
      <Box flexDirection="row">
        <Text color="error" bold>● {pct(d.vitals.contextLeft)}</Text>
        <Text dimColor> 上下文 {bar(d.vitals.contextLeft ?? 0, 100, 6)}  </Text>
        <Text color="warning">🔥 {compact(totalIn(last))}</Text>
        <Text dimColor> token · </Text>
        <Text color="success" bold>{ntd(last.usd, d.rate)}</Text>
        <Text dimColor>{hot.length > 0 ? `  ⚔ ${hot.map(s => `${s.name}×${s.count}`).join(' ')}` : ''}  ｜ 累計 </Text>
        <Text color="warning" bold>{ntd(d.total, d.rate)}</Text>
        <Text dimColor>  {blue.label} {bar(blue.left ?? 0, 100, 6)} </Text>
        <Text color="suggestion" bold>{pct(blue.left)} ●</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const d = await gather($, fixedRate, budgetTwd)

    if (e.surface === 'terminal') {
      const { Box, Text } = $.ui.resolve(e)
      const blue = mana(d)

      return (
        <Box flexDirection="column">
          <Text>
            <Text color="error" bold>● 上下文 {pct(d.vitals.contextLeft)} </Text>
            <Text color="error">{bar(d.vitals.contextLeft ?? 0, 100)}</Text>
            <Text>   </Text>
            <Text color="suggestion">{bar(blue.left ?? 0, 100)}</Text>
            <Text color="suggestion" bold> {blue.label} {pct(blue.left)} ●</Text>
          </Text>
          {d.history.slice(-3).map((s, i, all) => (
            <Text dimColor>
              第 {d.history.length - all.length + i + 1} 次燒掉 {compact(totalIn(s))} token，產出 {compact(s.output)}，花費 {ntd(s.usd, d.rate)}
            </Text>
          ))}
          <Text>
            {topSkills(d.skills).map((s, i) => `[${i + 1} ${s.name}×${s.count}]`).join(' ') || '技能列：還沒用過工具'}
          </Text>
          <Text dimColor>
            ⚔ {d.gear.model || '—'}   🛡 MCP×{d.gear.mcp.length} {d.gear.mcp.join('、')}
          </Text>
          <Text>
            <Text color="warning">{bar(d.total === null ? 0 : d.total * d.rate.twdPerUsd, budgetTwd, 30)}</Text>
            <Text dimColor> 累計 {ntd(d.total, d.rate)} / 預算 NT${budgetTwd}</Text>
          </Text>
        </Box>
      )
    }

    const { Box, Svg } = $.ui.resolve(e)
    const width = Math.min(760, Math.max(320, (e.viewport?.columns ?? 95) * 8))

    return (
      <Box>
        <Svg source={hudSvg(d)} alt={hudAlt(d)} width={width} />
      </Box>
    )
  })
}
