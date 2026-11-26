import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { PartyPopper } from 'lucide-react';
import { Alert, Button, Field, Input, Select, Textarea } from '@/design-system';
import { ThemeToggle, ThemedLogo } from '@/components/AppControls';
import { supabase, friendlyError } from '@/lib/supabase';

const AREAS = [
  ['natacion', 'Natación'], ['ballet', 'Ballet'], ['gimnasia', 'Gimnasia rítmica'], ['oberfit', 'Oberfit (gimnasio)'], ['terapia', 'Terapia física'], ['nutricion', 'Nutrición'],
];

/** Formulario público para pedir una clase de prueba (no requiere cuenta). */
export default function Prueba() {
  const [f, setF] = useState({ name: '', phone: '', email: '', child: '', birth: '', area: 'natacion', msg: '', web: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (f.web) { setOk(true); return; } // campo trampa para robots
    setBusy(true); setError(null);
    try {
      const { error } = await supabase.rpc('solicitar_prueba', {
        p_name: f.name, p_phone: f.phone, p_email: f.email || null, p_child: f.child || null,
        p_birthdate: f.birth || null, p_department: f.area || null, p_message: f.msg || null,
      });
      if (error) throw error;
      setOk(true);
    } catch (err) { setError(friendlyError(err)); } finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen bg-bg px-4 py-6">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 flex items-center justify-between"><ThemedLogo className="h-12 w-auto" /><ThemeToggle /></div>
        {ok ? (
          <div className="rounded-xl border border-border bg-surface p-8 text-center">
            <PartyPopper className="mx-auto mb-3 h-12 w-12 text-primary" />
            <h1 className="text-2xl font-bold">¡Gracias! Te escribimos pronto</h1>
            <p className="mt-2 text-base text-fg-muted">Te contactaremos por WhatsApp para elegir el día de tu clase de prueba sin costo.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-surface p-5 sm:p-8">
            <div>
              <h1 className="text-2xl font-extrabold sm:text-3xl">Agenda una clase de prueba</h1>
              <p className="mt-1 text-base text-fg-muted">Sin costo. Déjanos tus datos y te contactamos para elegir horario.</p>
            </div>
            <Field label="Tu nombre" required>{(p) => <Input {...p} value={f.name} onChange={set('name')} autoComplete="name" required />}</Field>
            <Field label="Celular (WhatsApp)" required>{(p) => <Input {...p} type="tel" inputMode="tel" value={f.phone} onChange={set('phone')} placeholder="10 dígitos" autoComplete="tel" required />}</Field>
            <Field label="Correo">{(p) => <Input {...p} type="email" value={f.email} onChange={set('email')} autoComplete="email" />}</Field>
            <Field label="¿Qué te interesa?">{(p) => <Select {...p} value={f.area} onChange={set('area')}>{AREAS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}</Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nombre del niño o niña">{(p) => <Input {...p} value={f.child} onChange={set('child')} placeholder="Si es para tu hijo" />}</Field>
              <Field label="Fecha de nacimiento">{(p) => <Input {...p} type="date" value={f.birth} onChange={set('birth')} />}</Field>
            </div>
            <Field label="¿Algo que debamos saber?">{(p) => <Textarea {...p} rows={2} value={f.msg} onChange={set('msg')} placeholder="Horario que buscas, experiencia previa…" />}</Field>
            <input type="text" tabIndex={-1} autoComplete="off" value={f.web} onChange={set('web')} className="hidden" aria-hidden />
            {error && <Alert tone="danger" title="No se pudo enviar">{error}</Alert>}
            <Button type="submit" size="lg" block loading={busy}>Quiero mi clase de prueba</Button>
            <p className="text-center text-sm text-fg-muted">Usamos tus datos solo para contactarte sobre tu clase. ¿Ya eres socio? <Link to="/" className="font-semibold text-primary">Entra aquí</Link></p>
          </form>
        )}
      </div>
    </div>
  );
}
