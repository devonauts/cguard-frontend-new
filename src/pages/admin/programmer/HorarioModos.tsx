/**
 * TURNOS › HORARIO: ONE EDITOR, TWO MODES (phase 2, 2026-10-31).
 *
 * «Horario» and «Planificador» were two menu entries that edited the same
 * schedule in two different ways and did not know about each other. Now there
 * is one entry and one page with two modes:
 *
 *   · En vivo  — the live schedule; every change is saved at once.
 *   · Borrador — the shared draft (server-side); nothing is live until
 *                «Publicar», which applies everything or nothing.
 *
 * In live mode the switch also says when a draft is waiting, and who saved
 * it, so nobody edits live without knowing someone is preparing changes.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import { CalendarCheck2, CalendarRange } from "lucide-react";

import { ApiService } from "@/services/api/apiService";

interface Resumen {
  updatedBy: string | null;
  updatedAt: string | null;
  editors: Array<{ name: string }>;
}

export function rutaDelModo(modo: "vivo" | "borrador", search = ""): string {
  const q = new URLSearchParams(search);

  if (modo === "borrador") q.set("modo", "borrador");
  else q.delete("modo");
  const s = q.toString();

  return `/schedule${s ? `?${s}` : ""}`;
}

export default function HorarioModos({
  modo,
  className = "mb-4",
}: {
  modo: "vivo" | "borrador";
  className?: string;
}) {
  const { t } = useTranslation();
  const { search } = useLocation();
  const tenantId = localStorage.getItem("tenantId") || "";
  const [resumen, setResumen] = useState<Resumen | null>(null);

  useEffect(() => {
    if (modo !== "vivo" || !tenantId) return;
    let vivo = true;

    // Summary only: no plan, and it does not count as «editing».
    ApiService.get(`/tenant/${tenantId}/schedule-draft?summary=1`)
      .then((r: any) => {
        if (!vivo) return;
        const d = r?.draft;

        setResumen(
          d
            ? {
                updatedBy: d.updatedBy || null,
                updatedAt: d.updatedAt || null,
                editors: Array.isArray(r?.editors) ? r.editors : [],
              }
            : null,
        );
      })
      .catch(() => undefined);

    return () => {
      vivo = false;
    };
  }, [modo, tenantId]);

  const pestana =
    "cg-focus inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors";
  const estilo = (activo: boolean) =>
    activo
      ? { background: "var(--brand)", color: "var(--brand-ink)" }
      : { color: "var(--ink-soft)" };

  return (
    <div className={`${className} flex flex-wrap items-center gap-2`}>
      <nav
        aria-label={t("ui.HorarioModos.modos", "Modo del horario")}
        className="glass inline-flex items-center gap-1 p-1"
      >
        <Link
          aria-current={modo === "vivo" ? "page" : undefined}
          className={pestana}
          style={estilo(modo === "vivo")}
          to={rutaDelModo("vivo", search)}
        >
          <CalendarCheck2 size={15} /> {t("ui.HorarioModos.enVivo", "En vivo")}
        </Link>
        <Link
          aria-current={modo === "borrador" ? "page" : undefined}
          className={pestana}
          style={estilo(modo === "borrador")}
          to={rutaDelModo("borrador", search)}
        >
          <CalendarRange size={15} /> {t("ui.HorarioModos.borrador", "Borrador")}
          {modo === "vivo" && resumen && (
            <span
              aria-hidden
              className="ml-0.5 inline-block size-2 rounded-full"
              style={{ background: "var(--warn)" }}
            />
          )}
        </Link>
      </nav>
      {modo === "vivo" && resumen && (
        <Link
          className="min-w-0 text-sm underline-offset-2 hover:underline"
          style={{ color: "var(--warn-text, var(--ink))" }}
          to={rutaDelModo("borrador", search)}
        >
          {resumen.editors.length
            ? t("ui.HorarioModos.hayBorradorEditando", {
                defaultValue:
                  "Hay un borrador sin publicar; ahora lo está editando {{quien}}.",
                quien: resumen.editors.map((e) => e.name).join(", "),
              })
            : t("ui.HorarioModos.hayBorrador", {
                defaultValue:
                  "Hay un borrador sin publicar (lo guardó {{quien}}).",
                quien: resumen.updatedBy || "—",
              })}
        </Link>
      )}
      {modo === "vivo" ? (
        <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
          {t(
            "ui.HorarioModos.ayudaVivo",
            "Cada cambio se guarda al momento en el horario real.",
          )}
        </span>
      ) : (
        <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
          {t(
            "ui.HorarioModos.ayudaBorrador",
            "Nada llega al horario real hasta «Publicar». El borrador se comparte con tu equipo.",
          )}
        </span>
      )}
    </div>
  );
}
