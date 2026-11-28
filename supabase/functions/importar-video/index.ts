// Copia un video de la biblioteca (generado en Higgsfield) al almacenamiento propio del club
// para no depender del enlace externo. Solo coordinación y dirección.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const ALLOWED = /^https:\/\/[a-z0-9]+\.cloudfront\.net\//;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: ok } = await user.rpc('forma_coaches');
    if (!ok) return json({ error: 'Solo coordinación y dirección pueden copiar videos' }, 403);
    const { ids } = (await req.json()) as { ids: string[] };
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: vids } = await admin.from('exercise_videos').select('id,kind,url,exercises(slug)').in('id', ids);
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
