import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Car } from 'lucide-react';
import { visitorLogService } from '@/lib/api/visitorLogService';
import { Section, EmptyState, SkeletonCards, FadeIn, StatusBadge } from '@/components/kit';
import type { Station } from '@/types';

type Props = { station: Station; stationId: string; postSiteId: string };

/**
 * ════════════════════════════════════════════════════════════════════════════
 * CONTROL VEHICULAR DEL PUESTO — entra, se estaciona, sale.
 *
 * Un vehículo NO es una tabla aparte: es una visita del `visitorLog` que trae
 * placa. El vigilante la registra desde la app (modo «Vehículo», donde la placa
 * es la identidad) y marca la salida desde la misma ficha; aquí se ve el
 * resultado. Un vehículo sin `exitTime` sigue DENTRO.
 *
 * ── POR QUÉ ESTA PANTALLA NO SERVÍA ────────────────────────────────────────
 * Dos fallos que se tapaban entre sí:
 *
 * 1. Buscaba las filas probando cinco escrituras posibles del tipo de lugar
 *    («Parking», «Parqueadero», «Estacionamiento», «Vehículo», «Vehiculo») y,
 *    si ninguna devolvía nada, se traía TODAS las visitas del puesto. La app
 *    escribe `placeType: "vehiculo"`, así que la lista acababa enseñando
 *    también a las personas que llegaron a pie: por eso no se entendía qué era
 *    esta sección.
 * 2. La primera columna pintaba nombre y apellido. En una visita en modo
 *    vehículo el nombre es el del conductor —o el literal «Vehículo» cuando no
 *    se anota— así que LA PLACA, que es el único dato que identifica al coche,
 *    no aparecía por ningún lado.
 *
 * Ahora la regla es la del dato, no la de una cadena de texto: es un vehículo
 * si tiene placa. Y la placa manda en la primera columna.
 * ════════════════════════════════════════════════════════════════════════════
 */

interface ParkGuardRef { firstName?: string; first_name?: string; lastName?: string; last_name?: string; name?: string; fullName?: string }
interface ParkingRow {
  id?: string;
  firstName?: string; first_name?: string;
  lastName?: string; last_name?: string;
  name?: string; visitorName?: string;
  company?: string;
  placeType?: string; place_type?: string;
  vehiclePlate?: string; vehicle_plate?: string;
  vehicleType?: string; vehicle_type?: string;
  vehicleColor?: string; vehicleMakeModel?: string;
  parkingLocation?: string;
  tagNumber?: string;
  visitDate?: string | null; entryTime?: string | null; createdAt?: string | null;
  exitTime?: string | null; exit_time?: string | null;
  guard?: ParkGuardRef | null; securityGuard?: ParkGuardRef | null; guardName?: string;
}

/** Los tipos que manda la app del vigilante, traducidos a algo legible. */
const TIPO: Record<string, string> = {
  car: 'Automóvil', motorcycle: 'Motocicleta', van: 'Furgoneta',
  truck: 'Camión', other: 'Otro',
};

function formatDate(val: string | null | undefined) {
  if (!val) return '—';
  try { return new Date(val).toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'short' }); }
  catch { return val; }
}

/** Cuánto lleva dentro, en un formato que se lee de un vistazo. */
function permanencia(entrada: string | null | undefined, salida: string | null | undefined): string {
  if (!entrada) return '—';
  const ini = new Date(entrada).getTime();
  const fin = salida ? new Date(salida).getTime() : Date.now();
  if (!Number.isFinite(ini) || !Number.isFinite(fin) || fin < ini) return '—';
  const min = Math.round((fin - ini) / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return min % 60 === 0 ? `${h} h` : `${h} h ${min % 60} min`;
}

export default function StationParking({ stationId }: Props) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ParkingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [soloDentro, setSoloDentro] = useState(false);

  useEffect(() => {
    if (!stationId) return;
    let mounted = true;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        // Se piden las visitas del puesto y se filtra por el DATO (¿trae placa?)
        // en vez de adivinar cómo se escribió el tipo de lugar.
        const res: any = await visitorLogService.list(
          { stationId } as any,
          { limit: 200, offset: 0 },
        );
        const list: ParkingRow[] = Array.isArray(res) ? res : (res?.rows ?? []);
        if (mounted) setRows(list);
      } catch (e: any) {
        if (mounted) setError(e?.message || t('station.parking.loadError', 'Error al cargar registros'));
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [stationId, t]);

  const vehiculos = useMemo(() => {
    const conPlaca = rows.filter(r => String(r.vehiclePlate || r.vehicle_plate || '').trim());
    // Más reciente primero: lo que acaba de entrar es lo que se está mirando.
    return conPlaca.sort((a, b) => {
      const fa = new Date(a.visitDate || a.entryTime || a.createdAt || 0).getTime();
      const fb = new Date(b.visitDate || b.entryTime || b.createdAt || 0).getTime();
      return fb - fa;
    });
  }, [rows]);

  const dentro = useMemo(() => vehiculos.filter(r => !(r.exitTime || r.exit_time)), [vehiculos]);
  const visibles = soloDentro ? dentro : vehiculos;

  return (
    <Section
      icon={<Car />}
      title={
        <span>
          {t('station.parking.title', 'Control vehicular')}
          {!loading && vehiculos.length > 0 && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">({vehiculos.length})</span>
          )}
        </span>
      }
      action={
        !loading && vehiculos.length > 0 ? (
          <button
            type="button"
            onClick={() => setSoloDentro(v => !v)}
            aria-pressed={soloDentro}
            className="cg-focus min-h-9 shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all"
            style={soloDentro
              ? { background: 'var(--brand)', color: 'var(--brand-ink)' }
              : { background: 'var(--glass-sunken)', color: 'var(--ink-soft)' }}
          >
            {t('station.parking.onlyInside', 'Sólo los que están dentro')} ({dentro.length})
          </button>
        ) : undefined
      }
      contentClassName="-mx-5 -mb-5"
    >
      <p className="px-5 -mt-2 mb-3 text-xs text-muted-foreground">
        {t('station.parking.subtitle', 'Entrada y salida de vehículos en este puesto. El vigilante los registra desde la app y marca la salida cuando se van.')}
      </p>

      {loading ? (
        <div className="px-5 pb-5"><SkeletonCards count={4} /></div>
      ) : error ? (
        <div className="px-5 pb-5 text-sm" style={{ color: 'var(--bad-text)' }}>{error}</div>
      ) : visibles.length === 0 ? (
        <div className="px-5 pb-5">
          <EmptyState
            icon={<Car />}
            title={soloDentro
              ? t('station.parking.emptyInside', 'Ahora mismo no hay vehículos dentro.')
              : t('station.parking.empty', 'Todavía no se ha registrado ningún vehículo en este puesto.')}
            description={soloDentro
              ? undefined
              : t('station.parking.emptyHint', 'El vigilante los registra desde la app, en Visitas › Vehículo.')}
          />
        </div>
      ) : (
        <FadeIn className="overflow-x-auto">
          <table className="min-w-[880px] text-sm">
            <thead className="bg-muted/30 border-b">
              <tr>
                <th className="cg-eyebrow px-2 py-2 text-left">{t('station.parking.col.plate', 'Placa')}</th>
                <th className="cg-eyebrow px-2 py-2 text-left">{t('station.parking.col.vehicle', 'Vehículo')}</th>
                <th className="cg-eyebrow px-2 py-2 text-left">{t('station.parking.col.driver', 'Conductor / empresa')}</th>
                <th className="cg-eyebrow px-2 py-2 text-left">{t('station.parking.col.entry', 'Entrada')}</th>
                <th className="cg-eyebrow px-2 py-2 text-left">{t('station.parking.col.exit', 'Salida')}</th>
                <th className="cg-eyebrow px-2 py-2 text-left">{t('station.parking.col.stay', 'Permanencia')}</th>
                <th className="cg-eyebrow px-2 py-2 text-left">{t('station.parking.col.guard', 'Vigilante')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {visibles.map((r: ParkingRow, i: number) => {
                const placa = String(r.vehiclePlate || r.vehicle_plate || '').trim().toUpperCase();
                const tipoBruto = String(r.vehicleType || r.vehicle_type || '').trim();
                const tipo = TIPO[tipoBruto.toLowerCase()] || tipoBruto || '—';
                const detalle = [r.vehicleMakeModel, r.vehicleColor].filter(Boolean).join(' · ');
                const firstName = r.firstName || r.first_name || '';
                const lastName = r.lastName || r.last_name || '';
                const conductor = [firstName, lastName].filter(Boolean).join(' ') || r.name || r.visitorName || '—';
                const entradaISO = r.visitDate || r.entryTime || r.createdAt;
                const salidaISO = r.exitTime || r.exit_time;
                const guard = r.guard || r.securityGuard || {};
                const guardName = [guard.firstName || guard.first_name, guard.lastName || guard.last_name]
                  .filter(Boolean).join(' ') || guard.name || guard.fullName || r.guardName || '—';
                return (
                  <tr key={r.id || i} className="hover:bg-muted/40">
                    <td className="px-2 py-2.5">
                      <span className="font-mono text-sm font-bold tracking-wider" style={{ color: 'var(--ink)' }}>{placa}</span>
                      {r.parkingLocation && (
                        <span className="block text-[11px] text-muted-foreground">{r.parkingLocation}</span>
                      )}
                    </td>
                    <td className="px-2 py-2.5">
                      <span style={{ color: 'var(--ink)' }}>{tipo}</span>
                      {detalle && <span className="block text-[11px] text-muted-foreground">{detalle}</span>}
                    </td>
                    <td className="min-w-0 px-2 py-2.5">
                      <span className="block truncate" style={{ color: 'var(--ink)' }}>{conductor}</span>
                      {r.company && <span className="block truncate text-[11px] text-muted-foreground">{r.company}</span>}
                    </td>
                    <td className="px-2 py-2.5 tabular-nums" style={{ color: 'var(--ink)' }}>{formatDate(entradaISO)}</td>
                    <td className="px-2 py-2.5 tabular-nums">
                      {salidaISO
                        ? <span className="text-muted-foreground">{formatDate(salidaISO)}</span>
                        : <StatusBadge tone="ok">{t('station.parking.inside', 'Dentro')}</StatusBadge>}
                    </td>
                    <td className="px-2 py-2.5 tabular-nums text-muted-foreground">{permanencia(entradaISO, salidaISO)}</td>
                    <td className="min-w-0 px-2 py-2.5">
                      <span className="block truncate" style={{ color: 'var(--ink)' }}>{guardName}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </FadeIn>
      )}
    </Section>
  );
}
