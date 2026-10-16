// Displace mode: the items between the dragged item's place and the pointer move aside, opening a
// gap where it would go (as in Ordner's list reordering).
//
// The owner gives the stretches the dragged item can pass, nearest first, in content coordinates:
// up[i] is what it passes going to slot -(i + 1), down[i] going to slot i + 1. A stretch is
// passed once the dragged item's top (going up) or bottom (going down) crosses its middle, so a
// tall item and a short one swap at the same point.
export function displace ({ up, down }) {
  return {
    slotAt (top, bottom) {
      let index = 0
      while (index < up.length && top < middle(up[index])) index++
      if (index) return -index
      while (index < down.length && bottom > middle(down[index])) index++
      return index
    }
  }
}

function middle ({ top, bottom }) {
  return (top + bottom) / 2
}
