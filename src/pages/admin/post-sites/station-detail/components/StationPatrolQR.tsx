import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, QrCode, Download, Printer, MapPin, ShieldCheck, AlertTriangle, Crosshair } from 'lucide-react';
import { ApiService, ApiError } from '@/services/api/apiService';
import { toast } from 'sonner';
import { Section, EmptyState, SkeletonCards, Stagger, StatusBadge } from '@/components/kit';
import { Button } from '@/components/ui/button';
import type { Station } from '@/types';
import { qrDataUrl, qrDataUrls, descargarQr } from '@/lib/qr';

interface StationDetail extends Station {
  latitude?: number | string | null;
  longitude?: number | string | null;
  geofenceRadius?: number | string | null;
}

type Props = { station: StationDetail; stationId: string; postSiteId: string };

interface Checkpoint {
  id: string;
  siteTourId: string;
  name: string;
  tagIdentifier: string;
  tagType: string;
  tourName: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
}

// Raw site-tour + tag rows from the API (read via several aliases).
interface RawTourRow { id?: string; _id?: string; name?: string; tourName?: string; siteTourName?: string }
interface RawTagRow {
  id?: string; _id?: string;
  name?: string; tagName?: string; tagIdentifier?: string;
  tagType?: string; type?: string;
  location?: string; locationDescription?: string;
  latitude?: number | string | null; latitud?: number | string | null;
  longitude?: number | string | null; longitud?: number | string | null;
}

/* El QR se genera EN EL NAVEGADOR (`@/lib/qr`). Antes se pedía a
   `api.qrserver.com`: el identificador de cada punto de control de cada
   instalación vigilada viajaba a un servicio ajeno en la cadena de consulta —y
   es justo el dato con el que se fabrica el QR—, la hoja no se podía imprimir
   sin conexión, y cuando la imagen no cargaba en 5 s se imprimía la hoja CON
   LOS RECUADROS EN BLANCO. */

function num(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) && (n !== 0 || v === 0) ? n : null;
}

export default function StationPatrolQR({ station, stationId }: Props) {
  const { t } = useTranslation();
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settingLoc, setSettingLoc] = useState<string | null>(null);
  /** Los QR ya generados, por punto. Se generan aquí, no se piden fuera. */
  const [qrs, setQrs] = useState<Record<string, string>>({});
  const [printing, setPrinting] = useState(false);

  const tenantId = (station?.tenantId || localStorage.getItem('tenantId') || '') as string;
  const stationRadius = num(station?.geofenceRadius) ?? 75;
  const stationLat = num(station?.latitud ?? station?.latitude);
  const stationLng = num(station?.longitud ?? station?.longitude);

  const load = useCallback(async () => {
    if (!stationId) return;
    setLoading(true);
    setError(null);
    try {
      const ts = Date.now();
      const toursRes: any = await ApiService.get(
        `/tenant/${tenantId}/site-tour?stationId=${encodeURIComponent(stationId)}&limit=999&_=${ts}`,
      );
      const tourRows: RawTourRow[] = Array.isArray(toursRes) ? toursRes : (toursRes?.rows ?? []);

      const collected: Checkpoint[] = [];
      for (const tr of tourRows) {
        const tid = tr.id || tr._id;
        if (!tid) continue;
        const tourName = tr.name || tr.tourName || tr.siteTourName || '';
        try {
          const tagsRes: any = await ApiService.get(
            `/tenant/${tenantId}/site-tour/${encodeURIComponent(tid)}/tags?_=${ts}`,
          );
          const rows = Array.isArray(tagsRes) ? tagsRes : (tagsRes?.rows ?? []);
          rows.forEach((tag: RawTagRow) => {
            collected.push({
              id: String(tag.id || tag._id),
              siteTourId: tid,
              name: tag.name || tag.tagName || tag.tagIdentifier || '—',
              tagIdentifier: tag.tagIdentifier || String(tag.id),
              tagType: (tag.tagType || tag.type || 'qr').toLowerCase(),
              tourName,
              location: tag.location || tag.locationDescription || '',
              latitude: num(tag.latitude ?? tag.latitud),
              longitude: num(tag.longitude ?? tag.longitud),
            });
          });
        } catch { /* skip tour on error */ }
      }
      // de-dup by id
      const seen = new Map<string, Checkpoint>();
      collected.forEach((c) => { if (!seen.has(c.id)) seen.set(c.id, c); });
      setCheckpoints(Array.from(seen.values()));
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 404) setCheckpoints([]);
      else setError(e?.message || t('station.patrolQr.loadError', 'Error al cargar los puntos de control'));
    } finally {
      setLoading(false);
    }
  }, [stationId, tenantId, t]);

  useEffect(() => { load(); }, [load]);

  // ── Tinta sobre PAPEL ──────────────────────────────────────────────────────
  // El PNG que se descarga y la hoja que se imprime salen del CRM y viven fuera
  // de él: se pegan en una pared. No pueden usar los tokens del tema (en modo
  // oscuro imprimirían un rectángulo negro), y el QR necesita fondo blanco puro
  // para que el lector lo reconozca. Por eso, y sólo aquí, el color es fijo.
  const PAPEL = 'white';
  const TINTA = 'black';
  const TINTA_TENUE = 'gray';
  const FILO_PAPEL = 'gainsboro';

  // Download a labeled PNG (QR + checkpoint name + identifier) via canvas.
  const downloadQr = async (cp: Checkpoint) => {
    try {
      const img = new Image();
      img.src = await qrDataUrl(cp.tagIdentifier, { size: 600 });
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
      const pad = 40, qr = 560, w = qr + pad * 2, h = qr + pad * 2 + 90;
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = PAPEL;
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, pad, pad, qr, qr);
      ctx.fillStyle = TINTA;
      ctx.textAlign = 'center';
      ctx.font = 'bold 30px sans-serif';
      ctx.fillText(cp.name.slice(0, 32), w / 2, qr + pad + 48);
      ctx.fillStyle = TINTA_TENUE;
      ctx.font = '20px monospace';
      ctx.fillText(cp.tagIdentifier.slice(0, 40), w / 2, qr + pad + 80);
      const link = document.createElement('a');
      link.download = `QR-${cp.name.replace(/[^\w-]+/g, '_')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch {
      // Si el lienzo falla, al menos que se lleve el QR pelado.
      try { descargarQr(await qrDataUrl(cp.tagIdentifier, { size: 600 }), `QR-${cp.name}`); }
      catch { toast.error(t('station.patrolQr.qrFailed', 'No se pudo generar el código')); }
    }
  };

  /**
   * HOJA IMPRIMIBLE DE TODA LA ESTACIÓN.
   *
   * Los QR van EMBEBIDOS como data URI: la ventana de impresión no depende de
   * ninguna descarga, así que imprime al instante y sin conexión. La versión
   * anterior pedía cada imagen a un servidor externo y, si no llegaba en 5 s,
   * imprimía la hoja con los recuadros EN BLANCO — y alguien las pegaba.
   *
   * Cada etiqueta lleva lo que hace falta para instalarla y para rescatarla:
   * el nombre del punto (para saber DÓNDE va antes de pegarla), la estación, el
   * código en texto (para teclearlo cuando la etiqueta se raye) y una marca de
   * corte. La instrucción de plastificar no es decoración: sin ella estas
   * etiquetas duran una temporada de lluvia.
   */
  const printQrs = async (list: Checkpoint[]) => {
    if (!list.length) return;
    setPrinting(true);
    try {
      const imagenes = await qrDataUrls(list.map((c) => c.tagIdentifier), { size: 480 });
      const w = window.open('', '_blank', 'width=900,height=1200');
      if (!w) { toast.error(t('station.patrolQr.popupBlocked', 'El navegador bloqueó la ventana de impresión.')); return; }

      // Nombre del punto, estación y código son texto del usuario: se escapan
      // antes de inyectarlos, o un valor como `<img onerror=...>` correría.
      const esc = (val: unknown): string =>
        String(val ?? '')
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

      const rotulo = esc(station?.nickname || station?.stationName || '');
      const cards = list.map((cp, i) => {
        const img = imagenes[i];
        const cuerpo = img
          ? `<img src="${img}" style="width:230px;height:230px;display:block;margin:0 auto;" />`
          : `<div style="width:230px;height:230px;margin:0 auto;display:grid;place-items:center;border:1px dashed #999;font:12px sans-serif;color:#999;">
               No se pudo generar<br/>este código
             </div>`;
        return `
        <div class="etiqueta">
          ${cuerpo}
          <div class="nombre">${esc(cp.name)}</div>
          ${cp.location ? `<div class="lugar">${esc(cp.location)}</div>` : ''}
          <div class="codigo">${esc(cp.tagIdentifier)}</div>
          <div class="pie">${rotulo}${cp.tourName ? ` · ${esc(cp.tourName)}` : ''}</div>
        </div>`;
      }).join('');

      w.document.write(`<!doctype html><html><head><meta charset="utf-8">
        <title>QR de rondas — ${rotulo}</title>
        <style>
          @page { margin: 12mm; }
          body { font-family: system-ui, sans-serif; margin: 0; color: #000; background: #fff; }
          h1 { font-size: 15px; margin: 0 0 2px; }
          .sub { font-size: 11px; color: #555; margin: 0 0 14px; }
          .aviso { font-size: 10.5px; color: #555; border: 1px solid #ddd; border-radius: 6px;
                   padding: 7px 10px; margin: 0 0 16px; }
          .rejilla { display: flex; flex-wrap: wrap; gap: 0; }
          .etiqueta { width: 268px; padding: 12px; margin: 0; text-align: center;
                      border: 1px dashed #bbb; page-break-inside: avoid; break-inside: avoid; }
          .nombre { font-size: 15px; font-weight: 700; margin-top: 8px; word-break: break-word; }
          .lugar  { font-size: 11px; color: #444; margin-top: 2px; word-break: break-word; }
          .codigo { font: 10px ui-monospace, monospace; color: #666; margin-top: 6px; word-break: break-all; }
          .pie    { font-size: 10px; color: #888; margin-top: 4px; }
          @media print { .aviso { border-color: #bbb; } }
        </style></head><body>
        <h1>Puntos de control — ${rotulo}</h1>
        <p class="sub">${list.length} etiqueta(s) · impreso ${esc(new Date().toLocaleDateString())}</p>
        <p class="aviso">
          Corta por la línea de puntos y <strong>plastifica cada etiqueta</strong> antes de
          pegarla: van a la intemperie y sin proteger no aguantan una temporada de lluvia.
          Pega cada una en el sitio que dice su nombre. El código de abajo sirve para
          teclearlo a mano si la etiqueta se raya y el lector no la reconoce.
        </p>
        <div class="rejilla">${cards}</div>
        <script>window.focus();window.print();<\/script>
        </body></html>`);
      w.document.close();
    } catch (e: any) {
      toast.error(e?.message || t('station.patrolQr.printFailed', 'No se pudo preparar la hoja'));
    } finally {
      setPrinting(false);
    }
  };

  /* Generar los QR en cuanto se conocen los puntos. Va en un efecto y no al
     pintar porque la generación es asíncrona; mientras tanto la tarjeta enseña
     un girador en el hueco del código, que es más honesto que un recuadro vacío. */
  useEffect(() => {
    let vivo = true;
    if (!checkpoints.length) { setQrs({}); return; }
    (async () => {
      const imgs = await qrDataUrls(checkpoints.map((c) => c.tagIdentifier), { size: 320 });
      if (!vivo) return;
      const mapa: Record<string, string> = {};
      checkpoints.forEach((c, i) => { const u = imgs[i]; if (u) mapa[c.id] = u; });
      setQrs(mapa);
    })();
    return () => { vivo = false; };
  }, [checkpoints]);

  // One-click: set a checkpoint's coordinates to the station's, so location
  // verification works. (Most checkpoints sit at/near the post.)
  const useStationLocation = async (cp: Checkpoint) => {
    if (stationLat == null || stationLng == null) {
      toast.error(t('station.patrolQr.stationNoCoords', 'El puesto no tiene coordenadas configuradas.'));
      return;
    }
    setSettingLoc(cp.id);
    try {
      await ApiService.put(
        `/tenant/${tenantId}/site-tour/${encodeURIComponent(cp.siteTourId)}/tag/${encodeURIComponent(cp.id)}`,
        { data: { latitude: stationLat, longitude: stationLng } },
      );
      toast.success(t('station.patrolQr.locationSet', 'Ubicación del punto actualizada'));
      setCheckpoints((cs) => cs.map((c) => c.id === cp.id ? { ...c, latitude: stationLat, longitude: stationLng } : c));
    } catch (e: any) {
      toast.error(e?.message || t('station.patrolQr.locationSetFailed', 'No se pudo actualizar la ubicación'));
    } finally {
      setSettingLoc(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header + how-it-works banner */}
      <Section
        icon={<QrCode />}
        title={
          <span>
            {t('station.patrolQr.title', 'Generar Códigos QR de Rondas')}
            {!loading && checkpoints.length > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">({checkpoints.length})</span>
            )}
          </span>
        }
        action={
          checkpoints.length > 0 ? (
            <Button variant="brand" size="sm" onClick={() => printQrs(checkpoints)} disabled={printing} className="gap-2">
              {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              {t('station.patrolQr.printAll', 'Imprimir todos')}
            </Button>
          ) : undefined
        }
      >
        <p className="-mt-2 text-sm" style={{ color: 'var(--ink-soft)' }}>
          {t('station.patrolQr.subtitle', 'Imprime y coloca estos QR en cada punto de control. El vigilante los escanea durante la ronda.')}
        </p>

        <div className="mt-4 flex items-start gap-2 rounded-md p-3 text-sm" style={{ background: 'color-mix(in oklab, var(--ok) 10%, transparent)', color: 'var(--ok-text)' }}>
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {t('station.patrolQr.verifyNote', 'Verificación de ubicación: al escanear, el servidor compara el GPS del vigilante con la ubicación del punto. Solo cuenta como válido si está dentro de')}{' '}
            <strong>{stationRadius} m</strong>. {t('station.patrolQr.verifyNote2', 'Los escaneos fuera de rango quedan registrados como "fuera de ubicación".')}
          </p>
        </div>
      </Section>

      {loading ? (
        <SkeletonCards count={6} className="sm:grid-cols-2 xl:grid-cols-3" />
      ) : error ? (
        <div className="glass p-6 text-sm" style={{ color: 'var(--bad-text)' }}>{error}</div>
      ) : checkpoints.length === 0 ? (
        <EmptyState
          icon={<QrCode />}
          title={t('station.patrolQr.empty', 'Aún no hay puntos de control. Créalos en la sección "Rondas de Seguridad" y vuelve aquí para generar sus QR.')}
        />
      ) : (
        <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {checkpoints.map((cp) => {
            const hasCoords = cp.latitude != null && cp.longitude != null;
            return (
              <div key={cp.id} className="glass-flat glass-hover flex flex-col overflow-hidden">
                {/* El QR necesita fondo blanco puro: es lo que el lector del
                    teléfono espera, en claro y en oscuro por igual. */}
                <div className="flex items-center justify-center p-4" style={{ background: PAPEL }}>
                  {qrs[cp.id]
                    ? <img src={qrs[cp.id]!} alt={cp.name} className="h-44 w-44" />
                    : <div className="grid h-44 w-44 place-items-center"><Loader2 className="animate-spin" size={20} /></div>}
                </div>
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <div>
                    <div className="font-semibold">{cp.name}</div>
                    <div className="font-mono text-xs" style={{ color: 'var(--ink-soft)' }}>{cp.tagIdentifier}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <StatusBadge tone="brand" dot={false} className="uppercase">{cp.tagType}</StatusBadge>
                    {cp.tourName ? <span style={{ color: 'var(--ink-soft)' }}>{cp.tourName}</span> : null}
                  </div>

                  {hasCoords ? (
                    <div className="inline-flex items-center gap-1.5 text-xs" style={{ color: 'var(--ok-text)' }}>
                      <MapPin className="h-3.5 w-3.5" />
                      {cp.latitude!.toFixed(5)}, {cp.longitude!.toFixed(5)}
                      <span style={{ color: 'var(--ink-soft)' }}>· ±{stationRadius}m</span>
                    </div>
                  ) : (
                    <div
                      className="flex flex-col gap-1.5 rounded-md p-2 text-xs"
                      style={{ background: 'color-mix(in oklab, var(--warn) 12%, transparent)', color: 'var(--warn-text)' }}
                    >
                      <span className="inline-flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" />{t('station.patrolQr.noCoords', 'Sin ubicación — la verificación no funcionará.')}</span>
                      {stationLat != null && stationLng != null && (
                        <button
                          onClick={() => useStationLocation(cp)}
                          disabled={settingLoc === cp.id}
                          className="cg-btn-glass cg-focus inline-flex w-fit items-center gap-1.5 rounded px-2 py-1 font-medium disabled:opacity-50"
                        >
                          {settingLoc === cp.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Crosshair className="h-3 w-3" />}
                          {t('station.patrolQr.useStationLocation', 'Usar ubicación del puesto')}
                        </button>
                      )}
                    </div>
                  )}

                  <div className="mt-auto flex gap-2 pt-2">
                    <button onClick={() => downloadQr(cp)} className="cg-btn-glass cg-focus inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm">
                      <Download className="h-4 w-4" /> {t('common.download', 'Descargar')}
                    </button>
                    <button onClick={() => printQrs([cp])} className="cg-btn-glass cg-focus inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm">
                      <Printer className="h-4 w-4" /> {t('common.print', 'Imprimir')}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </Stagger>
      )}
    </div>
  );
}
