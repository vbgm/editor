// The icons' shapes, drawn as Ordner draws its icons (foundation/client/vue/components/icon):
// strokes only, on a 128 × 128 grid. Each icon is a list of paths: a path is its `d`, or
// { d, cap, weight } for round ends (default: butt) or a stroke thinner or thicker than the icon's
// (weight × its stroke width). An icon that morphs is a function of its value (0–1) returning
// the list.
// angle-down, check, sliders and link are Ordner's own.

const round = d => ({ d, cap: 'round' })

// a circle as a path: centre and radius
const circle = (x, y, r) => `M${x - r},${y}a${r},${r} 0 1,0 ${r * 2},0a${r},${r} 0 1,0 ${-r * 2},0Z`

// a dot: a zero-length round-ended stroke, as wide as the stroke
const dot = (x, y) => ({ d: `M${x},${y}l0,0`, cap: 'round', weight: 1.3 })

export default {
  'angle-down': [round('M45.976,55l18,18l18,-18')],

  // 0: down (Ordner's angle-down), 1: up; between, the tip and the ends move towards each other,
  // flat halfway
  angle: value => [round(`M45.976,${55 + 18 * value}L63.976,${73 - 18 * value}L81.976,${55 + 18 * value}`)],

  check: [round('M24.067,60.38l30.908,28.099l44.958,-44.958')],

  sliders: [
    'M76,108l52,0',
    'M0,108l24,0',
    'M112,64l16,0',
    'M-0,64l60,0',
    'M68,20l60,0',
    'M0,20l16,0',
    'M64,108c-0,-7.732 -6.268,-14 -14,-14l-0,0c-7.732,0 -14,6.268 -14,14l0,0c0,7.732 6.268,14 14,14l0,0c7.732,-0 14,-6.268 14,-14l0,-0Z',
    'M100,64c-0,-7.732 -6.268,-14 -14,-14l-0,0c-7.732,0 -14,6.268 -14,14l0,0c0,7.732 6.268,14 14,14l0,0c7.732,-0 14,-6.268 14,-14l0,-0Z',
    'M56,22c-0,-7.732 -6.268,-14 -14,-14l-0,0c-7.732,0 -14,6.268 -14,14l0,0c0,7.732 6.268,14 14,14l0,0c7.732,-0 14,-6.268 14,-14l0,-0Z'
  ],

  link: [
    round('M71.18,26.931l11.744,-11.745c8.248,-8.248 21.642,-8.248 29.89,0c8.248,8.248 8.248,21.642 -0,29.89l-27.892,27.892c-8.249,8.248 -21.642,8.248 -29.89,-0'),
    round('M56.82,101.069l-11.744,11.745c-8.248,8.248 -21.642,8.248 -29.89,-0c-8.248,-8.248 -8.248,-21.642 0,-29.89l27.892,-27.892c8.249,-8.248 21.642,-8.248 29.89,0')
  ],

  // a window with a column on its left
  sidebar: [
    'M22,20l84,0c6.627,0 12,5.373 12,12l0,64c0,6.627 -5.373,12 -12,12l-84,0c-6.627,0 -12,-5.373 -12,-12l0,-64c0,-6.627 5.373,-12 12,-12Z',
    'M48,20l0,88'
  ],

  heading: [
    'M28,16l0,96',
    'M100,16l0,96',
    'M28,64l72,0'
  ],

  bold: [
    { d: 'M36,18l32,0c13.807,0 24,9.402 24,21c0,11.598 -10.193,21 -24,21l-32,0l0,-42Z', weight: 1.2 },
    { d: 'M36,60l38,0c14.912,0 26,11.193 26,25c0,13.807 -11.088,25 -26,25l-38,0l0,-50Z', weight: 1.2 }
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
    round('M40,34l-30,30l30,30'),
    round('M88,34l30,30l-30,30'),
    round('M74,22l-20,84')
  ],

  'list-bullet': [
    dot(18, 24),
    dot(18, 64),
    dot(18, 104),
    'M42,24l78,0',
    'M42,64l78,0',
    'M42,104l78,0'
  ],

  'list-ordered': [
    { d: 'M12,16l8,-6l0,28', weight: 0.75 },
    { d: 'M10,56c0,-5 4,-8 9,-8c5,0 9,3 9,8c0,8 -18,12 -18,22l19,0', weight: 0.75 },
    { d: 'M10,92c2,-3 5,-4 9,-4c5,0 9,3 9,7c0,4 -4,7 -10,7c7,0 11,3 11,8c0,5 -5,8 -10,8c-4,0 -8,-1 -10,-4', weight: 0.75 },
    'M42,24l78,0',
    'M42,64l78,0',
    'M42,104l78,0'
  ],

  // the editor's round task checkbox, ticked
  task: [
    circle(64, 64, 52),
    round('M40,66l16,15l32,-32')
  ]
}
