// "Add to Home Screen" helper.
//
// Android/Chrome hands us an event we can use to show its install dialog.
// iPhones have no such thing: the user has to use Share → Add to Home Screen,
// so all we can do there is tell them how.

import { useEffect, useState } from 'react'
import { readJSON, writeJSON } from './storage'

interface InstallPromptEvent extends Event {
  prompt?: () => Promise<unknown>
  userChoice?: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED_KEY = 'pn:install-dismissed'

let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

if (typeof window !== 'undefined') {
  // Fires once, often before the app has drawn anything, so catch it at load.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // we show our own hint instead of Chrome's mini-bar
    deferred = e
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    emit()
  })
}

function isInstalled(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function isIOS(): boolean {
  const ua = navigator.userAgent
  if (/android/i.test(ua)) return false
  // iPadOS reports itself as a Mac, but Macs don't have touch screens.
  return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/** 'prompt' = we can open the install dialog; 'ios' = show the Share steps; null = show nothing. */
export type InstallMode = 'prompt' | 'ios' | null

export function useInstallHint() {
  const [, rerender] = useState(0)
  const [dismissed, setDismissed] = useState(() => readJSON<boolean>(DISMISSED_KEY, false))

  useEffect(() => {
    const fn = () => rerender((n) => n + 1)
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  }, [])

  const mode: InstallMode = dismissed || isInstalled() ? null : deferred ? 'prompt' : isIOS() ? 'ios' : null

  return {
    mode,
    dismiss() {
      writeJSON(DISMISSED_KEY, true)
      setDismissed(true)
    },
    async install() {
      const event = deferred
      if (!event?.prompt) return
      await event.prompt()
      await event.userChoice
      deferred = null // the browser only lets the event be used once
      emit()
    },
  }
}
