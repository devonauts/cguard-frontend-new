import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2, UserCheck, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Modal, SearchInput, StatusBadge, InfoNote } from "@/components/kit";
import { ApiService } from "@/services/api/apiService";
import gapService, { type Gap, type GapCandidate } from "@/lib/api/gapService";
import { soloFechaCivil, soloHora } from "@/lib/horaDeLaEmpresa";
import {
  leerRespuestaDeError,
  peticionParaCubrir,
  type Confirmaciones,
  type Peticion,
} from "@/lib/cubrirHueco";

const tenant = () => localStorage.getItem("tenantId") || "";

async function enviar(p: Peticion): Promise<any> {
  return p.method === "PATCH"
    ? ApiService.patch(p.path, p.body)
    : ApiService.post(p.path, p.body);
}

/**
 * «Cubrir» one gap: the ranked people (availability, rest rule, hours this
 * week, who knows the post) and the write through the path that owns that
 * kind of hole (`lib/cubrirHueco`). A «está en su descanso» / «ya tiene turno»
 * answer becomes a question, then a retry with the flag.
 */
export default function CubrirHuecoModal({
  gap,
  titulo,
  onClose,
  onDone,
}: {
  gap: Gap;
  titulo: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [lista, setLista] = useState<GapCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [elegido, setElegido] = useState<GapCandidate | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [pregunta, setPregunta] = useState<{
    flag: keyof Confirmaciones;
    texto: string;
  } | null>(null);
  const [ok, setOk] = useState<Confirmaciones>({});

  useEffect(() => {
    let vivo = true;

    gapService
      .candidates(gap)
      .then((r) => vivo && setLista(r))
      .catch(
        (e: any) => vivo && setError(e?.data?.message || e?.message || "Error"),
      );

    return () => {
      vivo = false;
    };
  }, [gap]);

  const filtrados = useMemo(
    () =>
      (lista || []).filter(
        (c) =>
          !busca ||
          (c.fullName || "").toLowerCase().includes(busca.toLowerCase()),
      ),
    [lista, busca],
  );

  const cubrir = async (confirmaciones: Confirmaciones) => {
    if (!elegido) return;
    setEnviando(true);
    try {
      /* One call per cover. A falta not reported yet is reported and covered
         in the same transaction (coverage/report-and-cover): a refusal writes
         nothing, so the confirmed retry is the same call with the flag. */
      await enviar(
        peticionParaCubrir(tenant(), gap, elegido.guardId, confirmaciones),
      );
      toast.success(
        t("ui.SinCubrir.cubierto", {
          defaultValue: "{{nombre}} cubre este hueco.",
          nombre: elegido.fullName || "",
        }),
      );
      onDone();
    } catch (e) {
      const r = leerRespuestaDeError(e);

      if (r.tipo === "confirmar") {
        setPregunta({
          flag: r.flag,
          texto:
            r.flag === "allowRestDay"
              ? t(
                  "ui.SinCubrir.confirmarDescanso",
                  "Ese día le toca descansar. ¿Lo pones igual?",
                )
              : t(
                  "ui.SinCubrir.confirmarDoble",
                  "Ya tiene un turno que se cruza. ¿Lo pones igual (doblar turno)?",
                ),
        });
      } else {
        toast.error(
          r.mensaje || t("ui.SinCubrir.noSePudoCubrir", "No se pudo cubrir"),
        );
      }
    } finally {
      setEnviando(false);
    }
  };

  const chip = (texto: string, tono: string) => (
    <StatusBadge dot={false} tone={tono}>
      {texto}
    </StatusBadge>
  );

  return (
    <Modal
      open
      description={`${soloFechaCivil(gap.date, { weekday: "short", day: "numeric", month: "short" })} · ${soloHora(gap.startTime)}–${soloHora(gap.endTime)}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel", "Cancelar")}
          </Button>
          {pregunta ? (
            <Button
              disabled={enviando}
              variant="brand"
              onClick={() => {
                const nuevo = { ...ok, [pregunta.flag]: true };

                setOk(nuevo);
                setPregunta(null);
                void cubrir(nuevo);
              }}
            >
              {enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("ui.SinCubrir.siPonerlo", "Sí, ponerlo")}
            </Button>
          ) : (
            <Button
              disabled={!elegido || enviando || elegido.blocked}
              variant="brand"
              onClick={() => cubrir(ok)}
            >
              {enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("ui.SinCubrir.cubrir", "Cubrir")}
            </Button>
          )}
        </>
      }
      icon={<UserCheck />}
      size="lg"
      title={titulo}
      onOpenChange={(o) => !o && onClose()}
    >
      <div className="space-y-3">
        {gap.guardName &&
          gap.kind !== "open_shift" &&
          gap.kind !== "empty_slot" && (
            <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
              {t("ui.SinCubrir.enLugarDe", {
                defaultValue: "En lugar de {{nombre}}",
                nombre: gap.guardName,
              })}
            </p>
          )}
        {pregunta && (
          <InfoNote icon={<AlertTriangle />} tone="warn">
            {pregunta.texto}
          </InfoNote>
        )}
        <SearchInput
          placeholder={t("comun.buscarVigilante", "Buscar vigilante")}
          value={busca}
          onChange={setBusca}
        />
        <div className="glass-sunken max-h-80 overflow-y-auto p-1">
          {error ? (
            <p className="p-4 text-sm" style={{ color: "var(--bad-text)" }}>
              {error}
            </p>
          ) : lista === null ? (
            <div className="flex justify-center p-6">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : !filtrados.length ? (
            <p
              className="p-4 text-center text-sm"
              style={{ color: "var(--ink-soft)" }}
            >
              {t(
                "ui.SinCubrir.nadieLibre",
                "No hay nadie libre en ese horario.",
              )}
            </p>
          ) : (
            filtrados.map((c) => {
              const activo = elegido?.guardId === c.guardId;

              return (
                <button
                  key={c.guardId}
                  aria-pressed={activo}
                  className="cg-focus flex w-full flex-col gap-1 rounded-xl p-3 text-left transition-colors hover:bg-[var(--glass-raised)]"
                  style={
                    activo
                      ? {
                          background: "var(--brand-wash)",
                          boxShadow: "inset 0 0 0 1px var(--brand-line)",
                        }
                      : undefined
                  }
                  type="button"
                  onClick={() => {
                    setElegido(c);
                    setPregunta(null);
                    setOk({});
                  }}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">
                      {c.fullName || "—"}
                    </span>
                    <span
                      className="text-xs"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {c.reason}
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    {c.availability === "available" &&
                      chip(
                        t("ui.SinCubrir.disponible", "Dijo que puede"),
                        "ok",
                      )}
                    {c.availability === "unavailable" &&
                      chip(
                        t("ui.SinCubrir.noDisponible", "Dijo que no puede"),
                        "warn",
                      )}
                    {chip(
                      t("ui.SinCubrir.horasSemana", {
                        defaultValue: "{{h}} h esta semana",
                        h: c.hoursThisWeek,
                      }),
                      c.weeklyCapExceeded ? "bad" : "neutral",
                    )}
                    {c.shiftsHere > 0 &&
                      chip(
                        t("ui.SinCubrir.conoceElPuesto", {
                          defaultValue: "{{n}} turnos aquí",
                          n: c.shiftsHere,
                        }),
                        "info",
                      )}
                    {c.restViolation &&
                      chip(
                        t("ui.SinCubrir.descansoCorto", {
                          defaultValue: "Solo {{h}} h de descanso",
                          h: c.restHours ?? 0,
                        }),
                        "bad",
                      )}
                    {c.warning && chip(c.warning, c.blocked ? "bad" : "warn")}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
}
