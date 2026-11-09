import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, ScanFace, Star } from "lucide-react";

import AccionesDeRostro from "@/components/rostro/AccionesDeRostro";
import { FotoDeReferencia } from "@/components/rostro/PiezasDeRostro";
import { Modal, SkeletonCards, SmartImage, StatusBadge } from "@/components/kit";
import {
  rostrosService,
  type FotoDelRegistro,
  type RostroRegistrado,
} from "@/lib/api/rostrosService";
import { fechaYHora } from "@/lib/horaDeLaEmpresa";
import { chipDeEstado } from "@/lib/rostro";

/**
 * EL DETALLE DE UNA CARA REGISTRADA — para revisarla antes de aprobarla.
 *
 * Mike (2026-11-08): «debo poder dar click y ver el detalle y las fotos
 * capturadas con el metadata, para revisar y aprobar». Las fotos que guardó el
 * registro (la de referencia, una de cada giro y más de frente), cada una con
 * sus números; el resumen de la ráfaga; y de dónde vino la captura (app,
 * versión, dispositivo, IP, ubicación si la mandó la app). Abajo, las mismas
 * acciones que la lista.
 *
 * Los registros anteriores a la galería sólo tienen la foto de referencia: se
 * enseña ésa y lo que haya.
 */
export default function DetalleDeRostro({
  rostro,
  onClose,
}: {
  rostro: RostroRegistrado | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const abierto = !!rostro;
  const userId = rostro?.userId || "";
  const q = useQuery({
    queryKey: ["rostros", "detalle", userId],
    queryFn: () => rostrosService.leer(userId),
    enabled: abierto && !!userId,
    retry: false,
  });
  const r: RostroRegistrado | null = q.data ? { ...rostro!, ...q.data } : rostro;
  const nombre = r?.nombre || t("comun.vigilante", "Vigilante");

  const fotos: FotoDelRegistro[] = r?.fotos?.length
    ? r.fotos
    : r?.fotoUrl
      ? [{ url: r.fotoUrl, referencia: true, postura: "frente" }]
      : [];
  const [elegida, setElegida] = useState(0);

  useEffect(() => setElegida(0), [userId, fotos.length]);
  const foto = fotos[Math.min(elegida, fotos.length - 1)];
  const chip = r ? chipDeEstado(r.estado) : null;

  return (
    <Modal
      description={
        chip ? (
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge tone={chip.tono}>
              {t(chip.clave, { defaultValue: chip.respaldo })}
            </StatusBadge>
            {[r?.email, r?.telefono].filter(Boolean).join(" · ")}
          </span>
        ) : null
      }
      footer={
        r ? (
          <AccionesDeRostro
            rostro={r}
            size="default"
            onCambio={(nuevo) => {
              if (nuevo.estado !== r.estado) onClose();
            }}
          />
        ) : null
      }
      icon={<ScanFace />}
      open={abierto}
      size="xl"
      title={nombre}
      onOpenChange={(o) => !o && onClose()}
    >
      {!r ? null : (
        <div className="grid gap-5 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          {/* ── Las fotos ─────────────────────────────────────────────── */}
          <div className="min-w-0 space-y-3">
            {foto ? (
              <a
                className="cg-focus block overflow-hidden rounded-2xl"
                href={foto.url || undefined}
                rel="noreferrer"
                style={{ border: "1px solid var(--hairline)" }}
                target="_blank"
                title={t("rostros.detalle.abrirFoto", "Abrir la foto en grande")}
              >
                <SmartImage
                  alt={t("rostros.foto.alt", "Foto de referencia de {{nombre}}", { nombre })}
                  className="w-full"
                  rounded="rounded-none"
                  src={foto.url || null}
                  style={{ aspectRatio: "3 / 4", objectFit: "cover" }}
                />
              </a>
            ) : (
              <FotoDeReferencia nombre={nombre} size={160} />
            )}

            {fotos.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {fotos.map((f, i) => (
                  <button
                    key={`${f.url}-${i}`}
                    aria-label={etiquetaDePostura(t, f)}
                    aria-pressed={i === elegida}
                    className="cg-focus relative overflow-hidden rounded-xl"
                    style={{
                      width: 64,
                      height: 80,
                      outline:
                        i === elegida
                          ? "2px solid var(--brand)"
                          : "1px solid var(--hairline)",
                      outlineOffset: i === elegida ? 1 : 0,
                    }}
                    title={etiquetaDePostura(t, f)}
                    type="button"
                    onClick={() => setElegida(i)}
                  >
                    <SmartImage
                      alt={etiquetaDePostura(t, f)}
                      className="size-full"
                      rounded="rounded-none"
                      src={f.url || null}
                      style={{ objectFit: "cover", width: "100%", height: "100%" }}
                    />
                    {f.referencia && (
                      <span
                        className="absolute left-1 top-1 grid size-4 place-items-center rounded-full"
                        style={{ background: "var(--brand)", color: "var(--brand-ink, #fff)" }}
                      >
                        <Star size={9} />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {foto && (
              <Bloque titulo={etiquetaDePostura(t, foto)}>
                <Dato
                  etiqueta={t("rostros.detalle.cuadro", "Cuadro")}
                  valor={
                    foto.cuadro != null
                      ? r.rafaga?.total
                        ? t("rostros.detalle.cuadroDe", "{{n}} de {{total}}", {
                            n: foto.cuadro,
                            total: r.rafaga.total,
                          })
                        : String(foto.cuadro)
                      : null
                  }
                />
                <Dato etiqueta={t("rostros.detalle.giro", "Giro")} valor={num(foto.giro)} />
                <Dato etiqueta={t("rostros.detalle.cabeceo", "Cabeceo")} valor={num(foto.cabeceo)} />
                <Dato etiqueta={t("rostros.detalle.nitidez", "Nitidez")} valor={num(foto.nitidez, 0)} />
                <Dato etiqueta={t("rostros.detalle.luz", "Luz (0-255)")} valor={num(foto.luz, 0)} />
                <Dato
                  etiqueta={t("rostros.detalle.anchoCara", "Ancho de la cara")}
                  valor={foto.anchoCara != null ? `${Math.round(foto.anchoCara)} px` : null}
                />
                <Dato
                  etiqueta={t("rostros.detalle.confianza", "Confianza de la detección")}
                  valor={pct(foto.confianza)}
                />
              </Bloque>
            )}
            {r.fotos && r.fotos.length === 0 && r.fotoUrl && (
              <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
                {t(
                  "rostros.detalle.sinGaleria",
                  "Este registro es anterior a la galería: sólo se guardó la foto de referencia.",
                )}
              </p>
            )}
          </div>

          {/* ── Los datos ─────────────────────────────────────────────── */}
          <div className="min-w-0 space-y-4">
            {q.isLoading && <SkeletonCards count={2} />}

            <Bloque titulo={t("rostros.detalle.registro", "Registro")}>
              <Dato
                etiqueta={t("rostros.detalle.registradaEl", "Registrada")}
                valor={r.registradoEn ? fechaYHora(r.registradoEn) : null}
              />
              <Dato
                etiqueta={t("rostros.detalle.horaDelTelefono", "Hora del teléfono")}
                valor={r.captura?.capturadoEn ? fechaYHora(r.captura.capturadoEn) : null}
              />
              {r.estado !== "pendiente" && (
                <Dato
                  etiqueta={t("rostros.detalle.revisadaEl", "Revisada")}
                  valor={
                    r.revisadoEn
                      ? [fechaYHora(r.revisadoEn), r.revisadoPor].filter(Boolean).join(" · ")
                      : null
                  }
                />
              )}
              {r.estado === "rechazado" && (
                <Dato etiqueta={t("rostros.detalle.motivo", "Motivo del rechazo")} valor={r.motivoRechazo || null} />
              )}
            </Bloque>

            <Bloque titulo={t("rostros.detalle.rafaga", "La ráfaga")}>
              <Dato
                etiqueta={t("rostros.detalle.fotosUtiles", "Fotos útiles")}
                valor={
                  r.rafaga?.total != null
                    ? `${r.rafaga.usables ?? 0} / ${r.rafaga.total}`
                    : r.calidad
                      ? `${r.calidad.usables} / ${r.calidad.cuadros}`
                      : null
                }
              />
              <Dato
                ayuda={t(
                  "rostros.detalle.coherenciaAyuda",
                  "Cuánto se parecen las fotos entre sí. Por debajo de ~80 % conviene mirar bien que sea siempre la misma persona.",
                )}
                etiqueta={t("rostros.detalle.coherencia", "Coherencia")}
                valor={pct(r.rafaga?.coherencia ?? r.calidad?.coherencia)}
              />
              <Dato
                etiqueta={t("rostros.detalle.rangoDeGiro", "Giro de la cabeza")}
                valor={
                  r.rafaga?.giroMin != null && r.rafaga?.giroMax != null
                    ? `${num(r.rafaga.giroMin)} … ${num(r.rafaga.giroMax)}`
                    : null
                }
              />
              <Dato
                etiqueta={t("rostros.detalle.otraPersona", "Descartadas por ser otra cara")}
                valor={r.rafaga?.descartadosPorPersona != null ? String(r.rafaga.descartadosPorPersona) : null}
              />
              <Dato
                etiqueta={t("rostros.detalle.eligioElTelefono", "Fotos elegidas en el teléfono")}
                valor={
                  r.rafaga?.seleccionLocal == null
                    ? null
                    : r.rafaga.seleccionLocal
                      ? t("rostros.detalle.si", "Sí")
                      : t("rostros.detalle.no", "No")
                }
              />
            </Bloque>

            <Bloque titulo={t("rostros.detalle.captura", "Desde dónde")}>
              <Dato
                etiqueta={t("rostros.detalle.app", "App")}
                valor={
                  [
                    r.captura?.app,
                    r.captura?.plataforma,
                    r.captura?.version &&
                      `v${r.captura.version}${r.captura.build ? ` (${r.captura.build})` : ""}`,
                  ]
                    .filter(Boolean)
                    .join(" · ") || null
                }
              />
              <Dato
                etiqueta={t("rostros.detalle.dispositivo", "Dispositivo")}
                valor={[r.captura?.dispositivo, r.captura?.sistema].filter(Boolean).join(" · ") || null}
              />
              <Dato etiqueta={t("rostros.detalle.ip", "IP")} valor={r.captura?.ip || null} />
              <Dato
                etiqueta={t("rostros.detalle.ubicacion", "Ubicación")}
                valor={
                  r.captura?.ubicacion ? (
                    <a
                      className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
                      href={`https://www.google.com/maps?q=${r.captura.ubicacion.lat},${r.captura.ubicacion.lng}`}
                      rel="noreferrer"
                      style={{ color: "var(--brand-text)" }}
                      target="_blank"
                    >
                      {r.captura.ubicacion.lat.toFixed(5)}, {r.captura.ubicacion.lng.toFixed(5)}
                      {r.captura.ubicacion.precision != null &&
                        ` (±${Math.round(r.captura.ubicacion.precision)} m)`}
                      <ExternalLink size={11} />
                    </a>
                  ) : null
                }
              />
              <Dato etiqueta={t("rostros.detalle.agente", "Navegador / cliente")} valor={r.captura?.agente || null} />
              {!r.captura && !q.isLoading && (
                <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
                  {t(
                    "rostros.detalle.sinCaptura",
                    "Este registro es anterior a estos datos: no se guardó desde dónde se hizo.",
                  )}
                </p>
              )}
            </Bloque>
          </div>
        </div>
      )}
    </Modal>
  );
}

type T = ReturnType<typeof useTranslation>["t"];

function etiquetaDePostura(t: T, f: FotoDelRegistro): string {
  const base =
    f.postura === "izquierda"
      ? t("rostros.detalle.giroIzquierda", "Giro ←")
      : f.postura === "derecha"
        ? t("rostros.detalle.giroDerecha", "Giro →")
        : t("rostros.detalle.deFrente", "De frente");

  return f.referencia
    ? `${base} · ${t("rostros.detalle.referencia", "Foto de referencia")}`
    : base;
}

const num = (v: number | null | undefined, decimales = 2): string | null =>
  v == null || !Number.isFinite(v) ? null : v.toFixed(decimales);

const pct = (v: number | null | undefined): string | null =>
  v == null || !Number.isFinite(v) ? null : `${Math.round(v * 100)} %`;

function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="glass-flat rounded-xl p-3">
      <p className="cg-eyebrow mb-2">{titulo}</p>
      <dl className="space-y-1.5 text-xs">{children}</dl>
    </div>
  );
}

/** Una fila «etiqueta: valor». Sin valor no se pinta: nada de «—» inventados. */
function Dato({
  etiqueta,
  valor,
  ayuda,
}: {
  etiqueta: string;
  valor: ReactNode;
  ayuda?: string;
}) {
  if (valor == null || valor === "") return null;

  return (
    <div className="flex items-start justify-between gap-3">
      <dt style={{ color: "var(--ink-soft)" }} title={ayuda}>
        {etiqueta}
      </dt>
      <dd className="min-w-0 break-words text-right font-medium tabular-nums" style={{ color: "var(--ink)" }}>
        {valor}
      </dd>
    </div>
  );
}
