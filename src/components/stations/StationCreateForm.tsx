import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2, Plus, X } from "lucide-react";

import { invalidateEntity } from "@/lib/queryClient";
import { ApiService } from "@/services/api/apiService";
import { Button } from "@/components/ui/button";
import StationGeofencePolygon, {
  type PolyPoint,
} from "@/components/GoogleMap/StationGeofencePolygon";
import { FIELD_CLS_LG } from "@/pages/admin/clientes/components/_shared/tab-kit";
import { InfoNote } from "@/components/kit";
import { esEvento } from "@/lib/serviceTypes";
import { rangoDelEvento, vigenciaDe } from "@/lib/eventos";
import { horaDeLaEmpresa } from "@/lib/horaDeLaEmpresa";

import { AvisosDeRelevos } from "./AvisosDeRelevos";

/* ════════════════════════════════════════════════════════════════════════════
   LA COBERTURA DEL PUESTO, CON NÚMEROS.

   Lo que contrata el cliente es «de qué hora a qué hora, cuántos vigilantes a
   la vez y qué días». Eso es del PUESTO y es lo único que se pregunta aquí.
   Quién lo cubre y con qué ciclo (4-4-2, 7-1, sacafranco…) es de la GENTE y
   se decide al asignar y en el Planificador — el formulario viejo lo mezclaba
   (ciclo, bloques, «sacafranco o alternancia») y confundía.

   Cada franja × vigilantes a la vez se convierte en una plaza en el servidor
   (`auto-positions` con `franjas`), que es lo que leen el generador de turnos
   y el Planificador.
   ════════════════════════════════════════════════════════════════════════ */

export interface Franja {
  id: string;
  start: string;
  end: string;
  guards: number;
  /** Días que opera ('lun'…'dom'); vacío = todos. */
  days: string[];
}

export const DIAS = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"] as const;
const DIAS_CORTO: Record<string, string> = {
  lun: "L",
  mar: "M",
  mie: "X",
  jue: "J",
  vie: "V",
  sab: "S",
  dom: "D",
};

const nuevaFranja = (start: string, end: string, guards = 1): Franja => ({
  id: Math.random().toString(36).slice(2),
  start,
  end,
  guards,
  days: [],
});

const toMin = (hhmm: string) => {
  const m = String(hhmm || "").match(/^(\d{1,2}):(\d{2})$/);

  if (!m) return NaN;

  return (
    ((parseInt(m[1], 10) % 24) * 60 + (parseInt(m[2], 10) % 60) + 1440) % 1440
  );
};

/** Minutos que dura una franja; 00:00→00:00 = 24 h. */
export function duracion(f: Pick<Franja, "start" | "end">): number {
  const a = toMin(f.start);
  const b = toMin(f.end);

  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  const w = (b - a + 1440) % 1440;

  return w === 0 ? 1440 : w;
}

/** El tipo que guarda el servidor, derivado de las franjas (sólo para rótulos). */
export function tipoDeFranjas(
  fr: Franja[],
): "24h" | "12h-day" | "12h-night" | "custom" {
  const total = fr.reduce((acc, f) => acc + duracion(f), 0);

  if (fr.length <= 2 && total === 1440) return "24h";
  if (fr.length === 1) {
    const h = Math.floor(toMin(fr[0].start) / 60);

    return toMin(fr[0].end) <= toMin(fr[0].start) || h >= 18
      ? "12h-night"
      : "12h-day";
  }

  return "custom";
}

const toHHMM = (min: number) => {
  const mm = ((min % 1440) + 1440) % 1440;

  return `${String(Math.floor(mm / 60)).padStart(2, "0")}:${String(mm % 60).padStart(2, "0")}`;
};

/** Parte una ventana (de–a, o 24 h) en `turnos` franjas iguales. */
export function partir(
  desde: string,
  hasta: string,
  turnos: number,
  guards: number,
  days: string[],
): Franja[] {
  const ini = toMin(desde);
  const total = duracion({ start: desde, end: hasta });

  if (Number.isNaN(ini) || total <= 0) return [];
  const n = Math.max(1, Math.min(6, Math.round(turnos) || 1));
  const largo = total / n;

  return Array.from({ length: n }, (_, i) => ({
    ...nuevaFranja(
      toHHMM(ini + i * largo),
      toHHMM(ini + (i + 1) * largo),
      guards,
    ),
    days: [...days],
  }));
}

/**
 * EVENTOS: la ventana partida en RELEVOS de `horas` horas, uno detrás de otro
 * («16:00–00:30 en relevos de 4 h» → 16:00–20:00 y 20:00–00:30). Un sobrante de
 * menos de una hora no hace un relevo propio: se lo lleva el último (nadie
 * contrata a un vigilante para media hora).
 */
export function partirPorHoras(
  desde: string,
  hasta: string,
  horas: number,
  guards: number,
): Franja[] {
  const ini = toMin(desde);
  const total = duracion({ start: desde, end: hasta });
  const largo = Math.round(Math.max(1, Math.min(24, horas)) * 60);

  if (Number.isNaN(ini) || total <= 0) return [];
  const cortes: number[] = [];

  for (let m = 0; m < total; m += largo) cortes.push(m);
  if (cortes.length > 1 && total - cortes[cortes.length - 1] < 60) cortes.pop();

  return cortes
    .slice(0, 12)
    .map((m, i, xs) =>
      nuevaFranja(
        toHHMM(ini + m),
        toHHMM(ini + (i === xs.length - 1 ? total : xs[i + 1])),
        guards,
      ),
    );
}

/* ── EL TRAMO DE CADA FRANJA, POR LA HORA A LA QUE EMPIEZA ──────────────────
   D si arranca entre las 5 y las 12, T entre las 12 y las 18, N el resto. La
   rotación se escribe con un contador por tramo («3 D · 3 N · 2 L») y el
   servidor la guarda como patrón (primer tramo / segundo tramo / libres). */
export const NOMBRE_TRAMO: Record<string, string> = {
  D: "día",
  T: "tarde",
  N: "noche",
};
export function letraDeFranja(f: Pick<Franja, "start">): "D" | "T" | "N" {
  const h = Math.floor(toMin(f.start) / 60);

  if (Number.isNaN(h)) return "D";
  if (h >= 5 && h < 12) return "D";
  if (h >= 12 && h < 18) return "T";

  return "N";
}

export type Ciclo = { D: number; T: number; N: number; L: number };
export const CICLO_VACIO: Ciclo = { D: 0, T: 0, N: 0, L: 0 };

export interface Rotacion {
  dayShifts: number;
  nightShifts: number;
  restDays: number;
  alterna: boolean;
  dominical: boolean;
  nombre: string;
  largo: number;
  /** Tres tramos con días: el servidor sólo guarda dos. */
  noRepresentable: boolean;
}

/** Un ciclo de contadores → lo que entiende el servidor (o null si está vacío). */
export function rotacionDe(
  c: Ciclo,
  tramos: string[],
  alterna: boolean,
  dominical: boolean,
  /** El tramo PROPIO de la plaza (ciclo por plaza): va primero, ver abajo. */
  propio?: string,
): Rotacion | null {
  /* El motor cuenta `dayShifts` como turnos en la ventana PROPIA de la plaza y
     `nightShifts` en la ventana espejo (así dos plazas con el mismo patrón se
     cubren entre sí). Para una plaza nocturna «2 D · 3 N» son 3 en la suya y 2
     en la espejo: su tramo se pone primero. Medido 2026-10-06: sin esto, la
     plaza N de BIOMAR salía 2 N · 3 D. */
  const orden = propio
    ? [propio, ...tramos.filter((l) => l !== propio)]
    : tramos;
  const conDias = orden.filter((l) => (c[l as keyof Ciclo] || 0) > 0);

  if (!conDias.length) return null;
  const partes = [
    ...conDias.map((l) => `${c[l as keyof Ciclo]}${l}`),
    `${c.L}L`,
  ];
  const marcas = [
    alterna && tramos.length >= 2 ? "alterna" : "",
    dominical ? "dom" : "",
  ].filter(Boolean);
  const largo =
    conDias.reduce((acc, l) => acc + (c[l as keyof Ciclo] || 0), 0) + c.L;

  return {
    dayShifts: c[conDias[0] as keyof Ciclo] || 0,
    nightShifts: conDias[1] ? c[conDias[1] as keyof Ciclo] || 0 : 0,
    restDays: c.L,
    alterna: alterna && tramos.length >= 2,
    dominical,
    nombre: [partes.join(" "), ...marcas].join(" · "),
    largo,
    noRepresentable: conDias.length > 2,
  };
}

/** Cuántas personas cubren UN asiento con este ciclo. Si los días de trabajo
    dividen exacto el ciclo (1 y 1 = 24×24, 2 y 2, 3 y 3…) son k = largo ÷
    trabajo que se turnan, sin sacafranco; si no, es un fijo y el sacafranco
    tapa sus libres. El servidor crea una plaza por persona (teselado). */
export function personasQueSeTurnan(r: Rotacion | null): number {
  if (!r) return 1;
  const trabajo = r.dayShifts + r.nightShifts;

  return trabajo > 0 && r.largo % trabajo === 0
    ? Math.min(4, r.largo / trabajo)
    : 1;
}

/** Rótulo del tramo: «24 h» si su franja es el día entero; si no, su nombre. */
export function rotuloDeTramo(
  l: string,
  franjas: Pick<Franja, "start" | "end">[],
): string {
  if (l === "L") return "";
  const f = franjas.find((x) => letraDeFranja(x) === l);

  return f && duracion(f) === 1440 ? "24 h" : NOMBRE_TRAMO[l] || l;
}

export interface StationCreada {
  id: string;
  name: string;
}

interface Props {
  /** La sede (ya guardada): aporta tenant y coordenadas al puesto nuevo. */
  site: any;
  siteId: string;
  onCreated?: (st: StationCreada) => void;
  onCancel?: () => void;
  submitLabel?: string;
  /**
   * «evento»: la sede es un EVENTO. No hay rotación ni días de la semana —el
   * servidor crea asignaciones puntuales dentro de las fechas del evento—; se
   * pregunta la ventana, cuántos a la vez y la geocerca. Sin decirlo, se deduce
   * del tipo de servicio de la sede.
   */
  modo?: "normal" | "evento";
  /** Fechas del evento (ISO). Sin decirlo, las de la sede. */
  vigencia?: { desde?: string | null; hasta?: string | null };
}

/** La cobertura con la que nace el formulario de un evento: sus propias horas. */
export function coberturaInicialDelEvento(vig: {
  desde?: string | null;
  hasta?: string | null;
}): { modo: "" | "24h" | "horario"; desde: string; hasta: string } | null {
  const { desde, hasta } = vigenciaDe({
    vigenteDesde: vig.desde,
    vigenteHasta: vig.hasta,
  });

  if (!desde || !hasta || hasta.getTime() <= desde.getTime()) return null;
  const ini = horaDeLaEmpresa(desde);
  const fin = horaDeLaEmpresa(hasta);

  // Un evento de un día o más se cubre las 24 h, con el relevo a la hora en
  // que arranca; uno más corto, de su hora de inicio a la de fin.
  if (hasta.getTime() - desde.getTime() >= 24 * 3600 * 1000 || ini === fin)
    return { modo: "24h", desde: ini, hasta: ini };

  return { modo: "horario", desde: ini, hasta: fin };
}

/**
 * EL FORMULARIO COMPLETO DE CREAR ESTACIÓN — nombre, nominativo, cobertura
 * con números, geocerca, tolerancias — como componente, para que lo use igual
 * la página /post-sites/:id/stations/new y el paso «Estaciones» del asistente
 * de la sede. Un solo formulario, un solo comportamiento.
 */
export default function StationCreateForm({
  site,
  siteId,
  onCreated,
  onCancel,
  submitLabel,
  modo: modoProp,
  vigencia: vigenciaProp,
}: Props) {
  const id = siteId;
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const esModoEvento =
    (modoProp ?? (esEvento(site) ? "evento" : "normal")) === "evento";
  const vigencia = vigenciaProp ?? {
    desde: site?.vigenteDesde ?? null,
    hasta: site?.vigenteHasta ?? null,
  };
  // Sólo para el evento: arranca con sus horas ya puestas.
  const [inicialEvento] = useState(() =>
    esModoEvento ? coberturaInicialDelEvento(vigencia) : null,
  );

  // Datos del puesto
  const [newName, setNewName] = useState("");
  const [nickname, setNickname] = useState("");
  const [newDescription, setNewDescription] = useState("");
  /* LA COBERTURA: se dice como se contrata —«24 horas» o «de tal hora a tal
     hora»—, en cuántos turnos se parte y cuántos a la vez. De eso salen las
     franjas; quien quiera retocarlas a mano puede. */
  const [modo, setModo] = useState<"" | "24h" | "horario">(
    inicialEvento?.modo ?? "",
  );
  const [desde, setDesde] = useState(inicialEvento?.desde ?? "07:00");
  const [hasta, setHasta] = useState(inicialEvento?.hasta ?? "19:00");
  const [turnos, setTurnos] = useState(inicialEvento?.modo === "24h" ? 2 : 1);
  const [aLaVez, setALaVez] = useState(1);
  const [diasGlobal, setDiasGlobal] = useState<string[]>([]);
  const [ajustar, setAjustar] = useState(false);
  const [manuales, setManuales] = useState<Franja[]>([]);
  const ventana = modo === "24h" ? { desde, hasta: desde } : { desde, hasta };
  const horasVentana = modo
    ? duracion({ start: ventana.desde, end: ventana.hasta }) / 60
    : 0;
  /* EVENTOS: el turno se dice en HORAS. `null` = todo el horario (quien vaya
     cubre la ventana entera, cada día del evento); un número = relevos de
     tantas horas, y cada relevo tiene sus propias plazas. */
  const [relevo, setRelevo] = useState<number | null>(
    inicialEvento?.modo === "24h" ? 12 : null,
  );
  const calculadas = useMemo(
    () =>
      !modo
        ? []
        : esModoEvento
          ? relevo
            ? partirPorHoras(ventana.desde, ventana.hasta, relevo, aLaVez)
            : partir(ventana.desde, ventana.hasta, 1, aLaVez, [])
          : partir(ventana.desde, ventana.hasta, turnos, aLaVez, diasGlobal),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [modo, desde, hasta, turnos, aLaVez, diasGlobal, relevo, esModoEvento],
  );
  const franjas = ajustar ? manuales : calculadas;
  const seats = franjas.reduce((acc, f) => acc + Math.max(1, f.guards), 0);
  const franjasOk =
    franjas.length > 0 &&
    franjas.every((f) => duracion(f) > 0 && f.guards >= 1 && f.guards <= 20);
  const elegirModo = (m: "24h" | "horario") => {
    setModo(m);
    setAjustar(false);
    if (esModoEvento) setRelevo(m === "24h" ? 12 : null);
    if (m === "24h") {
      setDesde(esModoEvento && inicialEvento ? inicialEvento.desde : "07:00");
      setTurnos(2);
    } else {
      if (esModoEvento && inicialEvento) {
        setDesde(inicialEvento.desde);
        if (inicialEvento.modo === "horario") setHasta(inicialEvento.hasta);
      }
      setTurnos(1);
    }
  };
  const cambiarFranja = (fid: string, delta: Partial<Franja>) =>
    setManuales((fs) => fs.map((f) => (f.id === fid ? { ...f, ...delta } : f)));
  const quitarFranja = (fid: string) =>
    setManuales((fs) => fs.filter((f) => f.id !== fid));
  const anadirFranja = () =>
    setManuales((fs) => {
      const ultima = fs[fs.length - 1];

      return [
        ...fs,
        nuevaFranja(
          ultima?.end || "07:00",
          ultima ? ultima.start : "19:00",
          aLaVez,
        ),
      ];
    });
  const abrirAjuste = () => {
    setManuales(
      calculadas.map((f) => ({
        ...f,
        id: Math.random().toString(36).slice(2),
      })),
    );
    setAjustar(true);
  };
  /* LA ROTACIÓN (opcional): un contador por tramo (D/T/N según la hora de
     cada franja) y otro de libres. Para el puesto entero, o PLAZA POR PLAZA
     cuando cada vigilante lleva un ciclo distinto (BIOMAR: la mañana 2-3-2,
     la tarde 3-2-2). */
  const tramos = useMemo(() => {
    const vistos: string[] = [];

    for (const f of franjas) {
      const l = letraDeFranja(f);

      if (!vistos.includes(l)) vistos.push(l);
    }

    return vistos;
  }, [franjas]);
  const plazas = useMemo(
    () =>
      [...franjas]
        .sort((x, y) => toMin(x.start) - toMin(y.start))
        .flatMap((f) => Array.from({ length: Math.max(1, f.guards) }, () => f)),
    [franjas],
  );
  const [porPlaza, setPorPlaza] = useState(false);
  const [ciclos, setCiclos] = useState<Record<string, Ciclo>>({});
  const [alterna, setAlterna] = useState(false);
  const [dominical, setDominical] = useState(false);
  const cicloDe = (k: string): Ciclo => ciclos[k] || CICLO_VACIO;
  const ponerCiclo = (k: string, l: keyof Ciclo, v: number) =>
    setCiclos((cs) => ({
      ...cs,
      [k]: { ...cicloDe(k), [l]: Math.max(0, Math.min(30, v)) },
    }));
  const rotacion = useMemo(
    () => rotacionDe(cicloDe("*"), tramos, alterna, dominical),
    [ciclos, tramos, alterna, dominical],
  ); // eslint-disable-line react-hooks/exhaustive-deps
  const rotacionesPorPlaza = useMemo(
    () =>
      plazas.map((f, i) =>
        rotacionDe(
          cicloDe(String(i)),
          tramos,
          alterna,
          dominical,
          letraDeFranja(f),
        ),
      ),
    [plazas, ciclos, tramos, alterna, dominical], // eslint-disable-line react-hooks/exhaustive-deps
  );
  /* Cuánta gente fija pide el puesto con estos ciclos: por asiento, k que se
     turnan (ciclo que cierra exacto) o 1 fijo cuyos libres tapa el sacafranco. */
  const rotacionesEfectivas = porPlaza
    ? rotacionesPorPlaza
    : plazas.map(() => rotacion);
  const necesarios = rotacionesEfectivas.some(Boolean)
    ? rotacionesEfectivas.reduce((acc, r) => acc + personasQueSeTurnan(r), 0)
    : 0;
  const conSacafranco = rotacionesEfectivas.some(
    (r) => r && !r.noRepresentable && personasQueSeTurnan(r) === 1,
  );

  /* EL RADIO EN LA UNIDAD DE LA EMPRESA. En EE. UU. se piensa en pies; el
     servidor sigue guardando metros. Y el PUNTO EXACTO del puesto: nace en
     la sede y se arrastra en el mapa (la caseta no siempre está en la puerta). */
  const usaPies =
    (localStorage.getItem("tenantCountry") || "").toUpperCase() === "US";
  const [geofenceRadius, setGeofenceRadius] = useState(usaPies ? "330" : "100");
  const radioEnMetros = usaPies
    ? Math.round((Number(geofenceRadius) || 0) * 0.3048)
    : Math.round(Number(geofenceRadius) || 0);
  const sedeLat = Number(site?.latitud || site?.latitude);
  const sedeLng = Number(site?.longitud || site?.longitude);
  const [punto, setPunto] = useState<{ lat: number; lng: number } | null>(null);
  const puntoFinal =
    punto ??
    (Number.isFinite(sedeLat) && Number.isFinite(sedeLng) && sedeLat !== 0
      ? { lat: sedeLat, lng: sedeLng }
      : null);
  const [geofencePolygon, setGeofencePolygon] = useState<PolyPoint[]>([]);
  // Per-station clock-in tolerance windows (minutes). Empty = use tenant default.
  const [clockInEarlyBufferMin, setClockInEarlyBufferMin] = useState("");
  const [clockInLateGraceMin, setClockInLateGraceMin] = useState("");

  const createStation = async () => {
    const tenantId = site?.tenantId || localStorage.getItem("tenantId") || "";
    const postSiteId = site?.id || id || "";

    if (!newName.trim()) {
      toast.error(t("postSites.stations.provideName", "Provide a name"));

      return;
    }
    if (!postSiteId) {
      toast.error(
        t("postsite.Details.unexpected", "Unexpected error occurred"),
      );

      return;
    }
    if (!franjasOk) {
      toast.error(
        t(
          "ui.StationCreateForm.faltaCobertura",
          "Di qué horas se cubre: 24 horas o de qué hora a qué hora, y cuántos vigilantes a la vez.",
        ),
      );

      return;
    }
    setSaving(true);
    try {
      /* Sin pin ni sede geolocalizada va `null`: la columna es DECIMAL y
         una cadena vacía la rompe («Data truncated for column 'latitud'»). */
      const latitud = puntoFinal?.lat ?? null;
      const longitud = puntoFinal?.lng ?? null;
      const tipo = tipoDeFranjas(franjas);
      // Los relevos de un evento ya vienen en orden de reloj y pueden cruzar la
      // medianoche (22:00, 02:00): ordenarlos por minuto daría 02:00 primero.
      const ordenadas = esModoEvento
        ? [...franjas]
        : [...franjas].sort((x, y) => toMin(x.start) - toMin(y.start));
      const primera = ordenadas[0];
      const ultima = ordenadas[ordenadas.length - 1];
      const payload = {
        stationName: newName,
        nickname: nickname.trim() || null,
        postSiteId,
        latitud,
        longitud,
        /* El horario lo describen las PLAZAS, que las crea `auto-positions`
           a partir de estas mismas franjas. Lo que va en la fila del puesto es
           el rótulo: la ventana total y cuántos vigilantes caben a la vez. */
        turnoType: tipo,
        is24h: tipo === "24h",
        numberOfGuardsInStation: String(seats),
        startingTimeInDay: primera.start,
        finishTimeInDay: tipo === "24h" ? primera.start : ultima.end,
        geofenceRadius: radioEnMetros || 100,
        geofencePolygon: geofencePolygon.length >= 3 ? geofencePolygon : null,
        // Empty input → null so the tenant Nómina default applies.
        clockInEarlyBufferMin:
          clockInEarlyBufferMin.trim() === ""
            ? null
            : Number(clockInEarlyBufferMin),
        clockInLateGraceMin:
          clockInLateGraceMin.trim() === ""
            ? null
            : Number(clockInLateGraceMin),
        description: newDescription,
      } as any;
      const createdSt: any = await ApiService.post(
        `/tenant/${tenantId}/station`,
        { data: payload },
      );
      const adopted =
        (createdSt &&
          (createdSt.adoptedTours || createdSt.data?.adoptedTours)) ||
        0;

      if (adopted > 0)
        toast.success(
          t("ui.AddStationPage.rondasRecuperadas", {
            count: adopted,
            defaultValue:
              "{{count}} rondas del puesto anterior recuperadas en este puesto",
          }),
        );
      invalidateEntity("stations");
      const newStationId = createdSt?.id || createdSt?.data?.id || null;

      // La rotación se vuelve patrón del servidor (reutilizado si ya existía
      // uno igual): uno para el puesto, o uno por plaza. Si falla, la
      // estación queda sin plantilla y el ciclo se decide al asignar.
      const crearPatron = async (r: Rotacion | null): Promise<string> => {
        if (!r || r.noRepresentable || !newStationId) return "";
        try {
          const res: any = await ApiService.post(
            `/tenant/${tenantId}/rotation-style`,
            {
              data: {
                name: r.nombre,
                dayShifts: r.dayShifts,
                nightShifts: r.nightShifts,
                restDays: r.restDays,
                alternatesDayNight: r.alterna,
                sundayDoubleRest: r.dominical,
                reuseIfExists: true,
              },
            },
          );

          return res?.id || res?.data?.id || "";
        } catch (e) {
          console.error("rotation-style failed", e);

          return "";
        }
      };
      let rotationStyleId = "";
      let positionRotationStyleIds: string[] | undefined;

      if (porPlaza) {
        positionRotationStyleIds = [];
        for (const r of rotacionesPorPlaza)
          positionRotationStyleIds.push(await crearPatron(r));
        rotationStyleId = positionRotationStyleIds.find(Boolean) || "";
        if (!positionRotationStyleIds.some(Boolean))
          positionRotationStyleIds = undefined;
      } else {
        rotationStyleId = await crearPatron(rotacion);
      }

      // Las plazas: una por vigilante a la vez en cada franja.
      if (newStationId) {
        try {
          await ApiService.post(
            `/tenant/${tenantId}/station/${newStationId}/auto-positions`,
            {
              data: {
                scheduleType: tipo,
                rotationStyleId: rotationStyleId || undefined,
                positionRotationStyleIds,
                franjas: ordenadas.map((f) => ({
                  start: f.start,
                  end: f.end,
                  guards: Math.max(1, f.guards),
                  days: f.days.length && f.days.length < 7 ? f.days : [],
                })),
              },
            },
          );
        } catch (cfgErr: any) {
          console.error("auto-positions failed", cfgErr);
          toast.warning(
            t(
              "postSites.stations.horarioConfigFailed",
              "Estación creada, pero no se pudo configurar el horario. Configúralo en Programador › Horario.",
            ),
          );
        }
      }
      toast.success(t("postSites.stations.created", "Station created"));
      onCreated?.({ id: newStationId || "", name: newName });
    } catch (err: any) {
      console.error("Failed creating station", err);
      toast.error(
        err?.message ||
          t("postSites.stations.createFailed", "Failed creating station"),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="glass">
        <div className="space-y-6 p-6">
          {/* Name */}
          <div>
            <label className="mb-2 block text-sm font-medium">
              {t("postSites.stations.form.name", "Nombre *")}
            </label>
            <input
              autoFocus
              className={FIELD_CLS_LG}
              placeholder={t(
                "postSites.stations.placeholderName",
                "Nombre de la estación",
              )}
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>

          {/* Nickname / nominativo — private to operations */}
          <div>
            <label className="mb-2 flex items-center gap-2 text-sm font-medium">
              {t("postSites.stations.form.nickname", "Nominativo")}
              <span
                className="rounded px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wide"
                style={{
                  background: "var(--glass-sunken)",
                  color: "var(--ink-soft)",
                }}
              >
                {t("common.private", "Privado")}
              </span>
            </label>
            <input
              className={FIELD_CLS_LG}
              placeholder={t(
                "postSites.stations.placeholderNickname",
                "Apodo / nominativo interno",
              )}
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
            <p className="mt-1 text-xs" style={{ color: "var(--ink-soft)" }}>
              {t(
                "postSites.stations.form.nicknameHint",
                "Solo visible para operaciones del tenant. El cliente no lo ve.",
              )}
            </p>
          </div>

          {/* ¿Qué horas se cubre? — como se contrata: 24 h o de tal a tal hora */}
          <div>
            {esModoEvento && (
              <InfoNote className="mb-3" tone="brand">
                {(() => {
                  const rango = rangoDelEvento(vigencia.desde, vigencia.hasta);

                  return rango
                    ? t("ui.StationCreateForm.eventoNota", {
                        defaultValue:
                          "Evento: {{rango}} · Di qué horas cubre esta estación dentro del evento y cuántos vigilantes a la vez. Sin rotación: quien asignes trabaja esas horas mientras dure el evento.",
                        rango,
                      })
                    : t(
                        "ui.StationCreateForm.eventoNotaSinFechas",
                        "Di qué horas cubre esta estación dentro del evento y cuántos vigilantes a la vez. Sin rotación: quien asignes trabaja esas horas mientras dure el evento.",
                      );
                })()}
              </InfoNote>
            )}
            <label className="mb-1 block text-sm font-medium">
              {t(
                "ui.StationCreateForm.queHorasSeCubre",
                "¿Qué horas se cubre? *",
              )}
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {(["24h", "horario"] as const).map((m) => {
                const activo = modo === m;

                return (
                  <button
                    key={m}
                    className="cg-focus rounded-full border px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80"
                    style={
                      activo
                        ? {
                            background: "var(--brand)",
                            color: "var(--brand-ink)",
                            borderColor: "var(--brand)",
                          }
                        : {
                            background: "var(--glass)",
                            color: "var(--ink)",
                            borderColor: "var(--hairline)",
                          }
                    }
                    type="button"
                    onClick={() => elegirModo(m)}
                  >
                    {m === "24h"
                      ? t("ui.StationCreateForm.preset.24h", "24 horas")
                      : t(
                          "ui.StationCreateForm.unHorario",
                          "Un horario (hora de entrada y de salida)",
                        )}
                  </button>
                );
              })}
            </div>

            {modo && (
              <div className="glass-flat mt-3 space-y-3 p-3">
                {/* Fila 1: la ventana y en cuántos turnos se parte */}
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {modo === "horario" ? (
                    <>
                      <span style={{ color: "var(--ink-soft)" }}>
                        {t("ui.StationCreateForm.de", "de")}
                      </span>
                      <input
                        className="cg-input cg-focus h-8 w-32 px-2 text-center font-mono text-sm"
                        type="time"
                        value={desde}
                        onChange={(e) => setDesde(e.target.value)}
                      />
                      <span style={{ color: "var(--ink-soft)" }}>
                        {t("ui.StationCreateForm.a", "a")}
                      </span>
                      <input
                        className="cg-input cg-focus h-8 w-32 px-2 text-center font-mono text-sm"
                        type="time"
                        value={hasta}
                        onChange={(e) => setHasta(e.target.value)}
                      />
                    </>
                  ) : (
                    <>
                      <span style={{ color: "var(--ink-soft)" }}>
                        {t("ui.StationCreateForm.relevoALas", "relevo a las")}
                      </span>
                      <input
                        className="cg-input cg-focus h-8 w-32 px-2 text-center font-mono text-sm"
                        type="time"
                        value={desde}
                        onChange={(e) => setDesde(e.target.value)}
                      />
                    </>
                  )}
                  <span className="font-semibold tabular-nums">
                    {Math.round(horasVentana * 10) / 10} h
                  </span>
                  {!esModoEvento && (
                    <>
                      <span
                        className="mx-1 h-5 w-px"
                        style={{ background: "var(--hairline)" }}
                      />
                      <span style={{ color: "var(--ink-soft)" }}>
                        {t("ui.StationCreateForm.enTurnosDe", "en")}
                      </span>
                      <input
                        className="cg-input cg-focus h-8 w-14 px-2 text-center text-sm"
                        max={6}
                        min={1}
                        type="number"
                        value={turnos}
                        onChange={(e) =>
                          setTurnos(
                            Math.max(
                              1,
                              Math.min(6, Number(e.target.value) || 1),
                            ),
                          )
                        }
                      />
                      <span style={{ color: "var(--ink-soft)" }}>
                        {t("ui.StationCreateForm.turnosDeNh", {
                          defaultValue: "turnos de {{h}} h",
                          count: turnos,
                          h: horasVentana
                            ? Math.round(
                                (horasVentana / Math.max(1, turnos)) * 10,
                              ) / 10
                            : 0,
                        })}
                      </span>
                    </>
                  )}
                </div>
                {/* EVENTOS: cuánto dura el turno de cada vigilante. En un
                    concierto es normal que nadie haga las 8 h: entran en
                    relevos de 4. Cada relevo lleva sus propias plazas. */}
                {esModoEvento && (
                  <div className="space-y-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span style={{ color: "var(--ink-soft)" }}>
                        {t(
                          "ui.StationCreateForm.evento.turnoDeCadaUno",
                          "Turno de cada vigilante",
                        )}
                      </span>
                      {[null, 2, 4, 6, 8, 12]
                        .filter(
                          (h) => h === null || (h < horasVentana && h <= 12),
                        )
                        .map((h) => {
                          const activo = relevo === h;

                          return (
                            <button
                              key={String(h)}
                              aria-pressed={activo}
                              className="cg-focus rounded-full border px-3 py-1 text-xs font-semibold transition-opacity hover:opacity-80"
                              style={
                                activo
                                  ? {
                                      background: "var(--brand)",
                                      color: "var(--brand-ink)",
                                      borderColor: "var(--brand)",
                                    }
                                  : {
                                      background: "var(--glass)",
                                      color: "var(--ink)",
                                      borderColor: "var(--hairline)",
                                    }
                              }
                              type="button"
                              onClick={() => {
                                setRelevo(h);
                                setAjustar(false);
                              }}
                            >
                              {h === null
                                ? t(
                                    "ui.StationCreateForm.evento.todoElHorario",
                                    {
                                      defaultValue: "Todo el horario ({{h}} h)",
                                      h: Math.round(horasVentana * 10) / 10,
                                    },
                                  )
                                : t("ui.StationCreateForm.evento.relevosDe", {
                                    defaultValue: "Relevos de {{h}} h",
                                    h,
                                  })}
                            </button>
                          );
                        })}
                    </div>
                    {calculadas.length > 1 && (
                      <p
                        className="text-xs"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {t("ui.StationCreateForm.evento.relevosResumen", {
                          defaultValue:
                            "{{n}} relevos: {{tramos}}. Cada vigilante cubre sólo su relevo.",
                          n: calculadas.length,
                          tramos: calculadas
                            .map((f) => `${f.start}–${f.end}`)
                            .join(" · "),
                        })}
                      </p>
                    )}
                  </div>
                )}
                {/* Fila 2: cuántos a la vez y qué días — juntos, para que el número no se pierda */}
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="inline-flex items-center gap-2">
                    <input
                      className="cg-input cg-focus h-8 w-14 px-2 text-center text-sm"
                      max={20}
                      min={1}
                      type="number"
                      value={aLaVez}
                      onChange={(e) =>
                        setALaVez(
                          Math.max(
                            1,
                            Math.min(20, Number(e.target.value) || 1),
                          ),
                        )
                      }
                    />
                    <span style={{ color: "var(--ink-soft)" }}>
                      {t("ui.StationCreateForm.aLaVez", {
                        defaultValue: "vigilantes a la vez",
                        count: aLaVez,
                      })}
                    </span>
                  </span>
                  {/* Un evento no tiene «días de la semana»: tiene sus fechas. */}
                  {!esModoEvento && (
                    <>
                      <span
                        className="h-5 w-px"
                        style={{ background: "var(--hairline)" }}
                      />
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="text-xs"
                          style={{ color: "var(--ink-soft)" }}
                        >
                          {t("ui.StationCreateForm.dias", "días")}
                        </span>
                        <span className="flex gap-0.5">
                          {DIAS.map((d) => {
                            const todos = diasGlobal.length === 0;
                            const on = todos || diasGlobal.includes(d);

                            return (
                              <button
                                key={d}
                                aria-pressed={on}
                                className="cg-focus h-6 w-6 rounded text-[10px] font-bold"
                                style={
                                  on
                                    ? {
                                        background:
                                          "color-mix(in oklab, var(--brand) 22%, transparent)",
                                        color: "var(--brand-text)",
                                      }
                                    : {
                                        background: "var(--glass-sunken)",
                                        color: "var(--ink-faint)",
                                      }
                                }
                                title={d}
                                type="button"
                                onClick={() => {
                                  const actuales: string[] = todos
                                    ? [...DIAS]
                                    : diasGlobal;
                                  const sig = on
                                    ? actuales.filter((x) => x !== d)
                                    : [...actuales, d];

                                  setDiasGlobal(sig.length === 7 ? [] : sig);
                                }}
                              >
                                {DIAS_CORTO[d]}
                              </button>
                            );
                          })}
                        </span>
                      </span>
                    </>
                  )}
                </div>

                {/* Las franjas que salen de eso */}
                <div>
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                    <span className="cg-eyebrow">
                      {ajustar
                        ? t(
                            "ui.StationCreateForm.franjasAjustadas",
                            "Franjas (ajustadas a mano)",
                          )
                        : t(
                            "ui.StationCreateForm.franjasResultantes",
                            "Franjas que se cubren",
                          )}
                    </span>
                    {!ajustar ? (
                      <button
                        className="cg-focus text-xs font-semibold"
                        style={{ color: "var(--brand-text)" }}
                        type="button"
                        onClick={abrirAjuste}
                      >
                        {t(
                          "ui.StationCreateForm.ajustarAMano",
                          "Ajustar a mano",
                        )}
                      </button>
                    ) : (
                      <button
                        className="cg-focus text-xs font-semibold"
                        style={{ color: "var(--brand-text)" }}
                        type="button"
                        onClick={() => setAjustar(false)}
                      >
                        {t(
                          "ui.StationCreateForm.volverAutomatico",
                          "Volver a lo automático",
                        )}
                      </button>
                    )}
                  </div>
                  {!ajustar ? (
                    <div className="flex flex-wrap gap-1.5">
                      {calculadas.map((f, i) => (
                        <span
                          key={f.id}
                          className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-xs"
                          style={{ borderColor: "var(--hairline)" }}
                        >
                          <span
                            className="grid h-4 w-4 place-items-center rounded-full text-[10px] font-bold"
                            style={{
                              background:
                                "color-mix(in oklab, var(--brand) 22%, transparent)",
                              color: "var(--brand-text)",
                            }}
                          >
                            {letraDeFranja(f)}
                          </span>
                          {i + 1} · {f.start}–{f.end} · ×{f.guards}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {manuales.map((f, i) => {
                        const min = duracion(f);
                        const mal = min === 0 || f.guards < 1;

                        return (
                          <div
                            key={f.id}
                            className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2"
                            style={{
                              borderColor: mal
                                ? "var(--bad)"
                                : "var(--hairline)",
                            }}
                          >
                            <span
                              className="w-6 text-center text-xs font-bold tabular-nums"
                              style={{ color: "var(--ink-faint)" }}
                            >
                              {i + 1}
                            </span>
                            <input
                              className="cg-input cg-focus h-8 w-32 px-2 text-center font-mono text-sm"
                              type="time"
                              value={f.start}
                              onChange={(e) =>
                                cambiarFranja(f.id, { start: e.target.value })
                              }
                            />
                            <span
                              className="text-xs"
                              style={{ color: "var(--ink-soft)" }}
                            >
                              {t("ui.StationCreateForm.a", "a")}
                            </span>
                            <input
                              className="cg-input cg-focus h-8 w-32 px-2 text-center font-mono text-sm"
                              type="time"
                              value={f.end}
                              onChange={(e) =>
                                cambiarFranja(f.id, { end: e.target.value })
                              }
                            />
                            <span
                              className="text-xs tabular-nums"
                              style={{ color: "var(--ink-faint)" }}
                            >
                              {min > 0
                                ? `${Math.round((min / 60) * 10) / 10} h`
                                : "—"}
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                              <input
                                className="cg-input cg-focus h-8 w-14 px-2 text-center text-sm"
                                max={20}
                                min={1}
                                type="number"
                                value={f.guards}
                                onChange={(e) =>
                                  cambiarFranja(f.id, {
                                    guards: Math.max(
                                      1,
                                      Math.min(20, Number(e.target.value) || 1),
                                    ),
                                  })
                                }
                              />
                              <span
                                className="text-xs"
                                style={{ color: "var(--ink-soft)" }}
                              >
                                {t("ui.StationCreateForm.aLaVez", {
                                  defaultValue: "vigilantes a la vez",
                                  count: f.guards,
                                })}
                              </span>
                            </span>
                            <div
                              className={
                                esModoEvento ? "hidden" : "flex gap-0.5"
                              }
                            >
                              {DIAS.map((d) => {
                                const todos = f.days.length === 0;
                                const on = todos || f.days.includes(d);

                                return (
                                  <button
                                    key={d}
                                    aria-pressed={on}
                                    className="cg-focus h-6 w-6 rounded text-[10px] font-bold"
                                    style={
                                      on
                                        ? {
                                            background:
                                              "color-mix(in oklab, var(--brand) 22%, transparent)",
                                            color: "var(--brand-text)",
                                          }
                                        : {
                                            background: "var(--glass-sunken)",
                                            color: "var(--ink-faint)",
                                          }
                                    }
                                    title={d}
                                    type="button"
                                    onClick={() => {
                                      const actuales: string[] = todos
                                        ? [...DIAS]
                                        : f.days;
                                      const sig = on
                                        ? actuales.filter((x) => x !== d)
                                        : [...actuales, d];

                                      cambiarFranja(f.id, {
                                        days: sig.length === 7 ? [] : sig,
                                      });
                                    }}
                                  >
                                    {DIAS_CORTO[d]}
                                  </button>
                                );
                              })}
                            </div>
                            <button
                              aria-label={t(
                                "ui.StationCreateForm.quitarFranja",
                                "Quitar franja",
                              )}
                              className="cg-focus ml-auto rounded-md"
                              style={{ color: "var(--bad-text)" }}
                              type="button"
                              onClick={() => quitarFranja(f.id)}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      })}
                      <button
                        className="cg-focus inline-flex items-center gap-1 text-xs font-semibold"
                        style={{ color: "var(--brand-text)" }}
                        type="button"
                        onClick={anadirFranja}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {t(
                          "ui.StationCreateForm.anadirFranja",
                          "Añadir franja",
                        )}
                      </button>
                    </div>
                  )}
                </div>
                <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                  {t("ui.StationCreateForm.resumenCobertura", {
                    defaultValue:
                      "{{horas}} h-vigilante al día · {{plazas}}",
                    horas:
                      Math.round(
                        (franjas.reduce(
                          (acc, f) => acc + duracion(f) * Math.max(1, f.guards),
                          0,
                        ) /
                          60) *
                          10,
                      ) / 10,
                    plazas: t("ui.eventos.nPlazas", {
                      defaultValue: "{{count}} plazas",
                      count: seats,
                    }),
                  })}
                </p>
                {/* Un relevo que se sale del evento se recorta: se avisa aquí. */}
                {esModoEvento && (
                  <AvisosDeRelevos
                    franjas={franjas}
                    sede={{
                      vigenteDesde: vigencia.desde ?? null,
                      vigenteHasta: vigencia.hasta ?? null,
                    }}
                  />
                )}
              </div>
            )}
          </div>

          {/* ¿Cómo trabajan? — un contador por tramo (D / T / N según la hora) y otro de libres;
              para el puesto entero o plaza por plaza */}
          {franjasOk && !esModoEvento && (
            <div>
              <label className="mb-1 block text-sm font-medium">
                {t(
                  "ui.StationCreateForm.comoTrabajan",
                  "¿Cómo trabajan los vigilantes de este puesto?",
                )}
                <span
                  className="ml-2 text-xs font-normal"
                  style={{ color: "var(--ink-faint)" }}
                >
                  {t("ui.StationCreateForm.opcional", "Opcional")}
                </span>
              </label>
              <p className="mb-3 text-xs" style={{ color: "var(--ink-soft)" }}>
                {t(
                  "ui.StationCreateForm.comoTrabajanExplica",
                  "Cuántos días seguidos hace cada vigilante en cada tramo y cuántos libra. Cada uno lo hereda al asignarlo, con su desfase para que entre ellos se cubran. Si el ciclo cierra exacto (1 y 1 = 24×24, 2 y 2…) los compañeros se turnan sin sacafranco; si no, el sacafranco tapa los libres. En el Planificador se cambia persona a persona.",
                )}
              </p>
              <div className="mb-3 flex flex-wrap gap-2">
                {[false, true].map((pp) => (
                  <button
                    key={String(pp)}
                    className="cg-focus rounded-full border px-3 py-1 text-xs font-semibold"
                    style={
                      porPlaza === pp
                        ? {
                            background: "var(--brand)",
                            color: "var(--brand-ink)",
                            borderColor: "var(--brand)",
                          }
                        : {
                            background: "var(--glass)",
                            color: "var(--ink)",
                            borderColor: "var(--hairline)",
                          }
                    }
                    type="button"
                    onClick={() => setPorPlaza(pp)}
                  >
                    {pp
                      ? t(
                          "ui.StationCreateForm.cadaPlazaSuCiclo",
                          "Cada plaza con su propio ciclo",
                        )
                      : t(
                          "ui.StationCreateForm.mismoCicloTodos",
                          "El mismo ciclo para todos",
                        )}
                  </button>
                ))}
              </div>
              {(porPlaza
                ? plazas.map((f, i) => ({ k: String(i), f, i }))
                : [{ k: "*", f: null, i: -1 }]
              ).map(({ k, f, i }) => {
                const c = cicloDe(k);
                const r = porPlaza ? rotacionesPorPlaza[i] : rotacion;

                return (
                  <div
                    key={k}
                    className="mb-2 flex flex-wrap items-center gap-2"
                  >
                    {f && (
                      <span className="w-40 shrink-0 text-xs">
                        <span className="font-semibold">
                          {t("ui.StationCreateForm.plazaN", {
                            defaultValue: "Plaza {{n}}",
                            n: i + 1,
                          })}
                        </span>
                        <span
                          className="block font-mono text-[10px]"
                          style={{ color: "var(--ink-faint)" }}
                        >
                          {letraDeFranja(f)} · {f.start}–{f.end}
                        </span>
                      </span>
                    )}
                    {[...tramos, "L"].map((l) => {
                      const esLibre = l === "L";
                      const n = c[l as keyof Ciclo] || 0;
                      const fr = esLibre
                        ? null
                        : franjas.find((x) => letraDeFranja(x) === l);

                      return (
                        <div
                          key={l}
                          className="glass-flat flex min-w-[8.5rem] flex-col items-center gap-1 rounded-xl px-3 py-2"
                        >
                          <span
                            className="text-xs font-bold"
                            style={{
                              color: esLibre
                                ? "var(--ink-soft)"
                                : "var(--brand-text)",
                            }}
                          >
                            {esLibre
                              ? t("ui.StationCreateForm.libres", "L · libres")
                              : `${l} · ${rotuloDeTramo(l, franjas) === "24 h" ? "24 h" : t(`ui.StationCreateForm.tramo.${l}`, NOMBRE_TRAMO[l])}`}
                          </span>
                          {fr && !f && (
                            <span
                              className="font-mono text-[10px]"
                              style={{ color: "var(--ink-faint)" }}
                            >
                              {fr.start}–{fr.end}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <button
                              aria-label="−"
                              className="cg-focus glass h-8 w-8 rounded-md text-base"
                              type="button"
                              onClick={() =>
                                ponerCiclo(k, l as keyof Ciclo, n - 1)
                              }
                            >
                              −
                            </button>
                            <input
                              className="cg-input cg-focus h-8 w-12 px-1 text-center text-sm font-semibold"
                              min={0}
                              type="number"
                              value={n}
                              onChange={(e) =>
                                ponerCiclo(
                                  k,
                                  l as keyof Ciclo,
                                  Number(e.target.value) || 0,
                                )
                              }
                            />
                            <button
                              aria-label="+"
                              className="cg-focus glass h-8 w-8 rounded-md text-base"
                              type="button"
                              onClick={() =>
                                ponerCiclo(k, l as keyof Ciclo, n + 1)
                              }
                            >
                              +
                            </button>
                          </span>
                        </div>
                      );
                    })}
                    {r && (
                      <span
                        className="text-xs"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        = {r.nombre} ·{" "}
                        {t("ui.StationCreateForm.cicloDeN", {
                          defaultValue: "ciclo de {{n}} días",
                          n: r.largo,
                        })}
                        {r.noRepresentable
                          ? ` · ${t("ui.StationCreateForm.tresTramosEnPlanificador", "con tres tramos se cuadra al asignar / en el Planificador")}`
                          : personasQueSeTurnan(r) > 1
                            ? ` · ${t("ui.StationCreateForm.seTurnan", {
                                defaultValue:
                                  "{{k}} vigilantes que se turnan, sin sacafranco",
                                k: personasQueSeTurnan(r),
                              })}`
                            : ` · ${t("ui.StationCreateForm.fijoMasSacafranco", "un fijo; el sacafranco tapa sus libres")}`}
                      </span>
                    )}
                  </div>
                );
              })}
              {necesarios > 0 && (
                <p
                  className="mb-2 text-xs font-semibold"
                  style={{ color: "var(--brand-text)" }}
                >
                  {t("ui.StationCreateForm.hacenFalta", {
                    defaultValue: "Hacen falta {{count}} vigilantes fijos",
                    count: necesarios,
                  })}
                  {conSacafranco
                    ? ` ${t("ui.StationCreateForm.masSacafranco", "+ sacafranco para los libres")}`
                    : ""}
                </p>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-4 text-xs">
                {tramos.length >= 2 && (
                  <label className="inline-flex items-center gap-1.5">
                    <input
                      checked={alterna}
                      type="checkbox"
                      onChange={(e) => setAlterna(e.target.checked)}
                    />
                    {t(
                      "ui.StationCreateForm.seAlternan",
                      "se alternan entre tramos (día y noche)",
                    )}
                  </label>
                )}
                <label className="inline-flex items-center gap-1.5">
                  <input
                    checked={dominical}
                    type="checkbox"
                    onChange={(e) => setDominical(e.target.checked)}
                  />
                  {t(
                    "ui.StationCreateForm.francoDobleDomingo",
                    "franco doble en domingo",
                  )}
                </label>
              </div>
            </div>
          )}

          {/* Geofence radius */}
          <div>
            <label className="mb-2 block text-sm font-medium">
              {usaPies
                ? t(
                    "ui.StationCreateForm.radioPies",
                    "Radio de la geocerca (pies)",
                  )
                : t(
                    "ui.StationCreateForm.radioMetros",
                    "Radio de la geocerca (metros)",
                  )}
            </label>
            <input
              className={FIELD_CLS_LG}
              max="5000"
              min="10"
              placeholder="100"
              type="number"
              value={geofenceRadius}
              onChange={(e) => setGeofenceRadius(e.target.value)}
            />
            {usaPies && (
              <p className="mt-1 text-xs" style={{ color: "var(--ink-faint)" }}>
                ≈ {radioEnMetros} m
              </p>
            )}
            <p className="mt-1 text-xs" style={{ color: "var(--ink-soft)" }}>
              {t(
                "postSites.stations.form.geofenceHint",
                "Distancia máxima para marcar entrada",
              )}
            </p>
          </div>

          {/* Clock-in tolerance windows */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium">
                {t(
                  "postSites.stations.form.clockInEarlyBuffer",
                  "Tolerancia de entrada anticipada (min)",
                )}
              </label>
              <input
                className={FIELD_CLS_LG}
                max="240"
                min="0"
                placeholder={t("common.default", "Por defecto")}
                type="number"
                value={clockInEarlyBufferMin}
                onChange={(e) => setClockInEarlyBufferMin(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium">
                {t(
                  "postSites.stations.form.clockInLateGrace",
                  "Tolerancia de entrada tardía (min)",
                )}
              </label>
              <input
                className={FIELD_CLS_LG}
                max="240"
                min="0"
                placeholder={t("common.default", "Por defecto")}
                type="number"
                value={clockInLateGraceMin}
                onChange={(e) => setClockInLateGraceMin(e.target.value)}
              />
            </div>
            <p
              className="text-xs sm:col-span-2"
              style={{ color: "var(--ink-soft)" }}
            >
              {t(
                "postSites.stations.form.clockInBufferHint",
                "Minutos antes/después de la hora de inicio en que el vigilante puede marcar entrada. Vacío = usar el valor por defecto de la empresa.",
              )}
            </p>
          </div>

          {/* Dónde está el puesto y hasta dónde llega su geocerca */}
          <div>
            <label className="mb-2 block text-sm font-medium">
              {t(
                "ui.StationCreateForm.ubicacionYGeocerca",
                "Ubicación exacta y geocerca",
              )}
            </label>
            <p className="mb-2 text-xs" style={{ color: "var(--ink-soft)" }}>
              {t(
                "ui.StationCreateForm.ubicacionYGeocercaExplica",
                "Arrastra el pin al punto exacto del puesto. La línea punteada es el radio de arriba: dentro de ella el vigilante puede marcar entrada. Si dibujas un polígono (3+ puntos), manda el polígono.",
              )}
            </p>
            <StationGeofencePolygon
              showLocation
              centerLat={puntoFinal?.lat}
              centerLng={puntoFinal?.lng}
              radiusMeters={geofencePolygon.length >= 3 ? 0 : radioEnMetros}
              siteLocation={
                Number.isFinite(sedeLat) &&
                Number.isFinite(sedeLng) &&
                sedeLat !== 0
                  ? { lat: sedeLat, lng: sedeLng }
                  : null
              }
              value={geofencePolygon}
              onCenterChange={(lat, lng) => setPunto({ lat, lng })}
              onChange={setGeofencePolygon}
            />
          </div>

          {/* Description */}
          <div>
            <label className="mb-2 block text-sm font-medium">
              {t("postSites.stations.form.description", "Descripción")}
            </label>
            <textarea
              className={`${FIELD_CLS_LG} resize-none`}
              placeholder={t(
                "postSites.stations.form.descriptionPlaceholder",
                "Descripción opcional",
              )}
              rows={4}
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
            />
          </div>
        </div>
      </div>
      {/* Barra de acciones */}
      <div className="glass sticky bottom-0 mt-4 flex items-center justify-end gap-3 p-3">
        {onCancel && (
          <Button disabled={saving} variant="outline" onClick={onCancel}>
            {t("actions.cancel", "Cancelar")}
          </Button>
        )}
        <Button
          className="gap-2"
          disabled={!newName.trim() || !franjasOk || saving}
          variant="brand"
          onClick={createStation}
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitLabel ?? t("actions.save", "Guardar")}
        </Button>
      </div>
    </>
  );
}
