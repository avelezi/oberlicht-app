// Genera una rutina con IA usando SOLO ejercicios aprobados de la biblioteca del club.
// Si el club aún no configura ANTHROPIC_API_KEY, responde { modo: "sin_ia" } y la app arma la rutina con reglas.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

interface Req { department: string; level_name?: string; group_name?: string; age_min: number; age_max: number; minutes: number; request: string; skills_focus?: string[] }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const auth = req.headers.get('Authorization') ?? '';
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const { data: me } = await sb.auth.getUser();
    if (!me?.user) return json({ error: 'Inicia sesión' }, 401);
    const body = (await req.json()) as Req;

    const key = Deno.env.get('ANTHROPIC_API_KEY');
    if (!key) return json({ modo: 'sin_ia' });

    const { data: cfg } = await sb.from('settings').select('value').eq('key', 'academia').maybeSingle();
    const model = (cfg?.value as { ia_modelo?: string } | null)?.ia_modelo ?? 'claude-sonnet-5-5';
    const sinCarga = (cfg?.value as { sin_carga_menores_de?: number } | null)?.sin_carga_menores_de ?? 14;

    const { data: ex, error } = await sb.from('exercises')
      .select('id,title,block,objective,min_age,max_age,minutes,dose,equipment,safety_note,key_points')
      .eq('department', body.department).eq('status', 'aprobado')
      .lte('min_age', body.age_max).gte('max_age', body.age_min);
    if (error) return json({ error: error.message }, 400);
    if (!ex?.length) return json({ error: 'No hay ejercicios aprobados para esa área y edad. Agrega ejercicios a la biblioteca primero.' }, 400);

    const system = `Eres coordinador técnico de un club deportivo infantil en México. Armas rutinas de clase en español claro.
Reglas estrictas:
- Usa SOLO ejercicios de la lista (por su "id"). No inventes ejercicios ni técnicas.
- Respeta las edades de cada ejercicio y las notas de seguridad.
- Si los alumnos son menores de ${sinCarga} años, nada de carga externa (pesas, kettlebells).
- La suma de minutos de los bloques debe ser igual al tiempo de la clase.
- Bloques en este orden cuando apliquen: Calentamiento, Parte principal, Juego, Vuelta a la calma.
- Responde ÚNICAMENTE con JSON válido, sin texto alrededor.`;
    const user = `Clase: ${body.request}
Área: ${body.department}${body.level_name ? ` · Nivel: ${body.level_name}` : ''}${body.group_name ? ` · Grupo: ${body.group_name}` : ''}
Edades: ${body.age_min} a ${body.age_max} años · Duración: ${body.minutes} minutos
${body.skills_focus?.length ? `Habilidades que más cuestan en el grupo: ${body.skills_focus.join(', ')}` : ''}
Ejercicios disponibles:
${JSON.stringify(ex)}

Formato de respuesta:
{"titulo":"…","objetivo":"…","bloques":[{"nombre":"Calentamiento","minutos":8,"items":[{"exercise_id":"…","dosis":"…","nota":"…"}]}],"resumen_familias":"2 frases para papás","tarea_casa":"1 actividad segura sin alberca ni equipo"}`;

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 2000, system, messages: [{ role: 'user', content: user }] }),
    });
    if (!r.ok) return json({ error: `La IA no respondió (${r.status}). Intenta de nuevo.` }, 502);
    const out = await r.json();
    const text: string = out.content?.map((c: { text?: string }) => c.text ?? '').join('') ?? '';
    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));

    // Validación: solo ids de la biblioteca
    const byId = new Map(ex.map((e) => [e.id, e]));
    const bloques = (parsed.bloques ?? []).map((b: { nombre: string; minutos: number; items?: { exercise_id: string; dosis?: string; nota?: string }[] }) => ({
      nombre: b.nombre, minutos: Number(b.minutos) || 0,
      items: (b.items ?? []).filter((i) => byId.has(i.exercise_id)).map((i) => ({
        exercise_id: i.exercise_id, titulo: byId.get(i.exercise_id)!.title, dosis: i.dosis ?? byId.get(i.exercise_id)!.dose, nota: i.nota ?? null,
      })),
    }));
    return json({ modo: 'ia', modelo: model, titulo: parsed.titulo, objetivo: parsed.objetivo, bloques, resumen_familias: parsed.resumen_familias, tarea_casa: parsed.tarea_casa });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
