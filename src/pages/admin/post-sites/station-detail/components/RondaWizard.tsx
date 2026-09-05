import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Loader2, Plus, Trash2, ArrowUp, ArrowDown, MapPin, Route, Printer, Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { ApiService } from '@/services/api/apiService';
import { Modal, FIELD_CLS, InfoNote } from '@/components/kit';
import { Button } from '@/components/ui/button';

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ASISTENTE PARA CREAR UNA RONDA COMPLETA
 *
 * Antes, montar una ronda de ocho puntos era esto: abrir un modal y escribir el
 * nombre; guardar; desplegar la ronda; pulsar «añadir punto»; escribir el
 * nombre del punto; guardar; repetir OCHO veces; y después ir a otra pestaña a
 * imprimir los códigos. Diecisiete idas y venidas para dar de alta un puesto.
 *
 * Así es como se hace en las plataformas grandes del sector, y por qué:
 *
 *  · **De una sentada.** Instalar un puesto es UNA tarea: se recorre el sitio
 *    una vez, se apunta dónde van los puntos y se da de alta todo junto. Partir
 *    eso en diecisiete pasos es lo que hace que la gente cree la ronda «para
 *    después» y se quede a medias — y una ronda sin puntos no avisa de nada.
 *
 *  · **Con plantillas.** Casi ninguna instalación es original: una bodega, un
 *    edificio y una urbanización tienen los mismos puntos con otros nombres.
 *    Empezar de una lista en blanco es lo que produce rondas de dos puntos.
 *    Las plantillas se EDITAN antes de crear; no son un molde cerrado.
 *
 *  · **Y termina en la impresora.** El punto de control no existe de verdad
 *    hasta que la etiqueta está pegada en la pared. Por eso el último paso
 *    ofrece imprimir: es el trabajo que queda, y separarlo en otra pestaña es
 *    lo que hace que se olvide.
 *
 * El CÓDIGO de cada punto no se pide ni se enseña aquí: lo emite el servidor.
 * Ver `backend/src/lib/checkpointCode.ts`.
 * ════════════════════════════════════════════════════════════════════════════
 */

export interface PuntoBorrador {
  /** Clave sólo de la lista en pantalla; no viaja al servidor. */
  key: string;
  nombre: string;
  lugar: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantId: string;
  stationId: string;
  postSiteId?: string;
  /** Coordenadas del puesto: los puntos nacen ahí y se afinan luego en el mapa. */
  stationLat: number | null;
  stationLng: number | null;
  stationRadius: number;
  /** Se llama al terminar; el segundo argumento es el id de la ronda creada. */
  onCreated: (tourId: string, puntosCreados: number) => void;
  /** Abrir la pestaña de códigos QR al terminar. */
  onPrint?: () => void;
}

/**
 * Plantillas. Los nombres son los que usa de verdad una empresa de guardianía
 * en español de la región, no traducciones de un manual.
 */
const PLANTILLAS: Array<{ id: string; nombre: string; descripcion: string; puntos: string[] }> = [
  {
    id: 'perimetral',
    nombre: 'Ronda perimetral',
    descripcion: 'El contorno de la instalación. La más común en bodegas y plantas.',
    puntos: ['Acceso principal', 'Perímetro norte', 'Perímetro sur', 'Perímetro posterior', 'Estacionamiento', 'Salida de emergencia'],
  },
  {
    id: 'interna',
    nombre: 'Ronda interna',
    descripcion: 'Recorrido por dentro del edificio, planta por planta.',
    puntos: ['Recepción', 'Pasillo central', 'Bodega', 'Cuarto eléctrico', 'Cuarto de máquinas', 'Azotea'],
  },
  {
    id: 'nocturna',
    nombre: 'Ronda nocturna',
    descripcion: 'Los puntos críticos, para repetir varias veces en la madrugada.',
    puntos: ['Acceso principal', 'Perímetro', 'Bodega', 'Cuarto eléctrico', 'Estacionamiento'],
  },
  {
    id: 'residencial',
    nombre: 'Ronda residencial',
    descripcion: 'Urbanización o conjunto: garita, áreas comunes y accesos.',
    puntos: ['Garita', 'Portón vehicular', 'Área social', 'Piscina', 'Juegos infantiles', 'Portón peatonal'],
  },
];

let contador = 0;
const nuevaClave = () => `p${++contador}`;
const puntoVacio = (nombre = '', lugar = ''): PuntoBorrador => ({ key: nuevaClave(), nombre, lugar });

export default function RondaWizard({
  open, onOpenChange, tenantId, stationId, postSiteId,
  stationLat, stationLng, stationRadius, onCreated, onPrint,
}: Props) {
  const { t } = useTranslation();
  const [paso, setPaso] = useState<1 | 2 | 3>(1);
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [puntos, setPuntos] = useState<PuntoBorrador[]>([puntoVacio()]);
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<{ tourId: string; creados: number; fallidos: number } | null>(null);

  const validos = useMemo(() => puntos.filter((p) => p.nombre.trim()), [puntos]);
  const sinCoordenadas = stationLat == null || stationLng == null;

  const reiniciar = () => {
    setPaso(1); setNombre(''); setDescripcion('');
    setPuntos([puntoVacio()]); setResultado(null);
  };

  const cerrar = (v: boolean) => {
    if (!v && !guardando) reiniciar();
    onOpenChange(v);
  };

  const aplicarPlantilla = (id: string) => {
    const p = PLANTILLAS.find((x) => x.id === id);
    if (!p) return;
    if (!nombre.trim()) setNombre(p.nombre);
    setPuntos(p.puntos.map((n) => puntoVacio(n)));
    setPaso(2);
  };

  const cambiar = (key: string, campo: 'nombre' | 'lugar', valor: string) =>
    setPuntos((ps) => ps.map((p) => (p.key === key ? { ...p, [campo]: valor } : p)));

  const mover = (i: number, delta: number) =>
    setPuntos((ps) => {
      const j = i + delta;
      if (j < 0 || j >= ps.length) return ps;
      const copia = [...ps];
      [copia[i], copia[j]] = [copia[j], copia[i]];
      return copia;
    });

  /**
   * Crear. La ronda primero y los puntos DESPUÉS, en orden: si un punto falla,
   * la ronda ya existe y lo que se creó se conserva — se dice cuántos entraron
   * y cuántos no, y se pueden añadir los que falten a mano. Tirarlo todo por un
   * nombre repetido sería peor: se pierde el trabajo de rellenar la lista.
   */
  const crear = async () => {
    if (!nombre.trim()) { toast.error(t('ronda.wizard.nameRequired', 'Ponle un nombre a la ronda')); return; }
    if (!validos.length) { toast.error(t('ronda.wizard.pointsRequired', 'Añade al menos un punto de control')); return; }
    setGuardando(true);
    try {
      const tour: any = await ApiService.post(`/tenant/${tenantId}/site-tour`, {
        name: nombre.trim(),
        description: descripcion.trim() || undefined,
        stationId,
        postSiteId: postSiteId || undefined,
        active: true,
      });
      const tourId = String(tour?.id ?? tour?.data?.id ?? '');
      if (!tourId) throw new Error(t('ronda.wizard.noTourId', 'La ronda se creó pero el servidor no devolvió su id'));

      let creados = 0;
      let fallidos = 0;
      for (const p of validos) {
        try {
          // El identificador NO se manda: lo emite el servidor, opaco.
          await ApiService.post(`/tenant/${tenantId}/site-tour/${encodeURIComponent(tourId)}/tag`, {
            name: p.nombre.trim(),
            location: p.lugar.trim() || undefined,
            tagType: 'qr',
            stationId,
            latitude: stationLat,
            longitude: stationLng,
            geofenceRadius: stationRadius,
            showGeoFence: true,
          });
          creados++;
        } catch {
          fallidos++;
        }
      }
      setResultado({ tourId, creados, fallidos });
      setPaso(3);
      onCreated(tourId, creados);
    } catch (e: any) {
      toast.error(e?.message || t('ronda.wizard.failed', 'No se pudo crear la ronda'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={cerrar}
      size="lg"
      icon={<Route className="h-5 w-5" />}
      title={
        paso === 3
          ? t('ronda.wizard.doneTitle', 'Ronda creada')
          : t('ronda.wizard.title', 'Nueva ronda')
      }
      description={
        paso === 1 ? t('ronda.wizard.step1', 'Empieza de una plantilla o desde cero. Podrás cambiarlo todo antes de guardar.')
        : paso === 2 ? t('ronda.wizard.step2', 'Escribe los puntos que el vigilante debe recorrer, en orden.')
        : undefined
      }
      footer={
        paso === 3 ? (
          <div className="flex justify-end gap-2">
            {onPrint && (
              <Button variant="brand" onClick={() => { onPrint(); cerrar(false); }} className="gap-2">
                <Printer className="h-4 w-4" /> {t('ronda.wizard.printNow', 'Imprimir los QR')}
              </Button>
            )}
            <Button variant="ghost" onClick={() => cerrar(false)}>
              {t('common.close', 'Cerrar')}
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>
              {paso === 2 && t('ronda.wizard.count', '{{n}} punto(s)', { n: validos.length })}
            </span>
            <div className="flex gap-2">
              {paso === 2 && (
                <Button variant="ghost" onClick={() => setPaso(1)} disabled={guardando}>
                  {t('common.back', 'Atrás')}
                </Button>
              )}
              {paso === 1 ? (
                <Button variant="brand" onClick={() => setPaso(2)} disabled={!nombre.trim()}>
                  {t('common.next', 'Siguiente')}
                </Button>
              ) : (
                <Button variant="brand" onClick={crear} disabled={guardando || !validos.length} className="gap-2">
                  {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t('ronda.wizard.create', 'Crear ronda y sus puntos')}
                </Button>
              )}
            </div>
          </div>
        )
      }
    >
      {paso === 1 && (
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              {t('ronda.wizard.name', 'Nombre de la ronda')}
            </label>
            <input
              className={FIELD_CLS}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder={t('ronda.wizard.namePh', 'Ronda nocturna') as string}
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              {t('ronda.wizard.desc', 'Descripción')} <span style={{ color: 'var(--ink-faint)' }}>({t('common.optional', 'opcional')})</span>
            </label>
            <input
              className={FIELD_CLS}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder={t('ronda.wizard.descPh', 'Cada 2 horas, de 22:00 a 06:00') as string}
            />
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              {t('ronda.wizard.templates', 'Empezar de una plantilla')}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {PLANTILLAS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => aplicarPlantilla(p.id)}
                  className="cg-focus glass-flat rounded-xl p-3 text-left transition-colors hover:bg-[var(--glass-hover)]"
                >
                  <span className="block text-sm font-semibold" style={{ color: 'var(--ink)' }}>{p.nombre}</span>
                  <span className="mt-0.5 block text-xs" style={{ color: 'var(--ink-soft)' }}>{p.descripcion}</span>
                  <span className="mt-1.5 block text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                    {p.puntos.length} {t('ronda.wizard.points', 'puntos')} · {p.puntos.slice(0, 3).join(', ')}…
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {paso === 2 && (
        <div className="space-y-3">
          {sinCoordenadas && (
            <InfoNote tone="warn" title={t('ronda.wizard.noCoordsTitle', 'El puesto no tiene ubicación') as string}>
              {t('ronda.wizard.noCoords',
                'Los puntos se crearán sin coordenadas, así que no se podrá comprobar que el vigilante estaba ahí. Pon la ubicación del puesto y luego ajusta cada punto en el mapa.')}
            </InfoNote>
          )}

          <div className="space-y-2">
            {puntos.map((p, i) => (
              <div key={p.key} className="glass-flat flex items-start gap-2 rounded-xl p-2">
                <span
                  className="mt-2 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold"
                  style={{ background: 'var(--brand-wash)', color: 'var(--brand-text)' }}
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <input
                    className={FIELD_CLS}
                    value={p.nombre}
                    onChange={(e) => cambiar(p.key, 'nombre', e.target.value)}
                    placeholder={t('ronda.wizard.pointPh', 'Nombre del punto — p. ej. Acceso principal') as string}
                  />
                  <input
                    className={FIELD_CLS}
                    value={p.lugar}
                    onChange={(e) => cambiar(p.key, 'lugar', e.target.value)}
                    placeholder={t('ronda.wizard.wherePh', 'Dónde se pega la etiqueta (opcional) — p. ej. junto al torniquete') as string}
                  />
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <button
                    type="button" onClick={() => mover(i, -1)} disabled={i === 0}
                    aria-label={t('common.moveUp', 'Subir') as string}
                    className="cg-focus cg-btn-glass grid h-7 w-7 place-items-center rounded-md disabled:opacity-30"
                  ><ArrowUp className="h-3.5 w-3.5" /></button>
                  <button
                    type="button" onClick={() => mover(i, 1)} disabled={i === puntos.length - 1}
                    aria-label={t('common.moveDown', 'Bajar') as string}
                    className="cg-focus cg-btn-glass grid h-7 w-7 place-items-center rounded-md disabled:opacity-30"
                  ><ArrowDown className="h-3.5 w-3.5" /></button>
                  <button
                    type="button" onClick={() => setPuntos((ps) => ps.filter((x) => x.key !== p.key))}
                    disabled={puntos.length === 1}
                    aria-label={t('common.delete', 'Eliminar') as string}
                    className="cg-focus cg-btn-glass grid h-7 w-7 place-items-center rounded-md disabled:opacity-30"
                  ><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setPuntos((ps) => [...ps, puntoVacio()])}
            className="cg-focus cg-btn-glass inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold"
          >
            <Plus className="h-4 w-4" /> {t('ronda.wizard.addPoint', 'Añadir punto')}
          </button>

          <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
            <MapPin className="mr-1 inline h-3 w-3" />
            {t('ronda.wizard.locHint',
              'Todos nacen en la ubicación del puesto. Después puedes afinar cada uno en el mapa para que la comprobación de cercanía sea exacta.')}
          </p>
        </div>
      )}

      {paso === 3 && resultado && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--ok)' }}>
            <Check className="h-4 w-4" />
            {t('ronda.wizard.created', '«{{nombre}}» con {{n}} punto(s) de control', { nombre: nombre.trim(), n: resultado.creados })}
          </div>
          {resultado.fallidos > 0 && (
            <InfoNote tone="warn">
              {t('ronda.wizard.someFailed',
                'No se pudieron crear {{n}} punto(s). La ronda y el resto sí quedaron guardados: añade los que falten desde la lista.',
                { n: resultado.fallidos })}
            </InfoNote>
          )}
          <InfoNote tone="info" title={t('ronda.wizard.nextTitle', 'Lo que falta') as string}>
            {t('ronda.wizard.next',
              'Los puntos existen, pero un punto de control no sirve hasta que su etiqueta está pegada en la pared. Imprime los QR, plastifícalos y colócalos donde dice el nombre de cada uno.')}
          </InfoNote>
        </div>
      )}
    </Modal>
  );
}
