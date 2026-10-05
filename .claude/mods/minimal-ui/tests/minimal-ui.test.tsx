import { describe, expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const ID = 'toolu_1'

const BASH_ROW = {
  plugin: 'minimal-ui',
  surface: 'terminal',
  component: 'ToolUse',
  requestId: ID,
  props: {
    tool_use_id: ID,
    tool: 'Bash',
    input: { command: 'git status --short\ngit diff --stat' },
    isRunning: false,
    isErrored: false,
    isInterrupted: false,
  },
} as const

const EDIT_RESULT = {
  plugin: 'minimal-ui',
  surface: 'terminal',
  component: 'ToolResult',
  requestId: ID,
  props: { tool_use_id: ID, tool: 'Edit', output: {}, isErrored: false },
} as const

// Stands in for the engine's own drawing beneath the plugin.
function engineDraws(on: On) {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine row</Text>
  })
}

describe('minimal-ui', () => {
  test('a tool row draws one collapsed line and a click expands it', async ($, on) => {
    engineDraws(on)
    const ui = await $.ui.mount(BASH_ROW)
    const row = await ui.find({ key: `row-${ID}` })
    expect(row?.text).toBe('bash git status --short git diff --stat')
    expect(await ui.find({ type: 'Text', text: /→/ })).toBeDefined()

    await ui.press({ key: `row-${ID}` })
    expect(await ui.find({ type: 'Text', text: /▾/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'engine row' })).toBeDefined()
    await ui.unmount()
  })

  test('a collapsed tool result draws nothing', async $ => {
    const ui = await $.ui.mount(EDIT_RESULT)
    expect(await ui.find({ type: 'Text' })).toBeUndefined()
    await ui.unmount()
  })

  test('/expand expands every row', async ($, on) => {
    engineDraws(on)
    await $.command.run({
      command: 'expand',
      args: '',
      origin: { kind: 'composer' },
      presentation: { isFullscreen: true, columns: 100 },
    })
    const ui = await $.ui.mount(BASH_ROW)
    expect(await ui.find({ type: 'Text', text: 'engine row' })).toBeDefined()
    await ui.unmount()
  })

  test('an errored row shows the error mark and no arrow', async $ => {
    const ui = await $.ui.mount({ ...BASH_ROW, props: { ...BASH_ROW.props, isErrored: true } })
    expect(await ui.find({ type: 'Text', text: /✗/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /→/ })).toBeUndefined()
    await ui.unmount()
  })

  test('a long edit path shows only its parent and file', async $ => {
    const path = '/private/tmp/claude-501/-Users-zhengjie-Dev-general-agent-skills/abc/scratchpad/demo.md'
    const ui = await $.ui.mount({
      ...BASH_ROW,
      props: { ...BASH_ROW.props, tool: 'Edit', input: { file_path: path, old_string: 'a', new_string: 'b\nc' } },
    })
    expect((await ui.find({ key: `row-${ID}` }))?.text).toBe('edit …/scratchpad/demo.md (+2 -1)')
    await ui.unmount()
  })

  test('a tool group always unfolds into its rows', async ($, on) => {
    let isExpanded: boolean | undefined
    on('ui.render', ($, e) => {
      if (e.component === 'ToolGroup') isExpanded = e.props.isExpanded
      const { Text } = $.ui.resolve(e)
      return <Text>engine row</Text>
    })
    const ui = await $.ui.mount({
      plugin: 'minimal-ui',
      surface: 'terminal',
      component: 'ToolGroup',
      props: { calls: [], isActive: true, isExpanded: false },
    })
    expect(isExpanded).toBe(true)
    await ui.unmount()
  })
})
