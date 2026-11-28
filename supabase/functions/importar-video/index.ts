// Copia videos de la biblioteca (generados en Higgsfield) al almacenamiento propio (bucket «academia»)
// para no depender del enlace externo.
//
// Dos formas de llamarla:
//  1. Desde la app (botón «Copiar al club»): usuario de coordinación o dirección, body { ids: [...] }.
//  2. Tarea de mantenimiento desde la base de datos (pg_net): header x-mantenimiento con un token de un
//     solo uso cuyo SHA-256 está en settings.mantenimiento_videos.hash. Body { todos: true, limite?: n }
//     copia todos los videos que sigan en el CDN externo.
//
// Estructura del bucket (pensada para varios clubes a futuro):
//   videos/<ejercicio>-<mal|bien>.mp4      biblioteca común de la plataforma (la misma para todos los clubes)
//   clubs/<club_id>/videos/...             (futuro) videos propios de cada club
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const ALLOWED = /^https:\/\/[a-z0-9]+\.cloudfront\.net\//;

async function sha256(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = (await req.json()) as { ids?: string[]; todos?: boolean; limite?: number };

    let query = admin.from('exercise_videos').select('id,kind,url,exercises(slug)');
    const token = req.headers.get('x-mantenimiento');
    if (token) {
      const { data: s } = await admin.from('settings').select('value').eq('key', 'mantenimiento_videos').maybeSingle();
      const v = (s?.value ?? {}) as { hash?: string; vence?: string };
      if (!v.hash || !v.vence || new Date(v.vence) < new Date() || v.hash !== (await sha256(token))) return json({ error: 'Token inválido' }, 403);
      if (!body.todos) return json({ error: 'Falta todos: true' }, 400);
      query = query.like('url', 'https://%.cloudfront.net/%').limit(Math.min(body.limite ?? 10, 20));
    } else {
      const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
      const { data: ok } = await user.rpc('forma_coaches');
      if (!ok) return json({ error: 'Solo coordinación y dirección pueden copiar videos' }, 403);
      query = query.in('id', body.ids ?? []);
    }

    const { data: vids } = await query;
    const done: string[] = []; const failed: string[] = [];
    for (const v of vids ?? []) {
      if (!v.url || !ALLOWED.test(v.url)) continue;
      const r = await fetch(v.url);
      if (!r.ok) { failed.push(v.id); continue; }
      const slug = (v.exercises as unknown as { slug: string } | null)?.slug ?? v.id;
      const path = `videos/${slug}-${v.kind}.mp4`;
      const up = await admin.storage.from('academia').upload(path, await r.arrayBuffer(), { contentType: 'video/mp4', upsert: true });
      if (up.error) { failed.push(v.id); continue; }
      const pub = admin.storage.from('academia').getPublicUrl(path).data.publicUrl;
      await admin.from('exercise_videos').update({ url: pub, provider: 'oberlicht' }).eq('id', v.id);
      done.push(v.id);
    }
    return json({ copiados: done.length, fallaron: failed.length });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
