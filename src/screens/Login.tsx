import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useApp } from '../AppContext'
import { Button, CheckIcon, LangToggle, MessageIcon, MicIcon, TextField } from '../components/ui'
import { formatPhoneInput, prettyPhone, toE164 } from '../lib/phone'
import { DEMO } from '../lib/supabase'
import type { Lang } from '../lib/types'

/** Screen 1: phone → code → (first time) name + business + language. */
export function Login() {
  const { status } = useApp()
  if (status !== 'needsSetup') return <PhoneAndCode />
  return (
    <Page header={<SmallBrand />}>
      <Setup />
    </Page>
  )
}

function Page({ header, children }: { header: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      {header}
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {children}
      </div>
    </div>
  )
}

/** Black header with the logo, what the app does, and the 3 steps. */
function Hero() {
  const { t } = useApp()
  const steps = [
    { Icon: MicIcon, label: t.stepTalk },
    { Icon: CheckIcon, label: t.stepCheck },
    { Icon: MessageIcon, label: t.stepSend },
  ]
  return (
    <header className="rounded-b-3xl bg-ink text-white">
      <div className="mx-auto max-w-md px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-7">
        <div className="flex justify-end">
          <LangToggle onDark />
        </div>
        <div className="flex flex-col items-center text-center">
          <img src="/favicon.svg" alt="" className="size-20" />
          <h1 className="mt-4 text-4xl font-black tracking-tight break-words">{t.appName}</h1>
          <p className="mt-2 max-w-xs text-lg text-gray-200">{t.tagline}</p>
          <ol className="mt-6 grid w-full grid-cols-3 gap-2 [@media(max-height:640px)]:hidden">
            {steps.map(({ Icon, label }, i) => (
              <li key={label} className="flex flex-col items-center gap-2">
                <span className="flex size-12 items-center justify-center rounded-full bg-brand text-ink">
                  <Icon className="size-6" />
                </span>
                <span className="text-base font-bold">
                  {i + 1}. {label}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </header>
  )
}

/** Slim header, so the code and setup forms fit above the keyboard. */
function SmallBrand({ langToggle = false }: { langToggle?: boolean }) {
  const { t } = useApp()
  return (
    <header className="bg-ink text-white">
      <div className="mx-auto flex max-w-md items-center gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <img src="/favicon.svg" alt="" className="size-10" />
        <span className="min-w-0 flex-1 truncate text-xl font-black">{t.appName}</span>
        {langToggle && <LangToggle onDark />}
      </div>
    </header>
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
    <Page header={step === 'phone' ? <Hero /> : <SmallBrand langToggle />}>
      {DEMO && (
        <p className="mb-4 rounded-xl border-2 border-dashed border-ink bg-brand/25 px-3 py-2 text-base font-semibold">
          {t.demoBanner}
        </p>
      )}
      {step === 'phone' && <div className="flex-1" />}

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
          <p className="text-lg">{t.codeSentTo(prettyPhone(phone).replaceAll('-', '\u2011'))}</p>
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
    </Page>
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
      <div className="pb-6">
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
