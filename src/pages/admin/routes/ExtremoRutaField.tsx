import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/kit';
import { Home, Flag, X, MapPin, Pencil } from 'lucide-react';
import AddressAutocomplete, { type AddressComponents } from '@/components/maps/AddressAutocomplete';
import type { ExtremoRuta } from './routeOptimizacion';

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ORIGEN Y DESTINO — los dos extremos OPCIONALES del recorrido
 *
 * Un supervisor no siempre sale de la base ni vuelve a ella: a veces arranca en
 * su casa y termina donde le pilla el relevo. Por eso los dos extremos son
 * opcionales por contrato, y por eso lo IMPORTANTE de esta pieza no es el campo
 * sino la frase de cuando está vacío: «la ruta empieza en la primera parada».
 * Sin decirlo, un campo vacío parece un dato que falta y alguien lo rellena por
 * si acaso.
 *
 * ── UN MAPA CADA VEZ ────────────────────────────────────────────────────────
 * El buscador de direcciones monta su propio mapa, y cada mapa es una carga
 * facturable. Por eso vive dentro de un modal: origen y destino no pueden estar
 * abiertos a la vez, y ninguno de los dos existe hasta que alguien lo pide.
 * ════════════════════════════════════════════════════════════════════════════
 */

interface Props {
  clase: 'origen' | 'destino';
  valor: ExtremoRuta | null;
  onChange: (v: ExtremoRuta | null) => void;
  /** Sólo lectura — en la ficha de consulta no se edita. */
  soloLectura?: boolean;
}

/* Constante de módulo: se evalúa al IMPORTAR el fichero, antes de que i18next
   sepa el idioma. Por eso guarda la CLAVE junto al español, y la traducción
   ocurre abajo, dentro del componente. */
const COPIA = {
  origen: {
    titulo: 'Origen',
    tituloKey: 'ui.ExtremoRutaField.origen.titulo',
    icono: <Home />,
    vacio: 'Sin origen definido: la ruta empieza en la primera parada.',
    vacioKey: 'ui.ExtremoRutaField.origen.vacio',
    accion: 'Definir origen',
    accionKey: 'ui.ExtremoRutaField.origen.accion',
    modal: 'Origen del recorrido',
    modalKey: 'ui.ExtremoRutaField.origen.modal',
    ayuda: 'Desde dónde arranca el supervisor. Si lo dejas vacío, la ruta empieza en la primera parada.',
    ayudaKey: 'ui.ExtremoRutaField.origen.ayuda',
  },
  destino: {
    titulo: 'Destino',
    tituloKey: 'ui.ExtremoRutaField.destino.titulo',
    icono: <Flag />,
    vacio: 'Sin destino definido: la ruta termina en la última parada.',
    vacioKey: 'ui.ExtremoRutaField.destino.vacio',
    accion: 'Definir destino',
    accionKey: 'ui.ExtremoRutaField.destino.accion',
    modal: 'Destino del recorrido',
    modalKey: 'ui.ExtremoRutaField.destino.modal',
    ayuda: 'Dónde termina el recorrido. Si lo dejas vacío, la ruta termina en la última parada.',
    ayudaKey: 'ui.ExtremoRutaField.destino.ayuda',
  },
} as const;

export default function ExtremoRutaField({ clase, valor, onChange, soloLectura = false }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [borrador, setBorrador] = useState<ExtremoRuta | null>(null);
  const { t } = useTranslation();
  const c = COPIA[clase];
  const titulo = t(c.tituloKey, c.titulo);

  const abrir = () => {
    setBorrador(valor);
    setAbierto(true);
  };

  const recoger = (a: AddressComponents) => {
    if (!Number.isFinite(a.latitude) || !Number.isFinite(a.longitude)) return;
    setBorrador({
      lat: a.latitude,
      lng: a.longitude,
      label: (a.address || '').trim() || `${a.latitude.toFixed(5)}, ${a.longitude.toFixed(5)}`,
    });
  };

  const confirmar = () => {
    if (borrador) onChange(borrador);
    setAbierto(false);
  };

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="[&_svg]:size-4" style={{ color: 'var(--brand-text)' }}>
          {c.icono}
        </span>
        <span className="text-sm font-semibold">{titulo}</span>
        <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>
          Opcional
        </span>
      </div>

      {valor ? (
        <div
          className="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3"
          style={{ borderColor: 'var(--hairline)', background: 'var(--glass-sunken)' }}
        >
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-foreground">{valor.label}</div>
            <div className="mt-0.5 text-xs tabular-nums" style={{ color: 'var(--ink-faint)' }}>
              {valor.lat.toFixed(5)}, {valor.lng.toFixed(5)}
            </div>
          </div>
          {!soloLectura && (
            <div className="flex shrink-0 items-center gap-2">
              <Button type="button" variant="outline" size="lg" onClick={abrir}>
                <Pencil className="size-4" /> Cambiar
              </Button>
              <Button
                type="button"
                variant="danger-ghost"
                size="lg"
                onClick={() => onChange(null)}
                aria-label={`Quitar ${titulo.toLowerCase()}`}
              >
                <X className="size-4" /> Quitar
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div
          className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed px-4 py-3"
          style={{ borderColor: 'var(--hairline)' }}
        >
          <p className="min-w-0 flex-1 text-sm" style={{ color: 'var(--ink-soft)' }}>
            {t(c.vacioKey, c.vacio)}
          </p>
          {!soloLectura && (
            <Button type="button" variant="outline" size="lg" onClick={abrir}>
              <MapPin className="size-4" /> {t(c.accionKey, c.accion)}
            </Button>
          )}
        </div>
      )}

      <Modal
        open={abierto}
        onOpenChange={setAbierto}
        size="lg"
        icon={c.icono}
        title={t(c.modalKey, c.modal)}
        description={t(c.ayudaKey, c.ayuda)}
        footer={
          <div className="flex w-full flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" size="lg" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button type="button" variant="brand" size="lg" disabled={!borrador} onClick={confirmar}>
              {t('ui.ExtremoRutaField.usarEstaUbicacion', 'Usar esta ubicación')}
            </Button>
          </div>
        }
      >
        {/* Sólo se monta cuando el modal está abierto: un mapa que nadie ve
            sigue siendo un mapa facturado. */}
        {abierto && (
          <div className="space-y-3">
            <AddressAutocomplete
              onAddressSelect={recoger}
              onGeocodeResult={recoger}
              defaultValue={valor?.label || ''}
              initialLat={valor?.lat}
              initialLng={valor?.lng}
              placeholder={clase === 'origen' ? 'Buscar el punto de partida…' : 'Buscar el punto final…'}
              mapHeight="280px"
            />
            {borrador && (
              <p className="text-xs tabular-nums" style={{ color: 'var(--ink-soft)' }}>
                Se guardará: {borrador.label} ({borrador.lat.toFixed(5)}, {borrador.lng.toFixed(5)})
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
