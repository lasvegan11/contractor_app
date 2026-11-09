import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useApp } from '../AppContext'
import { Button, LangToggle, TextField } from '../components/ui'
import { formatPhoneInput, prettyPhone, toE164 } from '../lib/phone'
import { DEMO } from '../lib/supabase'
import type { Lang } from '../lib/types'

/** Screen 1: phone → code → (first time) name + business + language. */
export function Login() {
  const { status } = useApp()
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex justify-end">
        <LangToggle />
      </div>
      {status === 'needsSetup' ? <Setup /> : <PhoneAndCode />}
    </div>
  )
}

function Brand() {
  const { t } = useApp()
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
      <img src="/favicon.svg" alt="" className="mb-4 size-20" />
      <h1 className="text-4xl font-black tracking-tight">{t.appName}</h1>
      <p className="mt-3 max-w-xs text-lg text-muted">{t.tagline}</p>
    </div>
  )
}

function PhoneAndCode() {
  const { t, sendCode, verifyCode } = useApp()
  const [step, setStep] = useState<'phone' | 'code'>('phone')
  const [phoneInput, setPhoneInput] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const phone = toE164(phoneInput)

  async function submitPhone(e?: FormEvent) {
    e?.preventDefault()
    if (!phone) return setError(t.badPhone)
    setBusy(true)
    setError(null)
    const ok = await sendCode(phone)
    setBusy(false)
    if (!ok) return setError(t.somethingWrong)
    setCode('')
    setStep('code')
  }

  async function submitCode(value = code) {
    if (!phone || value.length !== 6 || busy) return
    setBusy(true)
    setError(null)
    const ok = await verifyCode(phone, value)
    setBusy(false)
    if (!ok) {
      setError(t.badCode)
      setCode('')
    }
  }

  return (
    <>
      <Brand />
      {DEMO && (
        <p className="mb-4 rounded-xl border-2 border-ink bg-brand/30 p-3 text-base font-semibold">{t.demoBanner}</p>
      )}

      {step === 'phone' ? (
        <form onSubmit={submitPhone} className="space-y-4">
          <TextField
            label={t.phoneLabel}
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder={t.phonePlaceholder}
            value={phoneInput}
            onChange={(e) => {
              setPhoneInput(formatPhoneInput(e.target.value))
              setError(null)
            }}
            autoFocus
          />
          {error && <p className="text-base font-bold text-danger">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy || !phone}>
            {busy ? t.sending : t.sendCode}
          </Button>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void submitCode()
          }}
          className="space-y-4"
        >
          <p className="text-lg">{t.codeSentTo(prettyPhone(phone))}</p>
          <TextField
            label={t.codeLabel}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="••••••"
            value={code}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '').slice(0, 6)
              setCode(v)
              setError(null)
              if (v.length === 6) void submitCode(v)
            }}
            autoFocus
          />
          {error && <p className="text-base font-bold text-danger">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>
            {busy ? t.checking : t.logIn}
          </Button>
          <div className="flex flex-col gap-1">
            <Button variant="ghost" className="w-full text-base" disabled={busy} onClick={() => void submitPhone()}>
              {t.resend}
            </Button>
            <Button
              variant="ghost"
              className="w-full text-base"
              disabled={busy}
              onClick={() => {
                setStep('phone')
                setError(null)
              }}
            >
              {t.changeNumber}
            </Button>
          </div>
        </form>
      )}
    </>
  )
}

function Setup() {
  const { t, lang, setLang, profile, saveProfile } = useApp()
  const [name, setName] = useState(profile?.name ?? '')
  const [business, setBusiness] = useState(profile?.business_name ?? '')
  const [busy, setBusy] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => nameRef.current?.focus(), [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return nameRef.current?.focus()
    setBusy(true)
    await saveProfile({ name: name.trim(), business_name: business.trim() || null, lang })
    setBusy(false)
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col">
      <div className="py-8">
        <h1 className="text-4xl font-black">{t.setupTitle}</h1>
        <p className="mt-2 text-lg text-muted">{t.setupHint}</p>
      </div>
      <div className="space-y-5">
        <TextField
          ref={nameRef}
          label={t.yourName}
          autoComplete="name"
          autoCapitalize="words"
          placeholder={t.namePlaceholder}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <TextField
          label={t.businessName}
          autoComplete="organization"
          autoCapitalize="words"
          placeholder={t.businessPlaceholder}
          value={business}
          onChange={(e) => setBusiness(e.target.value)}
        />
        <fieldset>
          <legend className="mb-1 block text-base font-bold">{t.language}</legend>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ['en', 'English'],
                ['es', 'Español'],
              ] as Array<[Lang, string]>
            ).map(([l, label]) => (
              <button
                key={l}
                type="button"
                aria-pressed={lang === l}
                onClick={() => setLang(l)}
                className={`min-h-14 rounded-xl border-2 border-ink text-lg font-bold ${lang === l ? 'bg-ink text-white' : 'bg-white'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="flex-1" />
      <Button type="submit" className="mt-8 w-full" disabled={busy || !name.trim()}>
        {t.start}
      </Button>
    </form>
  )
}
