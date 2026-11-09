import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { flush, pendingCount } from './lib/data'
import { STRINGS, type Strings } from './lib/i18n'
import { readJSON, removeKey, writeJSON } from './lib/storage'
import { DEMO, sb } from './lib/supabase'
import type { Lang, Profile } from './lib/types'

type Status = 'loading' | 'signedOut' | 'needsSetup' | 'ready'

interface AppState {
  status: Status
  uid: string | null
  profile: Profile | null
  lang: Lang
  t: Strings
  setLang: (lang: Lang) => void
  sendCode: (phoneE164: string) => Promise<boolean>
  verifyCode: (phoneE164: string, code: string) => Promise<boolean>
  saveProfile: (patch: Partial<Omit<Profile, 'id'>>) => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AppState | null>(null)

const LANG_KEY = 'pn:lang'
const DEMO_UID = 'demo'
const profileKey = (uid: string) => `pn:${uid}:profile`

function initialLang(): Lang {
  const saved = readJSON<Lang | null>(LANG_KEY, null)
  if (saved === 'en' || saved === 'es') return saved
  return navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en'
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang)
  const [session, setSession] = useState<{ uid: string; phone: string | null } | null | undefined>(() => {
    if (!DEMO) return undefined // resolved from Supabase below
    const p = readJSON<Profile | null>(profileKey(DEMO_UID), null)
    return p ? { uid: DEMO_UID, phone: p.phone } : null
  })
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined)

  // --- session -------------------------------------------------------------
  useEffect(() => {
    if (DEMO) return
    const client = sb()
    client.auth.getSession().then(({ data }) => {
      const s = data.session
      setSession(s ? { uid: s.user.id, phone: s.user.phone ?? null } : null)
    })
    const { data } = client.auth.onAuthStateChange((_event, s) => {
      // Don't call Supabase from inside this callback; just record the change.
      setSession((prev) => {
        const next = s ? { uid: s.user.id, phone: s.user.phone ?? null } : null
        return prev?.uid === next?.uid ? prev : next
      })
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const uid = session?.uid ?? null

  // --- profile -------------------------------------------------------------
  useEffect(() => {
    if (!session) {
      setProfile(session === null ? null : undefined)
      return
    }
    const { uid: id, phone } = session
    const cached = readJSON<Profile | null>(profileKey(id), null)
    setProfile(cached ?? undefined)
    if (cached?.lang) setLangState(cached.lang)
    if (DEMO) return

    let cancelled = false
    ;(async () => {
      const client = sb()
      let { data, error } = await client
        .from('profiles')
        .select('id, name, business_name, phone, lang')
        .eq('id', id)
        .maybeSingle<Profile>()
      if (!error && !data) {
        // Signup trigger didn't run (e.g. migration applied later): create the row now.
        const created = await client
          .from('profiles')
          .upsert({ id, phone, lang: readJSON<Lang>(LANG_KEY, 'en') })
          .select('id, name, business_name, phone, lang')
          .single<Profile>()
        data = created.data
        error = created.error
      }
      if (cancelled) return
      if (data) {
        writeJSON(profileKey(id), data)
        setProfile(data)
        if (data.lang) setLangState(data.lang)
      } else if (!cached) {
        // Offline on first launch: let them in with what we know.
        setProfile({ id, name: null, business_name: null, phone, lang: initialLang() })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [session])

  // --- background sync -----------------------------------------------------
  useEffect(() => {
    if (!uid || DEMO) return
    const kick = () => {
      if (pendingCount(uid) > 0) void flush(uid)
    }
    kick()
    const onVisible = () => document.visibilityState === 'visible' && kick()
    window.addEventListener('online', kick)
    document.addEventListener('visibilitychange', onVisible)
    const timer = window.setInterval(kick, 30_000)
    return () => {
      window.removeEventListener('online', kick)
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(timer)
    }
  }, [uid])

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  // --- actions -------------------------------------------------------------
  const saveProfile = useCallback(
    async (patch: Partial<Omit<Profile, 'id'>>) => {
      if (!uid) return
      const base: Profile = profile ?? {
        id: uid,
        name: null,
        business_name: null,
        phone: session?.phone ?? null,
        lang,
      }
      const next = { ...base, ...patch }
      setProfile(next)
      writeJSON(profileKey(uid), next)
      if (DEMO) return
      const { error } = await sb().from('profiles').update(patch).eq('id', uid)
      if (error) console.warn('profile not saved to server yet', error)
    },
    [uid, profile, session, lang],
  )

  const setLang = useCallback(
    (next: Lang) => {
      setLangState(next)
      writeJSON(LANG_KEY, next)
      if (uid) void saveProfile({ lang: next })
    },
    [uid, saveProfile],
  )

  const sendCode = useCallback(async (phone: string) => {
    if (DEMO) return true
    const { error } = await sb().auth.signInWithOtp({ phone })
    if (error) console.warn('send code failed', error)
    return !error
  }, [])

  const verifyCode = useCallback(
    async (phone: string, code: string) => {
      if (DEMO) {
        if (!/^\d{6}$/.test(code)) return false
        const p: Profile = { id: DEMO_UID, name: null, business_name: null, phone, lang }
        writeJSON(profileKey(DEMO_UID), p)
        setSession({ uid: DEMO_UID, phone })
        return true
      }
      const { error } = await sb().auth.verifyOtp({ phone, token: code, type: 'sms' })
      if (error) console.warn('verify failed', error)
      return !error
    },
    [lang],
  )

  const signOut = useCallback(async () => {
    if (DEMO) {
      removeKey(profileKey(DEMO_UID))
      setSession(null)
      return
    }
    // Unsent changes stay in the outbox under this user's ID and sync on next login.
    await sb().auth.signOut({ scope: 'local' })
    setSession(null)
  }, [])

  const status: Status =
    session === undefined || (session && profile === undefined)
      ? 'loading'
      : !session
        ? 'signedOut'
        : !profile?.name
          ? 'needsSetup'
          : 'ready'

  const value = useMemo<AppState>(
    () => ({
      status,
      uid,
      profile: profile ?? null,
      lang,
      t: STRINGS[lang],
      setLang,
      sendCode,
      verifyCode,
      saveProfile,
      signOut,
    }),
    [status, uid, profile, lang, setLang, sendCode, verifyCode, saveProfile, signOut],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp(): AppState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>')
  return ctx
}
