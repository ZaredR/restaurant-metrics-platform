import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  ?? ''
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

/* ─── Client ────────────────────────────────────────────────
   Instantiated lazily so the app boots even without .env set.
   Pages that call supabase will get a clear error instead of
   a crash at startup.
   ─────────────────────────────────────────────────────────── */
export const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
      },
    })
  : null

export function getSupabase() {
  if (!supabase) throw new Error('Supabase no está configurado. Agrega VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env')
  return supabase
}
