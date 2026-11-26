import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { Button } from '@/design-system';
import logo from '@/design-system/assets/oberlicht-logo-fondo-claro.png';
import { useAsync } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { dateLong, fullName } from '@/lib/format';
import { SKILL_LABEL, type ReportCard } from '@/lib/escuela';
import type { Member } from '@/lib/types';
import { ErrorBox, Loading } from '@/components/common';

const DEPT: Record<string, string> = { natacion: 'Natación', ballet: 'Ballet', gimnasia: 'Gimnasia rítmica' };
const MARK = { lograda: '✓', en_proceso: '◐', sin_iniciar: '○' } as const;

/** Boleta de avance imprimible (personal y familias). */
export default function Boleta() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data, error } = useAsync(async () => {
    const card = (await must(supabase.from('report_cards').select('*').eq('id', id!).single())) as ReportCard;
    const [member, level, coach] = await Promise.all([
      must(supabase.from('members').select('*').eq('id', card.member_id).single()),
      must(supabase.from('levels').select('name').eq('id', card.level_id).single()),
      card.created_by ? must(supabase.from('profiles').select('full_name').eq('id', card.created_by).maybeSingle()) : null,
    ]);
    return { card, member: member as Member, level: (level as { name: string }).name, coach: (coach as { full_name: string } | null)?.full_name ?? '' };
  }, [id]);
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const { card, member, level, coach } = data;
  const pct = card.total ? Math.round((100 * card.achieved) / card.total) : 0;
  return (
    <>
      <div className="no-print mb-4 flex flex-wrap gap-2">
        <Button variant="secondary" icon={<ArrowLeft className="h-5 w-5" />} onClick={() => nav(-1)}>Regresar</Button>
        <Button icon={<Printer className="h-5 w-5" />} onClick={() => window.print()}>Imprimir o guardar PDF</Button>
      </div>
      <article className="print-area mx-auto max-w-3xl rounded-xl border border-neutral-200 bg-white p-6 text-neutral-900 shadow-sm sm:p-10" style={{ colorScheme: 'light' }}>
        <header className="mb-6 flex items-center justify-between gap-4 border-b-4 pb-4" style={{ borderColor: '#921C81' }}>
          <img src={logo} alt="Oberlicht" className="h-14 w-auto" />
          <div className="text-right">
            <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: '#921C81' }}>Boleta de avance</p>
            <p className="text-sm text-neutral-600">{dateLong(card.created_at)}</p>
          </div>
        </header>
        <div className="mb-6 grid gap-2 sm:grid-cols-2">
          <div><p className="text-sm text-neutral-500">Alumno</p><p className="text-2xl font-bold">{fullName(member)}</p></div>
          <div><p className="text-sm text-neutral-500">{DEPT[card.department] ?? card.department}</p><p className="text-2xl font-bold">{level}</p></div>
        </div>
        <div className="mb-6 grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-neutral-100 p-4"><p className="text-sm text-neutral-600">Habilidades logradas</p><p className="text-3xl font-bold">{card.achieved} de {card.total}</p><p className="text-sm text-neutral-600">{pct}% del nivel</p></div>
          <div className="rounded-lg bg-neutral-100 p-4"><p className="text-sm text-neutral-600">Asistencia (3 meses)</p><p className="text-3xl font-bold">{card.attendance_pct != null ? `${Number(card.attendance_pct)}%` : '—'}</p></div>
        </div>
        <table className="mb-6 w-full text-left text-base">
          <thead><tr className="border-b border-neutral-300 text-sm text-neutral-500"><th className="py-2">Habilidad</th><th className="py-2 text-right">Resultado</th></tr></thead>
          <tbody>
            {card.skills.map((s, i) => (
              <tr key={i} className="border-b border-neutral-200">
                <td className="py-2.5">{s.name}{s.note && <span className="block text-sm text-neutral-500">{s.note}</span>}</td>
                <td className={`py-2.5 text-right font-semibold ${s.status === 'lograda' ? 'text-green-700' : s.status === 'en_proceso' ? 'text-amber-700' : 'text-neutral-500'}`}>{MARK[s.status]} {SKILL_LABEL[s.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {card.comment && (
          <section className="mb-6 rounded-lg border-l-4 bg-neutral-50 p-4" style={{ borderColor: '#FEDB02' }}>
            <p className="mb-1 text-sm font-semibold text-neutral-600">Comentario del instructor</p>
            <p className="text-base">{card.comment}</p>
          </section>
        )}
        <footer className="mt-10 flex items-end justify-between gap-4 text-sm text-neutral-600">
          <div><div className="mb-1 h-px w-48 bg-neutral-400" />{coach || 'Instructor'}</div>
          <p>Oberlicht · brillas con fuerza</p>
        </footer>
      </article>
    </>
  );
}
