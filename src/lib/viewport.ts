import { useSyncExternalStore } from 'react'

/** The part of the screen the on-screen keyboard leaves visible, in CSS pixels from the top of the page. */
export interface VisibleArea {
  top: number
  height: number
}

function subscribe(onChange: () => void) {
  const vv = window.visualViewport
  if (!vv) return () => {}
  vv.addEventListener('resize', onChange)
  vv.addEventListener('scroll', onChange)
  return () => {
    vv.removeEventListener('resize', onChange)
    vv.removeEventListener('scroll', onChange)
  }
}

// iPhones don't shrink the page when the keyboard opens; it slides over the bottom of it and the
// visible part pans. (Android does shrink it, because of interactive-widget=resizes-content in
// index.html, so this stays empty there.) A large gap between the page and the visible part,
// at normal zoom, means the keyboard is up.
const KEYBOARD_MIN_PX = 120

function snapshot(): string {
  const vv = window.visualViewport
  if (!vv || Math.abs(vv.scale - 1) > 0.01) return ''
  if (document.documentElement.clientHeight - vv.height < KEYBOARD_MIN_PX) return ''
  return `${Math.round(vv.offsetTop)} ${Math.round(vv.height)}`
}

/** Where to draw so nothing hides behind the keyboard; null when no keyboard is covering the page. */
export function useKeyboardArea(): VisibleArea | null {
  const area = useSyncExternalStore(subscribe, snapshot, () => '')
  if (!area) return null
  const [top, height] = area.split(' ').map(Number)
  return { top, height }
}
