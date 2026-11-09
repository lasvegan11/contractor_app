import { useCallback, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ComponentProps, type ReactNode } from 'react'
import { useApp } from '../AppContext'

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type Variant = 'primary' | 'dark' | 'outline' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-ink border-2 border-ink active:bg-brand-dark',
  dark: 'bg-ink text-white border-2 border-ink active:bg-black',
  outline: 'bg-white text-ink border-2 border-ink active:bg-gray-100',
  ghost: 'bg-transparent text-ink border-2 border-transparent active:bg-gray-100',
  danger: 'bg-white text-danger border-2 border-danger active:bg-red-50',
}

export function Button({
  variant = 'primary',
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl px-5 text-lg font-bold transition-transform select-none active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100 ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export function TextField({
  label,
  className = '',
  ...props
}: ComponentProps<'input'> & { label: string }) {
  const id = useId()
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-base font-bold">
        {label}
      </label>
      <input
        id={id}
        {...props}
        className="block min-h-14 w-full rounded-xl border-2 border-ink bg-white px-4 text-xl text-ink placeholder:text-gray-500 focus:outline-4 focus:outline-offset-0 focus:outline-brand"
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Language toggle
// ---------------------------------------------------------------------------

export function LangToggle() {
  const { lang, setLang } = useApp()
  return (
    <div role="group" aria-label="Language / Idioma" className="flex rounded-xl border-2 border-ink p-0.5">
      {(['en', 'es'] as const).map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={lang === l}
          onClick={() => setLang(l)}
          className={`min-h-11 min-w-12 rounded-lg px-3 text-base font-black ${lang === l ? 'bg-ink text-white' : 'text-ink'}`}
        >
          {l === 'en' ? 'EN' : 'ES'}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bottom sheet
// ---------------------------------------------------------------------------

export function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const { t } = useApp()
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative max-h-[92dvh] overflow-y-auto rounded-t-3xl bg-white px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl"
      >
        <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-gray-300" aria-hidden="true" />
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-2xl font-black">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="flex size-12 items-center justify-center rounded-full active:bg-gray-100"
          >
            <XIcon />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

interface ToastState {
  id: number
  message: string
  action?: { label: string; run: () => void }
}

export function useToast(bottomClass = 'bottom-[calc(7rem+env(safe-area-inset-bottom))]') {
  const [toast, setToast] = useState<ToastState | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const show = useCallback((message: string, action?: ToastState['action'], ms = 4000) => {
    window.clearTimeout(timer.current)
    const id = Date.now()
    setToast({ id, message, action })
    timer.current = window.setTimeout(() => setToast((cur) => (cur?.id === id ? null : cur)), ms)
  }, [])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const node = toast ? (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4 ${bottomClass}`}
    >
      <div className="pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-base font-semibold text-white shadow-xl">
        <span>{toast.message}</span>
        {toast.action && (
          <button
            type="button"
            onClick={() => {
              toast.action?.run()
              setToast(null)
            }}
            className="min-h-12 shrink-0 rounded-xl bg-brand px-4 font-black text-ink"
          >
            {toast.action.label}
          </button>
        )}
      </div>
    </div>
  ) : null

  return { show, node }
}

// ---------------------------------------------------------------------------
// Icons (inline so they work offline and stay crisp)
// ---------------------------------------------------------------------------

type IconProps = { className?: string }
const icon = (className = 'size-6') => ({
  className,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
})

export const XIcon = ({ className }: IconProps) => (
  <svg {...icon(className)}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
)
export const PlusIcon = ({ className }: IconProps) => (
  <svg {...icon(className)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)
export const CheckIcon = ({ className }: IconProps) => (
  <svg {...icon(className)} strokeWidth={3.5}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
)
export const BackIcon = ({ className }: IconProps) => (
  <svg {...icon(className)} strokeWidth={3}>
    <path d="m15 18-6-6 6-6" />
  </svg>
)
export const MicIcon = ({ className }: IconProps) => (
  <svg {...icon(className)}>
    <rect x="9" y="2.5" width="6" height="12" rx="3" fill="currentColor" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3.5" />
  </svg>
)
export const StopIcon = ({ className }: IconProps) => (
  <svg {...icon(className)}>
    <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
  </svg>
)
export const SendIcon = ({ className }: IconProps) => (
  <svg {...icon(className)}>
    <path d="M21.5 2.5 10.5 13.5M21.5 2.5 15 21.5l-4.5-8-8-4.5 19-6.5Z" />
  </svg>
)
export const MessageIcon = ({ className }: IconProps) => (
  <svg {...icon(className)}>
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12Z" />
  </svg>
)
export const ShareIcon = ({ className }: IconProps) => (
  <svg {...icon(className)}>
    <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M5 12v7.5h14V12" />
  </svg>
)
export const CopyIcon = ({ className }: IconProps) => (
  <svg {...icon(className)}>
    <rect x="8.5" y="8.5" width="12" height="12" rx="2" />
    <path d="M15.5 5.5v-1a2 2 0 0 0-2-2h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h1" />
  </svg>
)
export const UserIcon = ({ className }: IconProps) => (
  <svg {...icon(className)}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </svg>
)
export const TrashIcon = ({ className }: IconProps) => (
  <svg {...icon(className)}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </svg>
)
export const CloudOffIcon = ({ className }: IconProps) => (
  <svg {...icon(className)}>
    <path d="M3 3l18 18M8.5 8.6A5 5 0 0 0 6.5 18h11m3-2.2A4 4 0 0 0 17 10h-.5A6 6 0 0 0 11 6c-.7 0-1.4.1-2 .4" />
  </svg>
)
