import type { MinimalUiItem, MinimalUiTurn } from '../types'

// A fold is the part of a turn before its final message: every tool call, and every text a tool call follows.
export type Fold = { turn: MinimalUiTurn; isAnchor: boolean }

export function newTurn(id: string, startedAt: number): MinimalUiTurn {
  return { id, startedAt, durationMs: null, items: [], errored: [] }
}

// The text and tool_use blocks of one stored response, in order.
export function itemsOf(content: unknown): MinimalUiItem[] {
  if (!Array.isArray(content)) return []
  return content.flatMap((block): MinimalUiItem[] => {
    if (block?.type === 'text' && typeof block.text === 'string' && block.text.trim() !== '') {
      return [{ kind: 'text', text: block.text.trim() }]
    }
    if (block?.type === 'tool_use' && typeof block.id === 'string') return [{ kind: 'tool', id: block.id }]
    return []
  })
}

function lastToolIndex(turn: MinimalUiTurn): number {
  return turn.items.findLastIndex(item => item.kind === 'tool')
}

function foldAt(turn: MinimalUiTurn, index: number): Fold | undefined {
  if (index < 0 || index > lastToolIndex(turn)) return undefined
  return { turn, isAnchor: index === 0 }
}

export function foldOfTool(turns: readonly MinimalUiTurn[], id: string): Fold | undefined {
  for (const turn of turns) {
    const index = turn.items.findIndex(item => item.kind === 'tool' && item.id === id)
    if (index >= 0) return foldAt(turn, index)
  }
  return undefined
}

// The latest match wins, as two turns can hold the same text.
export function foldOfText(turns: readonly MinimalUiTurn[], text: string): Fold | undefined {
  const wanted = text.trim()
  for (const turn of [...turns].reverse()) {
    const index = turn.items.findIndex(item => item.kind === 'text' && item.text === wanted)
    if (index >= 0) return foldAt(turn, index)
  }
  return undefined
}

function duration(ms: number): string {
  const seconds = Math.round(ms / 1000)
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

// `7 tool calls · 1m 12s · 1 error`; the time is absent while the turn runs.
export function summaryText(turn: MinimalUiTurn): string {
  const calls = turn.items.filter(item => item.kind === 'tool').length
  const parts = [`${calls} tool call${calls === 1 ? '' : 's'}`]
  if (turn.durationMs !== null) parts.push(duration(turn.durationMs))
  if (turn.errored.length > 0) parts.push(`${turn.errored.length} error${turn.errored.length === 1 ? '' : 's'}`)
  return parts.join(' · ')
}
