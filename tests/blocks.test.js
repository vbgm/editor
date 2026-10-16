// npm packages
import { describe, it, expect } from 'vitest'
import { ensureSyntaxTree } from '@codemirror/language'
// local
import { readFixture, createState, blocksOf } from './helpers.js'
import { getBlocks, getBlocksInRange } from '/src/app/editor/functions/blocks/index.js'
import generateDocument from '/src/app/functions/generate-document.js'

const basic = readFixture('basic.md').toString('utf8')

describe('blocks', () => {
  it('every list item is its own block', () => {
    const blocks = blocksOf(createState(basic))
    expect(blocks.map(block => block.type)).toEqual([
      'paragraph', 'heading', 'paragraph', 'heading',
      'listItem', 'listItem', 'listItem', 'paragraph',
      'heading', 'listItem', 'listItem', 'heading', 'paragraph', 'heading', 'paragraph'
    ])
    expect(blocks[4].text).toBe('- first task')
  })

  it('headings have their level', () => {
    const blocks = blocksOf(createState(basic))
    expect(blocks.filter(block => block.level).map(block => block.level)).toEqual([1, 2, 2, 3, 2])
  })

  it('front matter is one block and not read as headings', () => {
    const blocks = blocksOf(createState(readFixture('frontmatter.md').toString('utf8')))
    expect(blocks[0]).toEqual({ type: 'frontmatter', level: 0, text: '---\ntitle: Notes\ntags: [a, b]\n# yaml comment\n---' })
    expect(blocks[1]).toMatchObject({ type: 'heading', level: 1 })
  })

  it('a plain rule at the start is not front matter', () => {
    const blocks = blocksOf(createState('---\n\nText\n'))
    expect(blocks.map(block => block.type)).toEqual(['rule', 'paragraph'])
  })

  it('unclosed front matter does not crash', () => {
    const blocks = blocksOf(createState('---\ntitle: x\nmore\n'))
    expect(blocks[0].type).toBe('frontmatter')
  })

  it('headings inside code and quotes are not blocks', () => {
    const blocks = blocksOf(createState(readFixture('formatting.md').toString('utf8')))
    expect(blocks.filter(block => block.level).map(block => block.text)).toEqual([
      'Setext title\n============',
      'Subtitle\n--------'
    ])
  })

  it('a byte order mark does not hide a heading or front matter', () => {
    expect(blocksOf(createState(readFixture('bom.md').toString('utf8')))[0]).toEqual({ type: 'heading', level: 1, text: '# BOM file' })
    expect(blocksOf(createState('\uFEFF---\ntitle: x\n---\n\nText\n'))[0].type).toBe('frontmatter')
  })

  it('empty file has no blocks', () => {
    expect(blocksOf(createState(''))).toEqual([])
  })
})

describe('blocks in a range', () => {
  it('match the full list of blocks', () => {
    const text = generateDocument(3000)
    const state = createState(text)
    const all = getBlocks(state, { complete: true })
    for (const [from, to] of [[0, 500], [20000, 26000], [text.length - 3000, text.length], [55555, 55556]]) {
      const expected = all.filter(block => block.to >= from && block.from <= to)
      const actual = getBlocksInRange(state, from, to, { tree: ensureSyntaxTree(state, state.doc.length) }).filter(block => block.to >= from && block.from <= to)
      expect(actual, `${from}-${to}`).toEqual(expected)
    }
  })
})
