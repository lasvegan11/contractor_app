import type { Lang } from '../lib/types'

/**
 * Kinds of job, picked from big tiles when a job is created. Saved in `jobs.trade` by id, so
 * names can change without touching the database, and new kinds need no migration.
 * Later each kind gets its own starter list of materials (roadmap Phase 2).
 */
export const JOB_KINDS = [
  // First: a lot of the people using this are handymen doing small mixed jobs.
  { id: 'handyman', en: 'Handyman / repairs', es: 'Reparaciones' },
  { id: 'drywall', en: 'Drywall', es: 'Tablaroca' },
  { id: 'paint', en: 'Paint', es: 'Pintura' },
  { id: 'bath', en: 'Bath remodel', es: 'Remodelar baño' },
  { id: 'kitchen', en: 'Kitchen remodel', es: 'Remodelar cocina' },
  { id: 'tile', en: 'Tile & floor', es: 'Piso y azulejo' },
  { id: 'roofing', en: 'Roofing', es: 'Techo' },
  { id: 'stucco', en: 'Stucco', es: 'Estuco' },
  { id: 'framing', en: 'Framing', es: 'Framing' },
  { id: 'plumbing', en: 'Plumbing', es: 'Plomería' },
  { id: 'electrical', en: 'Electrical', es: 'Eléctrico' },
  { id: 'concrete', en: 'Concrete & block', es: 'Concreto y block' },
  { id: 'fence', en: 'Fence', es: 'Cerca' },
] as const

export type JobKindId = (typeof JOB_KINDS)[number]['id']

export function isJobKind(id: string | null | undefined): id is JobKindId {
  return JOB_KINDS.some((k) => k.id === id)
}

/** The kind's name in the app language, or null for no kind (or one this version doesn't know). */
export function jobKindName(id: string | null | undefined, lang: Lang): string | null {
  const kind = JOB_KINDS.find((k) => k.id === id)
  return kind ? kind[lang] : null
}
