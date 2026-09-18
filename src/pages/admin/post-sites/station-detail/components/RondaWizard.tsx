import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Loader2,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  MapPin,
  Route,
  Printer,
  Check,
  Crosshair,
  CalendarClock,
} from "lucide-react";
import { toast } from "sonner";

import {
  CamposDeHorario,
  valorInicial,
  aCuerpo,
  validaHorario,
  type ValorDeHorario,
} from "./RondaHorario";

import { ApiService } from "@/services/api/apiService";
import { Modal, FIELD_CLS, InfoNote } from "@/components/kit";
import { Button } from "@/components/ui/button";
import CheckpointLocationPicker from "@/components/maps/CheckpointLocationPicker";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ASISTENTE PARA CREAR UNA RONDA COMPLETA
 *
 * Antes, montar una ronda de ocho puntos era esto: abrir un modal y escribir el
 * nombre; guardar; desplegar la ronda; pulsar «añadir punto»; escribir el
 * nombre; guardar; repetir OCHO veces; y después ir a otra pestaña a imprimir
 * los códigos. Diecisiete idas y venidas para dar de alta un puesto.
 *
 * Así es como se hace en las plataformas grandes del sector, y por qué:
 *
 *  · **De una sentada.** Instalar un puesto es UNA tarea: se recorre el sitio
 *    una vez, se apunta dónde va cada punto y se da de alta todo junto. Partir
 *    eso en diecisiete pasos es lo que hace que la ronda se cree «para después»
 *    y se quede sin puntos — y una ronda sin puntos no avisa de nada.
 *
 *  · **Con plantillas.** Casi ninguna instalación es original: una bodega, un
 *    edificio y una urbanización tienen los mismos puntos con otros nombres.
 *    Se EDITAN antes de crear; no son un molde cerrado.
 *
 *  · **Colocando cada punto en el mapa AQUÍ.** Es lo que faltaba. Todos nacían
 *    en la coordenada del puesto y había que ir a afinarlos uno a uno después —
 *    o sea, otra vez la misma tarea partida en trozos. Y mientras no se afinan,
 *    la geocerca de los ocho puntos es el mismo círculo: la comprobación de que
 *    el vigilante estuvo EN CADA punto no comprueba nada, porque estar en la
 *    garita valida la azotea. Colocarlos aquí es lo que hace que la ronda sirva
 *    de prueba desde el primer día.
 *
 *  · **Y termina en la impresora.** El punto no existe de verdad hasta que la
 *    etiqueta está pegada en la pared.
 *
 * El CÓDIGO de cada punto no se pide ni se enseña: lo emite el servidor.
 * Ver `backend/src/lib/checkpointCode.ts`.
 * ════════════════════════════════════════════════════════════════════════════
 */

export interface PuntoBorrador {
  /** Clave sólo de la lista en pantalla; no viaja al servidor. */
  key: string;
  nombre: string;
  lugar: string;
  lat: number | null;
  lng: number | null;
  radius: number;
  /** ¿Se colocó a mano en el mapa, o sigue heredando la del puesto? */
  colocado: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantId: string;
  stationId: string;
  postSiteId?: string;
  /** Coordenadas del puesto: el punto de partida de cada checkpoint. */
  stationLat: number | null;
  stationLng: number | null;
  stationRadius: number;
  stationName?: string | null;
  onCreated: (tourId: string, puntosCreados: number) => void;
  onPrint?: () => void;
}

/**
 * Plantillas. Los nombres son los que usa de verdad una empresa de guardianía
 * en español de la región, no traducciones de un manual.
 */
const PLANTILLAS: Array<{
  id: string;
  nombre: string;
  descripcion: string;
  puntos: string[];
}> = [
  {
    id: "perimetral",
    nombre: "Ronda perimetral",
    descripcion:
      "El contorno de la instalación. La más común en bodegas y plantas.",
    puntos: [
      "Acceso principal",
      "Perímetro norte",
      "Perímetro sur",
      "Perímetro posterior",
      "Estacionamiento",
      "Salida de emergencia",
    ],
  },
  {
    id: "interna",
    nombre: "Ronda interna",
    descripcion: "Recorrido por dentro del edificio, planta por planta.",
    puntos: [
      "Recepción",
      "Pasillo central",
      "Bodega",
      "Cuarto eléctrico",
      "Cuarto de máquinas",
      "Azotea",
    ],
  },
  {
    id: "nocturna",
    nombre: "Ronda nocturna",
    descripcion:
      "Los puntos críticos, para repetir varias veces en la madrugada.",
    puntos: [
      "Acceso principal",
      "Perímetro",
      "Bodega",
      "Cuarto eléctrico",
      "Estacionamiento",
    ],
  },
  {
    id: "residencial",
    nombre: "Ronda residencial",
    descripcion: "Urbanización o conjunto: garita, áreas comunes y accesos.",
    puntos: [
      "Garita",
      "Portón vehicular",
      "Área social",
      "Piscina",
      "Juegos infantiles",
      "Portón peatonal",
    ],
  },
];

let contador = 0;
const nuevaClave = () => `p${++contador}`;

export default function RondaWizard({
  open,
  onOpenChange,
  tenantId,
  stationId,
  postSiteId,
  stationLat,
  stationLng,
  stationRadius,
  stationName,
  onCreated,
  onPrint,
}: Props) {
  const { t } = useTranslation();
  const [paso, setPaso] = useState<1 | 2 | 3>(1);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  /**
   * El horario, aquí mismo en el alta.
   *
   * Nace en «una vez por turno», que es la conducta de siempre: quien sólo
   * quiere crear la ronda y salir no tiene que tocar nada, y el asistente
   * sigue siendo tan corto como era. Ésa era su razón de existir.
   */
  const [horario, setHorario] = useState<ValorDeHorario>(() =>
    valorInicial(null),
  );
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<{
    tourId: string;
    creados: number;
    fallidos: number;
  } | null>(null);

  /** Todos nacen en la coordenada del puesto, y `colocado:false` lo confiesa. */
  const puntoVacio = (n = "", l = ""): PuntoBorrador => ({
    key: nuevaClave(),
    nombre: n,
    lugar: l,
    lat: stationLat,
    lng: stationLng,
    radius: stationRadius,
    colocado: false,
  });

  const [puntos, setPuntos] = useState<PuntoBorrador[]>([puntoVacio()]);
  /** Qué punto se está colocando en el mapa. */
  const [editando, setEditando] = useState<string | null>(null);

  const validos = useMemo(
    () => puntos.filter((p) => p.nombre.trim()),
    [puntos],
  );
  const sinColocar = useMemo(
    () => validos.filter((p) => !p.colocado).length,
    [validos],
  );
  const sinCoordenadas = stationLat == null || stationLng == null;
  const enEdicion = puntos.find((p) => p.key === editando) || null;

  const reiniciar = () => {
    setPaso(1);
    setNombre("");
    setDescripcion("");
    setHorario(valorInicial(null));
    setPuntos([puntoVacio()]);
    setResultado(null);
    setEditando(null);
  };

  const cerrar = (v: boolean) => {
    if (!v && !guardando) reiniciar();
    onOpenChange(v);
  };

  const aplicarPlantilla = (id: string) => {
    const p = PLANTILLAS.find((x) => x.id === id);

    if (!p) return;
    if (!nombre.trim()) setNombre(p.nombre);
    setPuntos(p.puntos.map((n) => puntoVacio(n)));
    setPaso(2);
  };

  const cambiar = (key: string, campo: "nombre" | "lugar", valor: string) =>
    setPuntos((ps) =>
      ps.map((p) => (p.key === key ? { ...p, [campo]: valor } : p)),
    );

  /** Colocar en el mapa marca el punto como COLOCADO: deja de heredar. */
  const colocar = (key: string, lat: number, lng: number, radius: number) =>
    setPuntos((ps) =>
      ps.map((p) =>
        p.key === key ? { ...p, lat, lng, radius, colocado: true } : p,
      ),
    );

  const mover = (i: number, delta: number) =>
    setPuntos((ps) => {
      const j = i + delta;

      if (j < 0 || j >= ps.length) return ps;
      const copia = [...ps];

      [copia[i], copia[j]] = [copia[j], copia[i]];

      return copia;
    });

  /**
   * Crear. La ronda primero y los puntos DESPUÉS, en orden: si un punto falla,
   * la ronda ya existe y lo creado se conserva — se dice cuántos entraron y
   * cuántos no, y se añaden los que falten a mano. Tirarlo todo por un nombre
   * repetido sería peor: se pierde el trabajo de rellenar y colocar la lista.
   */
  const crear = async () => {
    if (!nombre.trim()) {
      toast.error(t("ronda.wizard.nameRequired", "Ponle un nombre a la ronda"));

      return;
    }
    if (!validos.length) {
      toast.error(
        t("ronda.wizard.pointsRequired", "Añade al menos un punto de control"),
      );

      return;
    }
    const errorHorario = validaHorario(horario, t);

    if (errorHorario) {
      toast.error(errorHorario);

      return;
    }
    setGuardando(true);
    try {
      const tour: any = await ApiService.post(`/tenant/${tenantId}/site-tour`, {
        name: nombre.trim(),
        description: descripcion.trim() || undefined,
        stationId,
        postSiteId: postSiteId || undefined,
        active: true,
        // El horario entra CON el alta. Antes había que crear la ronda y
        // volver a su tarjeta a ponérselo, que es donde se quedaban a medias.
        ...aCuerpo(horario),
      });
      const tourId = String(tour?.id ?? tour?.data?.id ?? "");

      if (!tourId)
        throw new Error(
          t(
            "ronda.wizard.noTourId",
            "La ronda se creó pero el servidor no devolvió su id",
          ),
        );

      let creados = 0;
      let fallidos = 0;

      for (const p of validos) {
        try {
          // El identificador NO se manda: lo emite el servidor, opaco.
          await ApiService.post(
            `/tenant/${tenantId}/site-tour/${encodeURIComponent(tourId)}/tag`,
            {
              name: p.nombre.trim(),
              location: p.lugar.trim() || undefined,
              tagType: "qr",
              stationId,
              latitude: p.lat,
              longitude: p.lng,
              geofenceRadius: p.radius,
              showGeoFence: true,
            },
          );
          creados++;
        } catch {
          fallidos++;
        }
      }
      setResultado({ tourId, creados, fallidos });
      setPaso(3);
      onCreated(tourId, creados);
    } catch (e: any) {
      toast.error(
        e?.message || t("ronda.wizard.failed", "No se pudo crear la ronda"),
      );
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      description={
        paso === 1
          ? t(
              "ronda.wizard.step1",
              "Empieza de una plantilla o desde cero. Podrás cambiarlo todo antes de guardar.",
            )
          : paso === 2
            ? t(
                "ronda.wizard.step2map",
                "Escribe los puntos en orden y coloca cada uno en el mapa.",
              )
            : undefined
      }
      footer={
        paso === 3 ? (
          <div className="flex justify-end gap-2">
            {onPrint && (
              <Button
                className="gap-2"
                variant="brand"
                onClick={() => {
                  onPrint();
                  cerrar(false);
                }}
              >
                <Printer className="h-4 w-4" />{" "}
                {t("ronda.wizard.printNow", "Imprimir los QR")}
              </Button>
            )}
            <Button variant="ghost" onClick={() => cerrar(false)}>
              {t("common.close", "Cerrar")}
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs" style={{ color: "var(--ink-faint)" }}>
              {paso === 2 &&
                t("ronda.wizard.count", "{{n}} punto(s)", {
                  n: validos.length,
                })}
            </span>
            <div className="flex gap-2">
              {paso === 2 && (
                <Button
                  disabled={guardando}
                  variant="ghost"
                  onClick={() => setPaso(1)}
                >
                  {t("common.back", "Atrás")}
                </Button>
              )}
              {paso === 1 ? (
                <Button
                  disabled={!nombre.trim()}
                  variant="brand"
                  onClick={() => setPaso(2)}
                >
                  {t("common.next", "Siguiente")}
                </Button>
              ) : (
                <Button
                  className="gap-2"
                  disabled={guardando || !validos.length}
                  variant="brand"
                  onClick={crear}
                >
                  {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t("ronda.wizard.create", "Crear ronda y sus puntos")}
                </Button>
              )}
            </div>
          </div>
        )
      }
      icon={<Route className="h-5 w-5" />}
      open={open}
      size="lg"
      title={
        paso === 3
          ? t("ronda.wizard.doneTitle", "Ronda creada")
          : t("ronda.wizard.title", "Nueva ronda")
      }
      onOpenChange={cerrar}
    >
      {paso === 1 && (
        <div className="space-y-4">
          <div>
            <label
              className="mb-1 block text-sm font-semibold"
              style={{ color: "var(--ink)" }}
            >
              {t("ronda.wizard.name", "Nombre de la ronda")}
            </label>
            <input
              autoFocus
              className={FIELD_CLS}
              placeholder={t("ronda.wizard.namePh", "Ronda nocturna") as string}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </div>
          <div>
            <label
              className="mb-1 block text-sm font-semibold"
              style={{ color: "var(--ink)" }}
            >
              {t("ronda.wizard.desc", "Descripción")}{" "}
              <span style={{ color: "var(--ink-faint)" }}>
                ({t("common.optional", "opcional")})
              </span>
            </label>
            <input
              className={FIELD_CLS}
              placeholder={
                t(
                  "ronda.wizard.descPh",
                  "Cada 2 horas, de 22:00 a 06:00",
                ) as string
              }
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </div>

          <div>
            <p
              className="mb-2 text-sm font-semibold"
              style={{ color: "var(--ink)" }}
            >
              {t("ronda.wizard.templates", "Empezar de una plantilla")}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {PLANTILLAS.map((p) => (
                <button
                  key={p.id}
                  className="cg-focus glass-flat rounded-xl p-3 text-left transition-colors hover:bg-[var(--glass-hover)]"
                  type="button"
                  onClick={() => aplicarPlantilla(p.id)}
                >
                  <span
                    className="block text-sm font-semibold"
                    style={{ color: "var(--ink)" }}
                  >
                    {p.nombre}
                  </span>
                  <span
                    className="mt-0.5 block text-xs"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    {p.descripcion}
                  </span>
                  <span
                    className="mt-1.5 block text-[11px]"
                    style={{ color: "var(--ink-faint)" }}
                  >
                    {p.puntos.length} {t("ronda.wizard.points", "puntos")} ·{" "}
                    {p.puntos.slice(0, 3).join(", ")}…
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* ── CUÁNDO ─────────────────────────────────────────────────────
              Va aquí y no en un paso propio a propósito: este asistente nació
              para que crear una ronda dejara de ser diecisiete pasos, y un
              cuarto paso obligatorio iría justo contra eso. En «una vez por
              turno» —el valor de partida— son cuatro opciones y los días, así
              que quien no quiera horario pasa de largo sin tocar nada. */}
          <div className="rounded-lg border p-4">
            <p className="cg-eyebrow mb-3 flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5" />
              {t("ronda.wizard.when", "Cuándo se hace")}
            </p>
            <CamposDeHorario
              idPrefijo="alta"
              valor={horario}
              onChange={setHorario}
            />
          </div>
        </div>
      )}

      {paso === 2 && (
        <div className="space-y-3">
          {sinCoordenadas && (
            <InfoNote
              title={
                t(
                  "ronda.wizard.noCoordsTitle",
                  "El puesto no tiene ubicación",
                ) as string
              }
              tone="warn"
            >
              {t(
                "ronda.wizard.noCoords",
                "Los puntos se crearán sin coordenadas, así que no se podrá comprobar que el vigilante estaba ahí. Pon la ubicación del puesto y luego ajusta cada punto en el mapa.",
              )}
            </InfoNote>
          )}

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            {/* ── La lista ──────────────────────────────────────────────── */}
            <div className="space-y-2">
              {puntos.map((p, i) => {
                const activo = p.key === editando;

                return (
                  <div
                    key={p.key}
                    className="glass-flat flex items-start gap-2 rounded-xl p-2 transition-shadow"
                    style={
                      activo
                        ? {
                            boxShadow: "inset 0 0 0 1px var(--brand-line)",
                            background: "var(--brand-wash)",
                          }
                        : undefined
                    }
                  >
                    <span
                      className="mt-2 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold"
                      style={{
                        background: "var(--brand-wash)",
                        color: "var(--brand-text)",
                      }}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <input
                        className={FIELD_CLS}
                        placeholder={
                          t(
                            "ronda.wizard.pointPh",
                            "Nombre del punto — p. ej. Acceso principal",
                          ) as string
                        }
                        value={p.nombre}
                        onChange={(e) =>
                          cambiar(p.key, "nombre", e.target.value)
                        }
                        onFocus={() => setEditando(p.key)}
                      />
                      <input
                        className={FIELD_CLS}
                        placeholder={
                          t(
                            "ronda.wizard.wherePh",
                            "Dónde se pega la etiqueta (opcional)",
                          ) as string
                        }
                        value={p.lugar}
                        onChange={(e) =>
                          cambiar(p.key, "lugar", e.target.value)
                        }
                        onFocus={() => setEditando(p.key)}
                      />
                      <button
                        className="cg-focus inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold disabled:opacity-50"
                        disabled={sinCoordenadas}
                        style={{
                          color: p.colocado
                            ? "var(--ok-text)"
                            : "var(--warn-text)",
                        }}
                        type="button"
                        onClick={() => setEditando(activo ? null : p.key)}
                      >
                        {p.colocado ? (
                          <>
                            <MapPin className="h-3 w-3" />{" "}
                            {t("ronda.wizard.placed", "Colocado en el mapa")}
                          </>
                        ) : (
                          <>
                            <Crosshair className="h-3 w-3" />{" "}
                            {t("ronda.wizard.placeIt", "Colocar en el mapa")}
                          </>
                        )}
                      </button>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <button
                        aria-label={t("common.moveUp", "Subir") as string}
                        className="cg-focus cg-btn-glass grid h-7 w-7 place-items-center rounded-md disabled:opacity-30"
                        disabled={i === 0}
                        type="button"
                        onClick={() => mover(i, -1)}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        aria-label={t("common.moveDown", "Bajar") as string}
                        className="cg-focus cg-btn-glass grid h-7 w-7 place-items-center rounded-md disabled:opacity-30"
                        disabled={i === puntos.length - 1}
                        type="button"
                        onClick={() => mover(i, 1)}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        aria-label={t("common.delete", "Eliminar") as string}
                        className="cg-focus cg-btn-glass grid h-7 w-7 place-items-center rounded-md disabled:opacity-30"
                        disabled={puntos.length === 1}
                        type="button"
                        onClick={() => {
                          setPuntos((ps) => ps.filter((x) => x.key !== p.key));
                          if (editando === p.key) setEditando(null);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}

              <button
                className="cg-focus cg-btn-glass inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold"
                type="button"
                onClick={() => setPuntos((ps) => [...ps, puntoVacio()])}
              >
                <Plus className="h-4 w-4" />{" "}
                {t("ronda.wizard.addPoint", "Añadir punto")}
              </button>
            </div>

            {/* ── El mapa del punto seleccionado ────────────────────────── */}
            <div className="space-y-2">
              {enEdicion && !sinCoordenadas ? (
                <>
                  <p
                    className="text-xs font-semibold"
                    style={{ color: "var(--ink)" }}
                  >
                    {enEdicion.nombre.trim() ||
                      t("ronda.wizard.thisPoint", "Este punto")}
                  </p>
                  <CheckpointLocationPicker
                    lat={enEdicion.lat}
                    lng={enEdicion.lng}
                    radius={enEdicion.radius}
                    reference={
                      stationLat != null && stationLng != null
                        ? {
                            lat: stationLat,
                            lng: stationLng,
                            label: stationName || undefined,
                          }
                        : null
                    }
                    onChange={(la, ln, r) => colocar(enEdicion.key, la, ln, r)}
                  />
                </>
              ) : (
                <div
                  className="glass-flat grid min-h-[220px] place-items-center rounded-xl p-6 text-center text-sm"
                  style={{ color: "var(--ink-faint)" }}
                >
                  <span>
                    <MapPin className="mx-auto mb-2 h-5 w-5" />
                    {sinCoordenadas
                      ? t(
                          "ronda.wizard.mapNoStation",
                          "Pon primero la ubicación del puesto para poder colocar los puntos.",
                        )
                      : t(
                          "ronda.wizard.mapHint",
                          "Elige un punto de la lista para colocarlo en el mapa.",
                        )}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* ── POR QUÉ INSISTIR EN COLOCARLOS ──────────────────────────────
              Mientras todos comparten la coordenada del puesto, la geocerca de
              los ocho puntos es EL MISMO círculo: estar en la garita valida la
              azotea, y la ronda deja de probar nada. No se bloquea la creación
              —hay puestos donde la coordenada exacta se sabe después—, pero se
              dice, y se dice con la cuenta delante. */}
          {!sinCoordenadas && sinColocar > 0 && (
            <InfoNote tone="warn">
              {t(
                "ronda.wizard.pendingPlacement",
                "{{n}} punto(s) siguen en la coordenada del puesto. Mientras compartan sitio, la comprobación de cercanía no distingue un punto de otro: estar en la entrada daría por válida la azotea. Puedes crearlos igual y colocarlos después.",
                { n: sinColocar },
              )}
            </InfoNote>
          )}
        </div>
      )}

      {paso === 3 && resultado && (
        <div className="space-y-3">
          <div
            className="flex items-center gap-2 text-sm font-semibold"
            style={{ color: "var(--ok)" }}
          >
            <Check className="h-4 w-4" />
            {t(
              "ronda.wizard.created",
              "«{{nombre}}» con {{n}} punto(s) de control",
              { nombre: nombre.trim(), n: resultado.creados },
            )}
          </div>
          {resultado.fallidos > 0 && (
            <InfoNote tone="warn">
              {t(
                "ronda.wizard.someFailed",
                "No se pudieron crear {{n}} punto(s). La ronda y el resto sí quedaron guardados: añade los que falten desde la lista.",
                { n: resultado.fallidos },
              )}
            </InfoNote>
          )}
          <InfoNote
            title={t("ronda.wizard.nextTitle", "Lo que falta") as string}
            tone="info"
          >
            {t(
              "ronda.wizard.next",
              "Los puntos existen, pero un punto de control no sirve hasta que su etiqueta está pegada en la pared. Imprime los QR, plastifícalos y colócalos donde dice el nombre de cada uno.",
            )}
          </InfoNote>
        </div>
      )}
    </Modal>
  );
}
