import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../AppContext'
import { Button, LangToggle, PlusIcon, Sheet, TextField, UserIcon } from '../components/ui'
import { cachedJobs, createJob, loadJobs, onSyncChange } from '../lib/data'
import { timeAgo } from '../lib/i18n'
import { prettyPhone } from '../lib/phone'
import type { Job } from '../lib/types'

/** Screen 2: list of jobs, newest first, and a big "+ New Job" button. */
export function Jobs() {
  const { t, lang, uid } = useApp()
  const navigate = useNavigate()
  const [jobs, setJobs] = useState<Job[]>(() => (uid ? cachedJobs(uid) : []))
  const [creating, setCreating] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)

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
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b-2 border-ink bg-white px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <h1 className="flex-1 truncate text-3xl font-black">{t.jobs}</h1>
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

      <main className="flex-1 px-4 pt-4 pb-32">
        {jobs.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-2xl font-black">{t.noJobs}</p>
            <p className="mt-2 text-lg text-muted">{t.noJobsHint}</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {jobs.map((job) => (
              <li key={job.id}>
                <Link
                  to={`/job/${job.id}`}
                  className="block rounded-2xl border-2 border-ink bg-white p-4 active:bg-gray-100"
                >
                  <div className="text-xl font-black break-words">{job.name}</div>
                  {job.address && <div className="mt-0.5 text-base text-muted">{job.address}</div>}
                  <div className="mt-2 flex items-center gap-2 text-base font-semibold">
                    <span className="rounded-lg bg-brand px-2 py-0.5 text-ink">{t.items(job.item_count)}</span>
                    <span className="text-muted">· {timeAgo(job.updated_at, lang)}</span>
                  </div>
                </Link>
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
        onCreate={(name, address) => {
          if (!uid) return
          const job = createJob(uid, name, address)
          setCreating(false)
          navigate(`/job/${job.id}`)
        }}
      />
      <AccountSheet open={accountOpen} onClose={() => setAccountOpen(false)} />
    </div>
  )
}

function NewJobSheet({
  open,
  onClose,
  onCreate,
}: {
  open: boolean
  onClose: () => void
  onCreate: (name: string, address: string | null) => void
}) {
  const { t } = useApp()
  return (
    <Sheet open={open} title={t.newJob} onClose={onClose}>
      <NewJobForm onCreate={onCreate} />
    </Sheet>
  )
}

/** Mounted fresh each time the sheet opens, so it always starts empty. */
function NewJobForm({ onCreate }: { onCreate: (name: string, address: string | null) => void }) {
  const { t } = useApp()
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    onCreate(name.trim(), address.trim() || null)
  }

  return (
    <form onSubmit={submit} className="space-y-4">
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
