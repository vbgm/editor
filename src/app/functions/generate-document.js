// A large, realistic test document (default 10k lines): nested headings, paragraphs,
// bullet and numbered lists, code fences and quotes. Seeded, so every run is the same.

const words = ('lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor ' +
  'incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ' +
  'ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit').split(' ')

export default function generateDocument (lineCount = 10000) {
  let seed = 42
  const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
  const pick = list => list[Math.floor(random() * list.length)]
  const sentence = count => {
    const text = Array.from({ length: count }, () => pick(words)).join(' ')
    return text[0].toUpperCase() + text.slice(1) + '.'
  }
  const inline = text => text.replace(/\b(dolor|magna)\b/, '**$1**').replace(/\b(tempor|veniam)\b/, '*$1*')

  const lines = []
  let chapter = 0
  while (lines.length < lineCount) {
    const roll = random()
    if (roll < 0.04) {
      chapter++
      lines.push(`# Chapter ${chapter}`, '')
    } else if (roll < 0.14) {
      lines.push(`## ${sentence(3).slice(0, -1)}`, '')
    } else if (roll < 0.2) {
      lines.push(`### ${sentence(2).slice(0, -1)}`, '')
    } else if (roll < 0.55) {
      lines.push(inline(sentence(10 + Math.floor(random() * 40))), '')
    } else if (roll < 0.75) {
      const count = 2 + Math.floor(random() * 6)
      for (let index = 0; index < count; index++) lines.push(`- ${inline(sentence(4 + Math.floor(random() * 12)))}`)
      lines.push('')
    } else if (roll < 0.85) {
      const count = 2 + Math.floor(random() * 5)
      for (let index = 0; index < count; index++) lines.push(`${index + 1}. ${sentence(5)}`)
      lines.push('')
    } else if (roll < 0.93) {
      lines.push('```js', `const value = ${Math.floor(random() * 1000)}`, `console.log('${pick(words)}', value)`, '```', '')
    } else {
      lines.push(`> ${sentence(12)}`, '')
    }
  }
  return lines.slice(0, lineCount).join('\n') + '\n'
}
