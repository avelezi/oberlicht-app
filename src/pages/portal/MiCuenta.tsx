import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, Plus } from 'lucide-react';
import { Avatar, Button, Card, CardHeader, PageHeader } from '@/design-system';
import { useMyFamily } from '@/lib/portal';
import { ageLabel, fullName } from '@/lib/format';
import type { Member } from '@/lib/types';
import { ErrorBox, HealthFlag, Info, Loading } from '@/components/common';
import { FamilyFormModal, MemberFormModal } from '@/components/FamilyForms';

/** Portal: datos de la familia, hijos y datos fiscales para factura. */
export default function MiCuenta() {
  const nav = useNavigate();
  const { data: mine, error, reload } = useMyFamily();
  const [editFam, setEditFam] = useState(false);
  const [editMember, setEditMember] = useState<Member | null | undefined>(undefined);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!mine) return <Loading />;
  if (!mine.fam) { nav('/'); return null; }
  const { fam, members } = mine;

  return (
    <>
      <PageHeader title="Mi familia" description={`Socio #${fam.number}`} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Datos de contacto" actions={<Button size="sm" variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditFam(true)}>Editar</Button>} />
          <dl className="grid gap-4 sm:grid-cols-2">
            <Info label="Familia">{fam.name}</Info><Info label="Celular">{fam.phone}</Info>
            <Info label="Correo">{fam.email}</Info><Info label="Dirección">{fam.address}</Info>
          </dl>
        </Card>
        <Card>
          <CardHeader title="Factura" actions={<Button size="sm" variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditFam(true)}>Editar</Button>} />
          {fam.wants_invoice ? (
            <dl className="grid gap-4 sm:grid-cols-2">
              <Info label="RFC">{fam.rfc}</Info><Info label="Razón social">{fam.razon_social}</Info>
              <Info label="Código postal">{fam.cp_fiscal}</Info><Info label="Uso de CFDI">{fam.uso_cfdi}</Info>
            </dl>
          ) : <p className="text-base text-fg-muted">No solicitas factura. Si la necesitas (las colegiaturas pueden ser deducibles), agrega tus datos fiscales.</p>}
        </Card>
      </div>
      <h2 className="mb-3 mt-8 text-xl font-bold">Integrantes</h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {members.map((m) => (
          <Card key={m.id}>
            <div className="flex items-center gap-3">
              <Avatar name={fullName(m)} src={m.photo_url ?? undefined} size={48} />
              <div className="min-w-0 flex-1"><p className="text-lg font-semibold">{fullName(m)}</p><p className="text-sm text-fg-muted">{m.is_titular ? 'Titular · ' : ''}{ageLabel(m.birthdate)}</p></div>
              <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditMember(m)}>Editar</Button>
            </div>
            <div className="mt-3 space-y-2">
              <HealthFlag allergies={m.allergies} medical={m.medical_notes} />
              {!m.is_titular && !m.waiver_signed_at && <p className="text-sm font-semibold text-warning-700">! Falta aceptar el deslinde de responsabilidad (necesario para natación, ballet y gimnasia)</p>}
            </div>
          </Card>
        ))}
        <button onClick={() => setEditMember(null)} className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border-strong text-lg font-semibold text-primary hover:bg-primary-soft">
          <Plus className="h-7 w-7" /> Agregar a un hijo o familiar
        </button>
      </div>
      <FamilyFormModal open={editFam} onClose={() => setEditFam(false)} family={fam} onSaved={() => reload()} />
      <MemberFormModal open={editMember !== undefined} onClose={() => setEditMember(undefined)} familyId={fam.id} member={editMember} onSaved={reload} portal />
    </>
  );
}
