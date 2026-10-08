import { describe, expect, test, type Engine } from 'claude-code/testing'
import type { On, PromptOrigin } from 'claude-code'

const REMINDER = 'reminder: respond in ASD-STE100'

// The test stands for the engine: it answers $.session.turns() with the prompts sent before this one.
// It records each prompt that reached it, with the context blocks beside it.
function engine(on: On, turnsBefore = 0) {
  let turns = turnsBefore
  const seen: { text: string; context: readonly string[] }[] = []
  on('session.turns', () => ({ value: turns }))
  on('prompt.submit', ($, e) => {
    turns += 1
    seen.push({ text: e.text, context: e.context ?? [] })
    return { text: e.text, context: e.context }
  })
  return seen
}

async function send($: Engine, texts: string[], origin: PromptOrigin) {
  for (const text of texts) await $.prompt.submit({ text, wait: false, origin })
}

const reminded = (seen: ReturnType<typeof engine>) =>
  seen.filter(p => p.context.includes(REMINDER)).map(p => p.text)

describe('ste-reminder', () => {
  test('every third typed prompt carries the reminder as context', async ($, on) => {
    const seen = engine(on)

    await send($, ['one', 'two', 'three', 'four', 'five', 'six'], { kind: 'composer' })

    expect(reminded(seen)).toEqual(['three', 'six'])
  })

  test('the prompt text stays as typed', async ($, on) => {
    const seen = engine(on)

    await send($, ['one', 'two', 'three'], { kind: 'composer' })

    expect(seen.map(p => p.text)).toEqual(['one', 'two', 'three'])
  })

  test('prompts from an SDK host also get the reminder', async ($, on) => {
    const seen = engine(on)

    await send($, ['one', 'two', 'three'], { kind: 'sdk' })

    expect(reminded(seen)).toEqual(['three'])
  })

  test('a resumed session continues the count from the transcript', async ($, on) => {
    const seen = engine(on, 4)

    await send($, ['five', 'six'], { kind: 'sdk' })

    expect(reminded(seen)).toEqual(['six'])
  })

  test('an automatic prompt never gets the reminder', async ($, on) => {
    const seen = engine(on, 2)

    await send($, ['done'], { kind: 'task-notification' })

    expect(reminded(seen)).toEqual([])
  })
})
