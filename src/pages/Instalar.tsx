import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Download, Share, MoreVertical, PlusSquare, Monitor } from 'lucide-react';
import { Alert, Button, Card, Segmented } from '@/design-system';
import { platform, useInstall, type Platform } from '@/lib/install';
import { ThemePicker } from '@/components/AppControls';
import logoClaro from '@/design-system/assets/oberlicht-logo-fondo-claro.png';
import logoOscuro from '@/design-system/assets/oberlicht-logo-fondo-oscuro.png';
import { useTheme } from '@/lib/theme';

type Tab = 'iphone' | 'android' | 'windows' | 'mac';
const initial = (p: Platform): Tab => (p === 'ios' ? 'iphone' : p === 'android' ? 'android' : p === 'mac' ? 'mac' : 'windows');

const STEPS: Record<Tab, { title: string; browser: string; steps: { icon?: typeof Share; text: string }[] }> = {
  iphone: {
    title: 'iPhone o iPad', browser: 'Abre este link en Safari.',
    steps: [
      { icon: Share, text: 'Toca el botón Compartir (el cuadro con la flecha hacia arriba), abajo en la pantalla.' },
      { icon: PlusSquare, text: 'Desliza y elige «Agregar a inicio».' },
      { text: 'Toca «Agregar». El ícono de Oberlicht aparece en tu pantalla de inicio y abre como app.' },
    ],
  },
  android: {
    title: 'Android', browser: 'Abre este link en Chrome.',
    steps: [
      { icon: Download, text: 'Toca el botón «Instalar app» de arriba. Si no aparece, sigue los pasos de abajo.' },
      { icon: MoreVertical, text: 'Toca el menú ⋮ (arriba a la derecha) y elige «Instalar app» o «Agregar a la pantalla principal».' },
      { text: 'Confirma con «Instalar». La app queda junto a tus otras apps.' },
    ],
  },
  windows: {
    title: 'Computadora con Windows', browser: 'Abre este link en Chrome o Edge.',
    steps: [
      { icon: Download, text: 'Haz clic en «Instalar app» de arriba.' },
      { icon: Monitor, text: 'O haz clic en el ícono de instalar que aparece a la derecha de la barra de direcciones.' },
      { text: 'Confirma con «Instalar». Oberlicht queda en el menú Inicio y puedes anclarlo a la barra de tareas.' },
    ],
  },
  mac: {
    title: 'Mac', browser: 'En Safari, Chrome o Edge.',
    steps: [
      { icon: Share, text: 'Safari: menú Archivo → «Agregar al Dock».' },
      { icon: Download, text: 'Chrome o Edge: haz clic en «Instalar app» de arriba o en el ícono de instalar de la barra de direcciones.' },
      { text: 'Oberlicht queda en el Dock y en Aplicaciones, y abre en su propia ventana.' },
    ],
  },
};

/** Instrucciones para instalar la app en cualquier dispositivo. Se puede compartir el link: /instalar */
export default function Instalar() {
  const nav = useNavigate();
  const { canPrompt, installed, prompt } = useInstall();
  const { theme } = useTheme();
  const [tab, setTab] = useState<Tab>(initial(platform()));
  const [copied, setCopied] = useState(false);
  const s = STEPS[tab];
  const link = `${window.location.origin}/instalar`;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <img src={theme === 'dark' ? logoOscuro : logoClaro} alt="Oberlicht" className="mx-auto mb-6 h-14 w-auto" />
      <h1 className="text-center text-3xl font-bold">Instala Oberlicht</h1>
      <p className="mt-2 text-center text-lg text-fg-muted">Tenla a un toque, como cualquier otra app. No ocupa espacio y siempre está actualizada.</p>

      <div className="my-6 flex flex-col items-center gap-3">
        {installed ? (
          <Alert tone="success" title="Ya la tienes instalada">Ábrela desde tu pantalla de inicio, el Dock o el menú de aplicaciones.</Alert>
        ) : canPrompt ? (
          <Button size="xl" icon={<Download className="h-6 w-6" />} onClick={prompt}>Instalar app</Button>
        ) : null}
      </div>

      <div className="mb-4 flex justify-center">
        <Segmented value={tab} onChange={(v) => setTab(v as Tab)} options={[
          { id: 'iphone', label: 'iPhone' }, { id: 'android', label: 'Android' }, { id: 'windows', label: 'Windows' }, { id: 'mac', label: 'Mac' },
        ]} />
      </div>
      <Card>
        <h2 className="text-xl font-bold">{s.title}</h2>
        <p className="mb-4 text-base text-fg-muted">{s.browser}</p>
        <ol className="space-y-4">
          {s.steps.map((st, i) => (
            <li key={i} className="flex gap-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-lg font-bold text-primary-fg">{i + 1}</span>
              <p className="flex-1 pt-1.5 text-lg">{st.icon && <st.icon className="mr-1 inline h-5 w-5 align-text-bottom text-primary" aria-hidden />}{st.text}</p>
            </li>
          ))}
        </ol>
      </Card>

      <Card className="mt-6">
        <h2 className="mb-1 text-lg font-bold">Comparte estas instrucciones</h2>
        <p className="mb-3 text-base text-fg-muted">Mándalas por WhatsApp a las familias o al personal.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={copied ? <CheckCircle2 className="h-5 w-5" /> : undefined}
            onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); } catch { /* sin permiso */ } }}>
            {copied ? 'Link copiado' : 'Copiar link'}
          </Button>
          <a className="inline-flex h-control items-center rounded-md bg-success-600 px-4 text-base font-semibold text-white hover:bg-success-700"
            href={`https://wa.me/?text=${encodeURIComponent('Instala la app de Oberlicht: ' + link)}`} target="_blank" rel="noreferrer">Enviar por WhatsApp</a>
        </div>
      </Card>

      <Card className="mt-6">
        <h2 className="mb-3 text-lg font-bold">Modo día o noche</h2>
        <ThemePicker />
        <p className="mt-2 text-sm text-fg-muted">«Automático» cambia solo según la configuración de tu dispositivo.</p>
      </Card>

      <div className="mt-8 text-center"><Button variant="ghost" onClick={() => nav('/')}>Ir a la plataforma</Button></div>
    </div>
  );
}
