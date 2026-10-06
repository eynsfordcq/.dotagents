import type { Register } from 'claude-code'

const EVERY = 3
const REMINDER = '> reminder: respond in ASD-STE100'

// The line goes at the end of the user message only. The system prompt and earlier messages stay the same,
// so the prompt cache still matches.
export const register: Register = on => {
  // The count starts again when the module reloads.
  let typed = 0

  on('prompt.submit', ($, e, next) => {
    if (e.origin.kind !== 'composer') return next(e)

    typed += 1
    if (typed % EVERY !== 0) return next(e)

    return next({ ...e, text: `${e.text}\n\n${REMINDER}` })
  })
}
