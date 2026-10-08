import type { Register } from 'claude-code'

const EVERY = 3
const REMINDER = 'reminder: respond in ASD-STE100'
// The terminal sends 'composer'. An SDK host (stream-json stdin) sends 'sdk'. Automatic prompts do not get the reminder.
const TYPED_ORIGINS = new Set(['composer', 'sdk'])

// The reminder goes in a context block after the prompt. The model reads it, but the transcript keeps the prompt
// as typed. The system prompt and earlier messages stay the same, so the prompt cache still matches.
export const register: Register = on => {
  on('prompt.submit', async ($, e, next) => {
    if (!TYPED_ORIGINS.has(e.origin.kind)) return next(e)

    // The engine reads the count from the transcript, so it stays correct after a reload or a --resume.
    // The count does not include this prompt.
    const prompt = (await $.session.turns()) + 1
    if (prompt % EVERY !== 0) return next(e)

    return next({ ...e, context: [...(e.context ?? []), REMINDER] })
  })
}
