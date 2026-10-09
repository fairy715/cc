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
}

export type Rate = { twdPerUsd: number; isLive: boolean }

/** A tool or skill the session has used, as a slot on the skill bar. */
export type Skill = { name: string; count: number; lastSend: number }

/** What the session is equipped with: the model and the MCP servers. */
export type Gear = { model: string; mcp: string[] }

/** The two orbs: the context window left, and the rate-limit window left. */
export type Vitals = { contextLeft: number | null; quotaLeft: number | null; quotaLabel: string }

declare module 'claude-code' {
  interface PluginState {
    'token-meter': {
      history: Send[]
      sessionUsd: number | null
      rate: Rate | null
      skills: Skill[]
      gear: Gear
      vitals: Vitals
    }
  }
}
