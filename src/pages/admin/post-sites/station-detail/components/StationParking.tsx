import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Car } from 'lucide-react';
import { visitorLogService } from '@/lib/api/visitorLogService';
import { Section, EmptyState, SkeletonCards, FadeIn } from '@/components/kit';
import type { Station } from '@/types';

type Props = { station: Station; stationId: string; postSiteId: string };

// A visitor-log row surfaced as a parking record. Fields are read via several
// backend aliases (camel/snake case), so this stays permissive.
interface ParkGuardRef { firstName?: string; first_name?: string; lastName?: string; last_name?: string; name?: string; fullName?: string }
interface ParkingRow {
  id?: string;
  firstName?: string; first_name?: string;
  lastName?: string; last_name?: string;
  name?: string; visitorName?: string;
  placeType?: string; place_type?: string;
  visitDate?: string | null; entryTime?: string | null; createdAt?: string | null;
  exitTime?: string | null; exit_time?: string | null;
  guard?: ParkGuardRef | null; securityGuard?: ParkGuardRef | null; guardName?: string;
}

const PARKING_PLACE_TYPES = ['Parking', 'Parqueadero', 'Estacionamiento', 'Vehículo', 'Vehiculo'];

function formatDate(val: string | null | undefined) {
  if (!val) return '-';
  try { return new Date(val).toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'short' }); }
  catch { return val; }
}

export default function StationParking({ stationId }: Props) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ParkingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!stationId) return;
    let mounted = true;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        // Try each parking placeType until one returns results, fallback to all stationId logs
        let found: ParkingRow[] = [];

        for (const placeType of PARKING_PLACE_TYPES) {
          try {
            const res: any = await visitorLogService.list(
              { stationId, placeType } as any,
              { limit: 200, offset: 0 }
            );
            const list = Array.isArray(res) ? res : (res?.rows ?? []);
            if (list.length > 0) { found = list; break; }
          } catch {}
        }

        // Fallback: all visitor logs for this station
        if (found.length === 0) {
          const res: any = await visitorLogService.list(
            { stationId } as any,
            { limit: 200, offset: 0 }
          );
          found = Array.isArray(res) ? res : (res?.rows ?? []);
        }

        if (mounted) setRows(found);
      } catch (e: any) {
        if (mounted) setError(e?.message || t('station.parking.loadError', 'Error al cargar registros'));
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [stationId]);

  return (
    <Section
      icon={<Car />}
      title={
        <span>
          {t('station.parking.title', 'Gestión de Parking')}
          {!loading && rows.length > 0 && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">({rows.length})</span>
          )}
        </span>
      }
      contentClassName="-mx-5 -mb-5"
    >
      <p className="px-5 -mt-2 mb-3 text-xs text-muted-foreground">
        {t('station.parking.subtitle', 'Registro de entrada y salida de vehículos en este puesto')}
      </p>

      {loading ? (
        <div className="px-5 pb-5"><SkeletonCards count={4} /></div>
      ) : error ? (
        <div className="px-5 pb-5 text-sm" style={{ color: 'var(--bad-text)' }}>{error}</div>
      ) : rows.length === 0 ? (
        <div className="px-5 pb-5">
          <EmptyState
            icon={<Car />}
            title={t('station.parking.empty', 'No hay registros de parking para este puesto.')}
          />
        </div>
      ) : (
        <FadeIn className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/30 border-b">
              <tr>
                <th className="cg-eyebrow px-2 py-2">
                  {t('station.parking.col.visitor', 'Visitante / Vehículo')}
                </th>
                <th className="cg-eyebrow px-2 py-2">
                  {t('station.parking.col.placeType', 'Tipo')}
                </th>
                <th className="cg-eyebrow px-2 py-2">
                  {t('station.parking.col.entry', 'Entrada')}
                </th>
                <th className="cg-eyebrow px-2 py-2">
                  {t('station.parking.col.exit', 'Salida')}
                </th>
                <th className="cg-eyebrow px-2 py-2">
                  {t('station.parking.col.guard', 'Vigilante')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r: ParkingRow, i: number) => {
                const firstName = r.firstName || r.first_name || '';
                const lastName = r.lastName || r.last_name || '';
                const visitorName = [firstName, lastName].filter(Boolean).join(' ') || r.name || r.visitorName || '-';
                const placeType = r.placeType || r.place_type || '-';
                const entry = formatDate(r.visitDate || r.entryTime || r.createdAt);
                const exit = formatDate(r.exitTime || r.exit_time);
                const guard = r.guard || r.securityGuard || {};
                const guardName = [guard.firstName || guard.first_name, guard.lastName || guard.last_name]
                  .filter(Boolean).join(' ') || guard.name || guard.fullName || r.guardName || '-';
                return (
                  <tr key={r.id || i} className="hover:bg-muted/40">
                    <td className="px-2 py-2.5 text-foreground font-medium">{visitorName}</td>
                    <td className="px-2 py-2.5 text-muted-foreground">{placeType}</td>
                    <td className="px-2 py-2.5 text-foreground">{entry}</td>
                    <td className="px-2 py-2.5 text-muted-foreground">{exit}</td>
                    <td className="px-2 py-2.5 text-foreground">{guardName}</td>
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
