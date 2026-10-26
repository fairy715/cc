export type Send = {
  at: number
  model: string
  input: number
  cacheRead: number
  cacheWrite: number
  output: number
  usd: number | null
  seconds: number
  subagentTurns: number
  /** Which send of the session this was, counted on past the 200 the history keeps; absent on records from before 0.5.1. */
  no?: number
  /** External AI calls the send dispatched, by mercenary; absent when none. */
  mercs?: Partial<Record<MercName, number>>
}

export type Rate = { twdPerUsd: number; isLive: boolean }

/** A tool or skill the session has used, as a slot on the skill bar. */
export type Skill = {
  name: string
  /** Uses over the session. */
  count: number
  /** The `no` of the last send that used it. */
  lastSend: number
  /** Uses in that send alone; absent on records from before 0.5.1. */
  lastCount?: number
}

/** What the session is equipped with: the model and the MCP servers. */
export type Gear = { model: string; mcp: string[] }

/** The two orbs: the context window left, and the rate-limit window left. */
export type Vitals = { contextLeft: number | null; quotaLeft: number | null; quotaLabel: string }

/** An external AI Claude dispatches work to through the ai-dispatch skill. */
export type MercName = 'gemini' | 'codex'

/** How a mercenary's latest run ended. */
export type MercStatus = 'ok' | 'quota' | 'fail'

/** What one run folder says of one mercenary. */
export type MercReading = { tokens: number | null; status: MercStatus | null; at: number }

/** One mercenary over the session. */
export type Merc = {
  /** Calls seen in Claude's Bash commands. */
  calls: number
  /** Tokens summed over the session's run folders; null when no run reported any. */
  tokens: number | null
  /** How its latest run ended; null before any. */
  status: MercStatus | null
  /** The `no` of the last send that called it, and how many times it did. */
  lastSend: number
  lastCalls: number
}

export type Mercs = Record<MercName, Merc>

declare module 'claude-code' {
  interface PluginState {
    'token-meter': {
      history: Send[]
      sessionUsd: number | null
      rate: Rate | null
      skills: Skill[]
      gear: Gear
      vitals: Vitals
      mercs: Mercs
      /** Run folder name → what it says of each mercenary. */
      runs: Record<string, Partial<Record<MercName, MercReading>>>
    }
  }
}
