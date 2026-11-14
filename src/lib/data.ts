// Offline-first data layer.
//
// Every change is applied to a local copy (localStorage) first, then queued in an
// "outbox" and pushed to Supabase when there's signal. Reads show the local copy
// right away, then refresh from the server and lay any unsent changes on top.
// IDs are made on the phone, so items created offline keep the same ID when synced.

import { DEMO, sb } from './supabase'
import { readJSON, removeKey, writeJSON } from './storage'
import type { Job, Material } from './types'

// `op` is missing on upserts queued before deletes existed, so treat "no op" as upsert.
type JobOp = { v: string; op?: 'upsert'; row: Job } | { v: string; op: 'delete'; id: string }
type MatOp =
  | { v: string; op: 'upsert'; row: Material }
  | { v: string; op: 'delete'; id: string; job_id: string }

interface Outbox {
  jobs: Record<string, JobOp>
  mats: Record<string, MatOp>
}

const key = (uid: string, part: string) => `pn:${uid}:${part}`
const version = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
export const newId = () => crypto.randomUUID()

// ---------------------------------------------------------------------------
// change listeners (for the "saved on phone" indicator)
// ---------------------------------------------------------------------------

const listeners = new Set<() => void>()
export function onSyncChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
function emit() {
  listeners.forEach((fn) => fn())
}

// ---------------------------------------------------------------------------
// local copies
// ---------------------------------------------------------------------------

function getOutbox(uid: string): Outbox {
  return readJSON<Outbox>(key(uid, 'outbox'), { jobs: {}, mats: {} })
}
function saveOutbox(uid: string, ob: Outbox) {
  if (DEMO) return
  writeJSON(key(uid, 'outbox'), ob)
  emit()
}
export function pendingCount(uid: string): number {
  const ob = getOutbox(uid)
  return Object.keys(ob.jobs).length + Object.keys(ob.mats).length
}

const sortJobs = (jobs: Job[]) => [...jobs].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
const sortMats = (mats: Material[]) =>
  [...mats].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))

export function cachedJobs(uid: string): Job[] {
  return readJSON<Job[]>(key(uid, 'jobs'), []).map((j) => ({ ...j, picked_count: j.picked_count ?? 0 }))
}
function saveJobs(uid: string, jobs: Job[]) {
  writeJSON(key(uid, 'jobs'), sortJobs(jobs))
}
/** Rows saved before `official_name` existed don't have the field; every row needs it to sync in one batch. */
const withDefaults = (m: Material): Material => ({ ...m, official_name: m.official_name ?? null })

export function cachedMaterials(uid: string, jobId: string): Material[] {
  return readJSON<Material[]>(key(uid, `mats:${jobId}`), []).map(withDefaults)
}
function saveMaterials(uid: string, jobId: string, mats: Material[]) {
  writeJSON(key(uid, `mats:${jobId}`), sortMats(mats))
}

/** Unsent text in the composer, per job. */
export function loadDraft(uid: string, jobId: string): string {
  return readJSON<string>(key(uid, `draft:${jobId}`), '')
}
export function saveDraft(uid: string, jobId: string, text: string) {
  writeJSON(key(uid, `draft:${jobId}`), text)
}

const counts = (mats: Array<Pick<Material, 'picked_up'>>) => ({
  item_count: mats.length,
  picked_count: mats.filter((m) => m.picked_up).length,
})

/** Keep the job card's counts and "last updated" right without waiting for the server. */
function touchJobLocal(uid: string, jobId: string, mats: Material[]) {
  const jobs = cachedJobs(uid)
  const now = new Date().toISOString()
  saveJobs(
    uid,
    jobs.map((j) => (j.id === jobId ? { ...j, ...counts(mats), updated_at: now } : j)),
  )
}

// ---------------------------------------------------------------------------
// jobs
// ---------------------------------------------------------------------------

interface JobRow extends Omit<Job, 'item_count' | 'picked_count'> {
  materials: Array<{ picked_up: boolean }> | null
}

export async function loadJobs(uid: string): Promise<Job[]> {
  const local = cachedJobs(uid)
  if (DEMO) return sortJobs(local)

  const { data, error } = await sb()
    .from('jobs')
    .select('id, user_id, name, address, created_at, updated_at, materials(picked_up)')
    .order('updated_at', { ascending: false })
    .returns<JobRow[]>()
  if (error || !data) return sortJobs(local)

  const byId = new Map<string, Job>()
  for (const { materials, ...row } of data) byId.set(row.id, { ...row, ...counts(materials ?? []) })

  // Lay unsent changes on top of what the server has.
  const ob = getOutbox(uid)
  for (const op of Object.values(ob.jobs)) {
    if (op.op === 'delete') byId.delete(op.id)
    else byId.set(op.row.id, { ...byId.get(op.row.id), ...op.row })
  }
  const jobsWithPendingItems = new Set(
    Object.values(ob.mats).map((op) => (op.op === 'upsert' ? op.row.job_id : op.job_id)),
  )
  for (const id of jobsWithPendingItems) {
    const server = byId.get(id)
    const mine = local.find((j) => j.id === id)
    if (server && mine) {
      byId.set(id, {
        ...server,
        item_count: mine.item_count,
        picked_count: mine.picked_count,
        updated_at: mine.updated_at > server.updated_at ? mine.updated_at : server.updated_at,
      })
    }
  }

  const jobs = sortJobs([...byId.values()])
  saveJobs(uid, jobs)
  return jobs
}

export async function loadJob(uid: string, jobId: string): Promise<Job | null> {
  if (getOutbox(uid).jobs[jobId]?.op === 'delete') return null
  const local = cachedJobs(uid).find((j) => j.id === jobId)
  if (local || DEMO) return local ?? null
  const { data } = await sb()
    .from('jobs')
    .select('id, user_id, name, address, created_at, updated_at')
    .eq('id', jobId)
    .maybeSingle()
  return data ? { ...data, item_count: 0, picked_count: 0 } : null
}

function queueJob(uid: string, job: Job) {
  const ob = getOutbox(uid)
  ob.jobs[job.id] = { v: version(), row: job }
  saveOutbox(uid, ob)
  void flush(uid)
}

export function createJob(uid: string, name: string, address: string | null): Job {
  const now = new Date().toISOString()
  const job: Job = {
    id: newId(),
    user_id: uid,
    name: name.trim(),
    address: address?.trim() || null,
    created_at: now,
    updated_at: now,
    item_count: 0,
    picked_count: 0,
  }
  saveJobs(uid, [job, ...cachedJobs(uid)])
  queueJob(uid, job)
  return job
}

/** Rename a job or change its address. Returns the updated job, or null if it's gone. */
export function updateJob(uid: string, jobId: string, patch: Pick<Job, 'name' | 'address'>): Job | null {
  const current = cachedJobs(uid).find((j) => j.id === jobId)
  if (!current) return null
  const job: Job = {
    ...current,
    name: patch.name.trim(),
    address: patch.address?.trim() || null,
    updated_at: new Date().toISOString(),
  }
  saveJobs(uid, cachedJobs(uid).map((j) => (j.id === jobId ? job : j)))
  queueJob(uid, job)
  return job
}

/** Delete a job and its list. The server removes the materials too (on delete cascade). */
export function deleteJob(uid: string, jobId: string) {
  saveJobs(uid, cachedJobs(uid).filter((j) => j.id !== jobId))
  removeKey(key(uid, `mats:${jobId}`))
  removeKey(key(uid, `draft:${jobId}`))

  const ob = getOutbox(uid)
  for (const [id, op] of Object.entries(ob.mats)) {
    if ((op.op === 'upsert' ? op.row.job_id : op.job_id) === jobId) delete ob.mats[id]
  }
  ob.jobs[jobId] = { v: version(), op: 'delete', id: jobId }
  saveOutbox(uid, ob)
  void flush(uid)
}

// ---------------------------------------------------------------------------
// materials
// ---------------------------------------------------------------------------

export async function loadMaterials(uid: string, jobId: string): Promise<Material[]> {
  const local = cachedMaterials(uid, jobId)
  if (DEMO) {
    touchJobCount(uid, jobId, local)
    return local
  }

  const { data, error } = await sb()
    .from('materials')
    .select('id, job_id, user_id, qty, unit, item, official_name, picked_up, sort_order, created_at')
    .eq('job_id', jobId)
    .returns<Material[]>()
  if (error || !data) return local

  const byId = new Map<string, Material>()
  for (const m of data) byId.set(m.id, { ...m, qty: m.qty === null ? null : Number(m.qty) })
  for (const op of Object.values(getOutbox(uid).mats)) {
    if (op.op === 'upsert' && op.row.job_id === jobId) byId.set(op.row.id, withDefaults(op.row))
    if (op.op === 'delete' && op.job_id === jobId) byId.delete(op.id)
  }

  const mats = sortMats([...byId.values()])
  saveMaterials(uid, jobId, mats)
  touchJobCount(uid, jobId, mats)
  return mats
}

function touchJobCount(uid: string, jobId: string, mats: Material[]) {
  const jobs = cachedJobs(uid)
  const c = counts(mats)
  if (jobs.some((j) => j.id === jobId && (j.item_count !== c.item_count || j.picked_count !== c.picked_count))) {
    saveJobs(uid, jobs.map((j) => (j.id === jobId ? { ...j, ...c } : j)))
  }
}

/**
 * Save a new version of a job's list. `upserts` and `deletes` say what changed,
 * so only those rows go to the server.
 */
export function commitMaterials(
  uid: string,
  jobId: string,
  next: Material[],
  change: { upserts?: Material[]; deletes?: Material[] },
): Material[] {
  const sorted = sortMats(next)
  saveMaterials(uid, jobId, sorted)
  touchJobLocal(uid, jobId, sorted)

  const ob = getOutbox(uid)
  for (const row of change.upserts ?? []) ob.mats[row.id] = { v: version(), op: 'upsert', row }
  for (const row of change.deletes ?? []) {
    ob.mats[row.id] = { v: version(), op: 'delete', id: row.id, job_id: row.job_id }
  }
  saveOutbox(uid, ob)
  void flush(uid)
  return sorted
}

export function nextSortOrder(mats: Material[]): number {
  return mats.reduce((max, m) => Math.max(max, m.sort_order), -1) + 1
}

// ---------------------------------------------------------------------------
// sync
// ---------------------------------------------------------------------------

/** Network down, server hiccup, or expired login: keep the change and try later. */
const isTransient = (status: number) =>
  status === 0 || status === 401 || status === 408 || status === 429 || status >= 500

let running: Promise<void> | null = null
let again = false

export function flush(uid: string): Promise<void> {
  if (DEMO) return Promise.resolve()
  if (running) {
    again = true
    return running
  }
  running = pushOutbox(uid)
    .catch((err) => console.warn('sync failed, will retry', err))
    .finally(() => {
      running = null
      emit()
      if (again) {
        again = false
        void flush(uid)
      }
    })
  return running
}

/** Remove sent entries, unless they were changed again while we were sending. */
function settle(uid: string, sent: Array<{ id: string; v: string }>, kind: 'jobs' | 'mats') {
  const ob = getOutbox(uid)
  for (const { id, v } of sent) if (ob[kind][id]?.v === v) delete ob[kind][id]
  saveOutbox(uid, ob)
}

/**
 * Send a batch. If the server rejects it for good (bad row), send rows one by one
 * and drop only the bad ones, so one broken row can't jam the queue forever.
 * Returns false when we should stop and retry later.
 */
async function sendBatch<T extends { id: string; v: string }>(
  entries: T[],
  send: (entries: T[]) => PromiseLike<{ status: number; error: unknown }>,
  done: (entries: T[]) => void,
): Promise<boolean> {
  if (!entries.length) return true
  const res = await send(entries)
  if (!res.error) {
    done(entries)
    return true
  }
  if (isTransient(res.status)) return false
  for (const entry of entries) {
    const one = await send([entry])
    if (one.error && isTransient(one.status)) return false
    if (one.error) console.error('dropping change the server rejected', entry, one.error)
    done([entry])
  }
  return true
}

async function pushOutbox(uid: string): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return
  const client = sb()
  let ob = getOutbox(uid)

  // New and edited jobs first, so materials always have a job to point at.
  const jobUpserts: Array<{ id: string; v: string; row: Job }> = []
  const jobDeletes: Array<{ id: string; v: string }> = []
  for (const op of Object.values(ob.jobs)) {
    if (op.op === 'delete') jobDeletes.push({ id: op.id, v: op.v })
    else jobUpserts.push({ id: op.row.id, v: op.v, row: op.row })
  }
  const jobsOk = await sendBatch(
    jobUpserts,
    (batch) =>
      client.from('jobs').upsert(
        batch.map(({ row: { item_count: _items, picked_count: _picked, ...rest } }) => rest),
        { onConflict: 'id' },
      ),
    (batch) => settle(uid, batch, 'jobs'),
  )
  if (!jobsOk) return

  ob = getOutbox(uid)
  const upserts: Array<{ id: string; v: string; row: Material }> = []
  const deletes: Array<{ id: string; v: string }> = []
  for (const op of Object.values(ob.mats)) {
    if (op.op === 'upsert') upserts.push({ id: op.row.id, v: op.v, row: op.row })
    else deletes.push({ id: op.id, v: op.v })
  }

  const upsertsOk = await sendBatch(
    upserts,
    (batch) => client.from('materials').upsert(batch.map((e) => withDefaults(e.row)), { onConflict: 'id' }),
    (batch) => settle(uid, batch, 'mats'),
  )
  if (!upsertsOk) return

  const deletesOk = await sendBatch(
    deletes,
    (batch) =>
      client
        .from('materials')
        .delete()
        .in(
          'id',
          batch.map((e) => e.id),
        ),
    (batch) => settle(uid, batch, 'mats'),
  )
  if (!deletesOk) return

  // Deleted jobs last. Their materials go with them on the server.
  await sendBatch(
    jobDeletes,
    (batch) =>
      client
        .from('jobs')
        .delete()
        .in(
          'id',
          batch.map((e) => e.id),
        ),
    (batch) => settle(uid, batch, 'jobs'),
  )
}
