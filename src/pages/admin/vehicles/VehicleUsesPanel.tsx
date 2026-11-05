import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, History } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { alertaLabel, lectura, tipoDe } from "./flota";

import { EmptyState, Section, Segmented, SkeletonCards, StatusBadge, Toolbar } from "@/components/kit";
import vehicleService from "@/lib/api/vehicleService";
import { localeActual } from "@/lib/localeActual";

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * USOS DE LA FLOTA: cada salida y devolución, con quién, cuándo, lecturas,
 * km por odómetro, por GPS y por plan, y lo que el servidor marcó.
 */
export default function VehicleUsesPanel({ refresco }: { refresco: number }) {
  const { t } = useTranslation();
  const [filtro, setFiltro] = useState<"todos" | "abiertos" | "alertas">("todos");
  const [desde, setDesde] = useState(() => ymd(new Date(Date.now() - 30 * 86400000)));
  const [hasta, setHasta] = useState(() => ymd(new Date()));
  const [rows, setRows] = useState<any[] | null>(null);
  const locale = localeActual();
  const fecha = (v: any) =>
    v ? new Date(v).toLocaleString(locale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

  useEffect(() => {
    let vivo = true;

    setRows(null);
    vehicleService
      .uses({
        from: desde,
        to: hasta,
        status: filtro === "abiertos" ? "open" : undefined,
        flagged: filtro === "alertas" || undefined,
        limit: 300,
      })
      .then((r) => vivo && setRows(r?.rows || []))
      .catch((e) => {
        toast.error(e?.message || "Error");
        if (vivo) setRows([]);
      });

    return () => {
      vivo = false;
    };
  }, [filtro, desde, hasta, refresco]);

  return (
    <>
      <Toolbar>
        <Segmented
          value={filtro}
          onChange={setFiltro}
          options={[
            { value: "todos", label: t("ui.flota.usos.todos", "Todos") },
            { value: "abiertos", label: t("ui.flota.usos.abiertos", "En uso ahora") },
            { value: "alertas", label: t("ui.flota.usos.alertas", "Con alertas") },
          ]}
        />
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--ink-soft)" }}>
          {t("ui.RouteRunsHistory.desde", "Desde")}
          <input className="cg-input h-9 rounded-md px-2" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--ink-soft)" }}>
          {t("ui.RouteRunsHistory.hasta", "Hasta")}
          <input className="cg-input h-9 rounded-md px-2" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </label>
      </Toolbar>
      <Section contentClassName="-mx-5 -mb-5" icon={<History />} title={t("ui.flota.usos.titulo", "Salidas y devoluciones")}>
        {rows === null ? (
          <div className="p-5">
            <SkeletonCards count={3} />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={<History />} title={t("ui.flota.usos.vacio", "Sin usos en este periodo")} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead style={{ background: "var(--glass-sunken)", color: "var(--ink-soft)" }}>
                <tr>
                  {[
                    t("ui.flota.usos.vehiculo", "Vehículo"),
                    t("ui.flota.conductor", "Quién lo conduce"),
                    t("ui.flota.usos.salida", "Salida"),
                    t("ui.flota.usos.devolucion", "Devolución"),
                    t("ui.flota.usos.recorrido", "Recorrido"),
                    t("ui.flota.usos.gps", "GPS"),
                    t("ui.flota.usos.plan", "Plan de la ruta"),
                    t("ui.flota.usos.alertasCol", "Alertas"),
                  ].map((h) => (
                    <th key={h} className="px-4 py-2.5 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => {
                  const Icono = tipoDe(u.vehicle?.vehicleType).icon;
                  const flags: string[] = Array.isArray(u.flags) ? u.flags : [];

                  return (
                    <tr key={u.id} className="border-t align-top" style={{ borderColor: "var(--hairline)" }}>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-1.5 font-medium">
                          <Icono className="size-4" />
                          {u.vehicle?.name || "—"}
                        </span>
                        <span className="block font-mono text-xs" style={{ color: "var(--ink-faint)" }}>
                          {u.vehicle?.licensePlate || ""}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {u.driverName}
                        {u.purpose ? (
                          <span className="block text-xs" style={{ color: "var(--ink-faint)" }}>
                            {u.purpose}
                          </span>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        {fecha(u.startedAt)}
                        <span className="block text-xs tabular-nums" style={{ color: "var(--ink-faint)" }}>
                          {lectura(u.startOdometer, u.unit)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        {u.status === "open" ? (
                          <StatusBadge tone="brand">{t("ui.flota.estado.in_use", "En uso")}</StatusBadge>
                        ) : (
                          <>
                            {fecha(u.endedAt)}
                            <span className="block text-xs tabular-nums" style={{ color: "var(--ink-faint)" }}>
                              {lectura(u.endOdometer, u.unit)}
                            </span>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-medium tabular-nums">
                        {u.distance != null ? lectura(u.distance, u.unit) : "—"}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums">{u.gpsDistanceKm != null ? lectura(u.gpsDistanceKm, "km") : "—"}</td>
                      <td className="px-4 py-2.5 tabular-nums">
                        {u.plannedDistanceKm != null ? lectura(u.plannedDistanceKm, "km") : "—"}
                        {u.routeRunId ? (
                          <Link
                            className="block text-xs underline"
                            style={{ color: "var(--brand-text)" }}
                            to={`/vehicle-patrol/runs/${u.routeRunId}`}
                          >
                            {t("ui.flota.usos.verRecorrido", "Ver recorrido")}
                          </Link>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5">
                        {flags.length ? (
                          <div className="flex flex-col gap-1">
                            {flags.map((f) => (
                              <StatusBadge key={f} tone="warn">
                                <AlertTriangle className="mr-1 inline size-3" />
                                {alertaLabel(f)}
                              </StatusBadge>
                            ))}
                          </div>
                        ) : (
                          "—"
                        )}
                        {u.damages ? (
                          <span className="mt-1 block text-xs" style={{ color: "var(--bad-text)" }}>
                            {t("ui.flota.danos", "Daños (si hay)")}: {u.damages}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}
