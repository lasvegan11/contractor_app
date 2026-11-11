// parse-materials: free speech → [{ qty, unit, item }]
// Calls Claude; if that fails, refuses, or takes longer than 5s, falls back to plain rules.
// A logged-in user's request never gets an error back — the contractor is never blocked.

import Anthropic from 'npm:@anthropic-ai/sdk@1.6.0'
import { fallbackParse, type Lang, type ParsedItem } from '../_shared/fallback.ts'

const MODEL = Deno.env.get('CLAUDE_MODEL') ?? 'claude-opus-5-5'
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

const SYSTEM = `You turn a contractor's material list into line items. The text comes from speech recognition (or quick typing) on a job site in Las Vegas. It may be English, Spanish, or a mix of both, and uses trade slang.

For each distinct material return:
- qty: a number, or null if no amount was said
- unit: the counting unit (sheets, boxes, buckets, rolls, bags, pieces, feet, gallons, tubes, hojas, cajas, cubetas, etc.), or null if none
- item: what the material is, including its size or spec

Rules:
- Turn number words into numbers: "twelve" → 12, "doce" → 12, "a couple" → 2, "a dozen" → 12, "two and a half" → 2.5.
- Items are separated by "and", "y", commas, or simply by a new quantity starting mid-sentence.
- Keep each item and unit in the language the person said it in. Never translate.
- Fix obvious speech-recognition spelling ("dry wall" → "drywall") but keep trade slang ("mud", "romex", "lag bolts", "tablaroca").
- Write sizes in trade notation: "half inch" → 1/2", "five eighths" → 5/8", "two by four" → 2x4, "inch and five eighths" → 1-5/8".
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
        },
        required: ['qty', 'unit', 'item'],
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
    out.push({ qty, unit, item })
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
  const useFallbacks = !MODEL.includes('haiku') // Haiku has no server-side refusal fallback
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
