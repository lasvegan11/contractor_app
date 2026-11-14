export type { Lang, ParsedItem } from '../../supabase/functions/_shared/fallback.ts'
import type { Lang } from '../../supabase/functions/_shared/fallback.ts'

export interface Profile {
  id: string
  name: string | null
  business_name: string | null
  phone: string | null
  lang: Lang
}

export interface Job {
  id: string
  user_id: string
  name: string
  address: string | null
  /** Kind of job, an id from src/data/jobKinds.ts ("drywall", "bath"…), or null if skipped. */
  trade: string | null
  created_at: string
  updated_at: string
  /** Client-only: counted from the job's materials, never sent to the server. */
  item_count: number
  picked_count: number
}

export interface Material {
  id: string
  job_id: string
  user_id: string
  qty: number | null
  unit: string | null
  item: string
  /** Standard product name when `item` is slang or a nickname; shown under it and sent in brackets. */
  official_name: string | null
  /** Shown to the user as "Got it". */
  picked_up: boolean
  sort_order: number
  created_at: string
}
