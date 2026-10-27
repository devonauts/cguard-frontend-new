/**
 * «OFRECER DOBLETE» — launch an offer search for one open gap.
 *
 * Used from the Dobletes page (pick the gap here) and from Cobertura en vivo
 * (the gap comes with the button). Two ways to offer:
 *   · by waves (default): the server sends to the best ranked reserve members
 *     available for that slot, 3 first and then 5 more every 15 min;
 *   · by hand: the office ticks the people and only they get it.
 *
 * Hours already worked this week are shown as INFORMATION. The platform puts
 * no hour or rest limit: the company decides. The only hard block is physical
 * (two posts at the same time) and the server enforces it.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarPlus, Check, Clock, Send, Users, Zap } from "lucide-react";

import { MoneyInput, NivelBadge, dinero } from "./comun";

import { Button } from "@/components/ui/button";
import {
  EmptyState,
  InfoNote,
  Modal,
  Segmented,
  SkeletonCards,
  StatusBadge,
} from "@/components/kit";
import { ToggleRow } from "@/pages/admin/Configuration/components/SettingsForm";
import coverageService, {
  REASON_LABEL,
  stationLabel,
} from "@/lib/api/coverageService";
import dobletesService, { type OfferSearch } from "@/lib/api/dobletesService";
import { fechaYHora, soloHora } from "@/lib/horaDeLaEmpresa";

export interface HuecoElegido {
  id: string;
  /** What to show for the gap: «P-031 · Puerta norte». */
  titulo?: string;
  /** «Permiso · 20:00–08:00». */
  detalle?: string;
}

export default function LanzarDoblete({
  open,
  onOpenChange,
  hueco,
  onLanzado,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Preset gap (from Cobertura). Without it the modal lists the open ones. */
  hueco?: HuecoElegido | null;
  onLanzado?: (s: OfferSearch) => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [elegido, setElegido] = useState<HuecoElegido | null>(hueco ?? null);
  const [modo, setModo] = useState<"oleadas" | "mano">("oleadas");
  const [urgente, setUrgente] = useState(false);
  const [bono, setBono] = useState<number | null>(null);
  const [tocado, setTocado] = useState(false);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (open) {
      setElegido(hueco ?? null);
      setModo("oleadas");
      setUrgente(false);
      setTocado(false);
      setMarcados(new Set());
    }
  }, [open, hueco?.id]);

  const ajustes = useQuery({
    queryKey: ["dobletes", "settings"],
    queryFn: () => dobletesService.settings(),
    enabled: open,
    staleTime: 60_000,
  });
  const huecos = useQuery({
    queryKey: ["dobletes", "huecos-abiertos"],
    queryFn: () => coverageService.events({ status: "open" }),
    enabled: open && !hueco,
  });
  const candidatos = useQuery({
    queryKey: ["dobletes", "candidatos", elegido?.id],
    queryFn: () => dobletesService.candidates(elegido!.id),
    enabled: open && !!elegido?.id,
  });

  const s = ajustes.data?.settings;
  const moneda = ajustes.data?.currency || "USD";
  const decimales = ajustes.data?.decimals ?? 2;

  /* The bonus follows the company default (or the «relámpago» one when urgent)
     until the person types their own. */
  useEffect(() => {
    if (!s || tocado) return;
    setBono(
      urgente
        ? (s.urgentBonusCents ?? s.defaultBonusCents)
        : s.defaultBonusCents,
    );
  }, [s, urgente, tocado]);

  const lista = candidatos.data ?? [];
  const oleadas = s?.waveSizes?.length ? s.waveSizes : [3, 5];
  const minutos = s?.waveMinutes ?? 15;

  const abiertos = useMemo(
    () => (huecos.data?.rows ?? []).filter((e) => e.status === "open"),
    [huecos.data],
  );

  const alternar = (id: string) =>
    setMarcados((m) => {
      const n = new Set(m);

      if (n.has(id)) n.delete(id);
      else n.add(id);

      return n;
    });

  const lanzar = async () => {
    if (!elegido) return;
    setEnviando(true);
    try {
      const r = await dobletesService.start({
        eventId: elegido.id,
        bonusCents: bono,
        urgent: urgente,
        pickedUserIds: modo === "mano" ? [...marcados] : undefined,
      });

      toast.success(
        modo === "mano"
          ? t("dobletes.lanzar.enviadaA", {
              defaultValue:
                "Oferta enviada a {{n}} persona(s). El primero que acepte se queda el turno.",
              n: marcados.size,
            })
          : t("dobletes.lanzar.enviadaOleadas", {
              defaultValue:
                "Oferta enviada a la primera oleada ({{n}}). El primero que acepte se queda el turno.",
              n: oleadas[0],
            }),
      );
      void qc.invalidateQueries({ queryKey: ["dobletes"] });
      onLanzado?.(r);
      onOpenChange(false);
    } catch {
      /* the API layer already shows what failed */
    } finally {
      setEnviando(false);
    }
  };

  const listo = !!elegido && (modo === "oleadas" || marcados.size > 0);

  return (
    <Modal
      description={
        elegido
          ? [elegido.titulo, elegido.detalle].filter(Boolean).join(" · ")
          : t(
              "dobletes.lanzar.eligeHueco",
              "Elige el puesto que hay que cubrir.",
            )
      }
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("actions.cancel", "Cancelar")}
          </Button>
          <Button
            disabled={!listo || enviando}
            variant="brand"
            onClick={lanzar}
          >
            <Send className="mr-1.5 size-4" />
            {modo === "mano"
              ? t("dobletes.lanzar.enviarA", {
                  defaultValue: "Ofrecer a {{n}}",
                  n: marcados.size,
                })
              : t("dobletes.lanzar.enviar", "Ofrecer doblete")}
          </Button>
        </>
      }
      icon={<CalendarPlus />}
      open={open}
      size="lg"
      title={t("dobletes.lanzar.titulo", "Ofrecer doblete")}
      onOpenChange={onOpenChange}
    >
      <div className="space-y-4">
        {!hueco && (
          <div>
            <p className="cg-eyebrow mb-1.5">
              {t("dobletes.lanzar.hueco", "Puesto sin cubrir")}
            </p>
            {huecos.isLoading ? (
              <SkeletonCards count={2} />
            ) : !abiertos.length ? (
              <EmptyState
                description={t(
                  "dobletes.lanzar.sinHuecosDesc",
                  "Cuando registres una ausencia en Cobertura en vivo, el puesto aparece aquí para ofrecerlo.",
                )}
                icon={<CalendarPlus />}
                title={t(
                  "dobletes.lanzar.sinHuecos",
                  "No hay puestos sin cubrir",
                )}
              />
            ) : (
              <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                {abiertos.map((ev) => {
                  const titulo = stationLabel(ev.originStation) || "—";
                  const detalle = `${REASON_LABEL[ev.reason] || ev.reason} · ${fechaYHora(ev.windowStart)}–${soloHora(ev.windowEnd)}`;
                  const activo = elegido?.id === ev.id;

                  return (
                    <button
                      key={ev.id}
                      aria-pressed={activo}
                      className="glass-flat glass-hover cg-focus flex w-full items-center gap-3 p-3 text-left"
                      style={
                        activo
                          ? {
                              borderColor: "var(--brand-line)",
                              background: "var(--brand-wash)",
                            }
                          : undefined
                      }
                      type="button"
                      onClick={() => {
                        setElegido({ id: ev.id, titulo, detalle });
                        setMarcados(new Set());
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {titulo}
                        </p>
                        <p
                          className="truncate text-xs"
                          style={{ color: "var(--ink-soft)" }}
                        >
                          {detalle}
                        </p>
                      </div>
                      {activo && (
                        <Check
                          className="size-4"
                          style={{ color: "var(--brand-text)" }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {elegido && (
          <>
            <Segmented<"oleadas" | "mano">
              expandir
              options={[
                {
                  value: "oleadas",
                  label: t(
                    "dobletes.lanzar.modoOleadas",
                    "Por oleadas (automático)",
                  ),
                },
                {
                  value: "mano",
                  label: t("dobletes.lanzar.modoMano", "Elegir a mano"),
                },
              ]}
              value={modo}
              onChange={setModo}
            />
            <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
              {modo === "oleadas"
                ? t("dobletes.lanzar.explicaOleadas", {
                    defaultValue:
                      "Primero la reserva disponible para ese horario, mejor clasificados primero: {{a}} personas, y si nadie acepta en {{min}} min, {{b}} más. Si se acaban, te avisamos.",
                    a: oleadas[0],
                    b: oleadas[1] ?? oleadas[0],
                    min: minutos,
                  })
                : t(
                    "dobletes.lanzar.explicaMano",
                    "Sólo las personas que marques reciben la oferta. El primero que acepta se queda el turno.",
                  )}
            </p>

            <div
              className="glass-flat divide-y px-4"
              style={{ borderColor: "var(--hairline)" }}
            >
              <ToggleRow
                checked={urgente}
                hint={t(
                  "dobletes.lanzar.urgenteHint",
                  "Usa el bono relámpago de la empresa y avisa con prioridad alta.",
                )}
                label={t("dobletes.lanzar.urgente", "Urgente")}
                onCheckedChange={(v) => setUrgente(v)}
              />
              <div className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    {urgente && (
                      <Zap
                        className="size-3.5"
                        style={{ color: "var(--warn-text)" }}
                      />
                    )}
                    {t("dobletes.lanzar.bono", "Bono por este doblete")}
                  </p>
                  <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                    {t(
                      "dobletes.lanzar.bonoHint",
                      "Lo ve quien recibe la oferta. Vacío = sin bono.",
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <MoneyInput
                    cents={bono}
                    className="cg-input w-28 px-3 py-2 text-right text-sm"
                    decimals={decimales}
                    placeholder="0"
                    onCents={(c) => {
                      setTocado(true);
                      setBono(c);
                    }}
                  />
                  <span
                    className="text-xs"
                    style={{ color: "var(--ink-faint)" }}
                  >
                    {moneda}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <p className="cg-eyebrow mb-1.5 flex items-center gap-1.5">
                <Users className="size-3.5" />
                {modo === "mano"
                  ? t("dobletes.lanzar.marcaQuien", "Marca a quién ofrecerlo")
                  : t(
                      "dobletes.lanzar.quienesPrimero",
                      "Quiénes lo reciben primero",
                    )}
              </p>
              {candidatos.isLoading ? (
                <SkeletonCards count={3} />
              ) : !lista.length ? (
                <EmptyState
                  description={t(
                    "dobletes.lanzar.sinCandidatosDesc",
                    "Nadie está libre en ese horario. Puedes lanzar igual: la reserva que se marque disponible después también lo verá.",
                  )}
                  icon={<Users />}
                  title={t(
                    "dobletes.lanzar.sinCandidatos",
                    "Sin personas libres",
                  )}
                />
              ) : (
                <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                  {lista.map((c, i) => {
                    const marcado = marcados.has(c.guardId);
                    const enPrimera =
                      modo === "oleadas" && i < (oleadas[0] ?? 3);

                    return (
                      <button
                        key={c.guardId}
                        aria-pressed={modo === "mano" ? marcado : undefined}
                        className="glass-flat cg-focus flex w-full items-center gap-3 p-3 text-left"
                        disabled={modo !== "mano"}
                        style={
                          marcado || enPrimera
                            ? {
                                borderColor: "var(--brand-line)",
                                background: "var(--brand-wash)",
                              }
                            : undefined
                        }
                        type="button"
                        onClick={() => alternar(c.guardId)}
                      >
                        {modo === "mano" && (
                          <span
                            aria-hidden
                            className="grid size-5 shrink-0 place-items-center rounded-md border"
                            style={{
                              borderColor: marcado
                                ? "var(--brand)"
                                : "var(--hairline)",
                              background: marcado
                                ? "var(--brand)"
                                : "transparent",
                              color: "var(--brand-ink)",
                            }}
                          >
                            {marcado && <Check className="size-3.5" />}
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                            <span className="truncate">
                              {c.fullName || t("comun.vigilante", "Vigilante")}
                            </span>
                            <NivelBadge nivel={c.level} />
                            {c.inReserve && (
                              <StatusBadge dot={false} tone="info">
                                {t(
                                  "dobletes.lanzar.enReserva",
                                  "En la reserva",
                                )}
                              </StatusBadge>
                            )}
                          </p>
                          {c.reason && (
                            <p
                              className="truncate text-xs"
                              style={{ color: "var(--ink-soft)" }}
                            >
                              {c.reason}
                            </p>
                          )}
                        </div>
                        {c.hoursThisWeek != null && (
                          <span
                            className="flex shrink-0 items-center gap-1 text-xs tabular-nums"
                            style={{ color: "var(--ink-soft)" }}
                            title={t(
                              "dobletes.lanzar.horasInfo",
                              "Horas trabajadas esta semana. Sólo informativo: la empresa decide.",
                            )}
                          >
                            <Clock className="size-3.5" />
                            {t("dobletes.lanzar.horasSemana", {
                              defaultValue: "{{h}} h esta semana",
                              h: Math.round(c.hoursThisWeek * 10) / 10,
                            })}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <InfoNote tone="info">
              {t(
                "dobletes.lanzar.sinLimites",
                "La plataforma no pone límites de horas ni de descanso: lo decide tu empresa. Sólo impide estar en dos puestos a la vez.",
              )}
              {bono ? (
                <>
                  {" "}
                  {t("dobletes.lanzar.conBono", {
                    defaultValue: "Bono ofrecido: {{bono}}.",
                    bono: dinero(bono, moneda, decimales),
                  })}
                </>
              ) : null}
            </InfoNote>
          </>
        )}
      </div>
    </Modal>
  );
}
