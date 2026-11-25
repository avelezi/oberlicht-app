import { useState, type FormEvent } from 'react';
import { Alert, Button, Field, Input, Segmented, Checkbox } from '@/design-system';
import logoOscuro from '@/design-system/assets/oberlicht-logo-fondo-oscuro.png';
import logoClaro from '@/design-system/assets/oberlicht-logo-fondo-claro.png';
import { supabase, friendlyError } from '@/lib/supabase';

type Mode = 'entrar' | 'registro' | 'recuperar';

export default function Login() {
  const [mode, setMode] = useState<Mode>('entrar');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [privacy, setPrivacy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null); setInfo(null); setBusy(true);
    try {
      if (mode === 'entrar') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else if (mode === 'registro') {
        if (!privacy) throw new Error('Para crear la cuenta acepta el aviso de privacidad.');
        if (password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { data: { full_name: name.trim(), phone: phone.trim() }, emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) setInfo('Te enviamos un correo para confirmar tu cuenta. Ábrelo y después inicia sesión.');
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/nueva-contrasena` });
        if (error) throw error;
        setInfo('Si el correo está registrado, te llegará una liga para crear una contraseña nueva.');
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-sidebar p-12 text-white lg:flex">
        <img src={logoOscuro} alt="Oberlicht" className="h-16 w-auto" />
        <div>
          <h1 className="font-heading text-4xl font-extrabold leading-tight">Todo el club en un solo lugar.</h1>
          <p className="mt-4 max-w-md text-lg text-white/80">
            Inscripciones, clases, reservas, pagos y facturas de natación, Oberfit, ballet, gimnasia rítmica y más.
          </p>
        </div>
        <p className="text-sm text-white/60">Oberlicht · oberlicht.com.mx</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-md space-y-5">
          <div className="lg:hidden"><img src={logoClaro} alt="Oberlicht" className="h-14 w-auto" /></div>
          <div>
            <h2 className="text-3xl font-extrabold">
              {mode === 'entrar' ? 'Bienvenido' : mode === 'registro' ? 'Crea tu cuenta familiar' : 'Recupera tu contraseña'}
            </h2>
            <p className="mt-1 text-base text-fg-muted">
              {mode === 'entrar' && 'Entra con el correo que registraste en el club.'}
              {mode === 'registro' && 'Para padres, madres, tutores y socios adultos. Después agregas a tus hijos.'}
              {mode === 'recuperar' && 'Escribe tu correo y te enviamos una liga.'}
            </p>
          </div>

          <Segmented
            value={mode}
            onChange={(v) => { setMode(v as Mode); setError(null); setInfo(null); }}
            options={[{ id: 'entrar', label: 'Iniciar sesión' }, { id: 'registro', label: 'Soy nuevo' }]}
          />

          {mode === 'registro' && (
            <>
              <Field label="Nombre completo" required>
                {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Mariana López Ruiz" autoComplete="name" required />}
              </Field>
              <Field label="Celular (WhatsApp)" required hint="Te avisaremos de pagos y clases.">
                {(p) => <Input {...p} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10 dígitos" autoComplete="tel" required />}
              </Field>
            </>
          )}

          <Field label="Correo electrónico" required>
            {(p) => <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tucorreo@ejemplo.com" autoComplete="email" required />}
          </Field>

          {mode !== 'recuperar' && (
            <Field label="Contraseña" required hint={mode === 'registro' ? 'Mínimo 8 caracteres.' : undefined}>
              {(p) => <Input {...p} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'entrar' ? 'current-password' : 'new-password'} required />}
            </Field>
          )}

          {mode === 'registro' && (
            <Checkbox
              checked={privacy}
              onChange={(e) => setPrivacy(e.target.checked)}
              label="Acepto el aviso de privacidad"
              description="Autorizo el uso de mis datos y los de mis hijos menores para la operación del club (LFPDPPP)."
            />
          )}

          {error && <Alert tone="danger" title="No se pudo continuar">{error}</Alert>}
          {info && <Alert tone="success" title="Listo">{info}</Alert>}

          <Button type="submit" size="lg" block loading={busy}>
            {mode === 'entrar' ? 'Entrar' : mode === 'registro' ? 'Crear mi cuenta' : 'Enviar liga'}
          </Button>

          {mode === 'entrar' && (
            <button type="button" className="min-h-control w-full text-base font-semibold text-primary hover:underline" onClick={() => setMode('recuperar')}>
              Olvidé mi contraseña
            </button>
          )}
          {mode === 'recuperar' && (
            <button type="button" className="min-h-control w-full text-base font-semibold text-primary hover:underline" onClick={() => setMode('entrar')}>
              Regresar a iniciar sesión
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

export function NewPassword() {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    setMsg(error ? { tone: 'danger', text: friendlyError(error) } : { tone: 'success', text: 'Contraseña actualizada. Ya puedes usar la plataforma.' });
    if (!error) setTimeout(() => (window.location.href = '/'), 1500);
  }
  return (
    <div className="grid min-h-screen place-items-center p-6">
      <form onSubmit={submit} className="w-full max-w-md space-y-5">
        <img src={logoClaro} alt="Oberlicht" className="h-14 w-auto" />
        <h1 className="text-3xl font-extrabold">Crea tu contraseña nueva</h1>
        <Field label="Contraseña nueva" required hint="Mínimo 8 caracteres.">
          {(p) => <Input {...p} type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />}
        </Field>
        {msg && <Alert tone={msg.tone} title={msg.tone === 'success' ? 'Listo' : 'No se pudo'}>{msg.text}</Alert>}
        <Button type="submit" size="lg" block loading={busy}>Guardar contraseña</Button>
      </form>
    </div>
  );
}
