// npm packages
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
// local
import Saving, { autosaveDelay } from '/src/app/functions/saving.js'

// a platform with one file on a fake disk; every write and dialog is recorded
function setup ({ text = 'a', answers = {} } = {}) {
  const disk = { path: '/notes/a.md', text, modified: 1 }
  const calls = []
  const platform = {
    async writeFile (path, text, expected) {
      calls.push(['write', path, text, expected])
      if (disk.fail) throw { kind: 'io', message: disk.fail }
      if (expected != null && expected != disk.modified) throw { kind: 'changed' }
      Object.assign(disk, { path, text, modified: disk.modified + 1 })
      return disk.modified
    },
    async saveAs (text, name) {
      calls.push(['saveAs', name])
      if (!answers.saveAs) return null
      Object.assign(disk, { path: answers.saveAs, text, modified: 10 })
      return { path: answers.saveAs, name: answers.saveAs.split('/').pop(), modified: 10 }
    },
    async askToSave (name) {
      calls.push(['askToSave', name])
      return answers.askToSave
    },
    async askToOverwrite () {
      calls.push(['askToOverwrite'])
      return answers.askToOverwrite
    },
    async askToClose () {
      calls.push(['askToClose'])
      return answers.askToClose
    },
    async tell (title) {
      calls.push(['tell', title])
    }
  }
  const editor = { text }
  const changes = []
  const saving = new Saving({ platform, getText: () => editor.text, onChange: change => changes.push(change) })
  saving.load({ path: disk.path, name: 'a.md', text, modified: disk.modified })
  // the editor's text changed
  const type = more => {
    editor.text += more
    saving.edited()
  }
  const writes = () => calls.filter(call => call[0] == 'write')
  return { disk, calls, editor, changes, saving, platform, type, writes }
}

describe('autosave', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('saves once, a moment after the last edit', async () => {
    const { disk, saving, type, writes } = setup()
    type('b')
    await vi.advanceTimersByTimeAsync(autosaveDelay - 1)
    type('c')
    await vi.advanceTimersByTimeAsync(autosaveDelay - 1)
    expect(writes()).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    expect(writes()).toEqual([['write', '/notes/a.md', 'abc', 1]])
    expect(disk.text).toBe('abc')
    expect(saving.isEdited).toBe(false)
  })

  it('marks the document edited, and saved again', async () => {
    const { changes, type } = setup()
    type('b')
    expect(changes.at(-1)).toEqual({ name: 'a.md', isEdited: true })
    await vi.advanceTimersByTimeAsync(autosaveDelay)
    expect(changes.at(-1)).toEqual({ name: 'a.md', isEdited: false })
  })

  it('writes nothing when the text is back to the file\'s', async () => {
    const { editor, saving, type, writes } = setup()
    type('b')
    editor.text = 'a'
    saving.edited()
    await vi.advanceTimersByTimeAsync(autosaveDelay)
    expect(writes()).toEqual([])
    expect(saving.isEdited).toBe(false)
  })

  it('never saves a document without a path by itself', async () => {
    const { saving, type, calls } = setup()
    saving.load({ path: null, name: 'Untitled.md', text: '' })
    type('b')
    await vi.advanceTimersByTimeAsync(autosaveDelay * 10)
    expect(calls).toEqual([])
    expect(saving.isEdited).toBe(true)
  })

  it('does not overwrite a file changed by another app, and says so once', async () => {
    const { disk, saving, type, calls, writes } = setup()
    disk.modified = 5
    disk.text = 'theirs'
    type('b')
    await vi.advanceTimersByTimeAsync(autosaveDelay)
    type('c')
    await vi.advanceTimersByTimeAsync(autosaveDelay * 10)
    expect(disk.text).toBe('theirs')
    expect(writes().length).toBe(1)
    expect(calls.filter(call => call[0] == 'tell').length).toBe(1)
    expect(saving.isEdited).toBe(true)
  })

  it('keeps the edits when writing fails, says so once, and tries again on the next edit', async () => {
    const { disk, saving, type, calls, writes } = setup()
    disk.fail = 'disk full'
    type('b')
    await vi.advanceTimersByTimeAsync(autosaveDelay)
    type('c')
    await vi.advanceTimersByTimeAsync(autosaveDelay)
    expect(calls.filter(call => call[0] == 'tell').length).toBe(1)
    disk.fail = null
    type('d')
    await vi.advanceTimersByTimeAsync(autosaveDelay)
    expect(writes().length).toBe(3)
    expect(disk.text).toBe('abcd')
    expect(saving.isEdited).toBe(false)
  })

  it('is held back while paused (the benchmark)', async () => {
    const { saving, type, writes } = setup()
    saving.isPaused = true
    type('b')
    await vi.advanceTimersByTimeAsync(autosaveDelay)
    expect(writes()).toEqual([])
    expect(saving.isEdited).toBe(false)
  })
})

describe('save', () => {
  it('writes at once and cancels the pending autosave', async () => {
    vi.useFakeTimers()
    const { saving, type, writes } = setup()
    type('b')
    expect(await saving.save({ isAsked: true })).toBe(true)
    await vi.advanceTimersByTimeAsync(autosaveDelay)
    expect(writes().length).toBe(1)
    vi.useRealTimers()
  })

  it('runs saves one after another, each with the text as it is then', async () => {
    const { disk, editor, saving, writes } = setup()
    editor.text = 'ab'
    const first = saving.save()
    editor.text = 'abc'
    const second = saving.save()
    expect(await Promise.all([first, second])).toEqual([true, true])
    expect(writes().map(call => [call[2], call[3]])).toEqual([['abc', 1]])
    expect(disk.text).toBe('abc')
  })

  it('asks before replacing a file changed by another app', async () => {
    const { disk, saving, type, calls } = setup({ answers: { askToOverwrite: true } })
    disk.modified = 5
    type('b')
    expect(await saving.save({ isAsked: true })).toBe(true)
    expect(calls.map(call => call[0])).toEqual(['write', 'askToOverwrite', 'write'])
    expect(calls.at(-1)[3]).toBe(null)
    expect(disk.text).toBe('ab')
    expect(saving.isConflict).toBe(false)
  })

  it('leaves the file alone when replacing is cancelled', async () => {
    const { disk, saving, type } = setup({ answers: { askToOverwrite: false } })
    disk.modified = 5
    disk.text = 'theirs'
    type('b')
    expect(await saving.save({ isAsked: true })).toBe(false)
    expect(disk.text).toBe('theirs')
  })

  it('asks where for a document without a path, and saves by itself from then on', async () => {
    const { disk, saving, type, changes, writes } = setup({ answers: { saveAs: '/notes/new.md' } })
    saving.load({ path: null, name: 'Untitled.md', text: '' })
    type('x')
    expect(await saving.save({ isAsked: true })).toBe(true)
    expect(disk).toMatchObject({ path: '/notes/new.md', text: 'ax' })
    expect(changes.at(-1)).toEqual({ name: 'new.md', isEdited: false })
    vi.useFakeTimers()
    type('y')
    await vi.advanceTimersByTimeAsync(autosaveDelay)
    vi.useRealTimers()
    expect(writes().at(-1)).toEqual(['write', '/notes/new.md', 'axy', 10])
  })

  it('keeps everything as it was when Save As is cancelled', async () => {
    const { saving, type } = setup()
    type('b')
    expect(await saving.saveAs()).toBe(false)
    expect(saving.path).toBe('/notes/a.md')
    expect(saving.isEdited).toBe(true)
  })
})

describe('before closing or replacing the document', () => {
  it('lets an unedited document go at once', async () => {
    const { saving, calls } = setup()
    expect(await saving.release()).toBe(true)
    expect(calls).toEqual([])
  })

  it('saves a file with pending edits without asking', async () => {
    const { disk, saving, type, calls } = setup()
    type('b')
    expect(await saving.release()).toBe(true)
    expect(disk.text).toBe('ab')
    expect(calls.map(call => call[0])).toEqual(['write'])
  })

  it('asks whether to close anyway when saving fails', async () => {
    const { disk, saving, type, calls } = setup({ answers: { askToClose: false } })
    disk.fail = 'read-only'
    type('b')
    expect(await saving.release()).toBe(false)
    expect(calls.map(call => call[0])).toEqual(['write', 'tell', 'askToClose'])
  })

  it('asks to save a new document with text: Save, Don\'t Save, Cancel', async () => {
    for (const [answer, saveAs, result] of [['save', '/notes/new.md', true], ['save', null, false], ['discard', null, true], ['cancel', null, false]]) {
      const { saving, type, calls } = setup({ answers: { askToSave: answer, saveAs } })
      saving.load({ path: null, name: 'Untitled.md', text: '' })
      type('b')
      expect(await saving.release()).toBe(result)
      expect(calls[0]).toEqual(['askToSave', 'Untitled.md'])
    }
  })

  it('lets a new document go when its text was emptied again', async () => {
    const { editor, saving, calls } = setup()
    saving.load({ path: null, name: 'Untitled.md', text: '' })
    editor.text = ' \n'
    saving.edited()
    expect(await saving.release()).toBe(true)
    expect(calls).toEqual([])
  })

  it('asks for a file changed by another app', async () => {
    vi.useFakeTimers()
    const { disk, saving, type, calls } = setup({ answers: { askToSave: 'discard' } })
    disk.modified = 5
    type('b')
    await vi.advanceTimersByTimeAsync(autosaveDelay)
    vi.useRealTimers()
    expect(await saving.release()).toBe(true)
    expect(calls.map(call => call[0])).toEqual(['write', 'tell', 'askToSave'])
  })
})
