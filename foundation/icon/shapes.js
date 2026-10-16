// The icons' shapes, drawn as Ordner draws its icons (foundation/client/vue/components/icon):
// strokes only, on a 128 × 128 grid. Each icon is a list of paths: a path is its `d`, or
// { d, cap, weight } for round ends (default: butt) or a mark that is not a line (a dot: weight ×
// the stroke width). An icon that morphs is a function of its value (0–1) returning the list.
// { scale, paths } draws paths drawn larger (Ordner's) scaled about the centre, the stroke as
// thick as the others'.
//
// All in the same box and with the same stroke: about 104 units in their larger dimension (12 to
// 116), letters 92 high (18 to 110), a circle a little smaller (it looks larger than a square).
// The toolbar's arrow is smaller (56 wide); check and angle-down are for menus.
// angle-down, check, sliders and link are Ordner's own.

const round = d => ({ d, cap: 'round' })

// a circle as a path: centre and radius
const circle = (x, y, r) => `M${x - r},${y}a${r},${r} 0 1,0 ${r * 2},0a${r},${r} 0 1,0 ${-r * 2},0Z`

// a dot: a zero-length round-ended stroke, a little wider than the stroke so it reads as large
const dot = (x, y) => ({ d: `M${x},${y}l0,0`, cap: 'round', weight: 1.3 })

export default {
  'angle-down': [round('M45.976,55l18,18l18,-18')],

  // 0: down, 1: up; between, the tip and the ends move towards each other, flat halfway
  angle: value => [round(`M36,${50 + 28 * value}L64,${78 - 28 * value}L92,${50 + 28 * value}`)],

  check: [round('M24.067,60.38l30.908,28.099l44.958,-44.958')],

  sliders: {
    scale: 104 / 128,
    paths: [
      'M76,108l52,0',
      'M0,108l24,0',
      'M112,64l16,0',
      'M-0,64l60,0',
      'M68,20l60,0',
      'M0,20l16,0',
      'M64,108c-0,-7.732 -6.268,-14 -14,-14l-0,0c-7.732,0 -14,6.268 -14,14l0,0c0,7.732 6.268,14 14,14l0,0c7.732,-0 14,-6.268 14,-14l0,-0Z',
      'M100,64c-0,-7.732 -6.268,-14 -14,-14l-0,0c-7.732,0 -14,6.268 -14,14l0,0c0,7.732 6.268,14 14,14l0,0c7.732,-0 14,-6.268 14,-14l0,-0Z',
      'M56,22c-0,-7.732 -6.268,-14 -14,-14l-0,0c-7.732,0 -14,6.268 -14,14l0,0c0,7.732 6.268,14 14,14l0,0c7.732,-0 14,-6.268 14,-14l0,-0Z'
    ]
  },

  link: {
    scale: 104 / 110,
    paths: [
      round('M71.18,26.931l11.744,-11.745c8.248,-8.248 21.642,-8.248 29.89,0c8.248,8.248 8.248,21.642 -0,29.89l-27.892,27.892c-8.249,8.248 -21.642,8.248 -29.89,-0'),
      round('M56.82,101.069l-11.744,11.745c-8.248,8.248 -21.642,8.248 -29.89,-0c-8.248,-8.248 -8.248,-21.642 0,-29.89l27.892,-27.892c8.249,-8.248 21.642,-8.248 29.89,0')
    ]
  },

  // a window with a column on its left
  sidebar: [
    'M24,22l80,0c6.627,0 12,5.373 12,12l0,60c0,6.627 -5.373,12 -12,12l-80,0c-6.627,0 -12,-5.373 -12,-12l0,-60c0,-6.627 5.373,-12 12,-12Z',
    'M48,22l0,84'
  ],

  heading: [
    'M26,18l0,92',
    'M102,18l0,92',
    'M26,64l76,0'
  ],

  bold: [
    'M36,18l32,0c13.807,0 24,9.402 24,21c0,11.598 -10.193,21 -24,21l-32,0l0,-42Z',
    'M36,60l38,0c14.912,0 26,11.193 26,25c0,13.807 -11.088,25 -26,25l-38,0l0,-50Z'
  ],

  italic: [
    'M58,18l48,0',
    'M22,110l48,0',
    'M82,18l-36,92'
  ],

  strikethrough: [
    round('M94,34c-5,-11 -16,-17 -30,-17c-17,0 -30,9 -30,22c0,10 7,17 22,21'),
    round('M78,72c11,4 16,10 16,19c0,13 -13,20 -30,20c-15,0 -27,-6 -32,-17'),
    'M12,64l104,0'
  ],

  code: [
    round('M42,34l-30,30l30,30'),
    round('M86,34l30,30l-30,30'),
    round('M74,24l-20,80')
  ],

  'list-bullet': [
    dot(17, 24),
    dot(17, 64),
    dot(17, 104),
    'M40,24l76,0',
    'M40,64l76,0',
    'M40,104l76,0'
  ],

  // two rows, 1 and 2: three rows of digits run together at this stroke
  'list-ordered': [
    round('M15,24l11,-9l0,40'),
    round('M12,83c0,-7 5,-12 13,-12c8,0 13,5 13,12c0,13 -26,17 -26,30l27,0'),
    'M56,35l60,0',
    'M56,93l60,0'
  ],

  // the editor's round task checkbox, ticked
  task: [
    circle(64, 64, 48),
    round('M42,65l15,14l29,-29')
  ]
}
