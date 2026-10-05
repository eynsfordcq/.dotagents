import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { MinimalUiTurn } from '../types'
import { foldOfText, foldOfTool, itemsOf, newTurn, summaryText } from './turns'
import type { Fold } from './turns'

const MAX_TURNS = 100

const toggled = atom({ plugin: 'minimal-ui', key: 'toggled' } as const, [])
const openTurns = atom({ plugin: 'minimal-ui', key: 'openTurns' } as const, [])
const isAllExpanded = atom({ plugin: 'minimal-ui', key: 'isAllExpanded' } as const, false)
const turns = atom({ plugin: 'minimal-ui', key: 'turns' } as const, [])

type RenderEvent = Parameters<EngineInterface['ui']['resolve']>[0]

// A row or a fold is open when exactly one of these is true: /expand is on, or the person clicked it.
async function isOpen($: EngineInterface, ids: readonly string[], id: string): Promise<boolean> {
  return (await read($, isAllExpanded)) !== ids.includes(id)
}

function flip(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter(one => one !== id) : [...ids, id]
}

function updateLastTurn($: EngineInterface, change: (turn: MinimalUiTurn) => MinimalUiTurn) {
  return update($, turns, list => {
    const last = list.at(-1)
    return last === undefined ? list : [...list.slice(0, -1), change(last)]
  })
}

// `mcp__plugin__tool` reads as `plugin.tool`; a built-in tool reads in lowercase.
function toolName(tool: string): string {
  const parts = tool.split('__')
  return parts.length === 3 && parts[0] === 'mcp' ? `${parts[1]}.${parts[2]}` : tool.toLowerCase()
}

// `~/a/b.ts` when short; `…/parent/file` when the path is long.
function shortPath(path: string): string {
  const home = path.replace(/^\/(Users|home)\/[^/]+\//, '~/')
  if (home.length <= 50) return home
  return `…/${home.split('/').slice(-2).join('/')}`
}

function lineCount(text: unknown): number {
  return typeof text === 'string' && text !== '' ? text.split('\n').length : 0
}

// The one fact about the call that tells calls apart: the command, the path, the pattern.
function callSummary(tool: string, input: unknown): string {
  const args = (input ?? {}) as Record<string, unknown>
  const path = typeof args.file_path === 'string' ? shortPath(args.file_path) : undefined
  switch (tool) {
    case 'Bash':
      return String(args.command ?? '')
    case 'Edit':
      return `${path} (+${lineCount(args.new_string)} -${lineCount(args.old_string)})`
    case 'Write':
      return `${path} (${lineCount(args.content)} lines)`
    case 'Read':
      return path ?? ''
    case 'Grep':
    case 'Glob':
      return String(args.pattern ?? '')
    case 'Skill':
      return String(args.skill ?? '')
    case 'Agent':
    case 'Task':
      return String(args.description ?? '')
    case 'TodoWrite':
      return `${Array.isArray(args.todos) ? args.todos.length : 0} todos`
    default:
      return JSON.stringify(args)
  }
}

function oneLine(text: string, width: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= width ? flat : `${flat.slice(0, Math.max(1, width - 1))}…`
}

function mark(props: { isRunning: boolean; isErrored: boolean; isInterrupted: boolean }) {
  if (props.isInterrupted) return { glyph: '⊘', color: 'yellow' }
  if (props.isErrored) return { glyph: '✗', color: 'red' }
  if (props.isRunning) return { glyph: '⋯', color: 'cyan' }
  return undefined
}

// The line a fold draws at its first row: `▸ 7 tool calls · 1m 12s`; a click opens the fold.
function foldHeader($: EngineInterface, e: RenderEvent, fold: Fold, isFoldOpen: boolean) {
  const { Box, Button, Text } = $.ui.resolve(e)

  return (
    <Box marginTop={1}>
      <Text dimColor>{isFoldOpen ? '▾' : '▸'} </Text>
      <Button
        key={`fold-${fold.turn.id}`}
        label={summaryText(fold.turn)}
        plain
        dimColor
        onPress={() => update($, openTurns, ids => flip(ids, fold.turn.id))}
      />
    </Box>
  )
}

// A row in a fold: the header at the anchor, nothing elsewhere while closed, the row itself while open.
// A turn that still runs has no fold yet: its rows draw as they come.
async function inFold($: EngineInterface, e: RenderEvent, fold: Fold | undefined, row: () => Promise<JSX.Element>) {
  if (fold === undefined || fold.turn.durationMs === null) return row()

  const { Box } = $.ui.resolve(e)
  const isFoldOpen = await isOpen($, await read($, openTurns), fold.turn.id)
  if (!isFoldOpen) return fold.isAnchor ? foldHeader($, e, fold, false) : <Box />
  if (!fold.isAnchor) return row()

  return (
    <Box flexDirection="column">
      {foldHeader($, e, fold, true)}
      {await row()}
    </Box>
  )
}

export const register: Register = on => {
  on('prompt.submit', async ($, e, next) => {
    const now = await $.clock.now()
    await update($, turns, list => [...list, newTurn(String(now), now)].slice(-MAX_TURNS))

    return next(e)
  })

  on('session.append', async ($, e, next) => {
    const stored = await next(e)
    if (e.door === 'response' && e.agentId === undefined) {
      const items = itemsOf(e.message.content)
      if (items.length > 0) await updateLastTurn($, turn => ({ ...turn, items: [...turn.items, ...items] }))
    }

    return stored
  })

  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    const id = e.tool_use_id
    if (e.agentId === undefined && id !== undefined && 'isError' in result && result.isError) {
      await updateLastTurn($, turn => ({ ...turn, errored: [...turn.errored, id] }))
    }

    return result
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) await updateLastTurn($, turn => ({ ...turn, durationMs: e.durationMs }))

    return next(e)
  })

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'expand',
      description: 'Expand or collapse every turn and tool call row',
    })

    return next(e)
  })

  on('command.run', { command: 'expand' }, async $ => {
    await update($, toggled, () => [])
    await update($, openTurns, () => [])
    const isOn = await update($, isAllExpanded, value => !value)

    return { text: isOn ? 'Tool calls expanded.' : 'Tool calls collapsed.' }
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)

    const id = e.props.tool_use_id

    return inFold($, e, foldOfTool(await read($, turns), id), async () => {
      const { Box, Button, Text } = $.ui.resolve(e)
      const isRowOpen = await isOpen($, await read($, toggled), id)
      // The status mark takes the place of the arrow, so every row starts with one glyph.
      const status = mark(e.props)
      const width = (e.viewport?.columns ?? 100) - 4
      const label = oneLine(`${toolName(e.props.tool)} ${callSummary(e.props.tool, e.props.input)}`, width)
      const header = (
        <Box>
          {status ? (
            <Text color={status.color}>{status.glyph} </Text>
          ) : (
            <Text dimColor>{isRowOpen ? '▾' : '→'} </Text>
          )}
          <Button key={`row-${id}`} label={label} plain dimColor onPress={() => update($, toggled, ids => flip(ids, id))} />
        </Box>
      )
      if (!isRowOpen) return header

      return (
        <Box flexDirection="column">
          {header}
          {await next(e)}
        </Box>
      )
    })
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    if (await isOpen($, await read($, toggled), e.props.tool_use_id)) return next(e)

    const { Box } = $.ui.resolve(e)

    return <Box />
  })

  // A group always unfolds, so each call draws as its own one-line ToolUse row.
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)

    const list = await read($, turns)
    const folds = e.props.calls.flatMap(call => {
      const fold = call.tool_use_id === undefined ? undefined : foldOfTool(list, call.tool_use_id)
      return fold === undefined ? [] : [fold]
    })

    return inFold($, e, folds.find(one => one.isAnchor) ?? folds[0], () =>
      next({ ...e, props: { ...e.props, isExpanded: true } }),
    )
  })

  // Text a tool call follows belongs to the fold; the final message stays as the engine draws it.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)

    return inFold($, e, foldOfText(await read($, turns), e.props.text), () => next(e))
  })
}
