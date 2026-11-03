/**
 * Asistencia › Atrasos de esta semana — «¿quién llegó tarde?» in one click.
 *
 * Every late punch of the range (company days, Monday..Sunday by default),
 * grouped by person on the server with no row cap. Each row opens the marks
 * behind it in Marcaciones, already filtered.
 */
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { AlarmClock, RefreshCw } from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import { DataTable, type Column } from "@/components/table/DataTable";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  PageContainer,
  PageHeader,
  Section,
  SkeletonCards,
  StatusBadge,
  Toolbar,
} from "@/components/kit";
import attendanceService, { type AtrasoDePersona } from "@/lib/api/attendanceService";

import { enlaceAMarcaciones, minutos } from "@/lib/asistenciaVistas";

import { localeActual } from "@/lib/localeActual";
import { RangoDeAsistencia, etiquetaDeRango, useFiltrosDeAsistencia } from "./filtrosAsistencia";

type Fila = AtrasoDePersona & { id: string };

export default function NominaAtrasos() {
  const { t } = useTranslation();
  const [f, setF] = useFiltrosDeAsistencia({ periodo: "week" });
  const [filas, setFilas] = useState<Fila[]>([]);
  const [marcas, setMarcas] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    attendanceService
      .lateSummary({ from: f.from, to: f.to })
      .then((r) => {
        setFilas((r?.people || []).map((p) => ({ ...p, id: `${p.role}:${p.personId}` })));
        setMarcas(Number(r?.punches) || 0);
      })
      .catch((e) => {
        setFilas([]);
        setError(e?.message || t("ui.Asistencia.noSeCargo", "No se pudo cargar"));
      })
      .finally(() => setLoading(false));
  }, [f.from, f.to]);

  useEffect(load, [load]);

  const rol = (r: AtrasoDePersona["role"]) =>
    r === "supervisor"
      ? t("comun.supervisor", "Supervisor")
      : r === "staff"
        ? t("ui.NominaShared.administrativo", "Administrativo")
        : t("comun.vigilante", "Vigilante");

  // The app's language, not the browser's («Sun, Nov 01» on a Spanish screen);
  // only the first letter in capitals, like the range picker («Dom, 01 nov»).
  const dia = (ymd: string) => {
    const texto = new Date(`${ymd}T12:00:00Z`).toLocaleDateString(localeActual(), { timeZone: "UTC", weekday: "short", day: "2-digit", month: "short" });

    return texto.charAt(0).toLocaleUpperCase(localeActual()) + texto.slice(1);
  };

  const columns: Column<Fila>[] = [
    {
      key: "personName",
      header: t("ui.Asistencia.persona", "Persona"),
      titulo: true,
      render: (_v, r) => (
        <span className="flex items-center gap-1.5">
          <span className="font-semibold">{r.personName}</span>
          {r.role !== "guard" && (
            <StatusBadge dot={false} tone={r.role === "supervisor" ? "warn" : "info"}>
              {rol(r.role)}
            </StatusBadge>
          )}
        </span>
      ),
    },
    {
      key: "count",
      header: t("ui.Asistencia.vecesTarde", "Veces tarde"),
      numeric: true,
      render: (_v, r) => r.count,
    },
    {
      key: "totalMinutes",
      header: t("ui.Asistencia.minutosTotales", "Tiempo total"),
      numeric: true,
      render: (_v, r) => minutos(r.totalMinutes),
    },
    {
      key: "worst",
      header: t("ui.Asistencia.peorDia", "Peor día"),
      render: (_v, r) => (
        <span>
          <span>{dia(r.worst.day)}</span>
          {" · "}
          <span className="tabular-nums">{minutos(r.worst.minutes)}</span>
          {r.worst.stationName ? (
            <span className="block text-xs" style={{ color: "var(--ink-soft)" }}>
              {r.worst.stationName}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "ver",
      header: "",
      render: (_v, r) => (
        <Button asChild size="sm" variant="outline">
          <Link to={enlaceAMarcaciones(r, f.from, f.to)}>{t("ui.Asistencia.verMarcas", "Ver marcas")}</Link>
        </Button>
      ),
    },
  ];

  return (
    <AppLayout>
      <PageContainer width="wide">
        <PageHeader
          actions={
            <Button disabled={loading} variant="outline" onClick={load}>
              <RefreshCw className={loading ? "animate-spin" : ""} />
              {t("dashboard.refresh", "Actualizar")}
            </Button>
          }
          icon={<AlarmClock />}
          subtitle={t("ui.Asistencia.atrasosSubtitulo", "Quién llegó tarde, cuántas veces y cuánto, en la hora de la empresa")}
          title={t("sidebar.asistencia.atrasos", "Atrasos de la semana")}
        />

        <Toolbar>
          <RangoDeAsistencia f={f} onChange={setF} />
          {!loading && !error && (
            <span className="ml-auto pr-1 text-xs tabular-nums" style={{ color: "var(--ink-soft)" }}>
              {t("ui.Asistencia.resumenAtrasos", {
                personas: filas.length,
                marcas,
                defaultValue: "{{personas}} persona(s) · {{marcas}} llegada(s) tarde",
              })}
            </span>
          )}
        </Toolbar>

        <Section icon={<AlarmClock />} title={etiquetaDeRango(f.from, f.to)}>
          {error && (
            <div
              className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl px-4 py-3 text-sm font-medium"
              role="alert"
              style={{ background: "color-mix(in oklab, var(--bad) 12%, transparent)", color: "var(--bad-text)" }}
            >
              <span>{error}</span>
              <Button size="sm" variant="outline" onClick={load}>
                {t("ui.Asistencia.reintentar", "Reintentar")}
              </Button>
            </div>
          )}
          {loading ? (
            <SkeletonCards count={4} />
          ) : error ? null : (
            <DataTable
              columns={columns}
              data={filas}
              emptyState={
                <EmptyState
                  description={t(
                    "ui.Asistencia.sinAtrasosDescripcion",
                    "Nadie llegó tarde en estos días. Cambia de semana con las flechas para ver otras.",
                  )}
                  icon={<AlarmClock />}
                  title={t("ui.Asistencia.sinAtrasos", "Sin atrasos")}
                />
              }
            />
          )}
        </Section>
      </PageContainer>
    </AppLayout>
  );
}
