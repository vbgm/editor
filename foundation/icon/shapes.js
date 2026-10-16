// The icons' shapes, drawn as Ordner draws its icons (foundation/client/vue/components/icon):
// strokes only, on a 128 × 128 grid. Each icon is a list of paths: a path is its `d`, or
// { d, cap, weight } for round ends (default: butt) or a mark that is not a line (a dot: weight ×
// the stroke width). An icon that morphs is a function of its value (0–1) returning the list.
// { scale, paths } draws paths drawn at another size scaled about the centre, the stroke as
// thick as the others'. optical: [left, right], in the grid, added to a fitted icon's edges
// (Icon's isFitted): a side that is a point, a dot or a curve looks further away than a flat
// one, so it is drawn a little closer to its neighbour (negative: into the icon's box).
//
// All with the same stroke, and in the toolbar with their tops and bottoms on the same lines:
// 80 high, 24 to 104, scaled about the centre from how they are drawn (letters 92 high, 18 to
// 110); as in type, the shapes that look smaller overshoot the lines a little (the circle 84,
// the diagonal link 86), and those that look larger stay a little inside them (B and S 76,
// I and the lists 72); H1–H6 below. The toolbar's arrow is smaller (56 wide); check and
// angle-down are for menus.
// angle-down, check, sliders and link are Ordner's own.

const round = d => ({ d, cap: 'round' })

// a circle as a path: centre and radius
const circle = (x, y, r) => `M${x - r},${y}a${r},${r} 0 1,0 ${r * 2},0a${r},${r} 0 1,0 ${-r * 2},0Z`

// a dot: a zero-length round-ended stroke, a little wider than the stroke so it reads as large
const dot = (x, y) => ({ d: `M${x},${y}l0,0`, cap: 'round', weight: 1.3 })

// The headings' buttons, H1–H6: a small H (60 high, 44 to 104) close to the level's digit (80
// high, 24 to 104), on the same bottom line, drawn as the other icons are rather than as text.
// The digits are built as a geometric sans serif's: about 0.55 as wide as high, their bowls
// circles' arcs, flat ends on the bottom line; their centre lines run from 28.5 to 99.5, the
// stroke reaching 24 and 104.
const headingDigits = {
  // narrow: as close to the H as the others' bowls are
  1: ['M68,40L82,28.5L82,104'],
  // a round top (a circle's arc, narrower than the foot) running on into the diagonal, a flat
  // foot
  2: [round('M69.13,43.43A17,17 0 1,1 99.93,55.25L66,99.5'), 'M66,99.5L106,99.5'],
  // two circles' arcs, about as large, meeting where they touch
  3: [round('M70.84,37.25A17.5,17.5 0 1,1 86,63.5A18,18 0 1,1 70.41,90.5')],
  4: ['M96,104L96,28.5L66,80L108,80'],
  // a flat top and stem, the bowl a circle's arc from where the stem meets it
  5: ['M104,28.5L70,28.5L70,66.18', round('M70,66.18A20.5,20.5 0 1,1 68.25,89.25')],
  // a round top (an arc as wide as the bowl) down the left into a full circle
  6: [round('M101.32,35.64A20,20 0 0,0 66,48.5L66,79.5A20,20 0 1,0 106,79.5A20,20 0 1,0 66,79.5')]
}

const headingIcon = level => [
  'M14,44l0,60',
  'M48,44l0,60',
  'M14,74l34,0',
  ...headingDigits[level]
]

export default {
  'angle-down': [round('M45.976,55l18,18l18,-18')],

  // 0: down, 1: up; between, the tip and the ends move towards each other, flat halfway
  angle: value => [round(`M36,${50 + 28 * value}L64,${78 - 28 * value}L92,${50 + 28 * value}`)],

  check: [round('M24.067,60.38l30.908,28.099l44.958,-44.958')],

  // a little larger than the others (86), alone at the toolbar's right
  sliders: {
    scale: 86 / 114,
    // one up from Ordner's, centred: 7 to 121
    paths: [
      'M76,107l52,0',
      'M0,107l24,0',
      'M112,63l16,0',
      'M-0,63l60,0',
      'M68,19l60,0',
      'M0,19l16,0',
      'M64,107c-0,-7.732 -6.268,-14 -14,-14l-0,0c-7.732,0 -14,6.268 -14,14l0,0c0,7.732 6.268,14 14,14l0,0c7.732,-0 14,-6.268 14,-14l0,-0Z',
      'M100,63c-0,-7.732 -6.268,-14 -14,-14l-0,0c-7.732,0 -14,6.268 -14,14l0,0c0,7.732 6.268,14 14,14l0,0c7.732,-0 14,-6.268 14,-14l0,-0Z',
      'M56,21c-0,-7.732 -6.268,-14 -14,-14l-0,0c-7.732,0 -14,6.268 -14,14l0,0c0,7.732 6.268,14 14,14l0,0c7.732,-0 14,-6.268 14,-14l0,-0Z'
    ]
  },

  link: {
    optical: [-4, -4],
    scale: 86 / 110,
    paths: [
      round('M71.18,26.931l11.744,-11.745c8.248,-8.248 21.642,-8.248 29.89,0c8.248,8.248 8.248,21.642 -0,29.89l-27.892,27.892c-8.249,8.248 -21.642,8.248 -29.89,-0'),
      round('M56.82,101.069l-11.744,11.745c-8.248,8.248 -21.642,8.248 -29.89,-0c-8.248,-8.248 -8.248,-21.642 0,-29.89l27.892,-27.892c8.249,-8.248 21.642,-8.248 29.89,0')
    ]
  },

  // a window with a column on its left
  sidebar: {
    // a little smaller than the others (74): a large outline looks larger
    scale: 74 / 84,
    paths: [
    'M24,22l80,0c6.627,0 12,5.373 12,12l0,60c0,6.627 -5.373,12 -12,12l-80,0c-6.627,0 -12,-5.373 -12,-12l0,-60c0,-6.627 5.373,-12 12,-12Z',
    'M48,22l0,84'
    ]
  },

  'heading-1': headingIcon(1),
  'heading-2': headingIcon(2),
  'heading-3': headingIcon(3),
  'heading-4': headingIcon(4),
  'heading-5': headingIcon(5),
  'heading-6': headingIcon(6),

  heading: {
    scale: 80 / 92,
    paths: [
      'M26,18l0,92',
      'M102,18l0,92',
      'M26,64l76,0'
    ]
  },

  bold: {
    optical: [0, -2],
    scale: 76 / 92,
    paths: [
      'M36,18l32,0c13.807,0 24,9.402 24,21c0,11.598 -10.193,21 -24,21l-32,0l0,-42Z',
      'M36,60l38,0c14.912,0 26,11.193 26,25c0,13.807 -11.088,25 -26,25l-38,0l0,-50Z'
    ]
  },

  italic: {
    scale: 72 / 92,
    paths: [
      'M58,18l48,0',
      'M22,110l48,0',
      'M82,18l-36,92'
    ]
  },

  strikethrough: {
    optical: [-1, -1],
    scale: 76 / 94,
    paths: [
      round('M94,34c-5,-11 -16,-17 -30,-17c-17,0 -30,9 -30,22c0,10 7,17 22,21'),
      round('M78,72c11,4 16,10 16,19c0,13 -13,20 -30,20c-15,0 -27,-6 -32,-17'),
      'M22,64l84,0'
    ]
  },

  code: {
    optical: [-4, -4],
    paths: [
      round('M42,34l-30,30l30,30'),
      round('M86,34l30,30l-30,30'),
      round('M74,24l-20,80')
    ]
  },

  'list-bullet': {
    optical: [-2, 0],
    scale: 72 / 80,
    paths: [
      dot(17, 24),
      dot(17, 64),
      dot(17, 104),
      'M40,24l76,0',
      'M40,64l76,0',
      'M40,104l76,0'
    ]
  },

  // a 1 beside the first two of the bulleted list's three lines, a little larger than they
  // span, the third as long as the icon is wide
  'list-ordered': {
    scale: 72 / 80,
    paths: [
      'M10,32l16,-15l0,61',
      'M56,24l60,0',
      'M56,64l60,0',
      'M10,104l106,0'
    ]
  },

  // the editor's round task checkbox, ticked
  task: {
    optical: [-3, -3],
    scale: 84 / 96,
    paths: [
      circle(64, 64, 48),
      round('M42,65l15,14l29,-29')
    ]
  }
}
