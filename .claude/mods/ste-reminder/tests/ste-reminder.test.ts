import { describe, expect, test } from 'claude-code/testing'

describe('ste-reminder', () => {
  test('every third typed prompt ends with the reminder', async ($, on) => {
    const seen: string[] = []
    on('prompt.submit', ($, e) => {
      seen.push(e.text)
      return { text: e.text }
    })

    for (const text of ['one', 'two', 'three', 'four']) {
      await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
    }

    expect(seen).toEqual(['one', 'two', 'three\n\n> reminder: respond in ASD-STE100', 'four'])
  })

  test('prompts from an SDK host also count', async ($, on) => {
    const seen: string[] = []
    on('prompt.submit', ($, e) => {
      seen.push(e.text)
      return { text: e.text }
    })

    for (const text of ['one', 'two', 'three']) {
      await $.prompt.submit({ text, wait: false, origin: { kind: 'sdk' } })
    }

    expect(seen[2]).toBe('three\n\n> reminder: respond in ASD-STE100')
  })
})
