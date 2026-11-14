import { cleanOfficialName, fallbackParse } from '../../supabase/functions/_shared/fallback.ts'
import { DEMO, sb } from './supabase'
import type { Lang, ParsedItem } from './types'

/** The server answers within ~5s (it falls back on its own). Give it a little more for cold starts. */
const CLIENT_TIMEOUT_MS = 8000

function clean(data: unknown): ParsedItem[] {
  if (!Array.isArray(data)) return []
  return data.flatMap((raw): ParsedItem[] => {
    if (!raw || typeof raw !== 'object') return []
    const r = raw as Record<string, unknown>
    const item = typeof r.item === 'string' ? r.item.trim() : ''
    if (!item) return []
    return [
      {
        item,
        qty: typeof r.qty === 'number' && Number.isFinite(r.qty) ? r.qty : null,
        unit: typeof r.unit === 'string' && r.unit.trim() ? r.unit.trim() : null,
        official_name: cleanOfficialName(item, r.official_name),
      },
    ]
  })
}

/**
 * Turn free speech into items. Never throws and never blocks:
 * no signal, a slow server, or any error → split it locally instead.
 */
export async function parseMaterials(text: string, lang: Lang): Promise<ParsedItem[]> {
  if (DEMO || !navigator.onLine) return fallbackParse(text)
  try {
    const { data, error } = await sb().functions.invoke('parse-materials', {
      body: { text, lang },
      timeout: CLIENT_TIMEOUT_MS,
    })
    if (error) throw error
    const items = clean(data)
    return items.length ? items : fallbackParse(text)
  } catch (err) {
    console.warn('parse-materials unavailable, splitting locally', err)
    return fallbackParse(text)
  }
}
