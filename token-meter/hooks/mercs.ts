import type { Merc, MercName, MercReading, Mercs, MercStatus } from '../types'

export const MERCS: readonly MercName[] = ['gemini', 'codex']

export const MERC_LABEL: Record<MercName, string> = { gemini: 'Gemini', codex: 'Codex' }

export const noMerc = (): Merc => ({ calls: 0, tokens: null, status: null, lastSend: 0, lastCalls: 0 })

export const noMercs = (): Mercs => ({ gemini: noMerc(), codex: noMerc() })

/** The mercenaries a shell command calls: `agy -p` is Gemini, `codex exec` is Codex. */
export const mercsIn = (command: string): MercName[] => {
  const found: MercName[] = []
  if (/(^|[\s;&|(])agy\s+(?:[^\n;&|]*\s)?(-p|--print)\b/.test(command)) {
    found.push('gemini')
  }
  if (/(^|[\s;&|(])codex\s+exec\b/.test(command)) {
    found.push('codex')
  }

  return found
}

const QUOTA = /usage limit|rate[ -]?limit|quota|\b429\b|resource[_ ]exhausted/i

const TOTAL = /^(total_?tokens?|total_?token_?count|totaltokencount|total)$/i

const PART = /(input|prompt|output|candidates?|response|completion|thoughts?|reasoning)_?(tokens?|token_?count)$/i

/**
 * Tokens out of Gemini's `usage`, whatever its spelling: a total if it names
 * one, else its input and output parts, else each nested object's, summed.
 */
export const usageTokens = (usage: unknown): number | null => {
  if (typeof usage === 'number') {
    return Number.isFinite(usage) ? usage : null
  }
  if (usage === null || typeof usage !== 'object' || Array.isArray(usage)) {
    return null
  }

  const entries = Object.entries(usage as Record<string, unknown>)
  const total = entries.find(([k, v]) => TOTAL.test(k) && typeof v === 'number')
  if (total) {
    return total[1] as number
  }

  const parts = entries.filter(([k, v]) => PART.test(k) && typeof v === 'number').map(([, v]) => v as number)
  if (parts.length > 0) {
    return parts.reduce((a, b) => a + b, 0)
  }

  const nested = entries.map(([, v]) => (typeof v === 'object' ? usageTokens(v) : null)).filter((n): n is number => n !== null)

  return nested.length > 0 ? nested.reduce((a, b) => a + b, 0) : null
}

/** A Gemini run: its result.json, and its stderr.log when the result says it failed. */
export const readGemini = (resultJson: string | null, stderr: string | null, at: number): MercReading | null => {
  if (resultJson === null) {
    return stderr !== null && QUOTA.test(stderr) ? { tokens: null, status: 'quota', at } : null
  }

  let parsed: { status?: unknown; usage?: unknown } = {}
  try {
    parsed = JSON.parse(resultJson) as typeof parsed
  } catch {
    return { tokens: null, status: QUOTA.test(`${resultJson}\n${stderr ?? ''}`) ? 'quota' : 'fail', at }
  }

  const status: MercStatus =
    parsed.status === 'SUCCESS' ? 'ok' : QUOTA.test(`${String(parsed.status ?? '')}\n${stderr ?? ''}`) ? 'quota' : 'fail'

  return { tokens: usageTokens(parsed.usage), status, at }
}

/**
 * A Codex run from its stderr.log: the `tokens used` it ends with, and a quota
 * error after the echoed input (code in the input must not read as an error).
 */
export const readCodex = (stderr: string | null, hasAnswer: boolean, at: number): MercReading | null => {
  if (stderr === null && !hasAnswer) {
    return null
  }

  const text = stderr ?? ''
  const after = text.includes('</stdin>') ? text.slice(text.lastIndexOf('</stdin>')) : text.slice(-4000)
  const counts = [...after.matchAll(/tokens used:?\s*([\d,]+)/gi)]
  const last = counts[counts.length - 1]?.[1]
  const tokens = last === undefined ? null : Number(last.replace(/,/g, ''))
  const status: MercStatus = hasAnswer || tokens !== null ? 'ok' : QUOTA.test(after) ? 'quota' : 'fail'

  return { tokens: tokens !== null && Number.isFinite(tokens) ? tokens : null, status, at }
}

/** The mercenaries' token totals and latest status, from every run folder read so far. */
export const tally = (mercs: Mercs, runs: Readonly<Record<string, Partial<Record<MercName, MercReading>>>>): Mercs => {
  const summed = { gemini: { ...mercs.gemini }, codex: { ...mercs.codex } }
  for (const name of MERCS) {
    const readings = Object.values(runs)
      .map(r => r[name])
      .filter((r): r is MercReading => r !== undefined)
    const counted = readings.filter(r => r.tokens !== null)
    summed[name].tokens = counted.length > 0 ? counted.reduce((n, r) => n + (r.tokens ?? 0), 0) : null
    const latest = [...readings].sort((a, b) => b.at - a.at)[0]
    summed[name].status = latest?.status ?? summed[name].status
  }

  return summed
}

export const STATUS_WORD: Record<MercStatus, string> = { ok: '正常', quota: '額度不足', fail: '失敗' }
