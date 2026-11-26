import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { Button } from '@/design-system';
import logo from '@/design-system/assets/oberlicht-logo-fondo-claro.png';
import { useAsync } from '@/lib/hooks';
import { supabase, must } from '@/lib/supabase';
import { dateLong, fullName } from '@/lib/format';
import type { Certificate } from '@/lib/escuela';
import type { Member } from '@/lib/types';
import { ErrorBox, Loading } from '@/components/common';

const DEPT: Record<string, string> = { natacion: 'Natación', ballet: 'Ballet', gimnasia: 'Gimnasia rítmica' };

/** Certificado de nivel completado, listo para imprimir (horizontal). */
export default function Certificado() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data, error } = useAsync(async () => {
    const c = (await must(supabase.from('certificates').select('*').eq('id', id!).single())) as Certificate;
    const [member, level, coach] = await Promise.all([
      must(supabase.from('members').select('*').eq('id', c.member_id).single()),
      must(supabase.from('levels').select('name').eq('id', c.level_id).single()),
      c.issued_by ? must(supabase.from('profiles').select('full_name').eq('id', c.issued_by).maybeSingle()) : null,
    ]);
    return { c, member: member as Member, level: (level as { name: string }).name, coach: (coach as { full_name: string } | null)?.full_name ?? '' };
  }, [id]);
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const { c, member, level, coach } = data;
  return (
    <>
      <div className="no-print mb-4 flex flex-wrap gap-2">
        <Button variant="secondary" icon={<ArrowLeft className="h-5 w-5" />} onClick={() => nav(-1)}>Regresar</Button>
        <Button icon={<Printer className="h-5 w-5" />} onClick={() => window.print()}>Imprimir o guardar PDF</Button>
      </div>
      <article className="print-area print-landscape mx-auto max-w-4xl bg-white p-3 text-neutral-900 shadow-sm" style={{ colorScheme: 'light' }}>
        <div className="rounded-lg border-[10px] p-2" style={{ borderColor: '#921C81' }}>
          <div className="flex flex-col items-center rounded border-2 px-6 py-10 text-center sm:px-14" style={{ borderColor: '#FEDB02' }}>
            <img src={logo} alt="Oberlicht" className="mb-6 h-20 w-auto" />
            <p className="text-sm font-semibold uppercase tracking-[0.3em]" style={{ color: '#019ADE' }}>Certificado de logro</p>
            <p className="mt-6 text-lg text-neutral-600">Otorgado a</p>
            <p className="mt-1 text-4xl font-bold sm:text-5xl" style={{ color: '#921C81' }}>{fullName(member)}</p>
            <p className="mt-6 max-w-xl text-lg text-neutral-700">
              por completar con éxito el nivel <strong>{level}</strong> de {DEPT[c.department] ?? c.department}, demostrando esfuerzo, constancia y todas las habilidades del nivel.
            </p>
            {c.notes && <p className="mt-4 text-base italic text-neutral-600">«{c.notes}»</p>}
            <div className="mt-12 flex w-full flex-wrap items-end justify-between gap-6 text-sm text-neutral-600">
              <div className="text-left"><div className="mb-1 h-px w-52 bg-neutral-400" />{coach || 'Instructor'}</div>
              <div className="text-right">{dateLong(c.issued_at)}<br />Folio {String(c.folio).padStart(5, '0')}</div>
            </div>
          </div>
        </div>
      </article>
    </>
  );
}
