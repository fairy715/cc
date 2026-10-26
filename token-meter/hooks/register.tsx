import { atom, read, update } from 'claude-code'
import type { EngineInterface, ModelUsage, Register, ResolveInput } from 'claude-code'

import type { Gear, MercName, MercReading, Mercs, Rate, Send, Skill, Vitals } from '../types'
import {
  bar,
  compact,
  empty,
  filled,
  hudAlt,
  hudBandSvg,
  hudSvg,
  hiredLine,
  mercLine,
  mercsShort,
  lastNo,
  lastUse,
  mana,
  money,
  ntd,
  pct,
  replyLine,
  report,
  sendNo,
  skillName,
  topSkills,
  totalIn,
  usedLast,
} from './hud'
import type { HudData } from './hud'
import { MERC_LABEL, MERCS, mercsIn, noMercs, readCodex, readGemini, tally } from './mercs'

const history = atom({ plugin: 'token-meter', key: 'history' } as const, [])
const sessionUsd = atom({ plugin: 'token-meter', key: 'sessionUsd' } as const, null)
const rate = atom({ plugin: 'token-meter', key: 'rate' } as const, null)
const skills = atom({ plugin: 'token-meter', key: 'skills' } as const, [])
const gear = atom({ plugin: 'token-meter', key: 'gear' } as const, { model: '', mcp: [] })
const vitals = atom({ plugin: 'token-meter', key: 'vitals' } as const, { contextLeft: null, quotaLeft: null, quotaLabel: '額度' })
const mercs = atom({ plugin: 'token-meter', key: 'mercs' } as const, noMercs())
const runs = atom({ plugin: 'token-meter', key: 'runs' } as const, {})

const PANE = 'token-hud'
const RATE_URL = 'https://open.er-api.com/v6/latest/USD'
const DEFAULT_TWD_RATE = 31.9
const DEFAULT_BUDGET_TWD = 300
const RUNS_DIR = 'ai-dispatch/runs'
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
  mercs: await read($, mercs),
  budgetTwd,
})

const readText = async ($: EngineInterface, path: string): Promise<string | null> =>
  (await $.fs.exists(path)) ? String(await $.fs.read(path)) : null

/** What each ai-dispatch run folder made since `since` says of each mercenary. */
const scanRuns = async ($: EngineInterface, since: number): Promise<Record<string, Partial<Record<MercName, MercReading>>>> => {
  const home = await $.env.get('HOME')
  const dir = `${home ?? ''}/${RUNS_DIR}`
  if (!home || !(await $.fs.exists(dir))) {
    return {}
  }

  const folders = (await $.fs.list(dir))
    .filter(f => f.kind === 'dir' && f.mtimeMs >= since)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, 30)
  const found: Record<string, Partial<Record<MercName, MercReading>>> = {}
  for (const f of folders) {
    const run = `${dir}/${f.name}`
    const gemini = readGemini(await readText($, `${run}/gemini/result.json`), await readText($, `${run}/gemini/stderr.log`), f.mtimeMs)
    const answer = await readText($, `${run}/codex/answer.md`)
    const codex = readCodex(await readText($, `${run}/codex/stderr.log`), (answer ?? '').trim() !== '', f.mtimeMs)
    if (gemini || codex) {
      found[f.name] = { ...(gemini ? { gemini } : {}), ...(codex ? { codex } : {}) }
    }
  }

  return found
}

const localDay = (ms: number): string => {
  const d = new Date(ms)

  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

/** Reads the run folders into the mercenaries' tallies; a mercenary newly out of quota is told once a day. */
const refreshMercs = async ($: EngineInterface, since: number): Promise<void> => {
  const before = await read($, mercs)
  const found = await scanRuns($, since)
  const all = await update($, runs, r => ({ ...r, ...found }))
  const after = await update($, mercs, m => tally(m, all))

  for (const m of MERCS) {
    if (after[m].status !== 'quota' || before[m].status === 'quota') {
      continue
    }
    const key = `quota-notified:${m}`
    const today = localDay(await $.clock.now())
    if ((await $.store.get(key)) !== today) {
      await $.store.set(key, today)
      $.ui.toast(`${MERC_LABEL[m]} 額度不足，今天先讓它休息`)
    }
  }
}

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
  let pending: Record<MercName, number> = { gemini: 0, codex: 0 }
  let sessionSince = 0

  on('session.start', async ($, e, next) => {
    sessionSince = await $.clock.now().catch(() => 0)
    void $.session
      .usage()
      .then(u => {
        sessionSince = u.startedAt
        return refreshMercs($, sessionSince)
      })
      .catch(() => undefined)

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

    void $.ui.open({ id: PANE, title: 'Token HUD' }).catch(() => undefined)
    const d = await gather($, fixedRate, budgetTwd)

    return { text: `Token HUD：${hudAlt(d)}` }
  })

  on('prompt.submit', async ($, e, next) => {
    // A prompt delivered into a running turn belongs to that turn's tally.
    if (e.turnId === undefined) {
      acc = zero()
      subagentTurns = 0
      used = []
      pending = { gemini: 0, codex: 0 }
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

  on('tool.call', async ($, e, next) => {
    used.push(skillName(e.tool, e.tool === 'Skill' ? e.skill : undefined))
    const server = /^mcp__(.+?)__/.exec(e.tool)?.[1]?.replace(/_/g, ' ')
    if (server !== undefined) {
      await update($, gear, g => (g.mcp.includes(server) ? g : { ...g, mcp: [...g.mcp, server] })).catch(() => undefined)
    }

    const hired = e.tool === 'Bash' ? mercsIn(e.command) : []
    for (const m of hired) {
      pending[m] += 1
    }
    const ran = await next(e)
    if (hired.length > 0) {
      await refreshMercs($, sessionSince).catch(() => undefined)
    }

    return ran
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
    const hiredNow = pending
    if (MERCS.some(m => hiredNow[m] > 0)) {
      send.mercs = Object.fromEntries(MERCS.filter(m => hiredNow[m] > 0).map(m => [m, hiredNow[m]]))
    }

    // Numbered on from the last send kept, so the count runs past the 200 the history keeps.
    const list = await update($, history, l => [...l, { ...send, no: lastNo(l) + 1 }].slice(-200))
    const thisNo = lastNo(list)
    const tally = new Map<string, number>()
    for (const name of used) {
      tally.set(name, (tally.get(name) ?? 0) + 1)
    }
    await update($, skills, all => {
      const slots: Skill[] = all.map(s => ({ ...s }))
      for (const [name, times] of tally) {
        const found = slots.find(s => s.name === name)
        if (found) {
          found.count += times
          found.lastSend = thisNo
          found.lastCount = times
        } else {
          slots.push({ name, count: times, lastSend: thisNo, lastCount: times })
        }
      }
      return slots
    })
    await update($, mercs, (all: Mercs) => {
      const counted: Mercs = { gemini: { ...all.gemini }, codex: { ...all.codex } }
      for (const m of MERCS) {
        if (hiredNow[m] > 0) {
          counted[m].calls += hiredNow[m]
          counted[m].lastSend = thisNo
          counted[m].lastCalls = hiredNow[m]
        }
      }
      return counted
    })
    // A dispatch run in the background may have finished since its Bash call returned.
    await refreshMercs($, sessionSince).catch(() => undefined)
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
    pending = { gemini: 0, codex: 0 }

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

    if (e.surface === 'desktop') {
      const { Box, Svg } = $.ui.resolve(e)
      const width = Math.min(760, Math.max(360, e.props.bodyColumns * 8))

      return (
        <Box>
          <Svg source={hudBandSvg(d)} alt={hudAlt(d)} width={width} />
        </Box>
      )
    }

    const { Box, Text } = $.ui.resolve(e)
    const blue = mana(d)
    const hot = usedLast(d, 4)

    return (
      <Box flexDirection="row">
        <Text color="error" bold>● {pct(d.vitals.contextLeft)}</Text>
        <Text dimColor> 上下文 </Text>
        <Text color="error">{filled(d.vitals.contextLeft, 8)}</Text>
        <Text dimColor>{empty(d.vitals.contextLeft, 8)}  </Text>
        <Text color="warning">🔥 {compact(totalIn(last))}</Text>
        <Text dimColor> token · </Text>
        <Text color="success" bold>{ntd(last.usd, d.rate)}</Text>
        <Text dimColor>
          {hot.length > 0 ? `  ⚔ ${hot.map(lastUse).join(' ')}` : ''}
          {mercsShort(d.mercs) === '' ? '' : `  🤝 ${mercsShort(d.mercs)}`}  ｜ 累計{' '}
        </Text>
        <Text color="warning" bold>{ntd(d.total, d.rate)}</Text>
        <Text dimColor>  {blue.label} </Text>
        <Text color="suggestion">{filled(blue.left, 8)}</Text>
        <Text dimColor>{empty(blue.left, 8)} </Text>
        <Text color="suggestion" bold>{pct(blue.left)} ●</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'CommandOutput', props: { command: 'hud' } }, async ($, e, next) => {
    if (e.props.isErrored || /^(off|close|關|關閉)$/i.test(e.props.args.trim())) {
      return next(e)
    }

    return drawHud($, e, await gather($, fixedRate, budgetTwd), budgetTwd)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const d = await gather($, fixedRate, budgetTwd)

    return drawHud($, e, d, budgetTwd)
  })
}

// The HUD for a surface: an SVG where the surface draws one, text in the terminal.
const drawHud = ($: EngineInterface, e: ResolveInput & { viewport?: { columns: number } }, d: HudData, budgetTwd: number) => {
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
            第 {sendNo(s, d.history.length - all.length + i)} 次燒掉 {compact(totalIn(s))} token，產出 {compact(s.output)}，花費 {ntd(s.usd, d.rate)}
          </Text>
        ))}
        <Text>
          {topSkills(d.skills).map((s, i) => `[${i + 1} ${s.name}×${s.count}]`).join(' ') || '技能列：還沒用過工具'}
        </Text>
        <Text dimColor>
          ⚔ {d.gear.model || '—'}   🛡 MCP×{d.gear.mcp.length} {d.gear.mcp.join('、')}
        </Text>
        <Text dimColor>
          🤝 {MERCS.every(m => d.mercs[m].calls === 0 && d.mercs[m].tokens === null) ? '傭兵：本 session 尚未派工' : MERCS.map(m => mercLine(m, d.mercs)).join('   ')}
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
}
