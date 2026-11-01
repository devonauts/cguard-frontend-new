import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Check,
  Clock,
  Loader2,
  Pencil,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";

import {
  Avatar,
  EmptyState,
  InfoNote,
  Modal,
  SearchInput,
  Section,
  SkeletonCards,
  StatusBadge,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirmDialog";
import {
  type CandidatoLibre,
  useSede,
  useVigilantesOrdenados,
} from "@/components/post-sites/EventoDeLaSede";
import {
  eventoTerminado,
  rangoDelEvento,
  type RelevoDeEvento,
  relevosDeLaEstacion,
  ventanaDeLaPlaza,
  ventanasDeLaPlaza,
  vigenciaDe,
} from "@/lib/eventos";
import { fechaYHora, soloHora as soloHoraLarga } from "@/lib/horaDeLaEmpresa";
import { ApiService } from "@/services/api/apiService";
import { coverageService } from "@/lib/api/coverageService";
import { EditorDeRelevos } from "@/components/stations/RelevosDelEvento";

/* ════════════════════════════════════════════════════════════════════════════
   LA ESTACIÓN DE UN EVENTO: QUIÉN VA Y A QUÉ HORA. NADA MÁS.

   Un puesto fijo se lee por su rotación (quién libra, el sacafranco, las
   próximas cuatro semanas). Un evento no: es una noche, o tres días, y lo único
   que importa es qué tramo cubre cada vigilante DENTRO del evento. Por eso las
   pestañas Vigilantes y Turnos de una estación de evento son estas, y no las de
   siempre:

   · Vigilantes — los RELEVOS de la estación (todo el horario, o turnos de 4 h,
     6 h…), cada uno con sus plazas: quién está y qué hueco queda. Se asignan
     VARIOS de una vez, sólo entre los libres a esas horas.
   · Turnos — una línea de tiempo que empieza cuando empieza el evento y acaba
     cuando acaba, con la barra de cada vigilante y si ya fichó.
   ════════════════════════════════════════════════════════════════════════ */

type Props = { station: any; stationId: string; postSiteId: string };

interface Asignacion {
  id: string;
  guardId: string;
  nombre: string;
  telefono: string | null;
  inicio: string;
  fin: string;
}

interface Turno {
  id: string;
  guardId: string;
  asignacionId: string | null;
  nombre: string;
  start: Date;
  end: Date;
}

interface Fichaje {
  nombre: string;
  entrada: Date | null;
  salida: Date | null;
}

const filas = (r: any): any[] =>
  Array.isArray(r)
    ? r
    : Array.isArray(r?.rows)
      ? r.rows
      : Array.isArray(r?.data?.rows)
        ? r.data.rows
        : Array.isArray(r?.data)
          ? r.data
          : [];

const nombreDe = (g: any): string =>
  String(
    g?.fullName || [g?.firstName, g?.lastName].filter(Boolean).join(" ") || "",
  ).trim();

const hm = (v: any) => String(v || "").slice(0, 5);

/* La hora como la dice el resto del evento: «16:00», «00:30». Con «04:00 p. m.»
   la regla de horas no cabía. */
const soloHora = (d: Date) =>
  soloHoraLarga(d, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Todo lo de la estación del evento, leído una vez y recargable. */
function useEstacionDelEvento(stationId: string, station: any) {
  const tenantId = localStorage.getItem("tenantId") || "";
  const [plazas, setPlazas] = useState<any[] | null>(
    Array.isArray(station?.positions) && station.positions.length
      ? station.positions
      : null,
  );
  const [asignaciones, setAsignaciones] = useState<Asignacion[] | null>(null);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [fichajes, setFichajes] = useState<Fichaje[]>([]);
  const [vuelta, setVuelta] = useState(0);
  const recargar = useCallback(() => setVuelta((n) => n + 1), []);

  useEffect(() => {
    let vivo = true;

    (async () => {
      const [pz, asg, tur, fic] = await Promise.all([
        // Las plazas que trae la estación sirven para la PRIMERA lectura; al
        // recargar (p. ej. tras cambiar los relevos) se vuelven a pedir.
        vuelta === 0 && plazas
          ? Promise.resolve(plazas)
          : ApiService.get(`/tenant/${tenantId}/station/${stationId}/positions`)
              .then(filas)
              .catch(() => []),
        ApiService.get(
          `/tenant/${tenantId}/guard-assignments?stationId=${encodeURIComponent(stationId)}&status=active`,
        )
          .then(filas)
          .catch(() => []),
        ApiService.get(
          `/tenant/${tenantId}/shift?filter[station]=${encodeURIComponent(stationId)}&limit=999`,
        )
          .then(filas)
          .catch(() => []),
        ApiService.get(
          `/tenant/${tenantId}/guard-shift?filter[stationName]=${encodeURIComponent(stationId)}&limit=300`,
        )
          .then(filas)
          .catch(() => []),
      ]);

      if (!vivo) return;
      setPlazas(pz);
      setAsignaciones(
        asg
          // Los relevos de cobertura (`isRelief`) no son plazas del evento.
          .filter((a: any) => !a.isRelief && a.status !== "ended")
          .map((a: any) => ({
            id: String(a.id),
            guardId: String(a.guardId),
            nombre: nombreDe(a.guard) || "—",
            telefono: a.guard?.phoneNumber || null,
            inicio: hm(a.startTime),
            fin: hm(a.endTime),
          })),
      );
      setTurnos(
        tur
          .filter((s: any) => s.startTime && s.endTime && !s.deletedAt)
          .map((s: any) => ({
            id: String(s.id),
            guardId: String(s.guardId || s.guard?.id || ""),
            asignacionId: s.guardAssignmentId
              ? String(s.guardAssignmentId)
              : null,
            nombre: nombreDe(s.guard) || "—",
            start: new Date(s.startTime),
            end: new Date(s.endTime),
          }))
          .sort((a: Turno, b: Turno) => a.start.getTime() - b.start.getTime()),
      );
      setFichajes(
        fic.map((f: any) => ({
          nombre: String(f.guardName?.fullName || "").trim(),
          entrada: f.punchInTime ? new Date(f.punchInTime) : null,
          salida: f.punchOutTime ? new Date(f.punchOutTime) : null,
        })),
      );
    })();

    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationId, vuelta]);

  const relevos = useMemo(() => relevosDeLaEstacion(plazas || []), [plazas]);

  return {
    relevos,
    asignaciones,
    turnos,
    fichajes,
    recargar,
    cargando: !asignaciones,
  };
}

/** ¿A qué relevo pertenece una asignación? Por su hora de entrada y salida. */
const deRelevo = (r: RelevoDeEvento) => (a: { inicio: string; fin: string }) =>
  a.inicio === r.inicio && a.fin === r.fin;

/** «sáb 14 nov · 16:00–20:00» (o «16:00 → dom 15 nov 00:30» si cruza el día). */
function tramoLegible(start: Date, end: Date): string {
  const dia = fechaYHora(start, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: undefined,
    hour: undefined,
    minute: undefined,
  }).replace(/,/g, "");

  return `${dia} · ${soloHora(start)}–${soloHora(end)}`;
}

// ── VIGILANTES ─────────────────────────────────────────────────────────────

export function EventoVigilantes({ station, stationId, postSiteId }: Props) {
  const { t } = useTranslation();
  const sede = useSede(postSiteId, true, station?.postSite);
  const terminado = eventoTerminado(sede);
  const { relevos, asignaciones, turnos, recargar, cargando } =
    useEstacionDelEvento(stationId, station);
  const [asignando, setAsignando] = useState<RelevoDeEvento | null>(null);
  /* Cambiar los relevos (horario, duración, cuántos a la vez) sin recrear la
     estación. Va en línea encima de los relevos: ver `EditorDeRelevos`. */
  const [editandoRelevos, setEditandoRelevos] = useState(false);
  const tenantId = localStorage.getItem("tenantId") || "";

  const plazasTotales = relevos.reduce((n, r) => n + r.plazas, 0);
  const cubiertas = relevos.reduce(
    (n, r) =>
      n + Math.min(r.plazas, (asignaciones || []).filter(deRelevo(r)).length),
    0,
  );

  const quitar = async (a: Asignacion) => {
    if (
      !(await confirmDialog({
        title: t("ui.EventoDeLaEstacion.quitarTitulo", {
          defaultValue: "¿Quitar a {{nombre}} del evento?",
          nombre: a.nombre,
        }),
        message: t(
          "ui.EventoDeLaEstacion.quitarTexto",
          "Su puesto queda libre y su turno del evento se borra.",
        ),
        confirmText: t("station.guards.remove", "Quitar"),
        tone: "danger",
      }))
    )
      return;
    try {
      await ApiService.delete(
        `/tenant/${tenantId}/guard-assignment/${encodeURIComponent(a.id)}`,
      );
      recargar();
      try {
        window.dispatchEvent(new CustomEvent("assignments:changed"));
      } catch {
        /* sin oyentes */
      }
    } catch (e: any) {
      toast.error(
        e?.data?.message ||
          e?.message ||
          t("ui.EventoDeLaEstacion.noSePudoQuitar", "No se pudo quitar"),
      );
    }
  };

  if (cargando) return <SkeletonCards count={2} />;

  const editor = editandoRelevos && (
    <EditorDeRelevos
      relevos={relevos}
      sede={sede}
      stationId={stationId}
      onCancel={() => setEditandoRelevos(false)}
      onSaved={() => {
        setEditandoRelevos(false);
        recargar();
      }}
    />
  );
  const botonRelevos = !terminado && !editandoRelevos && (
    <Button
      size="sm"
      variant="outline"
      onClick={() => setEditandoRelevos(true)}
    >
      <Pencil className="mr-1.5 h-4 w-4" />
      {t("ui.RelevosDelEvento.cambiar", "Cambiar relevos")}
    </Button>
  );

  if (!relevos.length) {
    return (
      editor || (
        <EmptyState
          action={botonRelevos || undefined}
          description={t(
            "ui.EventoDeLaEstacion.sinPlazasTexto",
            "Esta estación no tiene puestos. Usa «Cambiar relevos» para decir su horario y cuántos vigilantes van a la vez.",
          )}
          icon={<Users />}
          title={t("ui.EventoDeLaEstacion.sinPlazas", "Sin puestos")}
        />
      )
    );
  }

  return (
    <div className="space-y-4">
      {botonRelevos && <div className="flex justify-end">{botonRelevos}</div>}
      {editor}
      <InfoNote tone="brand">
        <span className="font-semibold">
          {rangoDelEvento(sede?.vigenteDesde, sede?.vigenteHasta)}
        </span>
        {" · "}
        {t("ui.EventoDeLaEstacion.cubiertas", {
          defaultValue: "{{cubiertas}} de {{plazas}} puestos cubiertos",
          cubiertas,
          plazas: plazasTotales,
        })}
        {relevos.length > 1 &&
          ` · ${t("ui.EventoDeLaEstacion.cadaUnoSuRelevo", "cada vigilante cubre sólo su relevo")}`}
      </InfoNote>

      {relevos.map((r, i) => {
        const suyas = (asignaciones || []).filter(deRelevo(r));
        const vacantes = Math.max(0, r.plazas - suyas.length);
        const lleno = vacantes === 0;

        return (
          <Section
            key={`${r.inicio}-${r.fin}`}
            action={
              <div className="flex items-center gap-2">
                <StatusBadge
                  tone={lleno ? "ok" : suyas.length ? "warn" : "bad"}
                >
                  {suyas.length}/{r.plazas}
                </StatusBadge>
                {!terminado && vacantes > 0 && (
                  <Button size="sm" onClick={() => setAsignando(r)}>
                    <UserPlus className="mr-1.5 h-4 w-4" />
                    {t("ui.EventoDeLaEstacion.asignar", "Asignar vigilantes")}
                  </Button>
                )}
              </div>
            }
            icon={<Clock />}
            title={
              relevos.length > 1
                ? t("ui.EventoDeLaEstacion.relevoN", {
                    defaultValue: "Relevo {{n}} · {{inicio}}–{{fin}}",
                    n: i + 1,
                    inicio: r.inicio,
                    fin: r.fin,
                  })
                : t("ui.EventoDeLaEstacion.horarioUnico", {
                    defaultValue: "De {{inicio}} a {{fin}}",
                    inicio: r.inicio,
                    fin: r.fin,
                  })
            }
          >
            <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
              {suyas.map((a) => {
                const susTurnos = turnos.filter(
                  (s) =>
                    s.asignacionId === a.id ||
                    (!s.asignacionId && s.guardId === a.guardId),
                );

                return (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center gap-3 py-2.5"
                  >
                    <Avatar name={a.nombre} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{a.nombre}</p>
                      {a.telefono && (
                        <p
                          className="text-xs"
                          style={{ color: "var(--ink-soft)" }}
                        >
                          {a.telefono}
                        </p>
                      )}
                      {/* En el teléfono el horario va debajo del nombre: a
                          la derecha dejaba el nombre en «Aaron Coll…». */}
                      <div
                        className="text-xs tabular-nums sm:hidden"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {susTurnos.length
                          ? susTurnos.map((s) => (
                              <div key={s.id}>
                                {tramoLegible(s.start, s.end)}
                              </div>
                            ))
                          : `${a.inicio}–${a.fin}`}
                      </div>
                    </div>
                    <div
                      className="hidden text-right text-xs tabular-nums sm:block"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {susTurnos.length
                        ? susTurnos.map((s) => (
                            <div key={s.id}>{tramoLegible(s.start, s.end)}</div>
                          ))
                        : `${a.inicio}–${a.fin}`}
                    </div>
                    {!terminado && (
                      <button
                        aria-label={t("station.guards.remove", "Quitar")}
                        className="cg-btn-ghost cg-focus rounded-md p-1.5"
                        title={t("station.guards.remove", "Quitar")}
                        type="button"
                        onClick={() => quitar(a)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                );
              })}
              {vacantes > 0 && (
                <li className="py-2.5">
                  <button
                    className="cg-focus flex w-full items-center gap-3 rounded-lg border border-dashed px-3 py-2 text-left text-sm disabled:cursor-default"
                    disabled={terminado}
                    style={{
                      borderColor: "var(--hairline)",
                      color: "var(--ink-soft)",
                    }}
                    type="button"
                    onClick={() => setAsignando(r)}
                  >
                    <UserPlus className="h-4 w-4" />
                    {t("ui.EventoDeLaEstacion.plazasLibres", {
                      defaultValue: "{{count}} plazas libres",
                      count: vacantes,
                    })}
                  </button>
                </li>
              )}
            </ul>
          </Section>
        );
      })}

      {asignando && (
        <AsignarVarios
          ocupados={new Set((asignaciones || []).map((a) => a.guardId))}
          relevo={asignando}
          sede={sede}
          stationId={stationId}
          vacantes={Math.max(
            0,
            asignando.plazas -
              (asignaciones || []).filter(deRelevo(asignando)).length,
          )}
          onClose={() => setAsignando(null)}
          onDone={() => {
            setAsignando(null);
            recargar();
          }}
        />
      )}
    </div>
  );
}

/** Elegir VARIOS vigilantes para un relevo y asignarlos de una vez. */
function AsignarVarios({
  relevo,
  sede,
  stationId,
  vacantes,
  ocupados,
  onClose,
  onDone,
}: {
  relevo: RelevoDeEvento;
  sede: any;
  stationId: string;
  vacantes: number;
  ocupados: Set<string>;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const tenantId = localStorage.getItem("tenantId") || "";
  const [todos, setTodos] = useState<{ id: string; label: string }[]>([]);
  const [cargandoTodos, setCargandoTodos] = useState(true);
  const [filtro, setFiltro] = useState("");
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);
  /* Los archivados AL TERMINAR OTRO EVENTO (id → nombre del evento): no salen
     en el buscador (sólo activos), y asignarlos los reactiva solos. Van al
     final: un activo libre ya paga su asiento; reactivar suma uno. */
  const [archivadosTras, setArchivadosTras] = useState<Map<string, string>>(
    new Map(),
  );

  useEffect(() => {
    let vivo = true;

    Promise.all([
      ApiService.get(`/tenant/${tenantId}/security-guard/autocomplete?limit=500`),
      ApiService.get(`/tenant/${tenantId}/eventos/vigilantes-archivados`)
        .then(filas)
        .catch(() => [] as any[]),
    ])
      .then(([res, arch]: [any, any[]]) => {
        if (!vivo) return;
        const activos = filas(res)
          .map((r: any) => ({
            id: String(r.guardId || r.id || r.value || ""),
            label: String(r.fullName || r.name || r.label || r.email || ""),
          }))
          .filter((g: { id: string }) => g.id);
        const ya = new Set(activos.map((g: { id: string }) => g.id));
        const tras = new Map<string, string>();

        for (const a of arch) {
          const id = String(a?.guardId || "");

          if (id && !ya.has(id)) tras.set(id, String(a?.evento || ""));
        }
        setArchivadosTras(tras);
        setTodos([
          ...activos,
          ...arch
            .filter((a: any) => tras.has(String(a?.guardId || "")))
            .map((a: any) => ({
              id: String(a.guardId),
              label: String(a.nombre || ""),
            })),
        ]);
      })
      .catch(() => vivo && setTodos([]))
      .finally(() => vivo && setCargandoTodos(false));

    return () => {
      vivo = false;
    };
  }, [tenantId]);

  const ventana = useMemo(
    () =>
      ventanaDeLaPlaza(sede, { startTime: relevo.inicio, endTime: relevo.fin }),
    [sede, relevo.inicio, relevo.fin],
  );
  /* LIBRE = libre TODOS los días del evento. Mirar sólo el primero dejaba
     elegir a quien tiene turno el sábado y el servidor lo rechazaba después
     (medido en la QA). Se pregunta día por día y se cruza; de quien choca se
     guarda QUÉ día, para decírselo a quien asigna. */
  const ventanas = useMemo(
    () =>
      ventanasDeLaPlaza(sede, { startTime: relevo.inicio, endTime: relevo.fin }),
    [sede, relevo.inicio, relevo.fin],
  );
  const [libres, setLibres] = useState<Map<string, CandidatoLibre> | null>(null);
  const [ocupadoEl, setOcupadoEl] = useState<Map<string, string>>(new Map());
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;

    if (!ventanas.length) {
      setLibres(null);
      setCargando(false);

      return;
    }
    setCargando(true);
    Promise.all(
      ventanas.map((v) =>
        coverageService
          .candidates({
            stationId,
            windowStart: v.start.toISOString(),
            windowEnd: v.end.toISOString(),
            limit: 500,
          })
          .then((rows: any) => (Array.isArray(rows) ? rows : []))
          .catch(() => null),
      ),
    ).then((porDia) => {
      if (!vivo) return;
      // Si algún día no se pudo leer, no se marca a nadie: mejor sin marca
      // que con una marca falsa (el servidor rechaza el choque real igual).
      if (porDia.some((x) => x === null)) {
        setLibres(null);
        setCargando(false);

        return;
      }
      const sets = (porDia as any[][]).map(
        (rows) => new Set(rows.map((r: any) => String(r.guardId))),
      );
      const m = new Map<string, CandidatoLibre>();
      const ocupado = new Map<string, string>();

      (porDia[0] as any[]).forEach((r: any, i: number) => {
        const id = String(r.guardId);

        if (sets.every((st) => st.has(id)))
          m.set(id, {
            guardId: id,
            reason: r.reason ?? null,
            warning: r.warning ?? null,
            orden: i,
          });
      });
      // Los archivados tras un evento no tienen turnos: libres, al final.
      [...archivadosTras.keys()].forEach((id, i) =>
        m.set(id, { guardId: id, orden: 100000 + i }),
      );
      for (const g of todos) {
        if (archivadosTras.has(g.id)) continue;
        const dia = sets.findIndex((st) => !st.has(g.id));

        if (dia >= 0)
          ocupado.set(
            g.id,
            fechaYHora(ventanas[dia].start, {
              weekday: "short",
              day: "numeric",
              month: "short",
              year: undefined,
              hour: undefined,
              minute: undefined,
            }).replace(/,/g, ""),
          );
      }
      setLibres(m);
      setOcupadoEl(ocupado);
      setCargando(false);
    });

    return () => {
      vivo = false;
    };
  }, [stationId, ventanas, todos, archivadosTras]);
  const ordenados = useVigilantesOrdenados(
    useMemo(() => todos.filter((g) => !ocupados.has(g.id)), [todos, ocupados]),
    libres,
  );
  const visibles = useMemo(() => {
    const q = filtro.trim().toLowerCase();

    return q
      ? ordenados.filter((g) => g.label.toLowerCase().includes(q))
      : ordenados;
  }, [ordenados, filtro]);
  const libresVisibles = visibles.filter((g) => g.libre !== false);

  const alternar = (id: string) =>
    setElegidos((xs) =>
      xs.includes(id)
        ? xs.filter((x) => x !== id)
        : xs.length >= vacantes
          ? xs
          : [...xs, id],
    );
  const rellenar = () =>
    setElegidos(libresVisibles.slice(0, vacantes).map((g) => g.id));

  const guardar = async () => {
    setGuardando(true);
    const fallos: string[] = [];
    let bien = 0;
    let reactivados = 0;

    // Uno detrás de otro: el servidor mira la ocupación de las plazas por
    // horario, y en paralelo dos peticiones verían la misma plaza libre.
    for (const id of elegidos) {
      try {
        await ApiService.post(`/tenant/${tenantId}/guard-assignment`, {
          data: {
            guardId: id,
            stationId,
            positionId: relevo.positionIds[0] || null,
            isRelief: false,
          },
        });
        bien += 1;
        if (archivadosTras.has(id)) reactivados += 1;
      } catch (e: any) {
        const g = todos.find((x) => x.id === id);

        fallos.push(
          `${g?.label || "—"}: ${e?.data?.message || e?.message || ""}`.trim(),
        );
      }
    }
    setGuardando(false);
    // Reactivar a un archivado vuelve a ocupar su asiento: se dice, porque
    // es justo lo que la oficina vigila al reutilizar gente entre eventos.
    if (bien)
      toast.success(
        t("ui.EventoDeLaEstacion.asignados", {
          defaultValue: "{{count}} vigilantes asignados",
          count: bien,
        }),
        reactivados
          ? {
              description: t("ui.EventoDeLaEstacion.reactivados", {
                defaultValue:
                  "{{count}} estaban archivados: se reactivaron y vuelven a ocupar su asiento.",
                count: reactivados,
              }),
            }
          : undefined,
      );
    // Un renglón por persona que no se pudo asignar (el aviso no respeta
    // los saltos de línea si no se le pide).
    if (fallos.length)
      toast.error(
        <span className="whitespace-pre-line">{fallos.join("\n")}</span>,
      );
    try {
      window.dispatchEvent(new CustomEvent("assignments:changed"));
    } catch {
      /* sin oyentes */
    }
    onDone();
  };

  return (
    <Modal
      description={t("ui.EventoDeLaEstacion.asignarTexto", {
        defaultValue:
          "{{tramo}} · quedan {{count}} plazas. Salen primero los libres a esas horas.",
        tramo: ventana
          ? tramoLegible(ventana.start, ventana.end)
          : `${relevo.inicio}–${relevo.fin}`,
        count: vacantes,
      })}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <Button
            disabled={!libresVisibles.length || guardando}
            size="sm"
            variant="outline"
            onClick={rellenar}
          >
            {t("ui.EventoDeLaEstacion.rellenar", {
              defaultValue: "Elegir los {{count}} primeros libres",
              count: Math.min(vacantes, libresVisibles.length),
            })}
          </Button>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={onClose}>
              {t("common.cancel", "Cancelar")}
            </Button>
            <Button
              disabled={!elegidos.length || guardando}
              size="sm"
              onClick={guardar}
            >
              {guardando ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-1.5 h-4 w-4" />
              )}
              {t("ui.EventoDeLaEstacion.asignarN", {
                defaultValue: "Asignar {{count}}",
                count: elegidos.length,
              })}
            </Button>
          </div>
        </div>
      }
      icon={<UserPlus />}
      open
      size="lg"
      title={t("ui.EventoDeLaEstacion.asignar", "Asignar vigilantes")}
      onOpenChange={(o) => !o && !guardando && onClose()}
    >
      <div className="space-y-3">
        <SearchInput
          placeholder={t("ui.EventoDeLaEstacion.buscar", "Buscar vigilante")}
          value={filtro}
          onChange={setFiltro}
        />
        <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
          {t("ui.EventoDeLaEstacion.elegidos", {
            defaultValue: "{{n}} de {{count}} elegidos",
            n: elegidos.length,
            count: vacantes,
          })}
        </p>
        {cargandoTodos || cargando ? (
          <div className="flex justify-center py-8">
            <Loader2 className="animate-spin brand-text" />
          </div>
        ) : (
          <ul className="max-h-[52vh] space-y-1 overflow-y-auto pr-1">
            {visibles.map((g) => {
              const on = elegidos.includes(g.id);
              const ocupado = g.libre === false;
              const lleno = !on && elegidos.length >= vacantes;

              return (
                <li key={g.id}>
                  <button
                    aria-pressed={on}
                    className="cg-focus flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition-colors disabled:opacity-45"
                    disabled={ocupado || lleno}
                    style={{
                      background: on
                        ? "color-mix(in oklab, var(--brand) 16%, transparent)"
                        : "transparent",
                    }}
                    type="button"
                    onClick={() => alternar(g.id)}
                  >
                    <span
                      aria-hidden
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded border"
                      style={{
                        borderColor: on ? "var(--brand)" : "var(--hairline)",
                        background: on ? "var(--brand)" : "transparent",
                        color: "var(--brand-ink)",
                      }}
                    >
                      {on && <Check className="h-3 w-3" />}
                    </span>
                    <Avatar name={g.label} size="sm" />
                    {/* El archivado tras un evento lleva el aviso DEBAJO del
                       nombre: como insignia a la derecha, con el nombre del
                       evento, se comía el nombre de la persona. */}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{g.label}</span>
                      {archivadosTras.has(g.id) && (
                        <span
                          className="block text-xs"
                          style={{ color: "var(--ink-soft)" }}
                        >
                          {t("ui.EventoDeLaEstacion.archivadoTras", {
                            defaultValue:
                              "Archivado tras «{{evento}}» · se reactiva al asignar",
                            evento: archivadosTras.get(g.id),
                          })}
                        </span>
                      )}
                    </span>
                    {ocupado ? (
                      <StatusBadge tone="warn">
                        {ocupadoEl.get(g.id)
                          ? t("ui.EventoDeLaEstacion.ocupadoEl", {
                              defaultValue: "Ocupado el {{dia}}",
                              dia: ocupadoEl.get(g.id),
                            })
                          : t(
                              "ui.EventoDeLaEstacion.ocupado",
                              "Ocupado a esa hora",
                            )}
                      </StatusBadge>
                    ) : archivadosTras.has(g.id) ? (
                      // En el teléfono la línea de debajo del nombre ya lo
                      // dice; la insignia le quitaba media fila.
                      <span className="hidden shrink-0 sm:inline-flex">
                        <StatusBadge tone="info">
                          {t("ui.EventoDeLaEstacion.archivado", "Archivado")}
                        </StatusBadge>
                      </span>
                    ) : g.libre ? (
                      <StatusBadge tone="ok">
                        {t("ui.EventoDeLaEstacion.libre", "Libre")}
                      </StatusBadge>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}

// ── TURNOS ─────────────────────────────────────────────────────────────────

type Estado = "programado" | "enTurno" | "cumplido" | "noFicho";

const TONO: Record<Estado, string> = {
  programado: "color-mix(in oklab, var(--brand) 55%, transparent)",
  enTurno: "var(--ok)",
  cumplido: "color-mix(in oklab, var(--ok) 45%, transparent)",
  noFicho: "var(--bad)",
};

/** Lo que pasó con un turno, mirando los fichajes de la estación. */
function estadoDe(s: Turno, fichajes: Fichaje[], ahora: Date): Estado {
  const suyo = fichajes.find(
    (f) =>
      f.nombre &&
      f.nombre === s.nombre &&
      f.entrada &&
      f.entrada.getTime() >= s.start.getTime() - 3 * 3600_000 &&
      f.entrada.getTime() <= s.end.getTime(),
  );

  if (suyo?.salida) return "cumplido";
  if (suyo?.entrada) return "enTurno";
  if (ahora.getTime() > s.start.getTime() + 15 * 60_000) return "noFicho";

  return "programado";
}

export function EventoTurnos({ station, stationId, postSiteId }: Props) {
  const { t } = useTranslation();
  const sede = useSede(postSiteId, true, station?.postSite);
  const { relevos, turnos, fichajes, cargando } = useEstacionDelEvento(
    stationId,
    station,
  );
  const { desde, hasta } = vigenciaDe(sede);
  const ahora = new Date();

  if (cargando) return <SkeletonCards count={2} />;

  if (!desde || !hasta) {
    return (
      <EmptyState
        icon={<Clock />}
        title={t(
          "ui.EventoDeLaEstacion.sinFechas",
          "El evento no tiene fechas",
        )}
      />
    );
  }

  // Sólo lo que cae DENTRO del evento: es lo único que esta pestaña cuenta.
  const delEvento = turnos.filter((s) => s.end > desde && s.start < hasta);
  const etiquetas: Record<Estado, string> = {
    programado: t("ui.EventoDeLaEstacion.programado", "Programado"),
    enTurno: t("ui.EventoDeLaEstacion.enTurno", "En turno"),
    cumplido: t("ui.EventoDeLaEstacion.cumplido", "Cumplido"),
    noFicho: t("ui.EventoDeLaEstacion.noFicho", "No ha fichado"),
  };

  const leyenda = (
    <div
      className="flex flex-wrap items-center gap-3 text-xs"
      style={{ color: "var(--ink-soft)" }}
    >
      {(Object.keys(TONO) as Estado[]).map((e) => (
        <span key={e} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2.5 w-4 rounded-sm"
            style={{ background: TONO[e] }}
          />
          {etiquetas[e]}
        </span>
      ))}
    </div>
  );

  if (!delEvento.length) {
    return (
      <EmptyState
        description={t(
          "ui.EventoDeLaEstacion.sinTurnosTexto",
          "Cuando asignes vigilantes en la pestaña Vigilantes, aquí sale el turno de cada uno dentro del evento.",
        )}
        icon={<Clock />}
        title={t("ui.EventoDeLaEstacion.sinTurnos", "Todavía sin turnos")}
      />
    );
  }

  const span = hasta.getTime() - desde.getTime();
  const pct = (d: Date) =>
    Math.max(0, Math.min(100, ((d.getTime() - desde.getTime()) / span) * 100));

  /* Un evento de hasta dos días cabe en una línea de tiempo por horas. Una
     feria de dos semanas no: se lee como lista por día. */
  if (span > 48 * 3600_000) {
    const porDia = new Map<string, Turno[]>();

    for (const s of delEvento) {
      const dia = fechaYHora(s.start, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: undefined,
        hour: undefined,
        minute: undefined,
      });

      porDia.set(dia, [...(porDia.get(dia) || []), s]);
    }

    return (
      <div className="space-y-4">
        <InfoNote tone="brand">
          {rangoDelEvento(sede?.vigenteDesde, sede?.vigenteHasta)}
        </InfoNote>
        {leyenda}
        {[...porDia.entries()].map(([dia, lista]) => (
          <Section key={dia} icon={<Clock />} title={dia}>
            <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
              {lista.map((s) => {
                const e = estadoDe(s, fichajes, ahora);

                return (
                  <li
                    key={s.id}
                    className="flex items-center gap-3 py-2 text-sm"
                  >
                    <span className="w-28 font-mono tabular-nums">
                      {soloHora(s.start)}–{soloHora(s.end)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{s.nombre}</span>
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{ background: TONO[e], color: "var(--ink)" }}
                    >
                      {etiquetas[e]}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Section>
        ))}
      </div>
    );
  }

  /* Marcas de hora: unas doce como mucho. Con «cada 2 h» un evento de 48 h
     metía 24 rótulos en 720 px y se pisaban («06:0008:00»). */
  const paso =
    [1, 2, 3, 4, 6, 12].find((h) => span / (h * 3600_000) <= 12) || 12;
  const marcas: Date[] = [];
  const primera = new Date(desde);

  primera.setMinutes(0, 0, 0);
  if (primera < desde) primera.setTime(primera.getTime() + 3600_000);
  for (let m = primera.getTime(); m <= hasta.getTime(); m += paso * 3600_000)
    marcas.push(new Date(m));
  const ahoraDentro = ahora > desde && ahora < hasta;

  const grupos = relevos.length
    ? relevos.map((r, i) => ({
        clave: `${r.inicio}-${r.fin}`,
        titulo:
          relevos.length > 1
            ? t("ui.EventoDeLaEstacion.relevoN", {
                defaultValue: "Relevo {{n}} · {{inicio}}–{{fin}}",
                n: i + 1,
                inicio: r.inicio,
                fin: r.fin,
              })
            : `${r.inicio}–${r.fin}`,
        lista: delEvento.filter(
          (s) => soloHora(s.start) === r.inicio || relevos.length === 1,
        ),
      }))
    : [{ clave: "todos", titulo: "", lista: delEvento }];
  // Lo que no casa con ningún relevo (un turno movido a mano) no se pierde.
  const sueltos = delEvento.filter(
    (s) => !grupos.some((g) => g.lista.includes(s)),
  );

  if (sueltos.length)
    grupos.push({
      clave: "otros",
      titulo: t("ui.EventoDeLaEstacion.otros", "Otros turnos"),
      lista: sueltos,
    });

  return (
    <div className="space-y-3">
      <InfoNote tone="brand">
        <span className="font-semibold">
          {rangoDelEvento(sede?.vigenteDesde, sede?.vigenteHasta)}
        </span>
        {" · "}
        {t("ui.EventoDeLaEstacion.nTurnos", {
          defaultValue: "{{count}} turnos",
          count: delEvento.length,
        })}
      </InfoNote>
      {leyenda}
      <div className="glass-flat overflow-x-auto p-3">
        <div className="min-w-[720px]">
          {/* Regla de horas */}
          <div className="flex">
            <div className="w-44 shrink-0" />
            <div className="relative h-6 flex-1">
              {marcas.map((m) => (
                <span
                  key={m.getTime()}
                  className={`absolute text-[11px] tabular-nums ${
                    pct(m) > 97
                      ? "-translate-x-full"
                      : pct(m) < 3
                        ? ""
                        : "-translate-x-1/2"
                  }`}
                  style={{ left: `${pct(m)}%`, color: "var(--ink-soft)" }}
                >
                  {soloHora(m)}
                </span>
              ))}
            </div>
          </div>
          {grupos.map((g) => (
            <div key={g.clave} className="mt-2">
              {g.titulo && (
                <p
                  className="mb-1 text-xs font-semibold uppercase tracking-wide"
                  style={{ color: "var(--ink-soft)" }}
                >
                  {g.titulo}
                </p>
              )}
              {g.lista.map((s) => {
                const e = estadoDe(s, fichajes, ahora);

                return (
                  <div key={s.id} className="flex items-center">
                    <div className="w-44 shrink-0 truncate pr-2 text-sm">
                      {s.nombre}
                    </div>
                    <div
                      className="relative h-7 flex-1 border-l"
                      style={{ borderColor: "var(--hairline)" }}
                    >
                      {marcas.map((m) => (
                        <span
                          key={m.getTime()}
                          aria-hidden
                          className="absolute inset-y-0 w-px"
                          style={{
                            left: `${pct(m)}%`,
                            background: "var(--hairline)",
                          }}
                        />
                      ))}
                      {ahoraDentro && (
                        <span
                          aria-hidden
                          className="absolute inset-y-0 w-0.5"
                          style={{
                            left: `${pct(ahora)}%`,
                            background: "var(--bad)",
                          }}
                        />
                      )}
                      <div
                        className="absolute inset-y-1 flex items-center overflow-hidden rounded-md px-2 text-[11px] font-medium"
                        style={{
                          left: `${pct(s.start)}%`,
                          width: `${Math.max(1.5, pct(s.end) - pct(s.start))}%`,
                          background: TONO[e],
                          color: "var(--ink)",
                        }}
                        title={`${s.nombre} · ${tramoLegible(s.start, s.end)} · ${etiquetas[e]}`}
                      >
                        <span className="truncate tabular-nums">
                          {soloHora(s.start)}–{soloHora(s.end)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
