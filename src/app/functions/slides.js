// How the toolbar (App) and the sidebars (sidebar/) slide in and out, alike, as Web Animations'
// timing: quickly both ways, in easing out strongly, out evenly so it is not gone at once.

export const slideIn = { duration: 200, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }

export const slideOut = { duration: 200, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }

// px a panel slides by, fading, where nothing else moves with it: the toolbar's height, so the
// toolbar and the sidebars move as fast
export const slideDistance = 48
