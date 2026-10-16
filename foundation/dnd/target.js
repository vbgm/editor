// Target mode, for trees (a TOC sidebar, folders): the nodes stay where they are, and the drop
// position is decided by the pointer's vertical position over a node's own row (not its
// children), never by moving sideways, as in Ordner's sidebar:
// - near the row's top or bottom edge: before or after the node, at its level
// - over the rest of the row: onto the node, nesting the dragged node inside it
// Ordner splits a row into thirds; here the edges are narrower (20% each, at least 5 px), so
// nesting is the easy target and before / after need aiming.
//
// The owner gives the rows in content coordinates, in the order they are drawn, and says which
// drops are allowed (not onto the dragged node or into its own subtree, for example). A slot is
// { index, position } with position 'before', 'after' or 'onto', or null where nothing is allowed.

const edgeShare = 0.2
const edgeMin = 5

// rows: [{ top, bottom }]; isAllowed (index, position)
export function target ({ rows, isAllowed = () => true }) {
  return {
    initial: null,
    isSame (a, b) {
      return a == b || (!!a && !!b && a.index == b.index && a.position == b.position)
    },
    slotAt (top, bottom, pointer) {
      const index = rows.findIndex(row => pointer >= row.top && pointer < row.bottom)
      if (index < 0) return null
      const position = positionIn(rows[index], pointer)
      return isAllowed(index, position) ? { index, position } : null
    }
  }
}

export function positionIn ({ top, bottom }, pointer) {
  const edge = Math.max((bottom - top) * edgeShare, edgeMin)
  if (pointer < top + edge) return 'before'
  if (pointer >= bottom - edge) return 'after'
  return 'onto'
}
