/**
 * RESERVA — the backup bench: who is in it, when they can work extra
 * (weekday × D/T/N), and how many suplentes each post has.
 *
 * «Salud de la banca»: a post with fewer suplentes than the threshold (2) is
 * one absence away from a night of phone calls. It is flagged, and one click
 * opens a campaign already aimed at the guards who could fill it.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  HeartPulse,
  Megaphone,
  ShieldAlert,
  Users,
} from "lucide-react";

import {
  NivelBadge,
  SLOTS,
  nombreDePuesto,
  useEtiquetasDobletes,
} from "./comun";

import MeterBar from "@/components/charts/MeterBar";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  InfoNote,
  ListRow,
  Avatar,
  SearchInput,
  Section,
  SkeletonCards,
  StatCard,
  StatusBadge,
} from "@/components/kit";
import dobletesService, {
  type Bench,
  type ReserveMember,
} from "@/lib/api/dobletesService";
import { soloFecha } from "@/lib/horaDeLaEmpresa";

export default function TabReserva({
  onCampanaSugerida,
}: {
  /** Opens the campaign editor aimed at the posts short of suplentes. */
  onCampanaSugerida: (stationIds: string[]) => void;
}) {
  const { t } = useTranslation();
  const banca = useQuery({
    queryKey: ["dobletes", "bench"],
    queryFn: () => dobletesService.bench(),
  });

  if (banca.isLoading) return <SkeletonCards count={3} />;
  if (!banca.data)
    return (
      <EmptyState
        description={t(
          "dobletes.reserva.errorCargaDesc",
          "Revisa tu conexión y vuelve a intentarlo.",
        )}
        icon={<Users />}
        title={t("dobletes.reserva.errorCarga", "No se pudo cargar la reserva")}
      />
    );

  return (
    <div className="space-y-4">
      <Salud banca={banca.data} onCampanaSugerida={onCampanaSugerida} />
      <Disponibilidad banca={banca.data} />
      <Miembros miembros={banca.data.members} />
    </div>
  );
}

function Salud({
  banca,
  onCampanaSugerida,
}: {
  banca: Bench;
  onCampanaSugerida: (stationIds: string[]) => void;
}) {
  const { t } = useTranslation();
  const umbral = banca.healthThreshold || 2;
  const puestos = useMemo(
    () => [...banca.stations].sort((a, b) => a.suplentes - b.suplentes),
    [banca.stations],
  );
  const debiles = puestos.filter((p) => p.suplentes < umbral);
  const activos = banca.members.filter((m) => m.active).length;
  const max = Math.max(umbral * 2, ...puestos.map((p) => p.suplentes), 1);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={<Users />}
          label={t("dobletes.reserva.enLaReserva", "En la reserva")}
          value={activos}
        />
        <StatCard
          accent={debiles.length ? "bad" : "ok"}
          hint={t("dobletes.reserva.menosDe", {
            defaultValue: "menos de {{n}}",
            n: umbral,
          })}
          icon={<ShieldAlert />}
          label={t(
            "dobletes.reserva.puestosDebiles",
            "Puestos con pocos suplentes",
          )}
          value={debiles.length}
        />
        <StatCard
          icon={<HeartPulse />}
          label={t("dobletes.reserva.puestosCubiertos", "Puestos con banca")}
          value={`${puestos.length - debiles.length}/${puestos.length}`}
        />
        <StatCard
          icon={<Megaphone />}
          label={t("dobletes.reserva.fuera", "Vigilantes fuera de la reserva")}
          value={banca.guardsNotInReserve ?? "—"}
        />
      </div>

      <Section
        action={
          debiles.length > 0 ? (
            <Button
              size="sm"
              variant="brand"
              onClick={() => onCampanaSugerida(debiles.map((d) => d.stationId))}
            >
              <Megaphone className="mr-1.5 size-4" />
              {t("dobletes.reserva.lanzarCampana", "Lanzar campaña sugerida")}
            </Button>
          ) : undefined
        }
        icon={<HeartPulse />}
        title={t("dobletes.reserva.salud", "Salud de la banca")}
      >
        {debiles.length > 0 ? (
          <InfoNote className="mb-4" tone="bad">
            {t("dobletes.reserva.alerta", {
              defaultValue:
                "{{n}} puesto(s) tienen menos de {{umbral}} suplentes. Si falta alguien ahí, la búsqueda se queda corta. La campaña sugerida invita a quienes pueden cubrirlos.",
              n: debiles.length,
              umbral,
            })}
          </InfoNote>
        ) : (
          <InfoNote className="mb-4" tone="ok">
            {t("dobletes.reserva.sana", {
              defaultValue:
                "Todos los puestos tienen al menos {{umbral}} suplentes.",
              umbral,
            })}
          </InfoNote>
        )}
        {!puestos.length ? (
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            {t(
              "dobletes.reserva.sinPuestos",
              "Todavía no hay puestos configurados.",
            )}
          </p>
        ) : (
          <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {puestos.map((p) => {
              const debil = p.suplentes < umbral;

              return (
                <li key={p.stationId}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                    <span className="truncate font-medium">
                      {nombreDePuesto(p)}
                    </span>
                    <span
                      className="shrink-0 text-xs font-semibold tabular-nums"
                      style={{
                        color: debil ? "var(--bad-text)" : "var(--ink-soft)",
                      }}
                    >
                      {t("dobletes.reserva.suplentes", {
                        defaultValue: "{{n}} suplente(s)",
                        n: p.suplentes,
                      })}
                    </span>
                  </div>
                  <MeterBar
                    ariaLabel={nombreDePuesto(p)}
                    pct={(p.suplentes / max) * 100}
                    tone={
                      debil ? "bad" : p.suplentes < umbral * 2 ? "warn" : "ok"
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </>
  );
}

function Disponibilidad({ banca }: { banca: Bench }) {
  const { t } = useTranslation();
  const et = useEtiquetasDobletes();
  const cuenta = (d: number, s: string) =>
    banca.grid.find((g) => g.weekday === d && g.slot === s)?.count ?? 0;
  const max = Math.max(1, ...banca.grid.map((g) => g.count));
  // Monday first, as a work week reads.
  const orden = [1, 2, 3, 4, 5, 6, 0];

  return (
    <Section
      icon={<CalendarDays />}
      title={t(
        "dobletes.reserva.disponibilidad",
        "Disponibilidad de la reserva",
      )}
    >
      <p className="mb-3 text-sm" style={{ color: "var(--ink-soft)" }}>
        {t(
          "dobletes.reserva.disponibilidadDesc",
          "Cuántas personas de la reserva se marcaron disponibles para trabajar extra en cada día y franja.",
        )}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] border-separate border-spacing-1 text-center text-sm">
          <thead>
            <tr>
              <th className="w-20" />
              {orden.map((d) => (
                <th
                  key={d}
                  className="cg-eyebrow pb-1 font-semibold capitalize"
                >
                  {et.dias[d]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SLOTS.map((s) => (
              <tr key={s}>
                <th className="cg-eyebrow pr-2 text-left font-semibold">
                  {et.franja[s]}
                </th>
                {orden.map((d) => {
                  const n = cuenta(d, s);
                  const peso = n / max;

                  return (
                    <td
                      key={d}
                      className="rounded-lg py-2 font-semibold tabular-nums"
                      style={{
                        background:
                          n === 0
                            ? "color-mix(in oklab, var(--bad) 12%, transparent)"
                            : `color-mix(in oklab, var(--brand) ${Math.round(12 + peso * 50)}%, transparent)`,
                        color: n === 0 ? "var(--bad-text)" : "var(--ink)",
                      }}
                      title={`${et.dias[d]} · ${et.franja[s]}: ${n}`}
                    >
                      {n}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function Miembros({ miembros }: { miembros: ReserveMember[] }) {
  const { t } = useTranslation();
  const et = useEtiquetasDobletes();
  const [q, setQ] = useState("");
  const filas = useMemo(() => {
    const n = q.trim().toLowerCase();

    return [...miembros]
      .filter((m) => !n || (m.name || "").toLowerCase().includes(n))
      .sort(
        (a, b) =>
          Number(b.active) - Number(a.active) ||
          b.coveredThisMonth - a.coveredThisMonth,
      );
  }, [miembros, q]);

  const resumen = (m: ReserveMember) => {
    const dias = m.weekly
      .filter((w) => w.slots.length)
      .sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7))
      .map((w) => `${et.dias[w.weekday]} ${w.slots.join("")}`);

    return dias.length
      ? dias.join(" · ")
      : t("dobletes.reserva.sinDisponibilidad", "Sin disponibilidad marcada");
  };

  return (
    <Section
      action={
        <SearchInput
          className="w-56"
          placeholder={t("dobletes.reserva.buscar", "Buscar por nombre")}
          value={q}
          onChange={setQ}
        />
      }
      icon={<Users />}
      title={t("dobletes.reserva.miembros", {
        defaultValue: "Miembros ({{n}})",
        n: miembros.length,
      })}
    >
      {!filas.length ? (
        <EmptyState
          description={t(
            "dobletes.reserva.vacioDesc",
            "Los vigilantes se unen desde su app. Una campaña es la forma más rápida de llenar la banca.",
          )}
          icon={<Users />}
          title={t("dobletes.reserva.vacio", "Nadie en la reserva todavía")}
          variant="inline"
        />
      ) : (
        <div className="space-y-1.5">
          {filas.map((m) => (
            <ListRow
              key={m.userId}
              avatar={<Avatar name={m.name || "?"} size="sm" />}
              badges={
                <>
                  <NivelBadge nivel={m.level} />
                  {!m.active && (
                    <StatusBadge dot={false} tone="neutral">
                      {t("dobletes.reserva.enPausa", "En pausa")}
                    </StatusBadge>
                  )}
                </>
              }
              meta={
                <span
                  className="text-xs tabular-nums"
                  style={{ color: "var(--ink-soft)" }}
                >
                  {t("dobletes.reserva.cubiertosMes", {
                    defaultValue: "{{n}} este mes",
                    n: m.coveredThisMonth,
                  })}
                </span>
              }
              subtitle={
                <>
                  {resumen(m)}
                  {m.availabilityUpdatedAt
                    ? ` · ${t("dobletes.reserva.actualizada", {
                        defaultValue: "actualizada el {{fecha}}",
                        fecha: soloFecha(m.availabilityUpdatedAt),
                      })}`
                    : ""}
                </>
              }
              title={m.name || t("comun.vigilante", "Vigilante")}
            />
          ))}
        </div>
      )}
    </Section>
  );
}
