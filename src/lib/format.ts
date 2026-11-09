import type { Strings } from './i18n'
import { prettyPhone } from './phone'
import type { Job, Material, Profile } from './types'

const FRACTIONS: Array<[number, string]> = [
  [1 / 8, '1/8'], [1 / 4, '1/4'], [1 / 3, '1/3'], [3 / 8, '3/8'], [1 / 2, '1/2'],
  [5 / 8, '5/8'], [2 / 3, '2/3'], [3 / 4, '3/4'], [7 / 8, '7/8'],
]

/** 12 → "12", 2.5 → "2 1/2", 0.75 → "3/4", null → "" */
export function formatQty(qty: number | null): string {
  if (qty === null || !Number.isFinite(qty)) return ''
  const whole = Math.floor(qty)
  const frac = qty - whole
  if (frac < 0.001) return String(whole)
  const match = FRACTIONS.find(([v]) => Math.abs(v - frac) < 0.01)
  if (match) return whole ? `${whole} ${match[1]}` : match[1]
  return String(Math.round(qty * 100) / 100)
}

/** "12 sheets 1/2" drywall" */
export function itemLine(m: Pick<Material, 'qty' | 'unit' | 'item'>): string {
  return [formatQty(m.qty), m.unit, m.item].filter(Boolean).join(' ')
}

/** The text that gets sent. Matches the format in the spec. */
export function buildMessage(job: Job, profile: Profile, items: Material[], t: Strings): string {
  const from = [
    profile.name,
    profile.business_name ? `(${profile.business_name})` : '',
    prettyPhone(profile.phone),
  ]
    .filter(Boolean)
    .join(' ')

  return [
    `${t.msgJob}: ${job.name}`,
    ...(from ? [`${t.msgFrom}: ${from}`] : []),
    '',
    ...items.map((m) => `- ${itemLine(m)}`),
    '',
    t.msgSentWith,
  ].join('\n')
}

/** Parse what someone typed into the Qty box: "12", "2.5", "2 1/2", "1/2". */
export function parseQtyInput(raw: string): number | null {
  const s = raw.trim().replace(',', '.')
  if (!s) return null
  let total = 0
  for (const part of s.split(/\s+/)) {
    if (part.includes('/')) {
      const [n, d] = part.split('/').map(Number)
      if (!d || Number.isNaN(n)) return null
      total += n / d
    } else {
      const n = Number(part)
      if (Number.isNaN(n)) return null
      total += n
    }
  }
  return total >= 0 ? total : null
}
