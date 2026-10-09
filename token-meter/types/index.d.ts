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

declare module 'claude-code' {
  interface PluginState {
    'token-meter': { history: Send[]; sessionUsd: number | null; rate: Rate | null }
  }
}
