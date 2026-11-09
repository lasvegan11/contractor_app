import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

/** No Supabase keys → demo mode: no login, everything stays in this browser. */
export const DEMO = !url || !key

const client: SupabaseClient | null = DEMO
  ? null
  : createClient(url!, key!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: 'pn-auth',
      },
    })

export function sb(): SupabaseClient {
  if (!client) throw new Error('Supabase is not configured (demo mode)')
  return client
}
