// Plain-rules material parser. Used by the edge function when Claude fails or is slow,
// and by the app itself when there is no signal. No Deno or browser APIs in here:
// both sides import this same file.

export type Lang = 'en' | 'es'

export interface ParsedItem {
  qty: number | null
  unit: string | null
  item: string
  /** Standard product name when the item is slang or a nickname ("mud" → "joint compound"). */
  official_name: string | null
}

const plain = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

/** Keep the official name only when it says something the item text doesn't already say. */
export function cleanOfficialName(item: string, official: unknown): string | null {
  if (typeof official !== 'string') return null
  const name = official.trim()
  if (!name) return null
  return plain(item).includes(plain(name)) ? null : name
}

const NUMBER_WORDS: Record<string, number> = {
  // English
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30,
  forty: 40, fifty: 50, hundred: 100, dozen: 12, couple: 2,
  // Spanish
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7,
  ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
  dieciseis: 16, dieciséis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, cien: 100, docena: 12,
  par: 2,
}

// "a couple", "a dozen", "una docena", "un par"
const ARTICLES = new Set(['a', 'an', 'un', 'una'])

// Words that read as a counting unit right after the quantity.
const UNITS = new Set([
  // English
  'sheet', 'sheets', 'box', 'boxes', 'bucket', 'buckets', 'roll', 'rolls', 'bag', 'bags',
  'piece', 'pieces', 'pc', 'pcs', 'ft', 'feet', 'foot', 'lf', 'gallon', 'gallons', 'gal',
  'tube', 'tubes', 'stick', 'sticks', 'lb', 'lbs', 'pound', 'pounds', 'case', 'cases',
  'pack', 'packs', 'bundle', 'bundles', 'can', 'cans', 'pail', 'pails', 'yard', 'yards',
  'yd', 'yds', 'sq', 'squares', 'pallet', 'pallets', 'board', 'boards', 'length', 'lengths',
  'coil', 'coils', 'tub', 'tubs', 'carton', 'cartons', 'set', 'sets', 'pair', 'pairs',
  // Spanish
  'hoja', 'hojas', 'lamina', 'laminas', 'lámina', 'láminas', 'caja', 'cajas', 'cubeta',
  'cubetas', 'rollo', 'rollos', 'bolsa', 'bolsas', 'saco', 'sacos', 'pieza', 'piezas',
  'pie', 'pies', 'galon', 'galón', 'galones', 'tubo', 'tubos', 'libra', 'libras',
  'paquete', 'paquetes', 'bote', 'botes', 'bulto', 'bultos', 'tabla', 'tablas',
  'palo', 'palos', 'yarda', 'yardas', 'tarima', 'tarimas',
])

const SPLIT_RE = /\s*(?:[,;\n]+|\s&\s|\s(?:and|plus|y)\s)\s*/i
const FILLER_RE =
  /^(?:(?:i\s+)?(?:need|want|gotta\s+get|get\s+me|grab|also|and|plus|um+|uh+|necesito|ocupo|tráeme|traeme|también|tambien|y)\s+)+/i
const LEADING_NUM_RE = /^(\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+)(?=\s|$)\s*/

function toNumber(raw: string): number | null {
  const parts = raw.trim().split(/\s+/)
  let total = 0
  for (const part of parts) {
    if (part.includes('/')) {
      const [n, d] = part.split('/').map(Number)
      if (!d) return null
      total += n / d
    } else {
      const n = Number(part)
      if (Number.isNaN(n)) return null
      total += n
    }
  }
  return total
}

function parseLine(line: string): ParsedItem | null {
  let rest = line.trim().replace(/[.!?]+$/, '').replace(FILLER_RE, '').trim()
  if (!rest) return null

  let qty: number | null = null
  const digit = rest.match(LEADING_NUM_RE)
  if (digit) {
    qty = toNumber(digit[1])
    rest = rest.slice(digit[0].length)
  } else {
    const words = rest.split(/\s+/)
    const w0 = words[0]?.toLowerCase()
    const w1 = words[1]?.toLowerCase()
    if (w0 && ARTICLES.has(w0) && w1 && Object.hasOwn(NUMBER_WORDS, w1) && !ARTICLES.has(w1) && words.length > 2) {
      qty = NUMBER_WORDS[w1]
      rest = words.slice(2).join(' ')
    } else if (w0 && Object.hasOwn(NUMBER_WORDS, w0) && words.length > 1 && !/^(?:by|x|por)$/i.test(w1 ?? '')) {
      // "two by four" is a size, not a quantity.
      qty = NUMBER_WORDS[w0]
      rest = words.slice(1).join(' ')
    }
  }

  let unit: string | null = null
  if (qty !== null) {
    const words = rest.split(/\s+/)
    if (words.length > 1 && UNITS.has(words[0].toLowerCase())) {
      unit = words[0]
      rest = words.slice(1).join(' ')
    }
    rest = rest.replace(/^(?:of|de|del)\s+/i, '')
  }

  const item = rest.trim()
  if (!item) return null
  return { qty, unit, item, official_name: null } // only Claude knows the nicknames
}

export function fallbackParse(text: string): ParsedItem[] {
  return text
    .split(SPLIT_RE)
    .map(parseLine)
    .filter((x): x is ParsedItem => x !== null)
}
