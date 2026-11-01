import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  CalendarClock,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  LocateFixed,
  Mail,
  MapPin,
  MessageCircle,
  RefreshCw,
  Shield,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";

import AppLayout from "@/layouts/app-layout";
import {
  FIELD_CLS,
  FormField,
  InfoNote,
  PageContainer,
  PageHeader,
  SearchInput,
  Section,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import { MultiSelectDeSedes } from "@/components/MultiSelectDeSedes";
import JornadaEnLinea from "@/components/alta/JornadaEnLinea";
import { roleDisplayDescription, roleDisplayName } from "@/config/roleLabels";
import { ApiService } from "@/services/api/apiService";
import {
  supervisorPositionService,
  type SupervisorPosition,
} from "@/lib/api/supervisorPositionService";
import { crearPersona, filasDe, mensajeDeError } from "@/lib/crearPersona";
import { presetLunesAViernes } from "@/lib/jornadaSemanal";
import { plazasElegibles } from "@/pages/admin/programmer/AsignarAPuestoModal";
import {
  admiteSinCorreo,
  datosVacios,
  dondeTerminarHorario,
  enlaceDeWhatsApp,
  fichaDe,
  llevaDocumento,
  mensajeDeAcceso,
  pendientes,
  puedeSeguir,
  rolesDeOficina,
  rolVeTodo,
  plazaEnPalabras,
  rotacionDePlaza,
  rotacionEnPalabras,
  horasDe,
  semanaEnPalabras,
  tipoDeParam,
  turnoEnPalabras,
  validarDatos,
  validarLugar,
  type Datos,
  type ErrorDeCampo,
  type Horario,
  type OficinaFisica,
  type Paso,
  type Resultado,
  type RolDeOficina,
  type TipoDePersona,
} from "@/lib/agregarPersona";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «AGREGAR PERSONA» — one flow for guards, supervisors and office people,
 * with their schedule (Mike 2026-10-31: «haz todo»).
 *
 *   1 ¿Qué hace?   2 ¿Quién es?   3 ¿Dónde y cuándo trabaja?   4 Revisa y crea
 *
 * Nothing is written until «Crear». Then: the person (the same calls the old
 * forms make), their schedule (station seat, supervisor post or office week)
 * and, for the office, their location. If the person is created but the
 * schedule fails, the summary says so and offers where to finish it — the
 * person is never lost because of the second step.
 * ════════════════════════════════════════════════════════════════════════════
 */

const tenantId = () => localStorage.getItem("tenantId") || "";
const hoyLocal = () => {
  const d = new Date();

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const filas = filasDe;

type Sede = { id: string; name: string; clientIds: string[] };
type Overview = {
  stations: any[];
  positions: any[];
  assignments: any[];
  rotationStyles: any[];
};

/** Option card used by step 1 and the scope choice. */
function Opcion({
  activa,
  icono,
  titulo,
  texto,
  onClick,
  id,
}: {
  activa: boolean;
  icono?: React.ReactNode;
  titulo: React.ReactNode;
  texto: React.ReactNode;
  onClick: () => void;
  id: string;
}) {
  return (
    <button
      aria-pressed={activa}
      className="cg-focus flex min-w-0 items-start gap-3 rounded-xl border px-4 py-3 text-left transition"
      id={id}
      style={{
        borderColor: activa ? "var(--brand)" : "var(--hairline)",
        background: activa
          ? "color-mix(in oklab, var(--brand) 8%, transparent)"
          : "transparent",
      }}
      type="button"
      onClick={onClick}
    >
      {icono && (
        <span
          className="mt-0.5 shrink-0"
          style={{ color: activa ? "var(--brand-text)" : "var(--ink-soft)" }}
        >
          {icono}
        </span>
      )}
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{titulo}</span>
        <span className="block text-xs" style={{ color: "var(--ink-soft)" }}>
          {texto}
        </span>
      </span>
    </button>
  );
}

/** A selectable row of a list (seat or supervisor post). */
function Fila({
  activa,
  titulo,
  detalle,
  libre,
  bloqueada = false,
  onClick,
}: {
  activa: boolean;
  titulo: string;
  detalle: string;
  libre: boolean;
  /** An occupied guard seat cannot take another guard: shown, not selectable. */
  bloqueada?: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();

  return (
    <button
      aria-pressed={activa}
      className="cg-focus flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[var(--glass-sunken)] disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-transparent"
      disabled={bloqueada}
      style={
        activa
          ? { background: "color-mix(in oklab, var(--brand) 10%, transparent)" }
          : undefined
      }
      type="button"
      onClick={onClick}
    >
      <span
        aria-hidden
        className="grid size-5 shrink-0 place-items-center rounded-full border"
        style={{
          borderColor: activa ? "var(--brand)" : "var(--hairline)",
          background: activa ? "var(--brand)" : "transparent",
          color: "var(--brand-ink)",
        }}
      >
        {activa && <Check size={12} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{titulo}</span>
        <span
          className="block truncate text-[12px]"
          style={{ color: "var(--ink-soft)" }}
        >
          {detalle}
        </span>
      </span>
      <span
        className="shrink-0 text-[11px] font-semibold"
        style={{ color: libre ? "var(--ok-text)" : "var(--ink-faint)" }}
      >
        {libre
          ? t("ui.AllStaff.plazaVacante", "Vacante")
          : t("ui.AllStaff.plazaOcupada", "Ocupada")}
      </span>
    </button>
  );
}

export default function AgregarPersonaPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const tipoInicial = tipoDeParam(params.get("tipo"));

  const [tipo, setTipo] = useState<TipoDePersona | null>(tipoInicial);
  const [paso, setPaso] = useState<Paso>(tipoInicial ? 2 : 1);
  const [datos, setDatos] = useState<Datos>(datosVacios);
  const [tocado, setTocado] = useState(false);
  const [horario, setHorario] = useState<Horario>(null);
  /** «Lo hago después» chosen explicitly in step 3. */
  const [despues, setDespues] = useState(false);
  const [creando, setCreando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  // Catalogues, loaded on demand.
  const [roles, setRoles] = useState<RolDeOficina[]>([]);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [puestosSup, setPuestosSup] = useState<SupervisorPosition[] | null>(
    null,
  );
  const [cargando, setCargando] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  const cambiar = (delta: Partial<Datos>) =>
    setDatos((d) => ({ ...d, ...delta }));
  const errores = useMemo(
    () => (tipo ? validarDatos(tipo, datos) : {}),
    [tipo, datos],
  );
  const rolElegido = roles.find((r) => r.id === datos.rol) || null;

  // ── Loading ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (tipo !== "oficina" || roles.length) return;
    (async () => {
      try {
        const [r, s] = await Promise.all([
          ApiService.get(`/tenant/${tenantId()}/role`),
          ApiService.get(`/tenant/${tenantId()}/business-info`).catch(
            () => null,
          ),
        ]);

        setRoles(rolesDeOficina(filas(r) as RolDeOficina[]));
        setSedes(
          filas(s).map((x: any) => ({
            id: String(x.id),
            name: String(x.companyName ?? x.name ?? ""),
            clientIds:
              x.clientIds || (x.clientAccountId ? [x.clientAccountId] : []),
          })),
        );
      } catch (e: any) {
        toast.error(
          mensajeDeError(
            e,
            t(
              "agregarPersona.errores.cargarRoles",
              "No se pudieron cargar los roles",
            ),
          ),
        );
      }
    })();
  }, [tipo, roles.length, t]);

  const cargarLugares = useCallback(async () => {
    if (!tipo || tipo === "oficina") return;
    setCargando(true);
    try {
      if (tipo === "vigilante") {
        const hoy = hoyLocal();
        const r: any = await ApiService.get(
          `/tenant/${tenantId()}/scheduler/overview?startDate=${hoy}&endDate=${hoy}`,
        );
        const ov = r?.data || r || {};

        setOverview({
          stations: ov.stations || [],
          positions: ov.positions || [],
          assignments: ov.assignments || [],
          rotationStyles: ov.rotationStyles || [],
        });
      } else {
        const r = await supervisorPositionService.list();

        setPuestosSup((r?.rows || []).filter((p) => p.isActive !== false));
      }
    } catch (e: any) {
      toast.error(
        mensajeDeError(
          e,
          t(
            "agregarPersona.errores.cargarPuestos",
            "No se pudieron cargar los puestos",
          ),
        ),
      );
    } finally {
      setCargando(false);
    }
  }, [tipo, t]);

  useEffect(() => {
    if (paso !== 3) return;
    if (tipo === "vigilante" && !overview) cargarLugares();
    if (tipo === "supervisor" && !puestosSup) cargarLugares();
  }, [paso, tipo, overview, puestosSup, cargarLugares]);

  // The schedule draft starts in the shape of the chosen type.
  useEffect(() => {
    if (!tipo) return;
    setHorario((h) => {
      if (h && h.tipo === tipo) return h;
      if (tipo === "oficina")
        return {
          tipo,
          jornada: presetLunesAViernes(),
          desde: hoyLocal(),
          oficina: null,
        };
      if (tipo === "vigilante")
        return { tipo, stationId: "", positionId: "", desde: hoyLocal() };

      return { tipo, positionId: "", desde: hoyLocal() };
    });
  }, [tipo]);

  // ── Seats and posts, in words ─────────────────────────────────────────────
  const plazas = useMemo(() => {
    if (!overview) return [];
    const estPorId = new Map(
      overview.stations.map((s: any) => [String(s.id), s]),
    );
    const plazaPorId = new Map(
      overview.positions.map((p: any) => [String(p.id), p]),
    );

    return plazasElegibles(
      overview.stations,
      overview.positions,
      overview.assignments,
    ).map((p) => {
      const plaza = plazaPorId.get(p.positionId);
      const est = estPorId.get(p.stationId);
      const rot = rotacionDePlaza(plaza, est, overview.rotationStyles);

      return {
        ...p,
        sinRotacion: !rot,
        detalle: [
          plazaEnPalabras(p.plaza, plaza?.startTime, plaza?.endTime, t, rot),
          turnoEnPalabras(rot, plaza?.startTime, plaza?.endTime, t),
        ]
          .filter(Boolean)
          .join(" · "),
      };
    });
  }, [overview, t]);

  /** Rotation styles in words, for a seat that has none yet. */
  const estilosDeRotacion = useMemo(() => {
    const lista = (overview?.rotationStyles || []).map((s: any) => ({
      id: String(s.id),
      palabras: rotacionEnPalabras(s, t),
      nombre: String(s.name || ""),
    }));
    const repetidas = new Set(
      lista.map((x) => x.palabras).filter((p, i, a) => a.indexOf(p) !== i),
    );

    return lista.map((x) => ({
      id: x.id,
      etiqueta:
        repetidas.has(x.palabras) && x.nombre
          ? `${x.palabras} (${x.nombre})`
          : x.palabras,
    }));
  }, [overview, t]);

  const plazasVisibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();

    return q
      ? plazas.filter((p) => `${p.puesto} ${p.plaza}`.toLowerCase().includes(q))
      : plazas;
  }, [plazas, busqueda]);

  const puestos = useMemo(
    () =>
      (puestosSup || []).map((p) => {
        const ocupados = (p.assignments || []).filter(
          (a) => a.status === "active" && !a.isRelief,
        ).length;

        return {
          id: p.id,
          titulo: [p.name, p.zone].filter(Boolean).join(" · "),
          detalle: turnoEnPalabras(
            p.rotationStyle as any,
            p.startTime,
            p.endTime,
            t,
          ),
          libre: ocupados < Math.max(1, Number(p.guardsNeeded) || 1),
          sinRotacion: !p.rotationStyle,
        };
      }),
    [puestosSup, t],
  );

  // ── Navigation ────────────────────────────────────────────────────────────
  const horarioEfectivo: Horario = despues ? null : horario;
  const listoParaSeguir = puedeSeguir(paso, tipo, datos, horarioEfectivo);
  const siguiente = () => {
    if (paso === 2 && !listoParaSeguir) {
      setTocado(true);

      return;
    }
    if (listoParaSeguir && paso < 4) setPaso((p) => (p + 1) as Paso);
  };
  const atras = () => {
    if (paso > 1) setPaso((p) => (p - 1) as Paso);
    else navigate(-1);
  };
  const elegirTipo = (nuevo: TipoDePersona) => {
    setTipo(nuevo);
    setDespues(false);
    if (nuevo === "oficina") cambiar({ sinCorreo: false });
    setPaso(2);
  };

  const errorDeCampo = (e?: ErrorDeCampo) =>
    !tocado || !e
      ? undefined
      : e === "requerido"
        ? t("agregarPersona.errores.requerido", "Falta este dato")
        : e === "correoInvalido"
          ? t(
              "agregarPersona.errores.correoInvalido",
              "Revisa el correo: debe ser como nombre@empresa.com",
            )
          : e === "celularInvalido"
            ? t(
                "agregarPersona.errores.celularInvalido",
                "Revisa el celular: tiene que tener al menos 7 números",
              )
            : t(
                "agregarPersona.errores.sedesVacias",
                "Elige al menos una sede, o «Toda la operación»",
              );

  // ── Labels ────────────────────────────────────────────────────────────────
  const nombreDeTipo = (x: TipoDePersona) =>
    x === "vigilante"
      ? t("agregarPersona.tipo.vigilante", "Vigilante")
      : x === "supervisor"
        ? t("agregarPersona.tipo.supervisor", "Supervisor")
        : t("agregarPersona.tipo.oficina", "Personal de oficina");
  const nombreCompleto =
    `${datos.nombres.trim()} ${datos.apellidos.trim()}`.trim();

  const horarioEnPalabras = (): string[] => {
    const h = horarioEfectivo;

    if (!h)
      return [t("agregarPersona.resumen.horarioDespues", "Lo pondrás después")];
    if (h.tipo === "vigilante") {
      const p = plazas.find((x) => x.positionId === h.positionId);
      const elegida = h.sinRotacion
        ? estilosDeRotacion.find((x) => x.id === h.rotationStyleId)
        : null;

      if (p && elegida) {
        const plaza = overview?.positions.find(
          (x: any) => String(x.id) === h.positionId,
        );

        return [
          `${p.puesto} · ${[p.plaza, elegida.etiqueta, horasDe(plaza?.startTime, plaza?.endTime)].filter(Boolean).join(" · ")}`,
        ];
      }

      return p ? [`${p.puesto} · ${p.detalle}`] : [];
    }
    if (h.tipo === "supervisor") {
      const p = puestos.find((x) => x.id === h.positionId);

      return p ? [`${p.titulo} · ${p.detalle}`] : [];
    }

    return semanaEnPalabras(h.jornada, t);
  };

  const accesoEnPalabras = () => {
    if (!tipo) return "";
    if (!(admiteSinCorreo(tipo) && datos.sinCorreo))
      return t("agregarPersona.resumen.accesoCorreo", {
        defaultValue:
          "Le llega un correo a {{correo}} para crear su contraseña",
        correo: datos.correo.trim(),
      });
    if (tipo === "vigilante" && datos.celular.trim())
      return t(
        "agregarPersona.resumen.accesoCelular",
        "Te damos su usuario y un enlace para mandárselo por WhatsApp",
      );

    return t(
      "agregarPersona.resumen.accesoUsuario",
      "Te damos su usuario y un enlace para compartírselo en mano",
    );
  };

  // ── «Crear» ───────────────────────────────────────────────────────────────
  // The calls live in lib/crearPersona (shared with «Agregar varias personas»).
  const crear = async () => {
    if (!tipo || creando) return;
    setCreando(true);
    try {
      const r = await crearPersona(tipo, datos, horarioEfectivo, {
        sedes,
        rol: rolElegido,
        t,
      });

      setResultado(r);
      toast.success(
        t("agregarPersona.listo.toast", {
          defaultValue: "{{nombre}} ya está en el sistema",
          nombre: r.nombre,
        }),
      );
    } catch (e: any) {
      // The person could not be created: nothing was written, stay on the step.
      toast.error(
        mensajeDeError(
          e,
          t("agregarPersona.errores.crear", "No se pudo crear a la persona"),
        ),
      );
    } finally {
      setCreando(false);
    }
  };

  const empezarDeNuevo = () => {
    setResultado(null);
    setDatos(datosVacios());
    setTocado(false);
    setDespues(false);
    setHorario(null);
    setOverview(null);
    setPuestosSup(null);
    setBusqueda("");
    setTipo(null);
    setPaso(1);
  };

  // ── Rendering ─────────────────────────────────────────────────────────────
  const PASOS: Array<{ n: Paso; titulo: string }> = [
    { n: 1, titulo: t("agregarPersona.pasos.queHace", "¿Qué hace?") },
    { n: 2, titulo: t("agregarPersona.pasos.quienEs", "¿Quién es?") },
    {
      n: 3,
      titulo: t(
        "agregarPersona.pasos.dondeYCuando",
        "¿Dónde y cuándo trabaja?",
      ),
    },
    { n: 4, titulo: t("agregarPersona.pasos.revisa", "Revisa y crea") },
  ];

  return (
    <AppLayout>
      <PageContainer className="pb-28" width="default">
        <PageHeader
          actions={
            // Bulk add: same calls, a whole list at once (lib/crearPersona).
            !resultado && paso === 1 ? (
              <Button asChild variant="outline">
                <Link id="alta-varias" to="/personal/varias">
                  {t(
                    "agregarVarias.entrada",
                    "¿Son varias? Agrégalas de una vez",
                  )}
                </Link>
              </Button>
            ) : undefined
          }
          icon={<UserPlus />}
          subtitle={t(
            "agregarPersona.subtitulo",
            "Vigilantes, supervisores y personal de oficina, con su horario. Nada se guarda hasta que toques «Crear».",
          )}
          title={t("agregarPersona.titulo", "Agregar persona")}
        />

        {!resultado && (
          <ol
            aria-label={t("agregarPersona.pasos.aria", "Pasos")}
            className="mb-4 flex flex-wrap items-center gap-2"
          >
            {PASOS.map((p) => {
              const hecho = p.n < paso;
              const actual = p.n === paso;

              return (
                <li key={p.n} className="flex items-center gap-2">
                  <button
                    aria-current={actual ? "step" : undefined}
                    className="cg-focus inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold disabled:cursor-default"
                    disabled={!hecho}
                    style={{
                      borderColor: actual ? "var(--brand)" : "var(--hairline)",
                      background: actual
                        ? "color-mix(in oklab, var(--brand) 10%, transparent)"
                        : "transparent",
                      color: actual
                        ? "var(--brand-text)"
                        : hecho
                          ? "var(--ink)"
                          : "var(--ink-faint)",
                    }}
                    type="button"
                    onClick={() => hecho && setPaso(p.n)}
                  >
                    <span
                      className="grid size-5 place-items-center rounded-full text-[11px] tabular-nums"
                      style={{
                        background:
                          hecho || actual
                            ? "var(--brand)"
                            : "var(--glass-sunken)",
                        color:
                          hecho || actual
                            ? "var(--brand-ink)"
                            : "var(--ink-faint)",
                      }}
                    >
                      {hecho ? <Check size={12} /> : p.n}
                    </span>
                    {p.titulo}
                  </button>
                </li>
              );
            })}
          </ol>
        )}

        {resultado ? (
          <Listo
            r={resultado}
            semana={horarioEnPalabras()}
            onOtra={empezarDeNuevo}
            onVer={(url) => navigate(url)}
          />
        ) : (
          <Section
            icon={
              paso === 1 ? (
                <UserPlus />
              ) : paso === 2 ? (
                <UserPlus />
              ) : paso === 3 ? (
                <CalendarClock />
              ) : (
                <CheckCircle2 />
              )
            }
            title={PASOS[paso - 1].titulo}
          >
            <div className="space-y-6">
              {/* ── 1 · ¿Qué hace? ─────────────────────────────────────── */}
              {paso === 1 && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <Opcion
                    activa={tipo === "vigilante"}
                    icono={<Shield size={18} />}
                    id="alta-tipo-vigilante"
                    texto={t(
                      "agregarPersona.tipo.vigilanteTexto",
                      "Cuida un puesto en una estación. Su horario sale de la rotación del puesto.",
                    )}
                    titulo={nombreDeTipo("vigilante")}
                    onClick={() => elegirTipo("vigilante")}
                  />
                  <Opcion
                    activa={tipo === "supervisor"}
                    icono={<ShieldCheck size={18} />}
                    id="alta-tipo-supervisor"
                    texto={t(
                      "agregarPersona.tipo.supervisorTexto",
                      "Recorre y supervisa varias estaciones. Su horario sale de su puesto de supervisión.",
                    )}
                    titulo={nombreDeTipo("supervisor")}
                    onClick={() => elegirTipo("supervisor")}
                  />
                  <Opcion
                    activa={tipo === "oficina"}
                    icono={<Briefcase size={18} />}
                    id="alta-tipo-oficina"
                    texto={t(
                      "agregarPersona.tipo.oficinaTexto",
                      "Administración, despacho, recursos humanos. Tiene un horario semanal y marca en el reloj web.",
                    )}
                    titulo={nombreDeTipo("oficina")}
                    onClick={() => elegirTipo("oficina")}
                  />
                </div>
              )}

              {/* ── 2 · ¿Quién es? ─────────────────────────────────────── */}
              {paso === 2 && tipo && (
                <>
                  <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                    {t("agregarPersona.paso2.vasAAgregar", {
                      defaultValue: "Vas a agregar: {{tipo}}.",
                      tipo: nombreDeTipo(tipo),
                    })}{" "}
                    <button
                      className="cg-btn-link underline-offset-4 hover:underline"
                      type="button"
                      onClick={() => setPaso(1)}
                    >
                      {t("agregarPersona.paso2.cambiarTipo", "Cambiar")}
                    </button>
                  </p>
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                    <FormField
                      required
                      error={errorDeCampo(errores.nombres)}
                      htmlFor="alta-nombres"
                      label={t("agregarPersona.campos.nombres", "Nombres")}
                    >
                      <input
                        autoComplete="off"
                        className={FIELD_CLS}
                        id="alta-nombres"
                        placeholder={t(
                          "agregarPersona.campos.nombresEj",
                          "Ej. Carlos Andrés",
                        )}
                        value={datos.nombres}
                        onChange={(e) => cambiar({ nombres: e.target.value })}
                      />
                    </FormField>
                    <FormField
                      required
                      error={errorDeCampo(errores.apellidos)}
                      htmlFor="alta-apellidos"
                      label={t("agregarPersona.campos.apellidos", "Apellidos")}
                    >
                      <input
                        autoComplete="off"
                        className={FIELD_CLS}
                        id="alta-apellidos"
                        placeholder={t(
                          "agregarPersona.campos.apellidosEj",
                          "Ej. Ruiz Mora",
                        )}
                        value={datos.apellidos}
                        onChange={(e) => cambiar({ apellidos: e.target.value })}
                      />
                    </FormField>
                    {llevaDocumento(tipo) && (
                      <FormField
                        hint={t(
                          "agregarPersona.campos.documentoAyuda",
                          "Cédula, DUI, pasaporte… Opcional: lo puedes poner después.",
                        )}
                        htmlFor="alta-documento"
                        label={t(
                          "agregarPersona.campos.documento",
                          "Número de identificación",
                        )}
                      >
                        <input
                          autoComplete="off"
                          className={FIELD_CLS}
                          id="alta-documento"
                          value={datos.documento}
                          onChange={(e) =>
                            cambiar({ documento: e.target.value })
                          }
                        />
                      </FormField>
                    )}
                    {tipo !== "oficina" && (
                      <FormField
                        error={errorDeCampo(errores.celular)}
                        hint={
                          tipo === "vigilante"
                            ? t(
                                "agregarPersona.campos.celularAyuda",
                                "Si no tiene correo, con su celular te damos el enlace para WhatsApp.",
                              )
                            : undefined
                        }
                        htmlFor="alta-celular"
                        label={t("agregarPersona.campos.celular", "Celular")}
                      >
                        <input
                          autoComplete="off"
                          className={FIELD_CLS}
                          id="alta-celular"
                          inputMode="tel"
                          placeholder="+593 99 123 4567"
                          value={datos.celular}
                          onChange={(e) => cambiar({ celular: e.target.value })}
                        />
                      </FormField>
                    )}
                    <FormField
                      error={errorDeCampo(errores.correo)}
                      hint={
                        datos.sinCorreo && admiteSinCorreo(tipo)
                          ? undefined
                          : t(
                              "agregarPersona.campos.correoAyuda",
                              "Recomendado: le llega la invitación sola y puede recuperar su contraseña por correo.",
                            )
                      }
                      htmlFor="alta-correo"
                      label={t(
                        "agregarPersona.campos.correo",
                        "Correo electrónico",
                      )}
                      required={!(datos.sinCorreo && admiteSinCorreo(tipo))}
                    >
                      <input
                        autoComplete="off"
                        className={FIELD_CLS}
                        disabled={datos.sinCorreo && admiteSinCorreo(tipo)}
                        id="alta-correo"
                        inputMode="email"
                        placeholder="nombre@empresa.com"
                        value={
                          datos.sinCorreo && admiteSinCorreo(tipo)
                            ? ""
                            : datos.correo
                        }
                        onChange={(e) => cambiar({ correo: e.target.value })}
                      />
                      {admiteSinCorreo(tipo) && (
                        <label
                          className="mt-2 flex cursor-pointer items-center gap-2 text-sm"
                          htmlFor="alta-sin-correo"
                        >
                          <input
                            checked={datos.sinCorreo}
                            className="cg-focus"
                            id="alta-sin-correo"
                            type="checkbox"
                            onChange={(e) =>
                              cambiar({
                                sinCorreo: e.target.checked,
                                ...(e.target.checked ? { correo: "" } : {}),
                              })
                            }
                          />
                          {t(
                            "agregarPersona.campos.sinCorreo",
                            "No tiene correo (entra con un usuario)",
                          )}
                        </label>
                      )}
                      {admiteSinCorreo(tipo) && datos.sinCorreo && (
                        <p
                          className="mt-1.5 text-xs leading-relaxed"
                          style={{ color: "var(--ink-soft)" }}
                        >
                          {t(
                            "agregarPersona.campos.sinCorreoAyuda",
                            "El enlace se lo das tú: al terminar, «Compartir por WhatsApp» abre tu WhatsApp con el mensaje listo y lo envías desde tu teléfono. Si después consigue correo, agrégalo en su ficha.",
                          )}
                        </p>
                      )}
                    </FormField>
                    {admiteSinCorreo(tipo) && datos.sinCorreo && (
                      <FormField
                        hint={t(
                          "agregarPersona.campos.usuarioAyuda",
                          "Opcional. Si lo dejas vacío, el sistema le pone uno.",
                        )}
                        htmlFor="alta-usuario"
                        label={t(
                          "agregarPersona.campos.usuario",
                          "Usuario para entrar",
                        )}
                      >
                        <input
                          autoComplete="off"
                          className={FIELD_CLS}
                          id="alta-usuario"
                          placeholder="cruiz"
                          value={datos.usuario}
                          onChange={(e) => cambiar({ usuario: e.target.value })}
                        />
                      </FormField>
                    )}
                  </div>

                  {tipo === "oficina" && (
                    <div className="space-y-5">
                      <FormField
                        required
                        error={errorDeCampo(errores.rol)}
                        hint={
                          rolElegido
                            ? roleDisplayDescription(
                                String(
                                  rolElegido.slug || rolElegido.name || "",
                                ),
                              )
                            : undefined
                        }
                        htmlFor="alta-rol"
                        label={t(
                          "agregarPersona.campos.rol",
                          "¿Qué puede hacer? (rol)",
                        )}
                      >
                        <select
                          className={FIELD_CLS}
                          id="alta-rol"
                          value={datos.rol}
                          onChange={(e) => cambiar({ rol: e.target.value })}
                        >
                          <option value="">
                            {t(
                              "agregarPersona.campos.rolElige",
                              "Elige su rol",
                            )}
                          </option>
                          {roles.map((r) => (
                            <option key={r.id} value={r.id}>
                              {roleDisplayName(
                                String(r.slug || r.name || r.id),
                              )}
                            </option>
                          ))}
                        </select>
                      </FormField>
                      <div className="space-y-2">
                        <p className="text-sm font-medium">
                          {t("agregarPersona.campos.queVe", "¿Qué puede ver?")}
                        </p>
                        {rolVeTodo(rolElegido) ? (
                          <InfoNote tone="neutral">
                            {t(
                              "agregarPersona.campos.rolVeTodo",
                              "Este rol ve toda la operación por definición: no se puede acotar.",
                            )}
                          </InfoNote>
                        ) : (
                          <>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                              <Opcion
                                activa={datos.alcance === "todo"}
                                id="alta-alcance-todo"
                                texto={t(
                                  "ui.NewAdminUser.veTodosLosClientes",
                                  "Ve todos los clientes y todas las sedes. Es lo normal para la oficina.",
                                )}
                                titulo={t(
                                  "ui.NewAdminUser.todaLaOperacion2",
                                  "Toda la operación",
                                )}
                                onClick={() =>
                                  cambiar({ alcance: "todo", sedes: [] })
                                }
                              />
                              <Opcion
                                activa={datos.alcance === "sedes"}
                                id="alta-alcance-sedes"
                                texto={t(
                                  "ui.NewAdminUser.paraQuienLlevaUnasCuentas",
                                  "Para quien lleva unas cuentas concretas y no debe ver el resto.",
                                )}
                                titulo={t(
                                  "agregarPersona.campos.soloSedes",
                                  "Solo algunas sedes",
                                )}
                                onClick={() => cambiar({ alcance: "sedes" })}
                              />
                            </div>
                            {datos.alcance === "sedes" && (
                              <FormField
                                error={errorDeCampo(errores.sedes)}
                                label={t("ui.EditAdminUser.sedes", "Sedes")}
                              >
                                <MultiSelectDeSedes
                                  options={sedes}
                                  placeholder={t(
                                    "comun.elegirSedes",
                                    "Elegir sedes",
                                  )}
                                  value={datos.sedes}
                                  onChange={(ids) => cambiar({ sedes: ids })}
                                />
                              </FormField>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ── 3 · ¿Dónde y cuándo trabaja? ───────────────────────── */}
              {paso === 3 && tipo && horario && (
                <>
                  {despues ? (
                    <InfoNote
                      icon={<CalendarClock />}
                      title={t(
                        "agregarPersona.paso3.despuesTitulo",
                        "Le pondrás el horario después",
                      )}
                      tone="neutral"
                    >
                      {t(
                        "agregarPersona.paso3.despuesTexto",
                        "Al terminar te decimos dónde hacerlo. Ya aparece en Turnos › Horario aunque todavía no acepte su invitación.",
                      )}{" "}
                      <button
                        className="cg-btn-link font-semibold underline-offset-4 hover:underline"
                        type="button"
                        onClick={() => setDespues(false)}
                      >
                        {t(
                          "agregarPersona.paso3.mejorAhora",
                          "Mejor ponerlo ahora",
                        )}
                      </button>
                    </InfoNote>
                  ) : (
                    <>
                      {horario.tipo === "vigilante" && (
                        <div className="space-y-3">
                          <p
                            className="text-sm"
                            style={{ color: "var(--ink-soft)" }}
                          >
                            {t(
                              "agregarPersona.paso3.vigilanteIntro",
                              "Elige el puesto que va a cubrir. Su horario es la rotación de ese puesto: no hay que armarlo a mano.",
                            )}
                          </p>
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="min-w-0 flex-1">
                              <SearchInput
                                placeholder={t(
                                  "ui.AllStaff.buscarPuesto",
                                  "Buscar puesto…",
                                )}
                                value={busqueda}
                                onChange={setBusqueda}
                              />
                            </div>
                            <Button
                              size="sm"
                              type="button"
                              variant="ghost"
                              onClick={cargarLugares}
                            >
                              <RefreshCw size={14} />
                              {t("agregarPersona.paso3.recargar", "Recargar")}
                            </Button>
                          </div>
                          {cargando ? (
                            <p
                              className="flex items-center gap-2 text-sm"
                              style={{ color: "var(--ink-soft)" }}
                            >
                              <Loader2 className="animate-spin" size={14} />
                              {t(
                                "agregarPersona.paso3.cargando",
                                "Cargando puestos…",
                              )}
                            </p>
                          ) : !plazas.length ? (
                            <InfoNote
                              title={t(
                                "agregarPersona.paso3.sinPuestos",
                                "Todavía no hay puestos",
                              )}
                              tone="warn"
                            >
                              {t(
                                "agregarPersona.paso3.sinPuestosTexto",
                                "Crea primero la estación con sus puestos y vuelve aquí, o toca «Lo hago después».",
                              )}{" "}
                              <Link
                                className="font-semibold underline"
                                rel="noreferrer"
                                target="_blank"
                                to="/stations"
                              >
                                {t(
                                  "agregarPersona.paso3.crearEstacion",
                                  "Crear una estación",
                                )}
                                <ExternalLink
                                  className="ml-1 inline"
                                  size={12}
                                />
                              </Link>
                            </InfoNote>
                          ) : (
                            <div
                              className="max-h-[22rem] divide-y overflow-y-auto rounded-xl border"
                              style={{ borderColor: "var(--hairline)" }}
                            >
                              {plazasVisibles.map((p) => (
                                <Fila
                                  key={p.positionId}
                                  activa={horario.positionId === p.positionId}
                                  bloqueada={p.libres <= 0}
                                  detalle={p.detalle}
                                  libre={p.libres > 0}
                                  titulo={p.puesto}
                                  onClick={() =>
                                    setHorario({
                                      ...horario,
                                      stationId: p.stationId,
                                      positionId: p.positionId,
                                      sinRotacion: p.sinRotacion,
                                      rotationStyleId: null,
                                    })
                                  }
                                />
                              ))}
                            </div>
                          )}
                          {horario.sinRotacion && (
                            <InfoNote
                              title={t(
                                "agregarPersona.paso3.puestoSinRotacionVig",
                                "Este puesto todavía no tiene rotación",
                              )}
                              tone="warn"
                            >
                              <p className="mb-2">
                                {t(
                                  "agregarPersona.paso3.puestoSinRotacionVigTexto",
                                  "Elige cómo trabaja. Será la rotación del puesto y la heredarán los que vengan después.",
                                )}
                              </p>
                              <select
                                aria-label={t(
                                  "agregarPersona.paso3.comoTrabaja",
                                  "¿Cómo trabaja?",
                                )}
                                className={FIELD_CLS}
                                id="alta-rotacion"
                                value={horario.rotationStyleId || ""}
                                onChange={(e) =>
                                  setHorario({
                                    ...horario,
                                    rotationStyleId: e.target.value || null,
                                  })
                                }
                              >
                                <option value="">
                                  {t(
                                    "agregarPersona.paso3.eligeRotacion",
                                    "Elige cómo trabaja en ese puesto",
                                  )}
                                </option>
                                {estilosDeRotacion.map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {r.etiqueta}
                                  </option>
                                ))}
                              </select>
                            </InfoNote>
                          )}
                        </div>
                      )}

                      {horario.tipo === "supervisor" && (
                        <div className="space-y-3">
                          <p
                            className="text-sm"
                            style={{ color: "var(--ink-soft)" }}
                          >
                            {t(
                              "agregarPersona.paso3.supervisorIntro",
                              "Elige su puesto de supervisión. Su horario son las horas y la rotación de ese puesto.",
                            )}
                          </p>
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              className="cg-btn-link inline-flex items-center gap-1 text-sm font-semibold underline-offset-4 hover:underline"
                              rel="noreferrer"
                              target="_blank"
                              to="/supervisor-positions"
                            >
                              {t(
                                "agregarPersona.paso3.crearPuesto",
                                "Crear un puesto de supervisión",
                              )}
                              <ExternalLink size={12} />
                            </Link>
                            <Button
                              className="ml-auto"
                              size="sm"
                              type="button"
                              variant="ghost"
                              onClick={cargarLugares}
                            >
                              <RefreshCw size={14} />
                              {t("agregarPersona.paso3.recargar", "Recargar")}
                            </Button>
                          </div>
                          {cargando ? (
                            <p
                              className="flex items-center gap-2 text-sm"
                              style={{ color: "var(--ink-soft)" }}
                            >
                              <Loader2 className="animate-spin" size={14} />
                              {t(
                                "agregarPersona.paso3.cargando",
                                "Cargando puestos…",
                              )}
                            </p>
                          ) : !puestos.length ? (
                            <InfoNote
                              title={t(
                                "agregarPersona.paso3.sinPuestosSup",
                                "Todavía no hay puestos de supervisión",
                              )}
                              tone="warn"
                            >
                              {t(
                                "agregarPersona.paso3.sinPuestosSupTexto",
                                "Crea uno con «Crear un puesto de supervisión», toca «Recargar», o deja el horario para después.",
                              )}
                            </InfoNote>
                          ) : (
                            <div
                              className="divide-y overflow-hidden rounded-xl border"
                              style={{ borderColor: "var(--hairline)" }}
                            >
                              {puestos.map((p) => (
                                <Fila
                                  key={p.id}
                                  activa={horario.positionId === p.id}
                                  detalle={p.detalle}
                                  libre={p.libre}
                                  titulo={p.titulo}
                                  onClick={() =>
                                    setHorario({
                                      ...horario,
                                      positionId: p.id,
                                      sinRotacion: !!p.sinRotacion,
                                    })
                                  }
                                />
                              ))}
                            </div>
                          )}
                          {(() => {
                            const elegido = puestos.find(
                              (p) => p.id === horario.positionId,
                            );

                            return elegido &&
                              !elegido.sinRotacion &&
                              !elegido.libre ? (
                              <InfoNote tone="info">
                                {t(
                                  "agregarPersona.paso3.puestoSupLleno",
                                  "Este puesto ya tiene sus supervisores por turno. Lo agregas como uno más del puesto.",
                                )}
                              </InfoNote>
                            ) : null;
                          })()}
                          {puestos.find((p) => p.id === horario.positionId)
                            ?.sinRotacion && (
                            <InfoNote tone="warn">
                              {t(
                                "agregarPersona.paso3.puestoSinRotacion",
                                "Este puesto todavía no tiene rotación, así que no le daría turnos. Ponle una en Puestos de supervisión y toca «Recargar», o elige otro puesto.",
                              )}
                            </InfoNote>
                          )}
                        </div>
                      )}

                      {horario.tipo === "oficina" && (
                        <div className="space-y-5">
                          <JornadaEnLinea
                            value={horario.jornada}
                            onChange={(jornada) =>
                              setHorario({ ...horario, jornada })
                            }
                          />
                          <OficinaFisicaCampos
                            value={horario.oficina}
                            onChange={(oficina) =>
                              setHorario({ ...horario, oficina })
                            }
                          />
                        </div>
                      )}

                      <FormField
                        className="max-w-xs"
                        error={
                          validarLugar(horario) === "fechaInvalida"
                            ? t(
                                "agregarPersona.errores.fecha",
                                "Revisa la fecha",
                              )
                            : undefined
                        }
                        htmlFor="alta-desde"
                        label={
                          horario.tipo === "oficina"
                            ? t(
                                "agregarPersona.paso3.desdeOficina",
                                "Este horario empieza el",
                              )
                            : t("agregarPersona.paso3.desde", "Empieza el")
                        }
                      >
                        <input
                          className={FIELD_CLS}
                          id="alta-desde"
                          type="date"
                          value={horario.desde}
                          onChange={(e) =>
                            setHorario({
                              ...horario,
                              desde: e.target.value,
                            } as Horario)
                          }
                        />
                      </FormField>
                    </>
                  )}
                </>
              )}

              {/* ── 4 · Revisa y crea ──────────────────────────────────── */}
              {paso === 4 && tipo && (
                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-[12rem_1fr]">
                  <dt className="cg-eyebrow">
                    {t("agregarPersona.resumen.quien", "Quién")}
                  </dt>
                  <dd className="text-sm font-medium">
                    {nombreCompleto} · {nombreDeTipo(tipo)}
                    {tipo === "oficina" &&
                      rolElegido &&
                      ` · ${roleDisplayName(String(rolElegido.slug || rolElegido.name || ""))}`}
                  </dd>
                  <dt className="cg-eyebrow">
                    {t("agregarPersona.resumen.horario", "Horario")}
                  </dt>
                  <dd className="space-y-0.5 text-sm">
                    {horarioEnPalabras().map((linea) => (
                      <div key={linea}>{linea}</div>
                    ))}
                    {horarioEfectivo?.desde && (
                      <div
                        className="text-xs"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {t("agregarPersona.resumen.desde", {
                          defaultValue: "Desde el {{fecha}}",
                          fecha: horarioEfectivo.desde,
                        })}
                      </div>
                    )}
                  </dd>
                  <dt className="cg-eyebrow">
                    {t("agregarPersona.resumen.acceso", "Su acceso")}
                  </dt>
                  <dd className="text-sm">{accesoEnPalabras()}</dd>
                </dl>
              )}

              {/* ── Buttons ────────────────────────────────────────────── */}
              <div
                className="flex flex-wrap items-center gap-2 border-t pt-4"
                style={{ borderColor: "var(--hairline)" }}
              >
                <Button type="button" variant="ghost" onClick={atras}>
                  <ArrowLeft size={14} />
                  {paso === 1
                    ? t("agregarPersona.botones.cancelar", "Cancelar")
                    : t("agregarPersona.botones.atras", "Atrás")}
                </Button>
                {paso === 3 && !despues && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setDespues(true);
                      setPaso(4);
                    }}
                  >
                    {t("agregarPersona.botones.despues", "Lo hago después")}
                  </Button>
                )}
                <span className="flex-1" />
                {paso === 3 && !listoParaSeguir && (
                  <span
                    className="text-xs"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    {horario?.tipo === "vigilante"
                      ? validarLugar(horario) === "eligeRotacion"
                        ? t(
                            "agregarPersona.paso3.eligeRotacion",
                            "Elige cómo trabaja en ese puesto",
                          )
                        : t(
                            "agregarPersona.paso3.eligePlaza",
                            "Elige un puesto o toca «Lo hago después»",
                          )
                      : horario?.tipo === "supervisor"
                        ? validarLugar(horario) === "puestoSinRotacion"
                          ? t(
                              "agregarPersona.paso3.puestoSinRotacionCorto",
                              "Ese puesto no tiene rotación todavía",
                            )
                          : t(
                              "agregarPersona.paso3.eligePuesto",
                              "Elige un puesto de supervisión o toca «Lo hago después»",
                            )
                        : t(
                            "agregarPersona.paso3.revisaJornada",
                            "Revisa las horas marcadas en rojo",
                          )}
                  </span>
                )}
                {paso > 1 && paso < 4 && (
                  <Button
                    disabled={paso === 3 && !listoParaSeguir}
                    type="button"
                    variant="brand"
                    onClick={siguiente}
                  >
                    {t("agregarPersona.botones.siguiente", "Siguiente")}
                    <ArrowRight size={14} />
                  </Button>
                )}
                {paso === 4 && (
                  <Button
                    disabled={creando}
                    type="button"
                    variant="brand"
                    onClick={crear}
                  >
                    {creando ? (
                      <Loader2 className="animate-spin" size={14} />
                    ) : (
                      <UserPlus size={14} />
                    )}
                    {t("agregarPersona.botones.crear", "Crear y dar acceso")}
                  </Button>
                )}
              </div>
              {(tipo === "vigilante" || tipo === "supervisor") &&
                paso === 2 && (
                  <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                    {tipo === "vigilante"
                      ? t(
                          "agregarPersona.perfilCompleto",
                          "¿Necesitas su ficha completa o importar su hoja de vida?",
                        )
                      : t(
                          "agregarPersona.perfilCompletoSup",
                          "¿Necesitas su ficha completa, con zona y vehículo?",
                        )}{" "}
                    <Link
                      className="cg-btn-link font-semibold underline-offset-4 hover:underline"
                      to={
                        tipo === "vigilante"
                          ? "/security-guards/new"
                          : "/supervisors/new"
                      }
                    >
                      {t(
                        "agregarPersona.perfilCompletoLink",
                        "Crear perfil completo",
                      )}
                    </Link>
                  </p>
                )}
            </div>
          </Section>
        )}
      </PageContainer>
    </AppLayout>
  );
}

/** Optional office location: address, «Usar mi ubicación», radius. */
function OficinaFisicaCampos({
  value,
  onChange,
}: {
  value: OficinaFisica | null;
  onChange: (o: OficinaFisica | null) => void;
}) {
  const { t } = useTranslation();
  const [buscando, setBuscando] = useState(false);
  const o = value || { direccion: "", lat: "", lng: "", radio: "150" };
  const poner = (delta: Partial<OficinaFisica>) => onChange({ ...o, ...delta });

  const usarMiUbicacion = () => {
    if (!navigator.geolocation) {
      toast.error(
        t("agregarPersona.oficina.sinGps", "Este navegador no da la ubicación"),
      );

      return;
    }
    setBuscando(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        poner({
          lat: pos.coords.latitude.toFixed(6),
          lng: pos.coords.longitude.toFixed(6),
        });
        setBuscando(false);
      },
      () => {
        toast.error(
          t(
            "agregarPersona.oficina.gpsNegado",
            "No se pudo leer la ubicación. Revisa el permiso del navegador.",
          ),
        );
        setBuscando(false);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  return (
    <div
      className="space-y-3 rounded-xl border p-4"
      style={{ borderColor: "var(--hairline)" }}
    >
      <div className="flex items-start gap-2">
        <MapPin
          className="mt-0.5 shrink-0"
          size={16}
          style={{ color: "var(--ink-soft)" }}
        />
        <div>
          <p className="text-sm font-semibold">
            {t("agregarPersona.oficina.titulo", "Su oficina (opcional)")}
          </p>
          <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
            {t(
              "agregarPersona.oficina.texto",
              "Si la defines, el reloj de asistencia comprueba que marque desde su oficina.",
            )}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto_8rem] sm:items-end">
        <FormField
          htmlFor="alta-oficina-dir"
          label={t("agregarPersona.oficina.direccion", "Dirección")}
        >
          <input
            className={FIELD_CLS}
            id="alta-oficina-dir"
            placeholder={t(
              "agregarPersona.oficina.direccionEj",
              "Av. Principal 120, Centro",
            )}
            value={o.direccion}
            onChange={(e) => poner({ direccion: e.target.value })}
          />
        </FormField>
        <Button
          disabled={buscando}
          type="button"
          variant="outline"
          onClick={usarMiUbicacion}
        >
          {buscando ? (
            <Loader2 className="animate-spin" size={14} />
          ) : (
            <LocateFixed size={14} />
          )}
          {t(
            "agregarPersona.oficina.usarMiUbicacion",
            "Usar mi ubicación actual",
          )}
        </Button>
        <FormField
          htmlFor="alta-oficina-radio"
          label={t("agregarPersona.oficina.radio", "Radio (metros)")}
        >
          <input
            className={FIELD_CLS}
            id="alta-oficina-radio"
            inputMode="numeric"
            value={o.radio}
            onChange={(e) =>
              poner({ radio: e.target.value.replace(/[^\d]/g, "") })
            }
          />
        </FormField>
      </div>
      {o.lat && o.lng ? (
        <p className="text-xs tabular-nums" style={{ color: "var(--ok-text)" }}>
          {t("agregarPersona.oficina.ubicada", {
            defaultValue: "Ubicación: {{lat}}, {{lng}}",
            lat: o.lat,
            lng: o.lng,
          })}{" "}
          <button
            className="cg-btn-link underline-offset-4 hover:underline"
            type="button"
            onClick={() => poner({ lat: "", lng: "" })}
          >
            {t("agregarPersona.oficina.quitar", "Quitar")}
          </button>
        </p>
      ) : null}
    </div>
  );
}

/** After «Crear»: who, where, access, and what is still missing. */
function Listo({
  r,
  semana,
  onOtra,
  onVer,
}: {
  r: Resultado;
  semana: string[];
  onOtra: () => void;
  onVer: (url: string) => void;
}) {
  const { t } = useTranslation();
  const ficha = fichaDe(r.tipo, r.fichaId);
  const faltan = pendientes(r);
  const mensaje = mensajeDeAcceso(
    { nombre: r.nombre, username: r.acceso.username, link: r.acceso.link },
    t,
  );

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success(t("usuarioDeAcceso.compartir.copiado", "Copiado"));
    } catch {
      toast.error(
        t(
          "usuarioDeAcceso.compartir.noSeCopio",
          "No se pudo copiar. Selecciona el texto y cópialo a mano.",
        ),
      );
    }
  };

  return (
    <Section
      icon={<CheckCircle2 />}
      title={t("agregarPersona.listo.titulo", {
        defaultValue: "Listo: {{nombre}} ya está en el sistema",
        nombre: r.nombre,
      })}
    >
      <div className="space-y-5">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-[12rem_1fr]">
          <dt className="cg-eyebrow">
            {t("agregarPersona.resumen.horario", "Horario")}
          </dt>
          <dd className="space-y-0.5 text-sm">
            {r.horario === "hecho" ? (
              semana.map((linea) => <div key={linea}>{linea}</div>)
            ) : (
              <span style={{ color: "var(--ink-soft)" }}>
                {r.horario === "despues"
                  ? t(
                      "agregarPersona.listo.horarioDespues",
                      "Todavía sin horario",
                    )
                  : t(
                      "agregarPersona.listo.horarioFallo",
                      "No se pudo guardar",
                    )}
              </span>
            )}
          </dd>
          <dt className="cg-eyebrow">
            {t("agregarPersona.resumen.acceso", "Su acceso")}
          </dt>
          <dd className="min-w-0 space-y-2 text-sm">
            {r.acceso.link ? (
              <>
                {r.acceso.username && (
                  <div className="flex items-center gap-2">
                    <KeyRound size={14} style={{ color: "var(--ink-soft)" }} />
                    {t("agregarPersona.listo.usuario", "Usuario:")}{" "}
                    <code className="font-mono font-semibold">
                      {r.acceso.username}
                    </code>
                  </div>
                )}
                <input
                  readOnly
                  className={`${FIELD_CLS} font-mono text-xs`}
                  id="alta-enlace"
                  value={r.acceso.link}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => copiar(r.acceso.link || "")}
                  >
                    <Copy size={14} />
                    {t(
                      "usuarioDeAcceso.compartir.copiarEnlace",
                      "Copiar enlace",
                    )}
                  </Button>
                  <Button asChild size="sm" variant="brand">
                    <a
                      href={enlaceDeWhatsApp(mensaje)}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <MessageCircle size={14} />
                      {t(
                        "usuarioDeAcceso.compartir.whatsapp",
                        "Compartir por WhatsApp",
                      )}
                    </a>
                  </Button>
                </div>
                <InfoNote tone="warn">
                  {t(
                    "agregarPersona.listo.enlacePrivado",
                    "El enlace es solo para esta persona: con él pone la contraseña de su cuenta. No lo publiques en grupos.",
                  )}
                </InfoNote>
              </>
            ) : r.acceso.correo ? (
              <span className="flex items-center gap-2">
                <Mail size={14} style={{ color: "var(--ink-soft)" }} />
                {t("agregarPersona.listo.correoEnviado", {
                  defaultValue:
                    "Le enviamos un correo a {{correo}} para que cree su contraseña.",
                  correo: r.acceso.correo,
                })}
              </span>
            ) : (
              <span style={{ color: "var(--ink-soft)" }}>
                {t(
                  "agregarPersona.listo.accesoEnFicha",
                  "Su acceso está en su ficha («Reenviar invitación»).",
                )}
              </span>
            )}
          </dd>
        </dl>

        {faltan.includes("horario") && (
          <InfoNote
            icon={<CalendarClock />}
            title={
              r.horario === "fallo"
                ? t(
                    "agregarPersona.listo.faltaHorarioFallo",
                    "La persona se creó, pero su horario no se guardó",
                  )
                : t("agregarPersona.listo.faltaHorario", "Falta su horario")
            }
            tone="warn"
          >
            {r.horarioError && <div className="mb-2">{r.horarioError}</div>}
            <Button
              size="sm"
              type="button"
              variant="outline"
              onClick={() => onVer(dondeTerminarHorario(r.tipo, r.fichaId))}
            >
              {t("agregarPersona.listo.ponerHorario", "Ponerle horario")}
              <ArrowRight size={14} />
            </Button>
          </InfoNote>
        )}
        {faltan.includes("ubicacion") && (
          <InfoNote
            title={t(
              "agregarPersona.listo.faltaOficina",
              "Su oficina no se guardó",
            )}
            tone="warn"
          >
            {r.ubicacionError ||
              t(
                "agregarPersona.listo.faltaOficinaTexto",
                "Agrégala desde su ficha › Ubicación de oficina.",
              )}
          </InfoNote>
        )}

        <div
          className="flex flex-wrap gap-2 border-t pt-4"
          style={{ borderColor: "var(--hairline)" }}
        >
          {ficha && (
            <Button
              type="button"
              variant="outline"
              onClick={() => onVer(ficha)}
            >
              {t("agregarPersona.listo.verFicha", "Ver ficha")}
            </Button>
          )}
          <Button type="button" variant="brand" onClick={onOtra}>
            <UserPlus size={14} />
            {t("agregarPersona.listo.otra", "Agregar otra persona")}
          </Button>
        </div>
      </div>
    </Section>
  );
}
