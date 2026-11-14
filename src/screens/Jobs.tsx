import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../AppContext'
import {
  Button,
  CheckIcon,
  ChevronRightIcon,
  ClipboardIcon,
  CloudOffIcon,
  DownloadIcon,
  LangToggle,
  PinIcon,
  PlusIcon,
  Progress,
  ShareIcon,
  Sheet,
  TextField,
  UserIcon,
} from '../components/ui'
import { JobKindIcon } from '../components/JobKindIcon'
import { JobKindTiles } from '../components/JobKindPicker'
import { isJobKind, jobKindName, type JobKindId } from '../data/jobKinds'
import { cachedJobs, createJob, loadJobs, onSyncChange } from '../lib/data'
import { timeAgo } from '../lib/i18n'
import { useInstallHint } from '../lib/install'
import { useOfflinePending } from '../lib/useOfflinePending'
import { prettyPhone } from '../lib/phone'
import type { Job } from '../lib/types'

/** Screen 2: list of jobs, newest first, and a big "+ New Job" button. */
export function Jobs() {
  const { t, uid, profile } = useApp()
  const navigate = useNavigate()
  const [jobs, setJobs] = useState<Job[]>(() => (uid ? cachedJobs(uid) : []))
  const [creating, setCreating] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const offline = useOfflinePending(uid)

  useEffect(() => {
    if (!uid) return
    let alive = true
    const refresh = () => loadJobs(uid).then((j) => alive && setJobs(j))
    void refresh()
    const off = onSyncChange(() => alive && setJobs(cachedJobs(uid)))
    window.addEventListener('online', refresh)
    return () => {
      alive = false
      off()
      window.removeEventListener('online', refresh)
    }
  }, [uid])

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <div className="sticky top-0 z-10">
        <header className="flex items-center gap-2 border-b-2 border-ink bg-white px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
          <div className="min-w-0 flex-1">
            {(profile?.business_name || profile?.name) && (
              <p className="truncate text-sm font-bold tracking-wide text-muted uppercase">
                {profile.business_name || profile.name}
              </p>
            )}
            <h1 className="truncate text-3xl leading-tight font-black">{t.jobs}</h1>
          </div>
          <LangToggle />
          <button
            type="button"
            onClick={() => setAccountOpen(true)}
            aria-label={t.account}
            className="flex size-12 items-center justify-center rounded-xl border-2 border-ink active:bg-gray-100"
          >
            <UserIcon />
          </button>
        </header>
        {offline && (
          <div className="flex items-center gap-2 bg-ink px-4 py-2 text-base font-semibold text-white">
            <CloudOffIcon className="size-5" />
            {t.unsynced}
          </div>
        )}
      </div>

      <main className="flex-1 px-4 pt-4 pb-32">
        <InstallHint />
        {jobs.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <span className="flex size-20 items-center justify-center rounded-3xl bg-brand">
              <ClipboardIcon className="size-10" />
            </span>
            <p className="mt-5 text-2xl font-black">{t.noJobs}</p>
            <p className="mt-2 max-w-xs text-lg text-muted">{t.noJobsHint}</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {jobs.map((job) => (
              <li key={job.id}>
                <JobCard job={job} />
              </li>
            ))}
          </ul>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t-2 border-ink bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-xl">
          <Button className="min-h-16 w-full text-xl" onClick={() => setCreating(true)}>
            <PlusIcon className="size-7" />
            {t.newJob}
          </Button>
        </div>
      </div>

      <NewJobSheet
        open={creating}
        onClose={() => setCreating(false)}
        onCreate={(name, address, trade) => {
          if (!uid) return
          const job = createJob(uid, name, address, trade)
          setCreating(false)
          navigate(`/job/${job.id}`)
        }}
      />
      <AccountSheet open={accountOpen} onClose={() => setAccountOpen(false)} />
    </div>
  )
}

/** One-time nudge to put the app on the home screen. Hidden once installed or dismissed. */
function InstallHint() {
  const { t } = useApp()
  const { mode, install, dismiss } = useInstallHint()
  if (!mode) return null
  return (
    <aside className="mb-4 rounded-2xl border-2 border-dashed border-ink bg-brand/25 p-4">
      <div className="flex items-start gap-3">
        <img src="/favicon.svg" alt="" className="size-12 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-lg leading-snug font-black">{t.installTitle}</p>
          <p className="mt-1 text-base leading-snug text-muted">
            {mode === 'ios' && <ShareIcon className="mr-1 inline size-5 align-[-0.2em] text-ink" />}
            {mode === 'ios' ? t.installIOS : t.installAndroid}
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        {mode === 'prompt' && (
          <Button variant="dark" className="min-h-12 flex-1" onClick={() => void install()}>
            <DownloadIcon />
            {t.install}
          </Button>
        )}
        <Button variant="outline" className="min-h-12 flex-1" onClick={dismiss}>
          {mode === 'ios' ? t.gotIt : t.notNow}
        </Button>
      </div>
    </aside>
  )
}

function JobCard({ job }: { job: Job }) {
  const { t, lang } = useApp()
  const total = job.item_count
  const picked = Math.min(job.picked_count, total)
  const done = total > 0 && picked === total
  const kind = isJobKind(job.trade) ? job.trade : null
  return (
    <Link
      to={`/job/${job.id}`}
      className="flex items-center gap-2 rounded-2xl border-2 border-ink bg-white py-4 pr-2 pl-4 active:bg-gray-100"
    >
      <div className="min-w-0 flex-1">
        <div className="text-xl leading-snug font-black break-words">{job.name}</div>
        {(kind || job.address) && (
          <div className="mt-1 flex min-w-0 items-center gap-3 text-base text-muted">
            {kind && (
              <span className="flex shrink-0 items-center gap-1 font-semibold text-ink">
                <JobKindIcon kind={kind} className="size-4" />
                {jobKindName(kind, lang)}
              </span>
            )}
            {job.address && (
              <span className="flex min-w-0 items-center gap-1">
                <PinIcon className="size-4 shrink-0" />
                <span className="truncate">{job.address}</span>
              </span>
            )}
          </div>
        )}
        <div className="mt-3 flex items-center justify-between gap-3 text-base font-semibold">
          {total === 0 ? (
            <span className="rounded-lg bg-gray-100 px-2 py-0.5 text-muted">{t.noItemsYet}</span>
          ) : (
            <span className="rounded-lg bg-brand px-2 py-0.5 text-ink">{t.items(total)}</span>
          )}
          <span className="truncate text-muted">{timeAgo(job.updated_at, lang)}</span>
        </div>
        {picked > 0 && (
          <div className="mt-3 flex items-center gap-3 text-base font-semibold">
            <Progress value={picked} max={total} label={t.gotOf(picked, total)} className="min-w-12 flex-1" />
            <span className={`flex shrink-0 items-center gap-1 ${done ? 'text-ok' : 'text-ink'}`}>
              <CheckIcon className="size-4" />
              {done ? t.gotAll : t.gotShort(picked, total)}
            </span>
          </div>
        )}
      </div>
      <ChevronRightIcon className="size-6 shrink-0 text-muted" />
    </Link>
  )
}

type OnCreate = (name: string, address: string | null, trade: JobKindId | null) => void

function NewJobSheet({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: OnCreate }) {
  const { t } = useApp()
  return (
    <Sheet open={open} title={t.newJob} onClose={onClose}>
      <NewJobForm onCreate={onCreate} />
    </Sheet>
  )
}

/**
 * Mounted fresh each time the sheet opens, so it always starts empty.
 * Kind-of-job tiles come first, before any text field, so the keyboard doesn't cover them.
 */
function NewJobForm({ onCreate }: { onCreate: OnCreate }) {
  const { t, lang } = useApp()
  // undefined: still choosing. null: skipped.
  const [kind, setKind] = useState<JobKindId | null | undefined>(undefined)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')

  if (kind === undefined) return <JobKindTiles onPick={setKind} onSkip={() => setKind(null)} />

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    onCreate(name.trim(), address.trim() || null, kind ?? null)
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {/* what they picked; tap to go back to the tiles */}
      <button
        type="button"
        onClick={() => setKind(undefined)}
        className={`flex min-h-12 w-full items-center gap-2 rounded-xl border-2 border-ink px-3 text-left text-lg font-bold active:bg-gray-100 ${
          kind ? 'bg-brand/25' : 'border-dashed bg-white'
        }`}
      >
        {kind && <JobKindIcon kind={kind} className="size-6 shrink-0" />}
        <span className="min-w-0 flex-1 truncate">{kind ? jobKindName(kind, lang) : t.pickKind}</span>
        {kind && <span className="shrink-0 text-base font-semibold text-muted underline">{t.change}</span>}
      </button>
      <TextField
        label={t.jobName}
        placeholder={t.jobNamePlaceholder}
        autoCapitalize="words"
        enterKeyHint="next"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <TextField
        label={t.address}
        placeholder={t.addressPlaceholder}
        autoComplete="street-address"
        enterKeyHint="done"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
      />
      <Button type="submit" className="w-full" disabled={!name.trim()}>
        {t.createJob}
      </Button>
    </form>
  )
}

function AccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useApp()
  return (
    <Sheet open={open} title={t.account} onClose={onClose}>
      <AccountForm onDone={onClose} />
    </Sheet>
  )
}

function AccountForm({ onDone }: { onDone: () => void }) {
  const { t, profile, saveProfile, signOut } = useApp()
  const [name, setName] = useState(profile?.name ?? '')
  const [business, setBusiness] = useState(profile?.business_name ?? '')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    await saveProfile({ name: name.trim(), business_name: business.trim() || null })
    onDone()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <TextField label={t.yourName} value={name} onChange={(e) => setName(e.target.value)} autoCapitalize="words" />
      <TextField
        label={t.businessName}
        value={business}
        onChange={(e) => setBusiness(e.target.value)}
        autoCapitalize="words"
      />
      <div>
        <div className="mb-1 text-base font-bold">{t.phone}</div>
        <div className="text-xl">{prettyPhone(profile?.phone) || '—'}</div>
      </div>
      <Button type="submit" className="w-full" disabled={!name.trim()}>
        {t.save}
      </Button>
      <Button variant="outline" className="w-full" onClick={() => void signOut()}>
        {t.logOut}
      </Button>
    </form>
  )
}
