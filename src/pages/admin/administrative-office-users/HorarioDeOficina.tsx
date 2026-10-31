import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Clock, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState, Section, SkeletonCards, InfoNote } from "@/components/kit";
import OfficeHoursEditor from "@/components/schedule/OfficeHoursEditor";
import { ApiService } from "@/services/api/apiService";
import { usePermissions } from "@/hooks/usePermissions";
import {
  jornadaDesdeServidor,
  minutosNetos,
  textoDeHoras,
} from "@/lib/jornadaSemanal";
import { nombreDeDia } from "@/lib/secuenciaDeRotacion";
import { soloFechaCivil } from "@/lib/horaDeLaEmpresa";

/**
 * Personal › Usuarios de oficina › ficha › HORARIO (phase 2).
 *
 * The weekly hours of an office person used to be reachable only from
 * Programador › Horario › «Todo el personal». They belong to the person: this
 * tab shows them, the next seven days (leave and holidays included, the same
 * expansion payroll uses), and opens the same editor.
 */
export default function HorarioDeOficina({
  userId,
  name,
}: {
  userId: string;
  name: string;
}) {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const tenantId = localStorage.getItem("tenantId") || "";
  const [datos, setDatos] = useState<{
    days: any[];
    pattern: any | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editar, setEditar] = useState(false);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const r: any = await ApiService.get(
        `/tenant/${tenantId}/staff-schedule/${userId}/pattern`,
      );

      setDatos({
        days: Array.isArray(r?.days) ? r.days : [],
        pattern: r?.pattern ?? null,
      });
    } catch (e: any) {
      setError(e?.data?.message || e?.message || "Error");
    }
  }, [tenantId, userId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const jornada = jornadaDesdeServidor(datos?.pattern?.schedule);
  const puedeEditar = hasPermission("stationEdit");

  return (
    <Section
      action={
        puedeEditar && datos ? (
          <Button size="sm" variant="outline" onClick={() => setEditar(true)}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            {jornada
              ? t("ui.HorarioDeOficina.cambiar", "Cambiar horario")
              : t("ui.HorarioDeOficina.definir", "Definir horario")}
          </Button>
        ) : undefined
      }
      icon={<Clock />}
      title={t("ui.HorarioDeOficina.titulo", "Horario de oficina")}
    >
      {error ? (
        <InfoNote tone="bad">{error}</InfoNote>
      ) : !datos ? (
        <SkeletonCards count={1} />
      ) : !jornada ? (
        <EmptyState
          className="border-0 py-2"
          description={t(
            "ui.HorarioDeOficina.sinHorario",
            "Sin horario: su marcación no se compara con ninguna hora de entrada.",
          )}
          icon={<Clock />}
          title={t(
            "ui.HorarioDeOficina.sinHorarioTitulo",
            "Aún no tiene horario",
          )}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <ul className="space-y-1 text-sm">
            {jornada.map((d, i) => (
              <li key={d.dia} className="flex justify-between gap-3">
                <span>{nombreDeDia(i, t)}</span>
                <span
                  className="font-mono tabular-nums"
                  style={{ color: d.activo ? undefined : "var(--ink-faint)" }}
                >
                  {d.activo
                    ? `${d.start}–${d.end}${d.almuerzo ? ` · ${textoDeHoras(minutosNetos(d))}` : ""}`
                    : t("ui.HorarioDeOficina.libre", "Libre")}
                </span>
              </li>
            ))}
          </ul>
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t("ui.HorarioDeOficina.proximosDias", "Próximos días")}
            </p>
            <ul className="space-y-1 text-sm">
              {datos.days.map((d: any) => (
                <li key={d.date} className="flex justify-between gap-3">
                  <span>
                    {soloFechaCivil(d.date, {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                  <span className="font-mono tabular-nums">
                    {d.start && d.end
                      ? `${d.start}–${d.end}`
                      : d.code || t("ui.HorarioDeOficina.libre", "Libre")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {editar && (
        <OfficeHoursEditor
          inicial={jornada}
          persona={{ userId, name }}
          tenantId={tenantId}
          tieneHorario={!!jornada}
          onClose={() => setEditar(false)}
          onSaved={() => {
            setEditar(false);
            void cargar();
          }}
        />
      )}
    </Section>
  );
}
