import { useCallback, useEffect, useRef, useState } from 'react'
import type { Lang } from './types'

// Minimal Web Speech API types (not in every TS DOM lib, and Safari prefixes it).
interface SpeechAlternative {
  transcript: string
}
interface SpeechResult {
  readonly isFinal: boolean
  readonly length: number
  [index: number]: SpeechAlternative
}
interface SpeechResultEvent {
  readonly results: { readonly length: number; [index: number]: SpeechResult }
}
interface SpeechErrorEvent {
  readonly error: string
}
interface Recognizer {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: SpeechResultEvent) => void) | null
  onerror: ((e: SpeechErrorEvent) => void) | null
  onend: (() => void) | null
}
type RecognizerCtor = new () => Recognizer

function getRecognizer(): RecognizerCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: RecognizerCtor
    webkitSpeechRecognition?: RecognizerCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const BLOCKING_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported'])

/**
 * Talk-to-text. `onText` gets the full transcript of the current session
 * (final + in-progress words) each time it changes.
 */
export function useSpeech(lang: Lang, onText: (transcript: string) => void) {
  const [supported, setSupported] = useState(() => getRecognizer() !== null)
  const [listening, setListening] = useState(false)
  const recRef = useRef<Recognizer | null>(null)
  const onTextRef = useRef(onText)
  useEffect(() => {
    onTextRef.current = onText
  }, [onText])

  const stop = useCallback(() => {
    recRef.current?.stop()
  }, [])

  const start = useCallback(() => {
    const Ctor = getRecognizer()
    if (!Ctor) {
      setSupported(false)
      return
    }
    recRef.current?.abort()
    const rec = new Ctor()
    rec.lang = lang === 'es' ? 'es-US' : 'en-US'
    rec.continuous = true // contractors pause mid-list; don't cut them off
    rec.interimResults = true
    rec.onresult = (e) => {
      // Rebuild from every result each time (avoids duplicate words on Android).
      let text = ''
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0]?.transcript ?? ''
      onTextRef.current(text.trim())
    }
    rec.onerror = (e) => {
      if (BLOCKING_ERRORS.has(e.error)) setSupported(false)
    }
    rec.onend = () => {
      setListening(false)
      if (recRef.current === rec) recRef.current = null
    }
    recRef.current = rec
    try {
      rec.start()
      setListening(true)
    } catch {
      setSupported(false)
      setListening(false)
    }
  }, [lang])

  useEffect(() => () => recRef.current?.abort(), [])

  return { supported, listening, start, stop }
}
