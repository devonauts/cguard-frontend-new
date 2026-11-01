import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import {
  CalendarClock,
  Check,
  CheckCircle2,
  ClipboardPaste,
  Copy,
  Download,
  FileUp,
  Loader2,
  Mail,
  MessageCircle,
  RotateCcw,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import AppLayout from "@/layouts/app-layout";
import {
  FIELD_CLS,
  InfoNote,
  PageContainer,
  PageHeader,
  Section,
  Segmented,
  StatusBadge,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import JornadaEnLinea from "@/components/alta/JornadaEnLinea";
import { roleDisplayName } from "@/config/roleLabels";
import { ApiService } from "@/services/api/apiService";
import { securityGuardService } from "@/lib/api/securityGuardService";
import { supervisorService } from "@/lib/api/supervisorService";
import { hoyEnLaEmpresa } from "@/lib/horaDeLaEmpresa";
import {
  supervisorPositionService,
  type SupervisorPosition,
} from "@/lib/api/supervisorPositionService";
import { loadXlsx } from "@/lib/lazyXlsx";
import {
  presetLunesAViernes,
  validarJornada,
  type Jornada,
} from "@/lib/jornadaSemanal";
import { plazasElegibles } from "@/pages/admin/programmer/AsignarAPuestoModal";
import {
  dondeTerminarHorario,
  enlaceDeWhatsApp,
  fichaDe,
  mensajeDeAcceso,
  rolesDeOficina,
  rotacionDePlaza,
  turnoEnPalabras,
  type Horario,
  type Resultado,
  type RolDeOficina,
  type TipoDePersona,
} from "@/lib/agregarPersona";
import {
  claveDeCorreo,
  claveDeDocumento,
  leerFilas,
  partirTabla,
  plantillaCsv,
  prepararFilas,
  revisarFilas,
  type Catalogos,
  type Destino,
  type FilaDeLote,
  type PlazaDeLista,
  type Problema,
  type PuestoDeLista,
  type RolDeLista,
} from "@/lib/agregarVarias";
import {
  crearPersona,
  filasDe,
  mensajeDeError,
  ponerHorario,
} from "@/lib/crearPersona";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «AGREGAR VARIAS PERSONAS» — a whole list at once, each with their schedule
 * (Mike 2026-10-31: «agregar varias personas a la vez»).
 *
 *   1 Tu lista: paste from Excel / Google Sheets, or upload .csv / .xlsx
 *   2 Revisa: one row per person, problems per row, fix the puesto by hand
 *   3 Crear: one person at a time with the same calls as «Agregar persona»;
 *     one failure never stops the rest, and each can be retried
 *
 * Nothing is written until «Crear N personas».
 * ════════════════════════════════════════════════════════════════════════════
 */

const tenantId = () => localStorage.getItem("tenantId") || "";
const hoyLocal = () => {
  const d = new Date();

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

type Estado = "lista" | "creando" | "creada" | "error";

interface Salida {
  estado: Estado;
  error?: string | null;
  resultado?: Resultado | null;
  horario: Horario;
  /** Where they work, in words, for the results table. */
  donde: string;
}

/** Runs `fn` over `items` with at most `n` at a time. */
async function enParalelo<T>(
  items: T[],
  n: number,
  fn: (x: T) => Promise<void>,
) {
  let i = 0;
  const trabajadores = Array.from(
    { length: Math.min(n, items.length) },
    async () => {
      while (i < items.length) {
        const x = items[i++];

        await fn(x);
      }
    },
  );

  await Promise.all(trabajadores);
}

export default function AgregarVariasPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const archivoRef = useRef<HTMLInputElement | null>(null);

  const [texto, setTexto] = useState("");
  const [filas, setFilas] = useState<FilaDeLote[] | null>(null);
  const [soloProblemas, setSoloProblemas] = useState(false);
  /** After reading, the paste box folds into one line; this reopens it. */
  const [editandoLista, setEditandoLista] = useState(false);

  // Office week shared by every office row.
  const [conJornada, setConJornada] = useState(true);
  const [jornada, setJornada] = useState<Jornada>(presetLunesAViernes);

  // Catalogues.
  const [cat, setCat] = useState<Catalogos | null>(null);
  const [rolesCrudos, setRolesCrudos] = useState<RolDeOficina[]>([]);
  const [cargando, setCargando] = useState(true);

  // What the company already has (document / e-mail key → exists).
  const [docsVistos, setDocsVistos] = useState<Map<string, boolean>>(new Map());
  const [correosVistos, setCorreosVistos] = useState<Map<string, boolean>>(
    new Map(),
  );
  const [comprobando, setComprobando] = useState(false);

  // Creation.
  const [salidas, setSalidas] = useState<Record<string, Salida> | null>(null);
  const [progreso, setProgreso] = useState<{
    hechas: number;
    total: number;
    nombre: string;
  } | null>(null);

  // ── Catalogues ────────────────────────────────────────────────────────────
  const cargarCatalogos = useCallback(async () => {
    setCargando(true);
    try {
      const hoy = hoyLocal();
      const [ov, posts, roles, sups]: any[] = await Promise.all([
        ApiService.get(
          `/tenant/${tenantId()}/scheduler/overview?startDate=${hoy}&endDate=${hoy}`,
        ).catch(() => null),
        supervisorPositionService.list().catch(() => null),
        ApiService.get(`/tenant/${tenantId()}/role`).catch(() => null),
        supervisorService.list().catch(() => null),
      ]);
      const o = ov?.data || ov || {};
      const estPorId = new Map(
        (o.stations || []).map((s: any) => [String(s.id), s]),
      );
      const plazaPorId = new Map(
        (o.positions || []).map((p: any) => [String(p.id), p]),
      );
      const plazas: PlazaDeLista[] = plazasElegibles(
        o.stations || [],
        o.positions || [],
        o.assignments || [],
      ).map((p) => {
        const plaza: any = plazaPorId.get(p.positionId);
        const rot = rotacionDePlaza(
          plaza,
          estPorId.get(p.stationId) as any,
          o.rotationStyles || [],
        );

        return {
          stationId: p.stationId,
          positionId: p.positionId,
          puesto: p.puesto,
          plaza: p.plaza,
          libres: p.libres,
          sinRotacion: !rot,
          detalle: turnoEnPalabras(
            rot as any,
            plaza?.startTime,
            plaza?.endTime,
            t,
          ),
        };
      });
      const puestos: PuestoDeLista[] = (
        (posts?.rows || []) as SupervisorPosition[]
      )
        .filter((p) => p.isActive !== false)
        .map((p) => {
          const ocupados = (p.assignments || []).filter(
            (a) => a.status === "active" && !a.isRelief,
          ).length;

          return {
            id: p.id,
            titulo: [p.name, p.zone].filter(Boolean).join(" · "),
            libre: ocupados < Math.max(1, Number(p.guardsNeeded) || 1),
            sinRotacion: !p.rotationStyle,
            detalle: turnoEnPalabras(
              p.rotationStyle as any,
              p.startTime,
              p.endTime,
              t,
            ),
          };
        });
      const ofi = rolesDeOficina(filasDe(roles) as RolDeOficina[]);
      const rolesDeLista: RolDeLista[] = ofi.map((r) => ({
        id: String(r.id),
        nombres: [
          roleDisplayName(String(r.slug || r.name || "")),
          String(r.slug || ""),
          String(r.name || ""),
        ].filter(Boolean),
      }));

      setRolesCrudos(ofi);
      setCat({ plazas, puestos, roles: rolesDeLista });

      // Supervisors are few: their documents and e-mails come in one call.
      const docs = new Map<string, boolean>();
      const correos = new Map<string, boolean>();

      for (const s of filasDe(sups)) {
        const d = claveDeDocumento(s.governmentId || "");
        const c = claveDeCorreo(s.email || "");

        if (d) docs.set(d, true);
        if (c) correos.set(c, true);
      }
      setDocsVistos((m) => new Map([...m, ...docs]));
      setCorreosVistos((m) => new Map([...m, ...correos]));
    } finally {
      setCargando(false);
    }
  }, [t]);

  useEffect(() => {
    cargarCatalogos();
  }, [cargarCatalogos]);

  // ── Reading the list ──────────────────────────────────────────────────────
  const leer = (contenido: string) => {
    if (!cat) return;
    const leidas = leerFilas(partirTabla(contenido));

    if (!leidas.length) {
      toast.error(
        t(
          "agregarVarias.errores.vacia",
          "No encontramos personas en la lista. Revisa que tenga una fila por persona.",
        ),
      );

      return;
    }
    setFilas(prepararFilas(leidas, cat));
    setEditandoLista(false);
    setSalidas(null);
    setSoloProblemas(false);
  };

  const subirArchivo = async (f: File | undefined) => {
    if (!f) return;
    try {
      if (/\.(xlsx|xls)$/i.test(f.name)) {
        const XLSX = await loadXlsx();
        const libro = XLSX.read(await f.arrayBuffer(), {
          type: "array",
          cellDates: false,
          // Keep each cell's number format: it tells a date from a number.
          cellNF: true,
        });
        const hoja = libro.Sheets[libro.SheetNames[0]];
        // Cell by cell: the text as shown (keeps «0912…» and phone formats), but
        // a date cell from its serial — the shown text is US month/day.
        const rango = XLSX.utils.decode_range(hoja["!ref"] || "A1:A1");
        const filasXlsx: string[] = [];

        for (let r = rango.s.r; r <= rango.e.r; r++) {
          const celdas: string[] = [];

          for (let c = rango.s.c; c <= rango.e.c; c++) {
            const cell: any = hoja[XLSX.utils.encode_cell({ r, c })];
            let v = "";

            if (cell) {
              if (cell.t === "n" && cell.z && XLSX.SSF.is_date(cell.z)) {
                const d = XLSX.SSF.parse_date_code(cell.v);

                v = `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
              } else v = String(cell.w ?? cell.v ?? "");
            }
            celdas.push(v.replace(/[\t\n]/g, " "));
          }
          filasXlsx.push(celdas.join("\t"));
        }
        const tsv = filasXlsx.join("\n");

        setTexto(tsv);
        leer(tsv);
      } else {
        const contenido = await f.text();

        setTexto(contenido);
        leer(contenido);
      }
    } catch (e: any) {
      toast.error(
        mensajeDeError(
          e,
          t(
            "agregarVarias.errores.archivo",
            "No pudimos leer ese archivo. Prueba guardarlo como .csv o .xlsx.",
          ),
        ),
      );
    } finally {
      if (archivoRef.current) archivoRef.current.value = "";
    }
  };

  const descargarPlantilla = () => {
    const blob = new Blob([plantillaCsv()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = "plantilla-personal.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // ── Already in the company? (looked up once per document / e-mail) ───────
  useEffect(() => {
    if (!filas) return;
    const docs = [
      ...new Set(
        filas
          .filter((f) => f.tipo === "vigilante")
          .map((f) => claveDeDocumento(f.datos.documento))
          .filter((d) => d && !docsVistos.has(d)),
      ),
    ];
    const correos = [
      ...new Set(
        filas
          .map((f) => claveDeCorreo(f.datos.correo))
          .filter((c) => c && c.includes("@") && !correosVistos.has(c)),
      ),
    ];

    if (!docs.length && !correos.length) return;
    let vivo = true;
    const espera = setTimeout(async () => {
      setComprobando(true);
      const nuevosDocs = new Map<string, boolean>();
      const nuevosCorreos = new Map<string, boolean>();
      const trabajos: Array<() => Promise<void>> = [
        ...docs.map((d) => async () => {
          const r: any = await securityGuardService
            .list({ "filter[governmentId]": d, limit: "5" })
            .catch(() => null);

          nuevosDocs.set(
            d,
            filasDe(r).some(
              (g: any) => claveDeDocumento(g.governmentId || "") === d,
            ),
          );
        }),
        ...correos.map((c) => async () => {
          const r: any = await ApiService.get(
            `/tenant/${tenantId()}/user?filter%5Bemail%5D=${encodeURIComponent(c)}&limit=5`,
          ).catch(() => null);

          nuevosCorreos.set(
            c,
            filasDe(r).some((u: any) => claveDeCorreo(u.email || "") === c),
          );
        }),
      ];

      await enParalelo(trabajos, 4, (fn) => fn());
      if (!vivo) return;
      setDocsVistos((m) => new Map([...m, ...nuevosDocs]));
      setCorreosVistos((m) => new Map([...m, ...nuevosCorreos]));
      setComprobando(false);
    }, 500);

    return () => {
      vivo = false;
      clearTimeout(espera);
      setComprobando(false);
    };
  }, [filas, docsVistos, correosVistos]);

  const existentes = useMemo(
    () => ({
      documentos: new Set([...docsVistos].filter(([, v]) => v).map(([k]) => k)),
      correos: new Set([...correosVistos].filter(([, v]) => v).map(([k]) => k)),
    }),
    [docsVistos, correosVistos],
  );

  const problemas = useMemo(
    () =>
      filas && cat
        ? revisarFilas(filas, cat, existentes, hoyEnLaEmpresa())
        : new Map<string, Problema[]>(),
    [filas, cat, existentes],
  );
  const listas = useMemo(
    () => (filas || []).filter((f) => !(problemas.get(f.id) || []).length),
    [filas, problemas],
  );
  const conProblemas = (filas?.length || 0) - listas.length;
  const hayOficina = (filas || []).some((f) => f.tipo === "oficina");
  const jornadaOk = !conJornada || validarJornada(jornada).ok;

  const cambiarFila = (id: string, delta: Partial<FilaDeLote>) =>
    setFilas((fs) =>
      (fs || []).map((f) => (f.id === id ? { ...f, ...delta } : f)),
    );
  const cambiarDatos = (id: string, delta: Partial<FilaDeLote["datos"]>) =>
    setFilas((fs) =>
      (fs || []).map((f) =>
        f.id === id ? { ...f, datos: { ...f.datos, ...delta } } : f,
      ),
    );
  const quitarFila = (id: string) =>
    setFilas((fs) => (fs || []).filter((f) => f.id !== id));

  // ── Words ─────────────────────────────────────────────────────────────────
  const nombreDeTipo = (x: TipoDePersona | null) =>
    x === "vigilante"
      ? t("agregarPersona.tipo.vigilante", "Vigilante")
      : x === "supervisor"
        ? t("agregarPersona.tipo.supervisor", "Supervisor")
        : x === "oficina"
          ? t("agregarPersona.tipo.oficina", "Personal de oficina")
          : "—";

  const textoDeProblema = (p: Problema): string => {
    const m: Record<Problema, string> = {
      tipo: t(
        "agregarVarias.problemas.tipo",
        "Elige qué hace: vigilante, supervisor u oficina",
      ),
      nombres: t("agregarVarias.problemas.nombres", "Faltan los nombres"),
      apellidos: t("agregarVarias.problemas.apellidos", "Faltan los apellidos"),
      correoRequerido: t(
        "agregarVarias.problemas.correoRequerido",
        "La oficina entra con su correo: falta",
      ),
      correoInvalido: t(
        "agregarVarias.problemas.correoInvalido",
        "El correo no está bien escrito",
      ),
      celularInvalido: t(
        "agregarVarias.problemas.celularInvalido",
        "El celular necesita al menos 7 dígitos",
      ),
      rolRequerido: t("agregarVarias.problemas.rolRequerido", "Elige su rol"),
      rolDesconocido: t(
        "agregarVarias.problemas.rolDesconocido",
        "Ese rol no existe en tu empresa: elige uno",
      ),
      puestoNoEncontrado: t(
        "agregarVarias.problemas.puestoNoEncontrado",
        "No encontramos ese puesto: elígelo en la lista",
      ),
      puestoAmbiguo: t(
        "agregarVarias.problemas.puestoAmbiguo",
        "Hay varios puestos con ese nombre: elige uno",
      ),
      plazaOcupada: t(
        "agregarVarias.problemas.plazaOcupada",
        "Ese puesto ya está ocupado (o lo toma otra fila más arriba)",
      ),
      puestoSinRotacion: t(
        "agregarVarias.problemas.puestoSinRotacion",
        "Ese puesto no tiene rotación: no le daría turnos",
      ),
      fechaInvalida: t(
        "agregarVarias.problemas.fechaInvalida",
        "La fecha de inicio no es válida (usa 02/11/2026)",
      ),
      fechaPasada: t(
        "agregarVarias.problemas.fechaPasada",
        "La fecha de inicio ya pasó: pon hoy o una fecha futura",
      ),
      documentoRepetido: t(
        "agregarVarias.problemas.documentoRepetido",
        "Ese documento está dos veces en la lista",
      ),
      correoRepetido: t(
        "agregarVarias.problemas.correoRepetido",
        "Ese correo está dos veces en la lista",
      ),
      documentoExiste: t(
        "agregarVarias.problemas.documentoExiste",
        "Ya hay alguien con ese documento en tu empresa",
      ),
      correoExiste: t(
        "agregarVarias.problemas.correoExiste",
        "Ese correo ya es de una cuenta de tu empresa",
      ),
    };

    return m[p];
  };

  // ── Schedule of a row, in the wizard's shape ──────────────────────────────
  const horarioDe = (f: FilaDeLote): Horario => {
    const desde = f.empieza || hoyLocal();

    if (f.tipo === "vigilante" && f.destino?.tipo === "plaza")
      return {
        tipo: "vigilante",
        stationId: f.destino.stationId,
        positionId: f.destino.positionId,
        desde,
      };
    if (f.tipo === "supervisor" && f.destino?.tipo === "puesto")
      return { tipo: "supervisor", positionId: f.destino.positionId, desde };
    if (f.tipo === "oficina" && f.destino?.tipo === "jornada" && conJornada)
      return { tipo: "oficina", jornada, desde, oficina: null };

    return null;
  };

  const dondeEnPalabras = (f: FilaDeLote): string => {
    if (!cat) return "";
    if (f.destino?.tipo === "plaza") {
      const p = cat.plazas.find(
        (x) => x.positionId === (f.destino as any).positionId,
      );

      return p ? `${p.puesto} · ${p.plaza}` : "";
    }
    if (f.destino?.tipo === "puesto") {
      const p = cat.puestos.find((x) => x.id === (f.destino as any).positionId);

      return p?.titulo || "";
    }
    if (f.destino?.tipo === "jornada" && conJornada)
      return t("agregarVarias.donde.jornada", "Jornada de oficina");

    return "";
  };

  // ── «Crear N personas» ───────────────────────────────────────────────────
  const crearUna = async (f: FilaDeLote, previa?: Salida) => {
    const h = previa?.horario ?? horarioDe(f);
    const donde = previa?.donde ?? dondeEnPalabras(f);
    const rol = rolesCrudos.find((r) => String(r.id) === f.datos.rol) || null;

    setSalidas((s) => ({
      ...(s || {}),
      [f.id]: { estado: "creando", horario: h, donde },
    }));
    try {
      let r: Resultado;

      if (previa?.estado === "creada" && previa.resultado) {
        // Already created: only the schedule is retried.
        r = h
          ? await ponerHorario({ ...previa.resultado }, h, t)
          : previa.resultado;
      } else {
        r = await crearPersona(f.tipo as TipoDePersona, f.datos, h, { rol, t });
      }
      setSalidas((s) => ({
        ...(s || {}),
        [f.id]: { estado: "creada", resultado: r, horario: h, donde },
      }));
    } catch (e: any) {
      setSalidas((s) => ({
        ...(s || {}),
        [f.id]: {
          estado: "error",
          error: mensajeDeError(
            e,
            t("agregarPersona.errores.crear", "No se pudo crear a la persona"),
          ),
          horario: h,
          donde,
        },
      }));
    }
  };

  const crearTodas = async () => {
    const aCrear = listas;

    if (!aCrear.length) return;
    setSalidas(
      Object.fromEntries(
        aCrear.map((f) => [
          f.id,
          {
            estado: "lista" as Estado,
            horario: horarioDe(f),
            donde: dondeEnPalabras(f),
          },
        ]),
      ),
    );
    for (let i = 0; i < aCrear.length; i++) {
      const f = aCrear[i];

      setProgreso({
        hechas: i,
        total: aCrear.length,
        nombre: `${f.datos.nombres} ${f.datos.apellidos}`.trim(),
      });
      // One at a time: the server hands out seats and usernames in order.

      await crearUna(f);
    }
    setProgreso(null);
    toast.success(
      t("agregarVarias.listo.toast", {
        defaultValue: "Lista procesada: {{count}} personas",
        count: aCrear.length,
      }),
    );
  };

  const empezarDeNuevo = () => {
    setFilas(null);
    setSalidas(null);
    setTexto("");
    setProgreso(null);
    cargarCatalogos();
  };

  const copiar = async (s: string) => {
    try {
      await navigator.clipboard.writeText(s);
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

  // ── Rendering ─────────────────────────────────────────────────────────────
  const visibles = (filas || []).filter(
    (f) => !soloProblemas || (problemas.get(f.id) || []).length,
  );
  const enResultados = !!salidas;
  const creadas = salidas
    ? Object.values(salidas).filter((s) => s.estado === "creada")
    : [];
  const fallidas = salidas
    ? Object.values(salidas).filter((s) => s.estado === "error").length
    : 0;
  const conHorario = creadas.filter(
    (s) => s.resultado?.horario === "hecho",
  ).length;
  const pendientesDeHorario = creadas.filter(
    (s) => s.resultado && s.resultado.horario !== "hecho",
  ).length;

  return (
    <AppLayout>
      <PageContainer className="pb-28" width="wide">
        <PageHeader
          actions={
            <Button asChild variant="outline">
              <Link to="/personal/nueva">
                <UserPlus className="mr-2 h-4 w-4" />
                {t("agregarVarias.unaSola", "Agregar solo una")}
              </Link>
            </Button>
          }
          icon={<Users />}
          subtitle={t(
            "agregarVarias.subtitulo",
            "Pega tu lista de Excel o sube el archivo. Revisas cada persona y su horario antes de crear: nada se guarda hasta que toques «Crear».",
          )}
          title={t("agregarVarias.titulo", "Agregar varias personas")}
        />

        {!enResultados && (
          <Section
            icon={<ClipboardPaste />}
            title={t("agregarVarias.lista.titulo", "Tu lista")}
          >
            {filas && !editandoLista ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm" id="varias-leida">
                  {t("agregarVarias.lista.leida", {
                    defaultValue: "Leímos {{count}} personas de tu lista.",
                    count: filas.length,
                  })}
                </span>
                <span className="flex-1" />
                <Button
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => setEditandoLista(true)}
                >
                  <ClipboardPaste size={14} />
                  {t("agregarVarias.lista.cambiar", "Cambiar la lista")}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                  {t(
                    "agregarVarias.lista.ayuda",
                    "Una fila por persona. Columnas: Tipo (vigilante, supervisor u oficina), Nombres, Apellidos, Documento, Celular, Correo, Rol (solo oficina), Puesto (la estación y su puesto, o el puesto de supervisión) y Empieza. Con la primera fila de títulos, el orden no importa.",
                  )}
                </p>
                <textarea
                  className={`${FIELD_CLS} h-40 min-h-[8rem] py-2 font-mono text-xs`}
                  id="varias-pegar"
                  placeholder={t(
                    "agregarVarias.lista.placeholder",
                    "Tipo\tNombres\tApellidos\tDocumento\tCelular\tCorreo\tRol\tPuesto\tEmpieza\nVigilante\tLuis\tOrtega\t0912345678\t+593 99 555 0101\t\t\tEstación Norte · Fijo 1\t02/11/2026",
                  )}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    disabled={!texto.trim() || cargando}
                    id="varias-leer"
                    type="button"
                    variant={filas ? "outline" : "brand"}
                    onClick={() => leer(texto)}
                  >
                    {cargando ? (
                      <Loader2 className="animate-spin" size={14} />
                    ) : (
                      <ClipboardPaste size={14} />
                    )}
                    {t("agregarVarias.lista.revisar", "Revisar la lista")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => archivoRef.current?.click()}
                  >
                    <FileUp size={14} />
                    {t("agregarVarias.lista.subir", "Subir .csv o .xlsx")}
                  </Button>
                  <input
                    ref={archivoRef}
                    accept=".csv,.txt,.tsv,.xlsx,.xls"
                    className="hidden"
                    id="varias-archivo"
                    type="file"
                    onChange={(e) => subirArchivo(e.target.files?.[0])}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={descargarPlantilla}
                  >
                    <Download size={14} />
                    {t("agregarVarias.lista.plantilla", "Descargar plantilla")}
                  </Button>
                </div>
              </div>
            )}
          </Section>
        )}

        {!enResultados && filas && cat && (
          <Section
            action={
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <StatusBadge tone="ok">
                  {t("agregarVarias.revision.listas", {
                    defaultValue: "{{count}} listas",
                    count: listas.length,
                  })}
                </StatusBadge>
                {conProblemas > 0 && (
                  <button
                    aria-pressed={soloProblemas}
                    className="cg-focus rounded-full"
                    id="varias-solo-problemas"
                    type="button"
                    onClick={() => setSoloProblemas((v) => !v)}
                  >
                    <StatusBadge tone="bad">
                      {soloProblemas
                        ? t("agregarVarias.revision.verTodas", "Ver todas")
                        : t("agregarVarias.revision.conProblemas", {
                            defaultValue: "{{count}} con problemas",
                            count: conProblemas,
                          })}
                    </StatusBadge>
                  </button>
                )}
                {comprobando && (
                  <span
                    className="inline-flex items-center gap-1"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    <Loader2 className="animate-spin" size={12} />
                    {t(
                      "agregarVarias.revision.comprobando",
                      "Comprobando si ya están en tu empresa…",
                    )}
                  </span>
                )}
              </div>
            }
            className="mt-4"
            icon={<Users />}
            title={t("agregarVarias.revision.titulo", {
              defaultValue: "Revisa: {{count}} personas",
              count: filas.length,
            })}
          >
            <div
              className="overflow-x-auto rounded-xl border"
              style={{ borderColor: "var(--hairline)" }}
            >
              <table
                className="w-full min-w-[1320px] text-sm"
                id="varias-tabla"
              >
                <thead>
                  <tr className="cg-eyebrow text-left">
                    <th className="px-2 py-2">
                      {t("agregarVarias.col.linea", "Fila")}
                    </th>
                    <th className="px-2 py-2">
                      {t("agregarVarias.col.tipo", "Qué hace")}
                    </th>
                    <th className="px-2 py-2">
                      {t("agregarVarias.col.nombres", "Nombres")}
                    </th>
                    <th className="px-2 py-2">
                      {t("agregarVarias.col.apellidos", "Apellidos")}
                    </th>
                    <th className="px-2 py-2">
                      {t("agregarVarias.col.donde", "Rol y horario")}
                    </th>
                    <th className="px-2 py-2">
                      {t("agregarVarias.col.empieza", "Empieza")}
                    </th>
                    <th className="px-2 py-2">
                      {t("agregarVarias.col.documento", "Documento")}
                    </th>
                    <th className="px-2 py-2">
                      {t("agregarVarias.col.celular", "Celular")}
                    </th>
                    <th className="px-2 py-2">
                      {t("agregarVarias.col.correo", "Correo")}
                    </th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((f) => {
                    const ps = problemas.get(f.id) || [];

                    return (
                      <FilaEditable
                        key={f.id}
                        cat={cat}
                        conJornada={conJornada}
                        f={f}
                        nombreDeTipo={nombreDeTipo}
                        problemas={ps.map(textoDeProblema)}
                        roles={rolesCrudos}
                        onDatos={(d) => cambiarDatos(f.id, d)}
                        onFila={(d) => cambiarFila(f.id, d)}
                        onQuitar={() => quitarFila(f.id)}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!visibles.length && (
              <p className="mt-3 text-sm" style={{ color: "var(--ink-soft)" }}>
                {t(
                  "agregarVarias.revision.vacia",
                  "No quedan filas en la lista.",
                )}
              </p>
            )}
          </Section>
        )}

        {!enResultados && filas && hayOficina && (
          <Section
            className="mt-4"
            icon={<CalendarClock />}
            title={t(
              "agregarVarias.jornada.titulo",
              "Jornada para el personal de oficina",
            )}
          >
            <div className="space-y-4">
              <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                {t(
                  "agregarVarias.jornada.ayuda",
                  "La misma semana para todas las personas de oficina de la lista. Después puedes cambiar la de cada una en su ficha.",
                )}
              </p>
              <Segmented
                options={[
                  {
                    value: "con",
                    label: t("agregarVarias.jornada.con", "Con esta jornada"),
                  },
                  {
                    value: "sin",
                    label: t(
                      "agregarVarias.jornada.sin",
                      "Sin horario por ahora",
                    ),
                  },
                ]}
                value={conJornada ? "con" : "sin"}
                onChange={(v) => setConJornada(v === "con")}
              />
              {conJornada && (
                <JornadaEnLinea value={jornada} onChange={setJornada} />
              )}
            </div>
          </Section>
        )}

        {!enResultados && filas && (
          <div
            className="sticky bottom-0 z-10 mt-4 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3"
            style={{
              borderColor: "var(--hairline)",
              background: "var(--float)",
            }}
          >
            <span className="text-sm" style={{ color: "var(--ink-soft)" }}>
              {conProblemas > 0
                ? t("agregarVarias.pie.conProblemas", {
                    defaultValue:
                      "Las {{count}} filas con problemas no se crean: corrígelas aquí o quítalas.",
                    count: conProblemas,
                  })
                : t(
                    "agregarVarias.pie.todoListo",
                    "Todo listo. Se crean una por una, en el orden de la lista.",
                  )}
            </span>
            <span className="flex-1" />
            <Button type="button" variant="ghost" onClick={empezarDeNuevo}>
              {t("agregarVarias.pie.otraLista", "Usar otra lista")}
            </Button>
            <Button
              disabled={
                !listas.length || comprobando || (hayOficina && !jornadaOk)
              }
              id="varias-crear"
              type="button"
              variant="brand"
              onClick={crearTodas}
            >
              <UserPlus size={14} />
              {t("agregarVarias.pie.crear", {
                defaultValue: "Crear {{count}} personas",
                count: listas.length,
              })}
            </Button>
          </div>
        )}

        {enResultados && (
          <Section
            icon={
              progreso ? <Loader2 className="animate-spin" /> : <CheckCircle2 />
            }
            title={
              progreso
                ? t("agregarVarias.creando.titulo", {
                    defaultValue: "Creando {{hechas}} de {{total}}…",
                    hechas: progreso.hechas + 1,
                    total: progreso.total,
                  })
                : t("agregarVarias.hecho.titulo", "Lista procesada")
            }
          >
            <div className="space-y-4">
              {progreso ? (
                <div className="space-y-2">
                  <div
                    aria-valuemax={progreso.total}
                    aria-valuemin={0}
                    aria-valuenow={progreso.hechas}
                    className="h-2 overflow-hidden rounded-full"
                    role="progressbar"
                    style={{ background: "var(--glass-sunken)" }}
                  >
                    <div
                      className="h-full rounded-full transition-[width]"
                      style={{
                        width: `${Math.round((progreso.hechas / Math.max(1, progreso.total)) * 100)}%`,
                        background: "var(--brand)",
                      }}
                    />
                  </div>
                  <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                    {progreso.nombre}
                  </p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 text-xs">
                  <StatusBadge tone="ok">
                    {t("agregarVarias.hecho.creadas", {
                      defaultValue: "{{count}} creadas",
                      count: creadas.length,
                    })}
                  </StatusBadge>
                  <StatusBadge tone="info">
                    {t("agregarVarias.hecho.conHorario", {
                      defaultValue: "{{count}} con horario",
                      count: conHorario,
                    })}
                  </StatusBadge>
                  {pendientesDeHorario > 0 && (
                    <StatusBadge tone="warn">
                      {t("agregarVarias.hecho.sinHorario", {
                        defaultValue: "{{count}} sin horario todavía",
                        count: pendientesDeHorario,
                      })}
                    </StatusBadge>
                  )}
                  {fallidas > 0 && (
                    <StatusBadge tone="bad">
                      {t("agregarVarias.hecho.fallidas", {
                        defaultValue: "{{count}} no se crearon",
                        count: fallidas,
                      })}
                    </StatusBadge>
                  )}
                </div>
              )}

              <div
                className="overflow-x-auto rounded-xl border"
                style={{ borderColor: "var(--hairline)" }}
              >
                <table
                  className="w-full min-w-[900px] text-sm"
                  id="varias-resultados"
                >
                  <thead>
                    <tr className="cg-eyebrow text-left">
                      <th className="px-3 py-2">
                        {t("agregarVarias.res.persona", "Persona")}
                      </th>
                      <th className="px-3 py-2">
                        {t("agregarVarias.res.horario", "Horario")}
                      </th>
                      <th className="px-3 py-2">
                        {t("agregarVarias.res.acceso", "Su acceso")}
                      </th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {(filas || [])
                      .filter((f) => salidas?.[f.id])
                      .map((f) => {
                        const s = salidas![f.id];
                        const r = s.resultado || null;
                        const nombre =
                          `${f.datos.nombres} ${f.datos.apellidos}`.trim();
                        const ficha = r ? fichaDe(r.tipo, r.fichaId) : null;
                        const mensaje = r
                          ? mensajeDeAcceso(
                              {
                                nombre,
                                username: r.acceso.username,
                                link: r.acceso.link,
                              },
                              t,
                            )
                          : "";

                        return (
                          <tr
                            key={f.id}
                            className="border-t align-top"
                            style={{ borderColor: "var(--hairline)" }}
                          >
                            <td className="px-3 py-2.5">
                              <div className="font-semibold">{nombre}</div>
                              <div
                                className="text-xs"
                                style={{ color: "var(--ink-soft)" }}
                              >
                                {nombreDeTipo(f.tipo)}
                                {" · "}
                                {s.estado === "creada" ? (
                                  <span style={{ color: "var(--ok-text)" }}>
                                    {t("agregarVarias.res.creada", "Creada")}
                                  </span>
                                ) : s.estado === "error" ? (
                                  <span style={{ color: "var(--bad-text)" }}>
                                    {t(
                                      "agregarVarias.res.noCreada",
                                      "No se creó",
                                    )}
                                  </span>
                                ) : s.estado === "creando" ? (
                                  t("agregarVarias.res.creando", "Creando…")
                                ) : (
                                  t("agregarVarias.res.enEspera", "En espera")
                                )}
                              </div>
                              {s.estado === "error" && s.error && (
                                <div
                                  className="mt-1 text-xs"
                                  style={{ color: "var(--bad-text)" }}
                                >
                                  {s.error}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              {!r ? (
                                <span style={{ color: "var(--ink-faint)" }}>
                                  {s.donde || "—"}
                                </span>
                              ) : r.horario === "hecho" ? (
                                <span className="inline-flex items-center gap-1">
                                  <Check
                                    size={13}
                                    style={{ color: "var(--ok-text)" }}
                                  />
                                  {s.donde}
                                </span>
                              ) : r.horario === "despues" ? (
                                <span style={{ color: "var(--ink-soft)" }}>
                                  {t(
                                    "agregarVarias.res.sinHorario",
                                    "Sin horario por ahora",
                                  )}
                                </span>
                              ) : (
                                <span style={{ color: "var(--bad-text)" }}>
                                  {t("agregarVarias.res.horarioFallo", {
                                    defaultValue: "No se guardó: {{e}}",
                                    e: r.horarioError || "",
                                  })}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              {r?.acceso.link ? (
                                <div className="flex flex-wrap items-center gap-2">
                                  {r.acceso.username && (
                                    <code className="font-mono text-xs font-semibold">
                                      {r.acceso.username}
                                    </code>
                                  )}
                                  <Button
                                    size="sm"
                                    type="button"
                                    variant="outline"
                                    onClick={() => copiar(r.acceso.link || "")}
                                  >
                                    <Copy size={13} />
                                    {t(
                                      "usuarioDeAcceso.compartir.copiarEnlace",
                                      "Copiar enlace",
                                    )}
                                  </Button>
                                  <Button asChild size="sm" variant="outline">
                                    <a
                                      href={enlaceDeWhatsApp(mensaje)}
                                      rel="noreferrer"
                                      target="_blank"
                                    >
                                      <MessageCircle size={13} />
                                      WhatsApp
                                    </a>
                                  </Button>
                                </div>
                              ) : r?.acceso.correo ? (
                                <span className="inline-flex items-center gap-1 text-xs">
                                  <Mail
                                    size={13}
                                    style={{ color: "var(--ink-soft)" }}
                                  />
                                  {t("agregarVarias.res.correoEnviado", {
                                    defaultValue: "Correo enviado a {{c}}",
                                    c: r.acceso.correo,
                                  })}
                                </span>
                              ) : r ? (
                                <span
                                  className="text-xs"
                                  style={{ color: "var(--ink-soft)" }}
                                >
                                  {t(
                                    "agregarPersona.listo.accesoEnFicha",
                                    "Su acceso está en su ficha («Reenviar invitación»).",
                                  )}
                                </span>
                              ) : null}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <div className="flex flex-wrap justify-end gap-2">
                                {!progreso &&
                                  (s.estado === "error" ||
                                    (r && r.horario === "fallo")) && (
                                    <Button
                                      size="sm"
                                      type="button"
                                      variant="outline"
                                      onClick={() => crearUna(f, s)}
                                    >
                                      <RotateCcw size={13} />
                                      {s.estado === "error"
                                        ? t(
                                            "agregarVarias.res.reintentar",
                                            "Reintentar",
                                          )
                                        : t(
                                            "agregarVarias.res.reintentarHorario",
                                            "Reintentar horario",
                                          )}
                                    </Button>
                                  )}
                                {!progreso && r && r.horario === "despues" && (
                                  <Button
                                    size="sm"
                                    type="button"
                                    variant="outline"
                                    onClick={() =>
                                      navigate(
                                        dondeTerminarHorario(r.tipo, r.fichaId),
                                      )
                                    }
                                  >
                                    <CalendarClock size={13} />
                                    {t(
                                      "agregarPersona.listo.ponerHorario",
                                      "Ponerle horario",
                                    )}
                                  </Button>
                                )}
                                {ficha && (
                                  <Button
                                    size="sm"
                                    type="button"
                                    variant="ghost"
                                    onClick={() => navigate(ficha)}
                                  >
                                    {t(
                                      "agregarPersona.listo.verFicha",
                                      "Ver ficha",
                                    )}
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>

              {!progreso && (
                <>
                  {creadas.some((s) => s.resultado?.acceso.link) && (
                    <InfoNote tone="warn">
                      {t(
                        "agregarPersona.listo.enlacePrivado",
                        "El enlace es solo para esta persona: con él pone la contraseña de su cuenta. No lo publiques en grupos.",
                      )}
                    </InfoNote>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="brand"
                      onClick={empezarDeNuevo}
                    >
                      <Users size={14} />
                      {t("agregarVarias.hecho.otra", "Agregar otra lista")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => navigate("/schedule")}
                    >
                      <CalendarClock size={14} />
                      {t("agregarVarias.hecho.verHorario", "Ver el horario")}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </Section>
        )}
      </PageContainer>
    </AppLayout>
  );
}

/** One editable row of the review table. */
function FilaEditable({
  f,
  cat,
  roles,
  conJornada,
  problemas,
  nombreDeTipo,
  onDatos,
  onFila,
  onQuitar,
}: {
  f: FilaDeLote;
  cat: Catalogos;
  roles: RolDeOficina[];
  conJornada: boolean;
  problemas: string[];
  nombreDeTipo: (x: TipoDePersona | null) => string;
  onDatos: (d: Partial<FilaDeLote["datos"]>) => void;
  onFila: (d: Partial<FilaDeLote>) => void;
  onQuitar: () => void;
}) {
  const { t } = useTranslation();
  const celda = `${FIELD_CLS} h-8 text-xs`;
  const mal = problemas.length > 0;
  const valorDestino =
    f.destino?.tipo === "plaza" || f.destino?.tipo === "puesto"
      ? f.destino.positionId
      : f.destino?.tipo === "jornada"
        ? "jornada"
        : "";
  const elegirDestino = (v: string) => {
    let d: Destino = null;

    if (f.tipo === "vigilante" && v) {
      const p = cat.plazas.find((x) => x.positionId === v);

      if (p)
        d = { tipo: "plaza", stationId: p.stationId, positionId: p.positionId };
    } else if (f.tipo === "supervisor" && v)
      d = { tipo: "puesto", positionId: v };
    else if (f.tipo === "oficina" && v === "jornada") d = { tipo: "jornada" };
    onFila({ destino: d, destinoMotivo: null });
  };
  const cambiarTipo = (v: string) => {
    const tipo = (v || null) as TipoDePersona | null;

    onFila({
      tipo,
      destino: tipo === "oficina" ? { tipo: "jornada" } : null,
      destinoMotivo: null,
      datos: {
        ...f.datos,
        sinCorreo: !f.datos.correo.trim() && tipo !== "oficina",
      },
    });
  };

  return (
    <>
      <tr
        className="border-t align-top"
        style={{
          borderColor: "var(--hairline)",
          background: mal
            ? "color-mix(in oklab, var(--bad) 5%, transparent)"
            : undefined,
        }}
      >
        <td
          className="px-2 py-2 text-xs tabular-nums"
          style={{ color: "var(--ink-soft)" }}
        >
          {f.linea}
        </td>
        <td className="px-2 py-2">
          <select
            aria-label={t("agregarVarias.col.tipo", "Qué hace")}
            className={`${celda} min-w-[9.5rem]`}
            value={f.tipo || ""}
            onChange={(e) => cambiarTipo(e.target.value)}
          >
            <option value="">{t("agregarVarias.elegir", "Elegir…")}</option>
            {(["vigilante", "supervisor", "oficina"] as TipoDePersona[]).map(
              (x) => (
                <option key={x} value={x}>
                  {nombreDeTipo(x)}
                </option>
              ),
            )}
          </select>
        </td>
        <td className="px-2 py-2">
          <input
            aria-label={t("agregarVarias.col.nombres", "Nombres")}
            className={`${celda} min-w-[8rem]`}
            value={f.datos.nombres}
            onChange={(e) => onDatos({ nombres: e.target.value })}
          />
        </td>
        <td className="px-2 py-2">
          <input
            aria-label={t("agregarVarias.col.apellidos", "Apellidos")}
            className={`${celda} min-w-[8rem]`}
            value={f.datos.apellidos}
            onChange={(e) => onDatos({ apellidos: e.target.value })}
          />
        </td>
        <td className="px-2 py-2">
          <div className="flex min-w-[15rem] flex-col gap-1">
            {f.tipo === "oficina" && (
              <select
                aria-label={t("agregarVarias.rol", "Rol")}
                className={celda}
                value={f.datos.rol}
                onChange={(e) => onDatos({ rol: e.target.value })}
              >
                <option value="">
                  {t("agregarPersona.campos.rolElige", "Elige su rol")}
                </option>
                {roles.map((r) => (
                  <option key={r.id} value={String(r.id)}>
                    {roleDisplayName(String(r.slug || r.name || ""))}
                  </option>
                ))}
              </select>
            )}
            {f.tipo && (
              <select
                aria-label={t("agregarVarias.col.donde", "Rol y horario")}
                className={celda}
                value={valorDestino}
                onChange={(e) => elegirDestino(e.target.value)}
              >
                {f.tipo === "oficina" ? (
                  <>
                    <option disabled={!conJornada} value="jornada">
                      {t("agregarVarias.donde.jornada", "Jornada de oficina")}
                    </option>
                    <option value="">
                      {t("agregarVarias.jornada.sin", "Sin horario por ahora")}
                    </option>
                  </>
                ) : (
                  <>
                    <option value="">
                      {t("agregarVarias.jornada.sin", "Sin horario por ahora")}
                    </option>
                    {f.tipo === "vigilante"
                      ? cat.plazas.map((p) => (
                          <option
                            key={p.positionId}
                            disabled={
                              p.libres <= 0 && valorDestino !== p.positionId
                            }
                            value={p.positionId}
                          >
                            {`${p.puesto} · ${p.plaza}${p.detalle ? ` · ${p.detalle}` : ""}${p.libres <= 0 ? ` (${t("ui.AllStaff.plazaOcupada", "Ocupada")})` : p.sinRotacion ? ` (${t("agregarVarias.sinRotacion", "sin rotación")})` : ""}`}
                          </option>
                        ))
                      : cat.puestos.map((p) => (
                          <option key={p.id} value={p.id}>
                            {`${p.titulo}${p.detalle ? ` · ${p.detalle}` : ""}${p.sinRotacion ? ` (${t("agregarVarias.sinRotacion", "sin rotación")})` : ""}`}
                          </option>
                        ))}
                  </>
                )}
              </select>
            )}
            {f.puestoTexto && !f.destino && f.destinoMotivo && (
              <span
                className="text-[11px]"
                style={{ color: "var(--ink-soft)" }}
              >
                {t("agregarVarias.decia", {
                  defaultValue: "En tu lista: «{{x}}»",
                  x: f.puestoTexto,
                })}
              </span>
            )}
          </div>
        </td>
        <td className="px-2 py-2">
          <input
            aria-label={t("agregarVarias.col.empieza", "Empieza")}
            className={`${celda} min-w-[9.5rem]`}
            type="date"
            value={f.empieza}
            onChange={(e) =>
              onFila({ empieza: e.target.value, empiezaInvalida: false })
            }
          />
        </td>
        <td className="px-2 py-2">
          <input
            aria-label={t("agregarVarias.col.documento", "Documento")}
            className={`${celda} min-w-[7.5rem]`}
            disabled={f.tipo === "oficina"}
            value={f.datos.documento}
            onChange={(e) => onDatos({ documento: e.target.value })}
          />
        </td>
        <td className="px-2 py-2">
          <input
            aria-label={t("agregarVarias.col.celular", "Celular")}
            className={`${celda} min-w-[8.5rem]`}
            value={f.datos.celular}
            onChange={(e) => onDatos({ celular: e.target.value })}
          />
        </td>
        <td className="px-2 py-2">
          <input
            aria-label={t("agregarVarias.col.correo", "Correo")}
            className={`${celda} min-w-[13rem]`}
            placeholder={
              f.tipo === "oficina"
                ? ""
                : t("agregarVarias.sinCorreo", "Sin correo: entra con usuario")
            }
            value={f.datos.correo}
            onChange={(e) =>
              onDatos({
                correo: e.target.value,
                sinCorreo: !e.target.value.trim() && f.tipo !== "oficina",
              })
            }
          />
        </td>
        <td className="px-2 py-2 text-right">
          <Button
            aria-label={t("agregarVarias.quitar", "Quitar de la lista")}
            size="sm"
            type="button"
            variant="danger-ghost"
            onClick={onQuitar}
          >
            <Trash2 size={14} />
          </Button>
        </td>
      </tr>
      {mal && (
        <tr
          style={{
            background: "color-mix(in oklab, var(--bad) 5%, transparent)",
          }}
        >
          <td />
          <td
            className="px-2 pb-2 text-xs"
            colSpan={9}
            style={{ color: "var(--bad-text)" }}
          >
            {problemas.join(" · ")}
          </td>
        </tr>
      )}
    </>
  );
}
