// npm packages
import { describe, it, expect } from 'vitest'
import { ensureSyntaxTree } from '@codemirror/language'
// local
import { readFixture, createState, blocksOf } from './helpers.js'
import { getBlocks, getBlocksInRange } from '/src/app/editor/functions/blocks/index.js'
import generateDocument from '/src/app/functions/generate-document.js'

const basic = readFixture('basic.md').toString('utf8')

describe('blocks', () => {
  it('item: every list item is its own block', () => {
    const blocks = blocksOf(createState(basic, { granularity: 'item' }))
    expect(blocks.map(block => block.type)).toEqual([
      'paragraph', 'heading', 'paragraph', 'heading',
      'listItem', 'listItem', 'listItem', 'paragraph',
      'heading', 'listItem', 'listItem', 'heading', 'paragraph', 'heading', 'paragraph'
    ])
    expect(blocks[4].text).toBe('- first task')
  })

  it('element: a list is one block', () => {
    const blocks = blocksOf(createState(basic, { granularity: 'element' }))
    expect(blocks[4]).toEqual({ type: 'list', level: 0, text: '- first task\n- second task\n- third task' })
    expect(blocks.filter(block => block.level).map(block => block.level)).toEqual([1, 2, 2, 3, 2])
  })

  it('section: a heading with its body, and a preamble without heading', () => {
    const blocks = blocksOf(createState(basic, { granularity: 'section' }))
    expect(blocks.map(block => block.level)).toEqual([0, 1, 2, 2, 3, 2])
    expect(blocks[0].text).toBe('Some text before any heading.')
    expect(blocks[2].text).toBe('## Tasks\n\n- first task\n- second task\n- third task\n\nParagraph after the list.')
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
    const blocks = blocksOf(createState(readFixture('formatting.md').toString('utf8'), { granularity: 'element' }))
    expect(blocks.filter(block => block.level).map(block => block.text)).toEqual([
      'Setext title\n============',
      'Subtitle\n--------'
    ])
  })

  it('empty file has no blocks', () => {
    expect(blocksOf(createState(''))).toEqual([])
  })
})

describe('blocks in a range', () => {
  it('match the full list of blocks for every granularity', () => {
    const text = generateDocument(3000)
    for (const mode of ['item', 'element', 'section']) {
      const state = createState(text, { granularity: mode })
      const all = getBlocks(state, { complete: true })
      for (const [from, to] of [[0, 500], [20000, 26000], [text.length - 3000, text.length], [55555, 55556]]) {
        const expected = all.filter(block => block.to >= from && block.from <= to)
        const actual = getBlocksInRange(state, from, to, ensureSyntaxTree(state, state.doc.length)).filter(block => block.to >= from && block.from <= to)
        expect(actual, `${mode} ${from}-${to}`).toEqual(expected)
      }
    }
  })
})
