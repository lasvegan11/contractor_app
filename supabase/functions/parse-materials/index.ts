// parse-materials: free speech → [{ qty, unit, item }]
// Calls Claude; if that fails, refuses, or takes longer than 5s, falls back to plain rules.
// A logged-in user's request never gets an error back — the contractor is never blocked.

import Anthropic from 'npm:@anthropic-ai/sdk@1.6.0'
import { cleanOfficialName, fallbackParse, type Lang, type ParsedItem } from '../_shared/fallback.ts'

// Change the model without touching code: supabase secrets set ANTHROPIC_MODEL=claude-sonnet-5-5
const MODEL = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-haiku-5-5'
const TIMEOUT_MS = 5000
const AUTH_TIMEOUT_MS = 2000
const MAX_TEXT = 2000

// Set by Supabase for every edge function.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')

const client = new Anthropic({
  apiKey: Deno.env.get('ANTHROPIC_API_KEY'),
  maxRetries: 0, // a retry would blow the 5s budget; the fallback is the retry
  timeout: TIMEOUT_MS,
})

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SYSTEM = `You turn a contractor's material list into line items. The text is what a phone heard on a job site in Las Vegas (or quick typing). The speaker may use English, Spanish, or both in one sentence, often with a strong Spanish accent, and uses trade slang.

Step 1: work out what was really said. Because of the accent and the phone, trade words and numbers arrive spelled by sound, split into pieces, or swapped for other real words, sometimes rude ones. Sound the text out and ask what a contractor ordering materials would be saying:
- English trade words written the way Spanish sounds: "chirroc" → sheetrock, "jardi baquer" → HardieBacker, "tubaifor" → 2x4, "tritiado" → treated, "escrus" → screws, "chits" → sheets, "bax" → box, "mod" → mud, "teip" → tape.
- English words misheard as other English words: "shit rock" → sheetrock, "hardy backer" → HardieBacker, "threat it" → treated, "try wall" → drywall, "mood" → mud, "cock" → caulk, "corner bit" → corner bead, "row max" → romex.
- Spanish words misheard on a phone set to English: "these" → diez, "dose" → doce, "trace" → tres, "keen say" → quince, "sink o" → cinco, "o has" → hojas, "ca has" → cajas, "coup betas" → cubetas, "tour knee yos" → tornillos, "claw vos" → clavos, "ma dera tra tada" → madera tratada.
These are examples of the pattern, not a full list. Write the real word, correctly spelled, never the misheard one. Keep every amount and every material that was said. If you cannot tell what a word was, keep it as heard rather than guessing a product.

Step 2: for each distinct material return:
- qty: a number, or null if no amount was said
- unit: the counting unit (sheets, boxes, buckets, rolls, bags, pieces, feet, gallons, tubes, hojas, cajas, cubetas, etc.), or null if none
- item: what the material is, by the name the person meant, including its size or spec
- official_name: the standard product name when the person used a nickname, otherwise null

item uses the name the person meant. If they meant "mud", "Romex", "greenboard", "sharkbite couplings" or "tablaroca", item says that, plus the size. Do not swap a nickname for the proper name in item, and do not add product words they did not say. The proper name goes in official_name.

official_name is for the person at the supply counter, who may not know the nickname, and for searching a store's website. Fill it in only when item uses slang, a nickname, or a brand name standing for the whole product type, in English, Spanish or Spanglish. Give the name a US supplier lists the product under, in English, without the size or the amount. Use null when item already is the standard name, and for plain Spanish words that are not slang.

Examples (what was heard → item / official_name):
- "two buckets of mud" → "mud" / "joint compound"
- "fifty feet of romex twelve two" → "12/2 romex" / "NM-B wire"
- "six sheets of half inch greenboard" → "1/2" greenboard" / "moisture-resistant drywall"
- "ten half inch sharkbite couplings" → "1/2" sharkbite couplings" / "push-to-connect coupling"
- "five sheets of hardy backer" → "HardieBacker" / "cement board"
- "a skilsaw blade" → "skilsaw blade" / "circular saw blade"
- "doce hojas de tablaroca de media" → "tablaroca de 1/2"" / "drywall"
- "cinco hojas de chirroc" → "sheetrock" / "drywall"
- "tres cajas de pijas" → "pijas" / "screws"
- "dos cubetas de pasta" → "pasta" / "joint compound"
- "three boxes of drywall screws" → "drywall screws" / null
- "diez tornillos" → "tornillos" / null
- "dos tablas de madera tratada" → "madera tratada" / null
- "veinte varillas de media" → "varilla de 1/2"" / null
- "ten two by fours" → "2x4" / null
- "a box of sixteen penny nails" → "16d nails" / null

Rules:
- Turn number words into numbers: "twelve" → 12, "doce" → 12, "a couple" → 2, "a dozen" → 12, "two and a half" → 2.5.
- Items are separated by "and", "y", commas, or simply by a new quantity starting mid-sentence. A size or gauge said after the item belongs to that item and is not a new item: "romex twelve two" is one item, 12/2 romex.
- unit is only the counting word, matched to the amount (1 roll, 2 rolls). When the thing itself is what's counted ("ten two by fours", "veinte varillas de media"), unit is null and the thing is the item ("2x4", "varilla de 1/2"").
- Keep each item and unit in the language the person said it in. Never translate: "cajas" stays "cajas", "sheets" stays "sheets".
- Keep trade slang as slang ("mud", "romex", "lag bolts", "tablaroca").
- Write sizes in trade notation: "half inch" → 1/2", "five eighths" → 5/8", "two by four" → 2x4, "inch and five eighths" → 1-5/8", "sixteen penny" → 16d, "ar trece" or "are thirteen" → R-13, wire "twelve two" → 12/2.
- Leave out filler like "I need", "get me", "also", "necesito", "ocupo", "um".
- If nothing in the text is a material, return an empty list.`

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          qty: { anyOf: [{ type: 'number' }, { type: 'null' }] },
          unit: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          item: { type: 'string' },
          official_name: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        },
        required: ['qty', 'unit', 'item', 'official_name'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
}

function json(body: unknown, status = 200, source?: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS,
      'Content-Type': 'application/json',
      ...(source ? { 'X-Parse-Source': source } : {}),
    },
  })
}

function clean(items: unknown): ParsedItem[] {
  if (!Array.isArray(items)) return []
  const out: ParsedItem[] = []
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const item = typeof r.item === 'string' ? r.item.trim() : ''
    if (!item) continue
    const qty = typeof r.qty === 'number' && Number.isFinite(r.qty) && r.qty >= 0 ? r.qty : null
    const unit = typeof r.unit === 'string' && r.unit.trim() ? r.unit.trim() : null
    out.push({ qty, unit, item, official_name: cleanOfficialName(item, r.official_name) })
  }
  return out
}

/**
 * Only a logged-in app user may spend Claude tokens. The gateway's JWT check alone
 * isn't enough: it also lets through anyone holding the public app key, which ships
 * in the web app. So ask Supabase Auth whose token this is.
 */
async function isSignedIn(req: Request): Promise<boolean> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const apikey = SUPABASE_ANON_KEY ?? req.headers.get('apikey')
  if (!token || !apikey || !SUPABASE_URL) return false
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    })
    return res.ok
  } catch {
    return false
  }
}

async function parseWithClaude(text: string, lang: Lang): Promise<ParsedItem[] | null> {
  // Haiku has no server-side refusal fallback; a refusal there drops to the plain splitter below.
  const useFallbacks = !MODEL.includes('haiku')
  const response = await client.beta.messages.create(
    {
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
      ...(useFallbacks
        ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
        : {}),
      messages: [
        {
          role: 'user',
          content: `App language: ${lang === 'es' ? 'Spanish' : 'English'}\n\n<list>\n${text}\n</list>`,
        },
      ],
    },
    { signal: AbortSignal.timeout(TIMEOUT_MS) },
  )

  if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') return null
  const block = response.content.find((b) => b.type === 'text')
  if (!block || block.type !== 'text') return null
  const parsed = JSON.parse(block.text) as { items?: unknown }
  return clean(parsed.items)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
  // The app splits the text on the phone when this fails, so the user still isn't blocked.
  if (!(await isSignedIn(req))) return json({ error: 'Log in first' }, 401)

  let text = ''
  let lang: Lang = 'en'
  try {
    const body = await req.json()
    text = typeof body?.text === 'string' ? body.text.trim().slice(0, MAX_TEXT) : ''
    lang = body?.lang === 'es' ? 'es' : 'en'
  } catch {
    return json({ error: 'Body must be JSON: { text, lang }' }, 400)
  }
  if (!text) return json([], 200, 'empty')

  try {
    const items = await parseWithClaude(text, lang)
    if (items && items.length > 0) return json(items, 200, 'claude')
  } catch (err) {
    if (err instanceof Anthropic.APIUserAbortError || err instanceof Anthropic.APIConnectionTimeoutError) {
      console.warn('parse-materials: Claude timed out, using fallback')
    } else if (err instanceof Anthropic.APIError) {
      console.error(`parse-materials: Claude API ${err.status}: ${err.message}`)
    } else {
      console.error('parse-materials: unexpected error', err)
    }
  }

  return json(fallbackParse(text), 200, 'fallback')
})
