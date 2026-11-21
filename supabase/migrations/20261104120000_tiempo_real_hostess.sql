/* ─── Tiempo real para la hostess ───────────────────────────
   Varias tablets de hostess deben ver al instante las mesas que
   se ocupan o se liberan. Supabase Realtime publica los cambios
   de las tablas que están en la publicación supabase_realtime.
   (El if permite correr la migración en un Postgres sin Supabase.)
   ──────────────────────────────────────────────────────────── */

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.visitas, public.rol_asignaciones;
  end if;
end;
$$;
