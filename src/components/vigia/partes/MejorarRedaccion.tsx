import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Sparkles, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Modal, InfoNote } from "@/components/kit";
import { useEntitlement } from "@/hooks/useEntitlement";
import { useAgente } from "@/lib/agenteDeMarca";
import { vigiaProService, type ParteMejorado, type TextoDeParte } from "@/lib/api/vigiaProService";

/**
 * «Mejorar redacción» (VigIA Pro): corrige ortografía y redacción SIN tocar los
 * hechos. Nunca reemplaza solo: enseña el antes y el después, y si algo con
 * número (una hora, una placa) no llegó al texto nuevo, lo dice en rojo antes
 * de que nadie lo acepte.
 */
export default function MejorarRedaccion({
  obtener,
  aplicar,
  className,
}: {
  obtener: () => TextoDeParte;
  aplicar: (nuevo: TextoDeParte) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const agente = useAgente();
  const tiene = useEntitlement("vigia_pro");
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [original, setOriginal] = useState<TextoDeParte | null>(null);
  const [r, setR] = useState<ParteMejorado | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!tiene) return null;

  const pedir = async () => {
    const o = obtener();

    if (!o.descripcion.trim()) {
      toast.info(t("vigiaPro.partes.escribePrimero"));

      return;
    }
    setOriginal(o);
    setR(null);
    setError(null);
    setAbierto(true);
    setCargando(true);
    try {
      setR(await vigiaProService.redactar(o));
    } catch (e: any) {
      setError(e?.data?.message || e?.message || t("vigiaPro.partes.error"));
    } finally {
      setCargando(false);
    }
  };

  return (
    <>
      <Button className={className} disabled={cargando} size="sm" type="button" variant="outline" onClick={pedir}>
        <Sparkles className="mr-1.5 h-4 w-4" />
        {t("vigiaPro.partes.mejorar")}
      </Button>
      <Modal
        description={t("vigiaPro.partes.mejorarDesc", { agente: agente.nombre })}
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setAbierto(false)}>
              {t("vigiaPro.partes.quedarme")}
            </Button>
            <Button
              disabled={!r}
              type="button"
              variant="brand"
              onClick={() => {
                if (r) aplicar({ titulo: r.titulo, descripcion: r.descripcion, acciones: r.acciones });
                setAbierto(false);
              }}
            >
              {t("vigiaPro.partes.usar")}
            </Button>
          </div>
        }
        icon={<Sparkles />}
        open={abierto}
        size="lg"
        title={t("vigiaPro.partes.mejorar")}
        onOpenChange={setAbierto}
      >
        {cargando ? (
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            {t("vigiaPro.partes.redactando", { agente: agente.nombre })}
          </p>
        ) : error ? (
          <p className="text-sm" style={{ color: "var(--bad)" }}>{error}</p>
        ) : r && original ? (
          <div className="space-y-3 text-sm">
            {r.faltan.length > 0 && (
              <InfoNote icon={<AlertTriangle />} title={t("vigiaPro.partes.faltanTitulo")} tone="bad">
                {t("vigiaPro.partes.faltanDesc", { lista: r.faltan.join(", ") })}
              </InfoNote>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              <div className="glass-flat rounded-xl p-3">
                <p className="mb-1 text-xs font-semibold uppercase" style={{ color: "var(--ink-faint)" }}>
                  {t("vigiaPro.partes.antes")}
                </p>
                {original.titulo && <p className="font-semibold">{original.titulo}</p>}
                <p className="whitespace-pre-wrap">{original.descripcion}</p>
                {original.acciones && <p className="mt-2 whitespace-pre-wrap" style={{ color: "var(--ink-soft)" }}>{original.acciones}</p>}
              </div>
              <div className="glass-flat rounded-xl p-3">
                <p className="mb-1 text-xs font-semibold uppercase" style={{ color: "var(--brand-text)" }}>
                  {t("vigiaPro.partes.despues")}
                </p>
                {r.titulo && <p className="font-semibold">{r.titulo}</p>}
                <p className="whitespace-pre-wrap">{r.descripcion}</p>
                {r.acciones && <p className="mt-2 whitespace-pre-wrap" style={{ color: "var(--ink-soft)" }}>{r.acciones}</p>}
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
