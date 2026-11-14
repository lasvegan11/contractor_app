import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type PointerEvent,
} from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../AppContext'
import {
  BackIcon,
  Button,
  CheckIcon,
  CloudOffIcon,
  CopyIcon,
  MessageIcon,
  MicIcon,
  MinusIcon,
  MoreIcon,
  PlusIcon,
  Progress,
  SendIcon,
  ShareIcon,
  Sheet,
  StopIcon,
  TextField,
  TrashIcon,
  XIcon,
  useToast,
} from '../components/ui'
import {
  cachedMaterials,
  commitMaterials,
  deleteJob,
  loadDraft,
  loadJob,
  loadMaterials,
  newId,
  nextSortOrder,
  saveDraft,
  updateJob,
} from '../lib/data'
import { buildMessage, formatQty, officialName, parseQtyInput } from '../lib/format'
import { parseMaterials } from '../lib/parse'
import { useOfflinePending } from '../lib/useOfflinePending'
import { useSpeech } from '../lib/useSpeech'
import { useKeyboardArea } from '../lib/viewport'
import type { Job, Material, Profile } from '../lib/types'

/** Screen 3: one job's material list — talk/type, edit, check off, send. */
export function Materials() {
  const { id: jobId = '' } = useParams()
  const { uid } = useApp()
  if (!uid) return null
  // key: fresh state per job
  return <MaterialsScreen key={jobId} uid={uid} jobId={jobId} />
}

function MaterialsScreen({ uid, jobId }: { uid: string; jobId: string }) {
  const { t, lang, profile } = useApp()
  const navigate = useNavigate()
  const toast = useToast('bottom-[calc(12rem+env(safe-area-inset-bottom))]')

  const [job, setJob] = useState<Job | null | undefined>(undefined)
  const [items, setItems] = useState<Material[]>(() => cachedMaterials(uid, jobId))
  const itemsRef = useRef(items)
  const [text, setTextState] = useState(() => loadDraft(uid, jobId))
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Material | 'new' | null>(null)
  const [sendOpen, setSendOpen] = useState(false)
  const [jobOpen, setJobOpen] = useState(false)
  // Rows that were just added flash yellow once, so it's obvious what changed.
  const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(() => new Set())
  const offline = useOfflinePending(uid)
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const keyboard = useKeyboardArea()

  const setText = useCallback(
    (value: string) => {
      setTextState(value)
      saveDraft(uid, jobId, value) // nothing lost if the app closes mid-sentence
    },
    [uid, jobId],
  )

  // --- load ---------------------------------------------------------------
  useEffect(() => {
    let alive = true
    void loadJob(uid, jobId).then((j) => alive && setJob(j))
    const refresh = () =>
      loadMaterials(uid, jobId).then((m) => {
        if (!alive) return
        itemsRef.current = m
        setItems(m)
      })
    void refresh()
    window.addEventListener('online', refresh)
    return () => {
      alive = false
      window.removeEventListener('online', refresh)
    }
  }, [uid, jobId])

  /** Every change goes through here: local copy first, then queued for the server. */
  const commit = useCallback(
    (build: (cur: Material[]) => Material[], change: { upserts?: Material[]; deletes?: Material[] }) => {
      const next = commitMaterials(uid, jobId, build(itemsRef.current), change)
      itemsRef.current = next
      setItems(next)
    },
    [uid, jobId],
  )

  // --- voice ---------------------------------------------------------------
  const baseText = useRef('')
  const capturing = useRef(false)
  const speech = useSpeech(lang, (spoken) => {
    if (!capturing.current) return
    const base = baseText.current.trim()
    setText(base && spoken ? `${base}, ${spoken}` : base || spoken)
  })

  function toggleMic() {
    if (speech.listening) {
      speech.stop()
      return
    }
    baseText.current = text
    capturing.current = true
    speech.start()
  }

  // --- add -------------------------------------------------------------------
  async function addToList() {
    const input = text.trim()
    if (!input || adding) return
    capturing.current = false
    if (speech.listening) speech.stop()
    setAdding(true)
    const parsed = await parseMaterials(input, lang)
    setAdding(false)

    const now = new Date().toISOString()
    const start = nextSortOrder(itemsRef.current)
    const rows: Material[] = parsed.map((p, i) => ({
      id: newId(),
      job_id: jobId,
      user_id: uid,
      qty: p.qty,
      unit: p.unit,
      item: p.item,
      official_name: p.official_name,
      picked_up: false,
      sort_order: start + i,
      created_at: now,
    }))
    if (!rows.length) {
      toast.show(t.nothingFound) // keep what they said so they can fix it
      return
    }
    commit((cur) => [...cur, ...rows], { upserts: rows })
    setFreshIds(new Set(rows.map((r) => r.id)))
    setText('')
    if (!navigator.onLine) toast.show(t.offlineParsed, undefined, 6000)
    // New items land at the end of "still needed", right above the "Add item" button.
    requestAnimationFrame(() => addButtonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
  }

  // --- item actions ----------------------------------------------------------
  function togglePicked(m: Material) {
    const updated = { ...m, picked_up: !m.picked_up }
    commit((cur) => cur.map((x) => (x.id === m.id ? updated : x)), { upserts: [updated] })
    navigator.vibrate?.(10) // small tick on Android; iPhones ignore it
  }

  /** After a supply run: drop everything marked "Got it". */
  function clearPicked() {
    const gone = itemsRef.current.filter((m) => m.picked_up)
    if (!gone.length) return
    commit((cur) => cur.filter((m) => !m.picked_up), { deletes: gone })
    toast.show(
      t.removedCount(gone.length),
      { label: t.undo, run: () => commit((cur) => [...cur, ...gone], { upserts: gone }) },
      6000,
    )
  }

  function remove(m: Material) {
    commit((cur) => cur.filter((x) => x.id !== m.id), { deletes: [m] })
    toast.show(t.deleted, { label: t.undo, run: () => commit((cur) => [...cur, m], { upserts: [m] }) }, 5000)
  }

  function saveItem(fields: Pick<Material, 'qty' | 'unit' | 'item'>) {
    if (editing === 'new') {
      const row: Material = {
        id: newId(),
        job_id: jobId,
        user_id: uid,
        ...fields,
        official_name: null,
        picked_up: false,
        sort_order: nextSortOrder(itemsRef.current),
        created_at: new Date().toISOString(),
      }
      commit((cur) => [...cur, row], { upserts: [row] })
      setFreshIds(new Set([row.id]))
    } else if (editing) {
      // A renamed item is a different product, so its old standard name no longer applies.
      const official_name = fields.item === editing.item ? editing.official_name : null
      const updated = { ...editing, ...fields, official_name }
      commit((cur) => cur.map((x) => (x.id === updated.id ? updated : x)), { upserts: [updated] })
    }
    setEditing(null)
  }

  // --- render ----------------------------------------------------------------
  if (job === null) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-6 px-4 text-center">
        <p className="text-2xl font-black">{t.jobNotFound}</p>
        <Link to="/" className="rounded-2xl border-2 border-ink bg-brand px-6 py-4 text-lg font-bold">
          {t.back}
        </Link>
      </div>
    )
  }

  const hasText = text.trim().length > 0
  const needed = items.filter((m) => !m.picked_up)
  const done = items.filter((m) => m.picked_up)
  const row = (m: Material) => (
    <ItemRow
      key={m.id}
      m={m}
      fresh={freshIds.has(m.id) && !m.picked_up}
      onToggle={() => togglePicked(m)}
      onEdit={() => setEditing(m)}
      onDelete={() => remove(m)}
    />
  )

  return (
    // While typing on an iPhone, fit the screen to the part above the keyboard so the
    // Add to list button and the mic stay in view instead of hiding under it.
    <div
      className="mx-auto flex h-dvh max-w-xl flex-col"
      style={keyboard ? { position: 'fixed', top: keyboard.top, height: keyboard.height, left: 0, right: 0 } : undefined}
    >
      {/* header */}
      <header className="flex shrink-0 items-center gap-1 border-b-2 border-ink bg-white px-1 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
        <Link
          to="/"
          aria-label={t.back}
          className="flex size-12 shrink-0 items-center justify-center rounded-xl active:bg-gray-100"
        >
          <BackIcon className="size-7" />
        </Link>
        <button
          type="button"
          onClick={() => job && setJobOpen(true)}
          className="min-h-12 min-w-0 flex-1 rounded-xl px-1 text-left active:bg-gray-100"
        >
          <h1 className="truncate text-xl leading-tight font-black">{job?.name ?? ''}</h1>
          {job?.address && <p className="truncate text-sm text-muted">{job.address}</p>}
        </button>
        <button
          type="button"
          onClick={() => job && setJobOpen(true)}
          aria-label={t.editJob}
          className="flex size-12 shrink-0 items-center justify-center rounded-xl active:bg-gray-100"
        >
          <MoreIcon className="size-7" />
        </button>
      </header>

      {items.length > 0 && (
        <div className="shrink-0 border-b-2 border-gray-200 bg-gray-50 px-4 pt-2 pb-3">
          <div className="flex items-baseline justify-between gap-3 text-base font-bold">
            <span className={needed.length === 0 ? 'text-ok' : ''}>
              {needed.length === 0 ? t.gotAll : t.stillNeeded(needed.length)}
            </span>
            <span className="text-muted">{t.gotOf(done.length, items.length)}</span>
          </div>
          <Progress value={done.length} max={items.length} label={t.gotOf(done.length, items.length)} className="mt-2" />
        </div>
      )}

      {offline && (
        <div className="flex shrink-0 items-center gap-2 bg-ink px-4 py-2 text-base font-semibold text-white">
          <CloudOffIcon className="size-5" />
          {t.unsynced}
        </div>
      )}

      {/* list */}
      <main className="flex-1 overflow-y-auto px-3 pt-3 pb-4">
        {items.length === 0 && (
          <div className="px-2 py-10 text-center">
            <p className="text-2xl font-black">{t.emptyTitle}</p>
            <p className="mt-2 text-lg text-muted">{t.emptyHint}</p>
            <p className="mt-2 text-lg font-semibold italic">{t.emptyExample}</p>
          </div>
        )}
        <ul className="space-y-2">{needed.map(row)}</ul>
        <button
          ref={addButtonRef}
          type="button"
          onClick={() => setEditing('new')}
          className={`flex min-h-16 w-full scroll-mb-4 items-center gap-3 rounded-2xl border-2 border-dashed border-ink px-4 text-lg font-bold active:bg-gray-100 ${needed.length ? 'mt-2' : ''}`}
        >
          <PlusIcon className="size-7" />
          {t.addItem}
        </button>
        {done.length > 0 && (
          <section className="mt-6" aria-label={t.gotItem}>
            <div className="mb-1 flex items-center justify-between gap-2 pl-1">
              <h2 className="flex items-center gap-2 text-base font-black tracking-wide text-muted uppercase">
                <CheckIcon className="size-5" />
                {t.gotItem} · {done.length}
              </h2>
              <button
                type="button"
                onClick={clearPicked}
                className="flex min-h-12 items-center gap-1.5 rounded-xl px-3 text-base font-bold text-danger active:bg-red-50"
              >
                <TrashIcon className="size-5" />
                {t.clearGot}
              </button>
            </div>
            <ul className="space-y-2">{done.map(row)}</ul>
          </section>
        )}
      </main>

      {/* composer: everything one thumb needs, at the bottom */}
      <div
        className={`shrink-0 border-t-2 border-ink bg-gray-50 px-3 pt-3 ${
          keyboard ? 'pb-3' : 'pb-[max(0.75rem,env(safe-area-inset-bottom))]'
        }`}
      >
        {speech.listening && (
          <p
            role="status"
            className="mb-2 flex animate-fade-in items-center gap-2 rounded-xl bg-danger px-3 py-2 text-base font-bold text-white"
          >
            <span className="size-3 shrink-0 animate-pulse rounded-full bg-white" aria-hidden="true" />
            {t.listening}
          </p>
        )}
        {!speech.supported && <p className="mb-2 text-base font-semibold text-muted">🎤 {t.micHint}</p>}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t.composerPlaceholder}
          aria-label={t.composerPlaceholder}
          rows={2}
          enterKeyHint="done"
          className={`block max-h-40 w-full resize-none rounded-xl border-2 bg-white px-3 py-2 text-xl leading-snug placeholder:text-gray-500 focus:outline-4 focus:outline-offset-0 focus:outline-brand ${
            speech.listening ? 'border-danger' : 'border-ink'
          }`}
          style={{ fieldSizing: 'content' } as CSSProperties}
        />
        <div className="mt-3 flex gap-3">
          {speech.supported && (
            <button
              type="button"
              onClick={toggleMic}
              aria-pressed={speech.listening}
              aria-label={speech.listening ? t.stop : t.talk}
              className={`relative flex size-16 shrink-0 items-center justify-center rounded-full border-2 border-ink active:scale-95 ${
                speech.listening ? 'bg-danger text-white' : 'bg-brand text-ink'
              }`}
            >
              {speech.listening && (
                <span className="absolute inset-0 animate-ping rounded-full bg-danger/40" aria-hidden="true" />
              )}
              {speech.listening ? <StopIcon className="relative size-7" /> : <MicIcon className="size-8" />}
            </button>
          )}
          {hasText || items.length === 0 ? (
            <Button className="min-h-16 flex-1 text-xl" disabled={!hasText || adding} onClick={() => void addToList()}>
              {adding ? t.adding : t.addToList}
            </Button>
          ) : (
            <Button variant="dark" className="min-h-16 flex-1 text-xl" onClick={() => setSendOpen(true)}>
              <SendIcon />
              {t.sendList}
            </Button>
          )}
        </div>
      </div>

      <ItemSheet editing={editing} onClose={() => setEditing(null)} onSave={saveItem} onDelete={remove} />
      {job && profile && (
        <SendSheet
          open={sendOpen}
          onClose={() => setSendOpen(false)}
          job={job}
          profile={profile}
          items={items}
          onCopied={() => toast.show(t.copied)}
        />
      )}
      {job && (
        <JobSheet
          open={jobOpen}
          job={job}
          itemCount={items.length}
          onClose={() => setJobOpen(false)}
          onSave={(name, address) => {
            const updated = updateJob(uid, job.id, { name, address })
            if (updated) setJob(updated)
            setJobOpen(false)
          }}
          onDelete={() => {
            deleteJob(uid, job.id)
            navigate('/', { replace: true })
          }}
        />
      )}
      {toast.node}
    </div>
  )
}

// ---------------------------------------------------------------------------
// One row: checkbox · "qty · unit · item" (tap to edit) · ✕. Swipe left to delete.
// ---------------------------------------------------------------------------

const SWIPE_DELETE_PX = 110

function ItemRow({
  m,
  fresh,
  onToggle,
  onEdit,
  onDelete,
}: {
  m: Material
  fresh: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const { t } = useApp()
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const start = useRef<{ x: number; y: number } | null>(null)
  const swiped = useRef(false)

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    start.current = { x: e.clientX, y: e.clientY }
    swiped.current = false
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!start.current) return
    const ddx = e.clientX - start.current.x
    const ddy = e.clientY - start.current.y
    if (!dragging) {
      if (Math.abs(ddx) > 12 && Math.abs(ddx) > Math.abs(ddy) * 1.5) {
        setDragging(true)
        swiped.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
      } else if (Math.abs(ddy) > 12) {
        start.current = null // it's a scroll
      }
      return
    }
    setDx(Math.min(0, ddx))
  }
  function onPointerEnd() {
    start.current = null
    if (!dragging) return
    setDragging(false)
    if (dx < -SWIPE_DELETE_PX) {
      setDx(-window.innerWidth)
      window.setTimeout(onDelete, 150)
    } else {
      setDx(0)
    }
  }

  const qty = formatQty(m.qty)
  const official = officialName(m)
  const done = m.picked_up
  const doneText = done ? 'text-gray-600 line-through decoration-2' : ''
  return (
    <li className={`relative overflow-hidden rounded-2xl border-2 bg-danger ${done ? 'border-gray-300' : 'border-ink'}`}>
      <div className="absolute inset-y-0 right-0 flex items-center pr-5 text-white" aria-hidden="true">
        <TrashIcon className="size-7" />
      </div>
      <div
        className={`relative flex items-stretch ${done ? 'bg-gray-100' : 'bg-white'} ${fresh ? 'animate-flash' : ''}`}
        style={{ transform: `translateX(${dx}px)`, transition: dragging ? 'none' : 'transform 150ms ease-out', touchAction: 'pan-y' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClickCapture={(e) => {
          if (swiped.current) {
            e.preventDefault()
            e.stopPropagation()
            swiped.current = false
          }
        }}
      >
        <button
          type="button"
          role="checkbox"
          aria-checked={m.picked_up}
          aria-label={`${t.gotItem}: ${m.item}`}
          onClick={onToggle}
          className="flex w-14 shrink-0 items-center justify-center"
        >
          <span
            className={`flex size-9 items-center justify-center rounded-lg border-[3px] border-ink ${m.picked_up ? 'bg-ink text-brand' : 'bg-white'}`}
          >
            {m.picked_up && <CheckIcon className="size-6" />}
          </span>
        </button>
        {/* qty gets its own column so numbers line up when scanning the list at the counter */}
        <button
          type="button"
          onClick={onEdit}
          className="flex min-h-16 min-w-0 flex-1 items-center py-3 pr-1 text-left text-xl leading-snug"
        >
          <span className="flex min-w-0 items-baseline gap-2">
            <span className={`min-w-8 shrink-0 font-black whitespace-nowrap tabular-nums ${doneText}`}>{qty}</span>
            <span className="min-w-0">
              <span className={`block break-words ${doneText}`}>
                {m.unit && (
                  <>
                    <span className="font-bold">{m.unit}</span>
                    <span className="text-muted"> · </span>
                  </>
                )}
                {m.item}
              </span>
              {/* what the counter calls it, when the list says "mud" or "Romex" */}
              {official && <span className="block text-base break-words text-muted">{official}</span>}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`${t.delete}: ${m.item}`}
          className="flex w-12 shrink-0 items-center justify-center text-gray-500 active:text-danger"
        >
          <XIcon className="size-6" />
        </button>
      </div>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Edit / add one item by hand
// ---------------------------------------------------------------------------

function ItemSheet({
  editing,
  onClose,
  onSave,
  onDelete,
}: {
  editing: Material | 'new' | null
  onClose: () => void
  onSave: (fields: Pick<Material, 'qty' | 'unit' | 'item'>) => void
  onDelete: (m: Material) => void
}) {
  const { t } = useApp()
  return (
    <Sheet open={editing !== null} title={editing === 'new' ? t.newItem : t.editItem} onClose={onClose}>
      {editing && (
        <ItemForm
          key={editing === 'new' ? 'new' : editing.id}
          editing={editing}
          onSave={onSave}
          onDelete={(m) => {
            onDelete(m)
            onClose()
          }}
        />
      )}
    </Sheet>
  )
}

function ItemForm({
  editing,
  onSave,
  onDelete,
}: {
  editing: Material | 'new'
  onSave: (fields: Pick<Material, 'qty' | 'unit' | 'item'>) => void
  onDelete: (m: Material) => void
}) {
  const { t } = useApp()
  const existing = editing === 'new' ? null : editing
  const [qty, setQty] = useState(existing ? formatQty(existing.qty) : '')
  const [unit, setUnit] = useState(existing?.unit ?? '')
  const [item, setItem] = useState(existing?.item ?? '')
  const qtyId = useId()

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!item.trim()) return
    onSave({ qty: parseQtyInput(qty), unit: unit.trim() || null, item: item.trim() })
  }

  /** − / + so nobody has to type a number with gloves on. Going below 1 clears it. */
  function step(by: number) {
    const next = Math.max(0, (parseQtyInput(qty) ?? 0) + by)
    setQty(next === 0 ? '' : formatQty(next))
  }

  const one = parseQtyInput(qty) === 1
  const unitNow = unit.trim().toLowerCase()
  const stepButton =
    'flex size-12 items-center justify-center rounded-xl border-2 border-ink bg-white active:bg-gray-100'

  // Item first: it's the one field you must fill, and it's where the cursor starts, so it has to
  // sit above the keyboard. Qty and unit share a row so the whole form fits above it too.
  return (
    <form onSubmit={submit} className="space-y-3">
      <TextField
        label={t.item}
        placeholder={t.itemPlaceholder}
        value={item}
        onChange={(e) => setItem(e.target.value)}
        enterKeyHint="done"
        autoFocus={!existing}
      />

      <div>
        <div className="flex items-end gap-3">
          <div className="shrink-0">
            <label htmlFor={qtyId} className="mb-1 block text-base font-bold">
              {t.qty}
            </label>
            <div className="flex gap-1">
              <button type="button" aria-label={t.less} onClick={() => step(-1)} className={stepButton}>
                <MinusIcon className="size-6" />
              </button>
              <input
                id={qtyId}
                inputMode="decimal"
                placeholder="12"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="block min-h-12 w-16 rounded-xl border-2 border-ink bg-white px-1 text-center text-xl font-black text-ink placeholder:font-normal placeholder:text-gray-400 focus:outline-4 focus:outline-offset-0 focus:outline-brand"
              />
              <button type="button" aria-label={t.more} onClick={() => step(1)} className={stepButton}>
                <PlusIcon className="size-6" />
              </button>
            </div>
          </div>
          <TextField
            label={t.unit}
            placeholder={t.unitPlaceholder}
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="min-w-0 flex-1"
          />
        </div>
        {/* common units: one tap instead of typing. Scrolls sideways. */}
        <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {t.units.map(([single, many]) => {
            const on = unitNow === single || unitNow === many
            return (
              <button
                key={many}
                type="button"
                aria-pressed={on}
                onClick={() => setUnit(on ? '' : one ? single : many)}
                className={`min-h-12 shrink-0 rounded-full border-2 border-ink px-3.5 text-base font-bold ${
                  on ? 'bg-ink text-white' : 'bg-white text-ink active:bg-gray-100'
                }`}
              >
                {many}
              </button>
            )
          })}
        </div>
      </div>

      {/* stays in view at the bottom of the sheet if a small phone has to scroll the form */}
      <div className="sticky bottom-0 -mx-4 bg-white px-4 pt-1">
        <Button type="submit" className="w-full" disabled={!item.trim()}>
          {t.save}
        </Button>
      </div>
      {existing && (
        <Button variant="danger" className="w-full" onClick={() => onDelete(existing)}>
          <TrashIcon />
          {t.delete}
        </Button>
      )}
    </form>
  )
}

// ---------------------------------------------------------------------------
// Send: Text message / Share / Copy
// ---------------------------------------------------------------------------

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Older browsers / non-secure contexts
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

function SendSheet({
  open,
  onClose,
  ...props
}: {
  open: boolean
  onClose: () => void
  job: Job
  profile: Profile
  items: Material[]
  onCopied: () => void
}) {
  const { t } = useApp()
  return (
    <Sheet open={open} title={t.sendList} onClose={onClose}>
      <SendBody {...props} onClose={onClose} />
    </Sheet>
  )
}

/** Mounted fresh each time the sheet opens. */
function SendBody({
  job,
  profile,
  items,
  onClose,
  onCopied,
}: {
  job: Job
  profile: Profile
  items: Material[]
  onClose: () => void
  onCopied: () => void
}) {
  const { t } = useApp()
  const needed = items.filter((m) => !m.picked_up)
  // Only ask when some things are marked "Got it" and some aren't.
  const mixed = needed.length > 0 && needed.length < items.length
  const [which, setWhich] = useState<'needed' | 'all'>('needed')
  const message = buildMessage(job, profile, mixed && which === 'needed' ? needed : items, t)
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  return (
    <>
      {mixed && (
        <fieldset className="mb-4">
          <legend className="mb-1 text-base font-bold">{t.sendWhich}</legend>
          <div className="grid grid-cols-2 gap-2">
            {(['needed', 'all'] as const).map((w) => (
              <button
                key={w}
                type="button"
                aria-pressed={which === w}
                onClick={() => setWhich(w)}
                className={`min-h-14 rounded-xl border-2 border-ink px-2 text-base leading-tight font-bold ${
                  which === w ? 'bg-ink text-white' : 'bg-white text-ink active:bg-gray-100'
                }`}
              >
                {w === 'needed' ? t.sendNeeded(needed.length) : t.sendAll(items.length)}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <p className="mb-1 text-base font-bold">{t.preview}</p>
      {/* Looks like the text bubble they'll get */}
      <div className="mb-4 max-h-[34dvh] overflow-y-auto rounded-3xl rounded-bl-md bg-gray-200 px-4 py-3 text-base leading-snug break-words whitespace-pre-wrap">
        {message}
      </div>

      <div className="space-y-3">
        <a
          href={`sms:?&body=${encodeURIComponent(message)}`}
          onClick={() => window.setTimeout(onClose, 300)}
          className="flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl border-2 border-ink bg-ink text-xl font-bold text-white active:bg-black"
        >
          <MessageIcon className="size-7" />
          {t.textMessage}
        </a>
        <div className={`grid gap-3 ${canShare ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {canShare && (
            <Button
              variant="outline"
              className="min-h-16 w-full text-xl"
              onClick={() => {
                navigator.share({ title: job.name, text: message }).then(onClose, () => {
                  /* user closed the share sheet */
                })
              }}
            >
              <ShareIcon className="size-7" />
              {t.share}
            </Button>
          )}
          <Button
            variant="outline"
            className="min-h-16 w-full text-xl"
            onClick={async () => {
              if (await copyText(message)) {
                onClose()
                onCopied()
              }
            }}
          >
            <CopyIcon className="size-7" />
            {t.copy}
          </Button>
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Edit / delete the job
// ---------------------------------------------------------------------------

function JobSheet({
  open,
  onClose,
  ...props
}: {
  open: boolean
  onClose: () => void
  job: Job
  itemCount: number
  onSave: (name: string, address: string | null) => void
  onDelete: () => void
}) {
  const { t } = useApp()
  return (
    <Sheet open={open} title={t.editJob} onClose={onClose}>
      <JobForm {...props} />
    </Sheet>
  )
}

function JobForm({
  job,
  itemCount,
  onSave,
  onDelete,
}: {
  job: Job
  itemCount: number
  onSave: (name: string, address: string | null) => void
  onDelete: () => void
}) {
  const { t } = useApp()
  const [name, setName] = useState(job.name)
  const [address, setAddress] = useState(job.address ?? '')
  const [confirming, setConfirming] = useState(false)

  if (confirming) {
    return (
      <div className="space-y-4">
        <p className="text-xl leading-snug font-semibold">{t.deleteJobConfirm(job.name, itemCount)}</p>
        <Button variant="dangerSolid" className="w-full" onClick={onDelete}>
          <TrashIcon />
          {t.deleteJob}
        </Button>
        <Button variant="outline" className="w-full" onClick={() => setConfirming(false)}>
          {t.cancel}
        </Button>
      </div>
    )
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    onSave(name.trim(), address.trim() || null)
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <TextField
        label={t.jobName}
        autoCapitalize="words"
        enterKeyHint="next"
        value={name}
        onChange={(e) => setName(e.target.value)}
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
        {t.save}
      </Button>
      <Button variant="danger" className="w-full" onClick={() => setConfirming(true)}>
        <TrashIcon />
        {t.deleteJob}
      </Button>
    </form>
  )
}
