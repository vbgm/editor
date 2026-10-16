// The open document's file: where it lives, whether it has unsaved edits, and saving it.
//
// A document with a path saves itself shortly after the last edit (autosave); Save saves at once.
// One without a path (new, a sample, or opened in a browser) is saved only by Save / Save As,
// which ask where. Saves run one after another, each with the text as it is when it starts, so a
// save asked for while another is writing is never lost; a save whose text is already the file's
// writes nothing.
//
// When the file was changed on disk by another app since it was read or saved, autosave does not
// overwrite it: it stops and says so once; the next Save asks whether to replace the file. (Taking
// in the other app's changes comes with watching the file.) A save that fails keeps the edits and
// says why, once until a save works again; autosave tries again on the next edit.
//
// Before the document is closed or replaced, release() saves it, or asks what to do.

export const autosaveDelay = 400

export const untitledName = 'Untitled.md'

export default class Saving {
  // platform: src/platform; getText: the editor's text; onChange ({ name, isEdited })
  constructor ({ platform, getText, onChange = () => {} }) {
    this.platform = platform
    this.getText = getText
    this.onChange = onChange
    this.timer = null
    // saves, one after another
    this.queue = Promise.resolve(true)
    // while the editor holds text that is not the document's (the benchmark)
    this.isPaused = false
    this.isEdited = false
    this.load({ path: null, name: untitledName, text: '' })
  }

  // a document just opened: { path (null: none yet), name, text, modified }
  load ({ path, name, text, modified = null }) {
    clearTimeout(this.timer)
    this.path = path
    this.name = name
    this.savedText = text
    this.modified = modified
    this.isConflict = false
    this.isFailing = false
    this.setEdited(false)
  }

  setEdited (isEdited) {
    if (isEdited == this.isEdited) return
    this.isEdited = isEdited
    this.onChange({ name: this.name, isEdited })
  }

  // the editor's text changed
  edited () {
    if (this.isPaused) return
    this.setEdited(true)
    if (this.path && !this.isConflict) {
      clearTimeout(this.timer)
      this.timer = setTimeout(() => this.save(), autosaveDelay)
    }
  }

  // isAsked: by the user (Save): a document without a path asks where, a file changed by another
  // app asks whether to replace it. Resolves true when the file holds the text.
  save ({ isAsked = false } = {}) {
    clearTimeout(this.timer)
    if (!this.path) return isAsked ? this.saveAs() : Promise.resolve(false)
    return this.enqueue(() => this.write(isAsked))
  }

  saveAs () {
    clearTimeout(this.timer)
    return this.enqueue(async () => {
      const text = this.getText()
      let saved
      try {
        saved = await this.platform.saveAs(text, this.name)
      } catch (error) {
        await this.platform.tell(`“${this.name}” could not be saved.`, error.message ?? error.kind)
        return false
      }
      if (!saved) return false
      const isEdited = this.getText() != text
      this.load({ ...saved, text })
      if (isEdited) this.edited()
      // the name changed, maybe not the edited state
      this.onChange({ name: this.name, isEdited: this.isEdited })
      return true
    })
  }

  enqueue (task) {
    const result = this.queue.then(task)
    this.queue = result.catch(() => false)
    return result
  }

  async write (isAsked) {
    const text = this.getText()
    if (text == this.savedText) {
      this.setEdited(false)
      return true
    }
    if (this.isConflict && !isAsked) return false
    if (this.isConflict && !await this.platform.askToOverwrite(this.name)) return false
    try {
      this.modified = await this.platform.writeFile(this.path, text, this.isConflict ? null : this.modified)
    } catch (error) {
      if (error.kind == 'changed') {
        this.isConflict = true
        if (isAsked) return this.write(true)
        await this.platform.tell(`“${this.name}” was changed by another app.`, 'Your edits stay here but are no longer saved by themselves. Save (⌘S) to replace the file with them.')
        return false
      }
      this.error = error
      if (isAsked || !this.isFailing) {
        this.isFailing = true
        await this.platform.tell(`“${this.name}” could not be saved.`, error.message ?? error.kind)
      }
      return false
    }
    this.savedText = text
    this.isConflict = false
    this.isFailing = false
    this.error = null
    // edits made while writing are saved by their own autosave
    this.setEdited(this.getText() != text)
    return true
  }

  // Before closing or replacing the document: saves it, or asks. Resolves true when it may go.
  async release () {
    clearTimeout(this.timer)
    await this.queue
    if (this.getText() == this.savedText) return true
    if (this.path && !this.isConflict) {
      if (await this.save()) return true
      return this.platform.askToClose(this.name, this.error ?? { kind: 'io' })
    }
    // a new document typed in and emptied again
    if (!this.path && !this.getText().trim()) return true
    const answer = await this.platform.askToSave(this.name)
    if (answer == 'discard') return true
    if (answer == 'save') return this.save({ isAsked: true })
    return false
  }
}
