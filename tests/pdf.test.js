// @vitest-environment jsdom
// npm packages
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
// app functions
import { exportDocument, importDocument, isImportable } from '/src/app/functions/convert/index.js'

const root = process.cwd()

// the fonts and character maps are fetched from paths under the project's root (as Vite serves
// them), which Node cannot do
beforeAll(() => {
  globalThis.fetch = async url => new Response(readFileSync(join(root, new URL(url, 'file:///').pathname)))
})

const documents = name => new Uint8Array(readFileSync(join(root, 'tests', 'documents', name)))

// everything the PDF export lays out, written as the editor writes it
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

## 日本語と中文

これは日本語の文章です。**太字**も使えます。

简体中文：这是一个测试段落。
`

const text = bytes => Array.from(bytes, b => String.fromCharCode(b)).join('')

// the PDF made here, its creator renamed so the Markdown attached to it is not used: what any
// other reader sees
const elsewhere = bytes => Uint8Array.from(text(bytes).replaceAll('(Textflow)', '(Elsewher)'), c => c.charCodeAt(0))

// a PDF of one page with the given content stream and fonts, its offsets counted; font 5 is a
// Japanese font not in the file, its characters given by Adobe's UniJIS-UCS2-H character map
function pdf (content, fonts = '') {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 100] /Resources << /Font << ${fonts} >> >> /Contents 4 0 R >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type0 /BaseFont /KozMinPr6N-Regular /Encoding /UniJIS-UCS2-H /DescendantFonts [6 0 R] >>',
    '<< /Type /Font /Subtype /CIDFontType0 /BaseFont /KozMinPr6N-Regular /CIDSystemInfo << /Registry (Adobe) /Ordering (Japan1) /Supplement 6 >> /FontDescriptor 7 0 R >>',
    '<< /Type /FontDescriptor /FontName /KozMinPr6N-Regular /Flags 4 /FontBBox [0 -120 1000 880] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 700 /StemV 80 >>'
  ]
  let body = '%PDF-1.4\n'
  const offsets = objects.map((object, index) => {
    const offset = body.length
    body += `${index + 1} 0 obj\n${object}\nendobj\n`
    return offset
  })
  const xref = body.length
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Uint8Array.from(body, c => c.charCodeAt(0))
}

describe('PDF export', () => {
  it('writes a PDF carrying its Markdown', async () => {
    const raw = text(await exportDocument(sample, 'pdf', 'Sample'))
    expect(raw.startsWith('%PDF-')).toBe(true)
    expect(raw).toContain('(Sample.md)')
  })

  it('embeds the fonts the text needs, and only those', async () => {
    const latin = text(await exportDocument('Plain *text*.\n', 'pdf', 'Latin'))
    expect(latin).toContain('Inter-Regular')
    expect(latin).toContain('Inter-Italic')
    expect(latin).not.toContain('SourceCodePro')
    expect(latin).not.toContain('NotoSans')
    const japanese = text(await exportDocument('これは`code`です。\n', 'pdf', 'Japanese'))
    expect(japanese).toContain('NotoSansJP-Regular')
    expect(japanese).toContain('SourceCodePro-Regular')
    expect(japanese).not.toContain('NotoSansSC')
    const traditional = text(await exportDocument('這是一個測試段落。\n', 'pdf', 'Traditional'))
    expect(traditional).toContain('NotoSansTC-Regular')
  })
})

describe('PDF import', () => {
  it('knows PDF files', () => {
    expect(isImportable('Report.pdf')).toBe(true)
    expect(isImportable('Report.PDF')).toBe(true)
  })

  it('gives back the Markdown of a PDF made here', async () => {
    const { text: markdown, lost } = await importDocument(await exportDocument(sample, 'pdf', 'Sample'), 'Sample.pdf')
    expect(markdown).toBe(sample)
    expect(lost).toBe('')
  })

  it('reads a PDF without tags: headings by size, formats by font, links, Japanese and Chinese', async () => {
    const { text: markdown } = await importDocument(elsewhere(await exportDocument(sample, 'pdf', 'Sample')), 'Sample.pdf')
    // (the first line runs nearly to the margin, so the second goes on from it)
    expect(markdown).toContain('# Title\n\nSome **bold**, *italic*, ***both***, struck and `code` text, with a [link](https://example.com/a?b=1). A second line of the paragraph.\n\n## Lists\n\n')
    expect(markdown).toContain('## Lists\n\n- One\n- Two\n  - Two a\n  - Two b\n- Three\n\n3. Third\n4. Fourth\n   1. Nested\n   2. Numbers\n\n- [ ] Open task\n- [x] Done task\n')
    expect(markdown).toContain('| Name | Count |\n| --- | --- |\n| Apples | 3 |\n| Pears | 10 |')
    expect(markdown).toContain('```\nconst a = 1\n  indented()\n```')
    expect(markdown).toContain('## 日本語と中文\n\nこれは日本語の文章です。**太字**も使えます。\n\n简体中文：这是一个测试段落。\n')
  })

  it('reads a printed copy of a PDF made here (its Markdown not in it): lists by their markers, written as text', async () => {
    const original = readFileSync(join(root, 'tests', 'fixtures', 'basic.md'), 'utf8')
    const { text: markdown } = await importDocument(documents('printed.pdf'), 'printed.pdf')
    // quotes are a bar drawn beside them, which says nothing
    expect(markdown).toBe(original.replace(/^(?:> )+/gm, ''))
  })

  it('reads Chrome\'s tagged PDF: lists, nesting, start numbers, tables', async () => {
    const { text: markdown, lost } = await importDocument(documents('chrome.pdf'), 'chrome.pdf')
    expect(markdown).toBe(`# Trip notes

Plain, **bold**, *italic*, [a link](https://example.com/), \`code\`.

## Packing

- Tent
- Stove
  - Gas

3. Third
4. Fourth

| Day | Km |
| --- | --- |
| 1 | 12 |

The end.
`)
    expect(lost).toBe('')
  })

  it('reads Chrome\'s Japanese and Chinese, leaving out its headers and footers', async () => {
    const { text: markdown, lost } = await importDocument(documents('chrome-cjk.pdf'), 'chrome-cjk.pdf')
    expect(markdown).toBe('# 旅行のメモ\n\nこれは日本語の文章です。**太字**も使えます。\n\n简体中文：这是一个测试段落。\n\n繁體中文：這是一個測試段落。\n')
    expect(lost).toBe('headers and footers')
  })

  it('reads AppKit\'s PDF (TextEdit\'s): bullets and numbers typed as text', async () => {
    const { text: markdown } = await importDocument(documents('appkit.pdf'), 'appkit.pdf')
    expect(markdown).toContain('# Trip notes\n\nPlain, **bold**, *italic*, a link, `code`.\n\n## Packing\n\n- Tent\n- Stove\n  - Gas\n\n3. Third\n4. Fourth\n')
  })

  it('reads text in a font that is not in the PDF, with a character map of its own', async () => {
    const { text: markdown } = await importDocument(pdf('BT /F1 12 Tf 20 50 Td <65E5672C8A9E> Tj ET', '/F1 5 0 R'), 'nihongo.pdf')
    expect(markdown).toBe('日本語\n')
  })

  it('says what it cannot read', async () => {
    await expect(importDocument(pdf(''), 'scan.pdf')).rejects.toMatchObject({ kind: 'notDocument', message: expect.stringContaining('no text') })
    await expect(importDocument(Uint8Array.from('%PDF-1.4 broken', c => c.charCodeAt(0)), 'broken.pdf')).rejects.toMatchObject({ kind: 'notDocument' })
  })
})
