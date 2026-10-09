import type { Gear, Rate, Send, Skill, Vitals } from '../types'

export type HudData = {
  history: readonly Send[]
  total: number | null
  rate: Rate
  skills: readonly Skill[]
  gear: Gear
  vitals: Vitals
  budgetTwd: number
}

export const num = (n: number): string => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

export const compact = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : String(Math.round(n))

export const money = (n: number | null, r: Rate): string =>
  n === null ? 'US$—' : `US$${n.toFixed(4)}（NT$${(n * r.twdPerUsd).toFixed(2)}）`

export const ntd = (n: number | null, r: Rate): string => (n === null ? '—' : `NT$${(n * r.twdPerUsd).toFixed(2)}`)

export const bar = (value: number, max: number, width = 10): string => {
  const filled = max > 0 ? Math.min(width, Math.round((value / max) * width)) : 0

  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

/** A percent as a gauge in two parts, so the filled cells can take a colour of their own. */
export const filled = (p: number | null, width: number): string => '█'.repeat(Math.round((Math.max(0, Math.min(100, p ?? 0)) / 100) * width))

export const empty = (p: number | null, width: number): string => '░'.repeat(width - filled(p, width).length)

export const totalIn = (s: Send): number => s.input + s.cacheRead + s.cacheWrite

export const hitRate = (s: Send): number => {
  const all = totalIn(s)

  return all > 0 ? s.cacheRead / all : 0
}

export const rateNote = (r: Rate): string =>
  `匯率 1 USD = ${r.twdPerUsd.toFixed(2)} TWD（${r.isLive ? '即時' : '設定值'}）`

const ICONS: Record<string, string> = {
  Bash: '⚡',
  Edit: '✎',
  Write: '📜',
  Read: '👁',
  Grep: '🔍',
  Glob: '🗂',
  Agent: '👥',
  WebSearch: '🌐',
  WebFetch: '🌐',
  TodoWrite: '📋',
  NotebookEdit: '📓',
}

/** The skill-bar name of a tool call: a skill by its own name, an MCP tool by its server. */
export const skillName = (tool: string, skill?: string): string => {
  if (tool === 'Skill' && skill) {
    return `✨${skill.split(':').pop() ?? skill}`
  }

  const mcp = /^mcp__(.+?)__/.exec(tool)

  return mcp?.[1] ? `🔮${mcp[1].replace(/_/g, ' ')}` : tool
}

export const icon = (name: string): string => {
  const lead = name.codePointAt(0) ?? 0

  return lead > 0x2000 ? '' : (ICONS[name] ?? '◆')
}

/** The six slots: the most used first, those of the last send among them. */
export const topSkills = (skills: readonly Skill[], n = 6): Skill[] =>
  [...skills].sort((a, b) => b.count - a.count || b.lastSend - a.lastSend).slice(0, n)

export const pct = (n: number | null): string => (n === null ? '—' : `${Math.round(n)}%`)

/** The blue orb: the rate-limit window left, else what is left of the budget. */
export const mana = (d: HudData): { left: number | null; label: string } => {
  if (d.vitals.quotaLeft !== null) {
    return { left: d.vitals.quotaLeft, label: d.vitals.quotaLabel }
  }

  if (d.total === null || d.budgetTwd <= 0) {
    return { left: null, label: '預算' }
  }

  return { left: Math.max(0, 100 - ((d.total * d.rate.twdPerUsd) / d.budgetTwd) * 100), label: '預算' }
}

/** The line shown beneath every answer. */
export const replyLine = (d: HudData): string => {
  const last = d.history[d.history.length - 1]
  const blue = mana(d)
  const skills = topSkills(d.skills.filter(s => s.lastSend === d.history.length), 4)
    .map(s => `${icon(s.name)}${s.name}×${s.count}`)
    .join(' ')
  const burned = last === undefined ? '' : `🔥 本次 ${compact(totalIn(last))} token · ${ntd(last.usd, d.rate)}`

  return [
    burned,
    `🔴 上下文剩 ${pct(d.vitals.contextLeft)}`,
    `🔵 ${blue.label}剩 ${pct(blue.left)}`,
    `💰 累計 ${ntd(d.total, d.rate)}`,
    skills === '' ? '' : `⚔ ${skills}`,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** The /tokens report: markdown, which every surface draws as a table. */
export const report = (d: HudData): string => {
  const list = d.history
  const r = d.rate
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
    `### 💰 本 session 累計 **${d.total === null ? 'US$—' : `US$${d.total.toFixed(4)}`}** · **${ntd(d.total, r)}**`,
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

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const cut = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

const orb = (id: string, cx: number, cy: number, level: number | null, label: string, colors: [string, string, string]): string => {
  const r = 46
  const fill = Math.max(0, Math.min(1, (level ?? 0) / 100))
  const top = cy + r - 2 * r * fill

  return `
  <defs>
    <radialGradient id="${id}g" cx="40%" cy="35%" r="70%">
      <stop offset="0" stop-color="${colors[0]}"/><stop offset=".55" stop-color="${colors[1]}"/><stop offset="1" stop-color="${colors[2]}"/>
    </radialGradient>
    <clipPath id="${id}c"><rect x="${cx - r}" y="${top}" width="${2 * r}" height="${2 * r}"/></clipPath>
  </defs>
  <circle cx="${cx}" cy="${cy}" r="${r + 7}" fill="#1a1410" stroke="#8a6d3b" stroke-width="3"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="#0b0b0f"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}g)" clip-path="url(#${id}c)"/>
  <ellipse cx="${cx - 14}" cy="${cy - 22}" rx="18" ry="9" fill="#fff" opacity=".18"/>
  <text x="${cx}" y="${cy + 6}" text-anchor="middle" font-size="20" font-weight="700" fill="#fff" stroke="#000" stroke-width=".6">${pct(level)}</text>
  <text x="${cx}" y="${cy + r + 22}" text-anchor="middle" font-size="11" fill="#d8c9a3">${esc(label)}</text>`
}

/** The HUD as one SVG: red orb, log, skill bar, gear, experience bar, blue orb. */
export const hudSvg = (d: HudData): string => {
  const W = 760
  const H = 190
  const last = d.history[d.history.length - 1]
  const blue = mana(d)
  const slots = topSkills(d.skills)
  const spent = d.total === null ? 0 : d.total * d.rate.twdPerUsd
  const xp = d.budgetTwd > 0 ? Math.min(1, spent / d.budgetTwd) : 0

  const log = d.history
    .slice(-3)
    .map((s, i, all) => {
      const n = d.history.length - all.length + i + 1
      return `<text x="128" y="${24 + i * 16}" font-size="12" fill="#c8c8c8">第 ${n} 次燒掉 <tspan fill="#ff8a5c">${compact(totalIn(s))}</tspan> token，產出 <tspan fill="#9fd4ff">${compact(s.output)}</tspan>，花費 <tspan fill="#ffd166">${esc(ntd(s.usd, d.rate))}</tspan></text>`
    })
    .join('')

  const slotW = 50
  const slotsX = 150
  const slotY = 82
  const slotSvg = Array.from({ length: 6 }, (_, i) => {
    const s = slots[i]
    const x = slotsX + i * (slotW + 6)
    const isHot = s !== undefined && s.lastSend === d.history.length
    const glyph = s === undefined ? '' : icon(s.name) || ([...s.name][0] ?? '')
    const name = s === undefined ? '' : cut(s.name.replace(/^[^\w\s]+/u, ''), 7)

    return `
  <rect x="${x}" y="${slotY}" width="${slotW}" height="${slotW}" rx="4" fill="#15171c" stroke="${isHot ? '#ffcc66' : '#4a3d2a'}" stroke-width="${isHot ? 2.5 : 1.5}"/>
  <text x="${x + 4}" y="${slotY + 11}" font-size="9" fill="#bfae86">${i + 1}</text>
  <text x="${x + slotW / 2}" y="${slotY + 31}" text-anchor="middle" font-size="18" fill="#e8e0cc">${esc(glyph)}</text>
  <text x="${x + slotW / 2}" y="${slotY + 45}" text-anchor="middle" font-size="9" fill="#a99f8a">${esc(name)}</text>
  ${s === undefined ? '' : `<text x="${x + slotW - 4}" y="${slotY + 11}" text-anchor="end" font-size="10" font-weight="700" fill="#fff">${s.count}</text>`}`
  }).join('')

  const potionX = slotsX + 6 * (slotW + 6) + 6
  const potions = `
  <rect x="${potionX}" y="${slotY}" width="${slotW}" height="${slotW}" rx="4" fill="#2a0f0f" stroke="#a03a2a" stroke-width="1.5"/>
  <text x="${potionX + slotW / 2}" y="${slotY + 14}" text-anchor="middle" font-size="9" fill="#e7b3a8">本次</text>
  <text x="${potionX + slotW / 2}" y="${slotY + 31}" text-anchor="middle" font-size="10" font-weight="700" fill="#ffd166">${esc(last === undefined ? '—' : ntd(last.usd, d.rate))}</text>
  <text x="${potionX + slotW / 2}" y="${slotY + 45}" text-anchor="middle" font-size="9" fill="#e7b3a8">${last === undefined ? '' : compact(totalIn(last))}</text>
  <rect x="${potionX + slotW + 6}" y="${slotY}" width="${slotW}" height="${slotW}" rx="4" fill="#0f1a2a" stroke="#3a5aa0" stroke-width="1.5"/>
  <text x="${potionX + slotW + 6 + slotW / 2}" y="${slotY + 14}" text-anchor="middle" font-size="9" fill="#a8c3e7">快取</text>
  <text x="${potionX + slotW + 6 + slotW / 2}" y="${slotY + 33}" text-anchor="middle" font-size="13" font-weight="700" fill="#9fd4ff">${last === undefined ? '—' : `${Math.round(hitRate(last) * 100)}%`}</text>`

  const gear = `⚔ ${cut(d.gear.model || '—', 22)}   🛡 MCP×${d.gear.mcp.length}${d.gear.mcp.length > 0 ? `：${cut(d.gear.mcp.join('、'), 38)}` : ''}`
  const xpW = 470

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="system-ui, -apple-system, 'Noto Sans TC', sans-serif">
  <defs>
    <linearGradient id="stone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b2620"/><stop offset="1" stop-color="#14110d"/></linearGradient>
    <linearGradient id="xp" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b8860b"/><stop offset="1" stop-color="#ffd166"/></linearGradient>
  </defs>
  <rect x="0" y="0" width="${W}" height="${H}" rx="10" fill="url(#stone)" stroke="#5a4a32" stroke-width="2"/>
  ${orb('red', 64, 86, d.vitals.contextLeft, '上下文剩餘', ['#ff7b5c', '#c0170f', '#4a0000'])}
  ${orb('blue', W - 64, 86, blue.left, `${blue.label}剩餘`, ['#8fa6ff', '#2236c9', '#08083a'])}
  ${log}
  ${slotSvg}
  ${potions}
  <text x="${slotsX}" y="152" font-size="11" fill="#d8c9a3">${esc(gear)}</text>
  <rect x="${slotsX}" y="162" width="${xpW}" height="9" rx="4" fill="#0b0b0f" stroke="#5a4a32"/>
  <rect x="${slotsX}" y="162" width="${(xpW * xp).toFixed(1)}" height="9" rx="4" fill="url(#xp)"/>
  <text x="${slotsX + xpW / 2}" y="184" text-anchor="middle" font-size="10" fill="#bfae86">累計 ${esc(ntd(d.total, d.rate))} / 預算 NT$${num(d.budgetTwd)}</text>
</svg>`
}

export const hudAlt = (d: HudData): string => replyLine(d) || 'token-meter：還沒有紀錄'
