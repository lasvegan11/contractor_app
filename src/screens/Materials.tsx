import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useApp } from '../AppContext'
import {
  BackIcon,
  Button,
  CheckIcon,
  CloudOffIcon,
  CopyIcon,
  MessageIcon,
  MicIcon,
  PlusIcon,
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
  loadDraft,
  loadJob,
  loadMaterials,
  newId,
  nextSortOrder,
  onSyncChange,
  pendingCount,
  saveDraft,
} from '../lib/data'
import { buildMessage, formatQty, parseQtyInput } from '../lib/format'
import { parseMaterials } from '../lib/parse'
import { useSpeech } from '../lib/useSpeech'
import type { Job, Material } from '../lib/types'

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
  const toast = useToast('bottom-[calc(12rem+env(safe-area-inset-bottom))]')

  const [job, setJob] = useState<Job | null | undefined>(undefined)
  const [items, setItems] = useState<Material[]>(() => cachedMaterials(uid, jobId))
  const itemsRef = useRef(items)
  const [text, setTextState] = useState(() => loadDraft(uid, jobId))
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Material | 'new' | null>(null)
  const [sendOpen, setSendOpen] = useState(false)
  const offline = useOfflinePending(uid)
  const listEndRef = useRef<HTMLDivElement>(null)

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
      picked_up: false,
      sort_order: start + i,
      created_at: now,
    }))
    if (rows.length) commit((cur) => [...cur, ...rows], { upserts: rows })
    setText('')
    if (!navigator.onLine) toast.show(t.offlineParsed, undefined, 6000)
    requestAnimationFrame(() => listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }))
  }

  // --- item actions ----------------------------------------------------------
  function togglePicked(m: Material) {
    const updated = { ...m, picked_up: !m.picked_up }
    commit((cur) => cur.map((x) => (x.id === m.id ? updated : x)), { upserts: [updated] })
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
        picked_up: false,
        sort_order: nextSortOrder(itemsRef.current),
        created_at: new Date().toISOString(),
      }
      commit((cur) => [...cur, row], { upserts: [row] })
    } else if (editing) {
      const updated = { ...editing, ...fields }
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
  const message = job && profile ? buildMessage(job, profile, items, t) : ''

  return (
    <div className="mx-auto flex h-dvh max-w-xl flex-col">
      {/* header */}
      <header className="flex shrink-0 items-center gap-2 border-b-2 border-ink bg-white px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
        <Link
          to="/"
          className="flex min-h-12 shrink-0 items-center gap-1 rounded-xl pr-3 pl-1 text-lg font-bold active:bg-gray-100"
        >
          <BackIcon className="size-7" />
          {t.back}
        </Link>
        <div className="min-w-0 flex-1 text-right">
          <h1 className="truncate text-xl font-black">{job?.name ?? ''}</h1>
          {job?.address && <p className="truncate text-sm text-muted">{job.address}</p>}
        </div>
      </header>

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
        <ul className="space-y-2">
          {items.map((m) => (
            <ItemRow
              key={m.id}
              m={m}
              onToggle={() => togglePicked(m)}
              onEdit={() => setEditing(m)}
              onDelete={() => remove(m)}
            />
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="mt-2 flex min-h-16 w-full items-center gap-3 rounded-2xl border-2 border-dashed border-ink px-4 text-lg font-bold active:bg-gray-100"
        >
          <PlusIcon className="size-7" />
          {t.addItem}
        </button>
        <div ref={listEndRef} />
      </main>

      {/* composer: everything one thumb needs, at the bottom */}
      <div className="shrink-0 border-t-2 border-ink bg-white px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {speech.listening && (
          <p className="mb-2 flex items-center gap-2 text-base font-bold text-danger">
            <span className="size-3 animate-pulse rounded-full bg-danger" aria-hidden="true" />
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
          className="block max-h-40 w-full resize-none rounded-xl border-2 border-ink px-3 py-2 text-xl leading-snug placeholder:text-gray-500 focus:outline-4 focus:outline-offset-0 focus:outline-brand"
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
      <SendSheet
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        message={message}
        title={job?.name ?? ''}
        onCopied={() => toast.show(t.copied)}
      />
      {toast.node}
    </div>
  )
}

/** Shows the "saved on phone" bar only when there are unsent changes and no signal. */
function useOfflinePending(uid: string): boolean {
  const check = useCallback(() => !navigator.onLine && pendingCount(uid) > 0, [uid])
  const [value, setValue] = useState(check)
  useEffect(() => {
    const update = () => setValue(check())
    const off = onSyncChange(update)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      off()
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [check])
  return value
}

// ---------------------------------------------------------------------------
// One row: checkbox · "qty · unit · item" (tap to edit) · ✕. Swipe left to delete.
// ---------------------------------------------------------------------------

const SWIPE_DELETE_PX = 110

function ItemRow({
  m,
  onToggle,
  onEdit,
  onDelete,
}: {
  m: Material
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
  return (
    <li className="relative overflow-hidden rounded-2xl border-2 border-ink bg-danger">
      <div className="absolute inset-y-0 right-0 flex items-center pr-5 text-white" aria-hidden="true">
        <TrashIcon className="size-7" />
      </div>
      <div
        className="relative flex items-stretch bg-white"
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
          aria-label={m.picked_up ? t.pickedUp : t.notPickedUp}
          onClick={onToggle}
          className="flex w-16 shrink-0 items-center justify-center"
        >
          <span
            className={`flex size-9 items-center justify-center rounded-lg border-[3px] border-ink ${m.picked_up ? 'bg-ink text-brand' : 'bg-white'}`}
          >
            {m.picked_up && <CheckIcon className="size-6" />}
          </span>
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="min-h-16 min-w-0 flex-1 py-3 pr-1 text-left text-xl leading-snug break-words"
        >
          <span className={m.picked_up ? 'text-muted line-through' : ''}>
            {qty && <span className="font-black">{qty}</span>}
            {qty && <span className="text-muted"> · </span>}
            {m.unit && (
              <>
                <span className="font-semibold">{m.unit}</span>
                <span className="text-muted"> · </span>
              </>
            )}
            <span>{m.item}</span>
          </span>
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`${t.delete}: ${m.item}`}
          className="flex w-14 shrink-0 items-center justify-center text-muted active:text-danger"
        >
          <XIcon className="size-7" />
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

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!item.trim()) return
    onSave({ qty: parseQtyInput(qty), unit: unit.trim() || null, item: item.trim() })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-[6rem_1fr] gap-3">
        <TextField
          label={t.qty}
          inputMode="decimal"
          placeholder="12"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          autoFocus={!existing}
        />
        <TextField label={t.unit} placeholder={t.unitPlaceholder} value={unit} onChange={(e) => setUnit(e.target.value)} />
      </div>
      <TextField label={t.item} placeholder={t.itemPlaceholder} value={item} onChange={(e) => setItem(e.target.value)} />
      <Button type="submit" className="w-full" disabled={!item.trim()}>
        {t.save}
      </Button>
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
  message,
  title,
  onCopied,
}: {
  open: boolean
  onClose: () => void
  message: string
  title: string
  onCopied: () => void
}) {
  const { t } = useApp()
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  return (
    <Sheet open={open} title={t.sendList} onClose={onClose}>
      <pre className="mb-4 max-h-[38dvh] overflow-y-auto rounded-xl border-2 border-gray-300 bg-gray-50 p-3 font-sans text-base whitespace-pre-wrap">
        {message}
      </pre>
      <div className="space-y-3">
        <a
          href={`sms:?&body=${encodeURIComponent(message)}`}
          onClick={() => window.setTimeout(onClose, 300)}
          className="flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl border-2 border-ink bg-ink text-xl font-bold text-white active:bg-black"
        >
          <MessageIcon className="size-7" />
          {t.textMessage}
        </a>
        {canShare && (
          <Button
            variant="outline"
            className="min-h-16 w-full text-xl"
            onClick={() => {
              navigator.share({ title, text: message }).then(onClose, () => {
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
    </Sheet>
  )
}
