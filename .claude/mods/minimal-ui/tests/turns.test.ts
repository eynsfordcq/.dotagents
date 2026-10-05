import { describe, expect, test } from 'claude-code/testing'

import type { MinimalUiTurn } from '../types'

import { foldOfText, foldOfTool, itemsOf, newTurn, summaryText } from '../hooks/turns'

// prompt -> "Checking." -> bash -> read (error) -> "Done."
const TURN: MinimalUiTurn = {
  ...newTurn('t1', 0),
  durationMs: 72_000,
  items: [
    { kind: 'text', text: 'Checking.' },
    { kind: 'tool', id: 'a' },
    { kind: 'tool', id: 'b' },
    { kind: 'text', text: 'Done.' },
  ],
  errored: ['b'],
}

describe('turns', () => {
  test('itemsOf keeps text and tool_use blocks in order', async () => {
    const content = [
      { type: 'thinking', thinking: 'x' },
      { type: 'text', text: ' Checking. ' },
      { type: 'tool_use', id: 'a', name: 'Bash', input: {} },
      { type: 'text', text: '  ' },
    ]
    expect(itemsOf(content)).toEqual([
      { kind: 'text', text: 'Checking.' },
      { kind: 'tool', id: 'a' },
    ])
  })

  test('the first item is the anchor of the fold', async () => {
    expect(foldOfText([TURN], 'Checking.')?.isAnchor).toBe(true)
    expect(foldOfTool([TURN], 'a')?.isAnchor).toBe(false)
  })

  test('the final message after the last tool call is not folded', async () => {
    expect(foldOfText([TURN], 'Done.')).toBeUndefined()
  })

  test('an unknown row is not folded', async () => {
    expect(foldOfTool([TURN], 'zzz')).toBeUndefined()
    expect(foldOfText([TURN], 'never written')).toBeUndefined()
  })

  test('a turn with no tool calls has no fold', async () => {
    const chat: MinimalUiTurn = { ...newTurn('t2', 0), items: [{ kind: 'text', text: 'Hi.' }] }
    expect(foldOfText([chat], 'Hi.')).toBeUndefined()
  })

  test('the summary counts calls, time and errors', async () => {
    expect(summaryText(TURN)).toBe('2 tool calls · 1m 12s · 1 error')
    expect(summaryText({ ...TURN, durationMs: null, errored: [] })).toBe('2 tool calls')
  })
})
