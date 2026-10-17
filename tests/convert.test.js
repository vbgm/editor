// @vitest-environment jsdom
// npm packages
import { describe, it, expect } from 'vitest'
import { unzipSync, strFromU8 } from 'fflate'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
// app functions
import { importDocument, exportDocument, isImportable } from '/src/app/functions/convert/index.js'
import markdownTree from '/src/app/functions/convert/markdown-tree.js'

// everything with a form in all three formats, written as the editor writes it
const sample = `# Title

Some **bold**, *italic*, ***both***, ~~struck~~ and \`code\` text, with a [link](https://example.com/a?b=1).
A second line of the paragraph.

## Lists

- One
- Two
  - Two a
  - Two b
- Three

3. Third
4. Fourth
   1. Nested
   2. Numbers

- [ ] Open task
- [x] Done task

### Quote and code

> A quoted paragraph.

\`\`\`
const a = 1
  indented()
\`\`\`

---

| Name | Count |
| --- | --- |
| Apples | 3 |
| Pears | 10 |

Escaped \\*stars\\* and snake_case stay text.
`

describe('export and import give back the Markdown', () => {
  for (const extension of ['rtf', 'docx', 'odt']) {
    it(extension, async () => {
      const bytes = await exportDocument(sample, extension, 'Sample')
      const { text, lost } = await importDocument(bytes, `Sample.${extension}`)
      expect(text).toBe(sample)
      expect(lost).toBe('')
    })
  }
})

describe('export', () => {
  it('writes HTML', async () => {
    const html = new TextDecoder().decode(await exportDocument(sample, 'html', 'Sample <1>'))
    expect(html).toContain('<title>Sample &lt;1&gt;</title>')
    expect(html).toContain('<h1>Title</h1>')
    expect(html).toContain('<strong><em>both</em></strong>')
    expect(html).toContain('<ol start="3">')
    expect(html).toContain('<input type="checkbox" disabled checked> Done task')
    expect(html).toContain('<th>Name</th>')
  })

  it('puts the ODT type first and uncompressed', async () => {
    const bytes = await exportDocument(sample, 'odt', 'Sample')
    expect(strFromU8(bytes.subarray(30, 38))).toBe('mimetype')
    expect(Object.keys(unzipSync(bytes))).toContain('content.xml')
  })

  it('writes RTF as ASCII, other characters as \\u', async () => {
    const bytes = await exportDocument('Grüße — 😀\n', 'rtf', 'x')
    expect(bytes.every(byte => byte < 0x80)).toBe(true)
    const { text } = await importDocument(bytes, 'x.rtf')
    expect(text).toBe('Grüße — 😀\n')
  })

  it('leaves front matter out', () => {
    expect(markdownTree('---\ntitle: x\n---\n\nText\n').blocks).toEqual([{ type: 'paragraph', runs: [expect.objectContaining({ text: 'Text' })] }])
  })
})

describe('import', () => {
  it('knows the formats by extension', () => {
    expect(isImportable('a.RTF')).toBe(true)
    expect(isImportable('a.docx')).toBe(true)
    expect(isImportable('a.md')).toBe(false)
  })

  it('reads TextEdit RTF: headings by size, lists by their markers', async () => {
    const rtf = String.raw`{\rtf1\ansi\ansicpg1252\cocoartf2820
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fswiss\fcharset0 Helvetica;\f1\fswiss\fcharset0 Helvetica-Bold;\f2\fnil\fcharset0 Menlo-Regular;}
{\colortbl;\red255\green255\blue255;\red251\green0\blue7;}
{\*\expandedcolortbl;;\cssrgb\c100000\c0\c0;}
{\*\listtable{\list\listtemplateid1\listhybrid{\listlevel\levelnfc23\levelnfcn23\leveljc0\leveljcn0\levelfollow0\levelstartat1\levelspace360\levelindent0{\*\levelmarker \{disc\}}{\leveltext\leveltemplateid1\'01\uc0舦 ;}{\levelnumbers;}\fi-360\li720\lin720 }{\listname ;}\listid1}}
{\*\listoverridetable{\listoverride\listid1\listoverridecount0\ls1}}
\paperw11900\paperh16840\margl1440\margr1440\vieww11520\viewh8400\viewkind0
\pard\tx720\pardirnatural\partightenfactor0

\f1\b\fs36 \cf0 Big Title\
\pard\tx720\pardirnatural\partightenfactor0

\f0\b0\fs24 \cf0 Body text with \cf2 red\cf0  and \f2 mono\f0  and caf\'e9.\
\
\pard\tx220\tx720\pardirnatural\partightenfactor0
\ls1\ilvl0\cf0 {\listtext	\uc0舦 	}First\
{\listtext	\uc0舦 	}Second\
\pard\tx720\pardirnatural\partightenfactor0
\cf0 \
\f1\b Small heading
\f0\b0 \
Last.}`
    const { text, lost } = await importDocument(new TextEncoder().encode(rtf), 'a.rtf')
    expect(text).toBe('# Big Title\n\nBody text with red and `mono` and café.\n\n- First\n- Second\n\n## Small heading\n\nLast.\n')
    expect(lost).toBe('colours')
  })

  it('reads Word RTF: styles, fields, tables', async () => {
    const rtf = String.raw`{\rtf1\ansi\ansicpg1252\deff0{\fonttbl{\f0\froman\fcharset0 Times New Roman;}{\f1\fswiss\fcharset0 Arial;}}
{\stylesheet{\s0 Normal;}{\s1\outlinelevel0 heading 1;}{\s2 heading 2;}}
\pard\plain\s1\b\fs32 Chapter\par
\pard\plain\s2 Section\par
\pard\plain\qc See {\field{\*\fldinst{HYPERLINK "https://x.org"}}{\fldrslt{\ul\cf1 the site}}} now.\par
\trowd\cellx2000\cellx4000\pard\intbl A\cell B\cell\row
\trowd\cellx2000\cellx4000\pard\intbl 1\cell 2\cell\row
\pard\plain {\f1 Other font}\par
}`
    const { text, lost } = await importDocument(new TextEncoder().encode(rtf), 'a.rtf')
    expect(text).toBe('# Chapter\n\n## Section\n\nSee [the site](https://x.org) now.\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\nOther font\n')
    expect(lost).toBe('fonts and alignment')
  })

  it('escapes only what would become Markdown', async () => {
    const rtf = String.raw`{\rtf1\ansi # not a heading\par 1. not a list\par a*b snake_case [x](y) _under_\par}`
    const { text } = await importDocument(new TextEncoder().encode(rtf), 'a.rtf')
    expect(text).toBe('\\# not a heading\n\n1\\. not a list\n\na\\*b snake_case \\[x\\](y) \\_under\\_\n')
  })

  // tests/documents/textedit.*: textedit.html saved by macOS's textutil (TextEdit's converter)
  // as RTF, Word and OpenDocument: no heading styles, Word's lists typed as text, Word's link
  // and table and ODT's list start left out by textutil itself
  const textEdit = name => new Uint8Array(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'documents', name)))
  const tripStart = '# Trip notes\n\nPlain, **bold**, *italic*, '
  const tripLists = '## Packing\n\n- Tent\n- Stove\n  - Gas\n\n'
  const tripTable = '| Day | Km |\n| --- | --- |\n| 1 | 12 |\n\nThe end.\n'

  it('reads TextEdit RTF', async () => {
    const { text, lost } = await importDocument(textEdit('textedit.rtf'), 'textedit.rtf')
    expect(text).toBe(`${tripStart}[a link](https://example.com/), \`code\`.\n\n${tripLists}3. Third\n4. Fourth\n\n${tripTable}`)
    expect(lost).toBe('')
  })

  it('reads TextEdit Word: headings by size, lists typed as text', async () => {
    const { text, lost } = await importDocument(textEdit('textedit.docx'), 'textedit.docx')
    expect(text).toBe(`${tripStart}a link, \`code\`.\n\n${tripLists}3. Third\n4. Fourth\n\nDay\n\nKm\n\n1\n\n12\n\nThe end.\n`)
    // the link's look, without the link
    expect(lost).toBe('colours and underlining')
  })

  it('reads TextEdit OpenDocument', async () => {
    const { text, lost } = await importDocument(textEdit('textedit.odt'), 'textedit.odt')
    expect(text).toBe(`${tripStart}[a link](https://example.com/), \`code\`.\n\n${tripLists}1. Third\n2. Fourth\n\n${tripTable}`)
    expect(lost).toBe('')
  })

  it('says what is not a document', async () => {
    await expect(importDocument(new TextEncoder().encode('hello'), 'a.rtf')).rejects.toMatchObject({ kind: 'notDocument' })
  })
})
