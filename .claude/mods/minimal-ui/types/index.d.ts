// One row of a turn, in the order the model wrote it.
export type MinimalUiItem = { kind: 'text'; text: string } | { kind: 'tool'; id: string }

// One prompt and the response to it.
export type MinimalUiTurn = {
  id: string
  startedAt: number
  // Null while the turn runs.
  durationMs: number | null
  items: MinimalUiItem[]
  // The tool_use_ids that ended in an error.
  errored: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'minimal-ui': {
      // The tool_use_ids whose expanded state differs from isAllExpanded.
      toggled: string[]
      // The turn ids whose fold is open.
      openTurns: string[]
      isAllExpanded: boolean
      turns: MinimalUiTurn[]
    }
  }
}
