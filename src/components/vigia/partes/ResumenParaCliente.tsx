import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { FileText, Copy, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Modal, Segmented, InfoNote } from "@/components/kit";
import { useEntitlement } from "@/hooks/useEntitlement";
import { useAgente } from "@/lib/agenteDeMarca";
import { soloFechaCivil } from "@/lib/horaDeLaEmpresa";
import {
  vigiaProService,
  IDIOMAS_DE_PARTE,
  idiomaDelServidor,
  type ResumenParaCliente as Resumen,
} from "@/lib/api/vigiaProService";

/**
 * «Resumen para el cliente» (VigIA Pro). El asistente redacta; una persona lo
 * lee, lo corrige si quiere y decide si se envía. Las cifras las cuenta el
 * servidor, no el modelo, y se enseñan aparte para poder comprobarlas.
 */
export default function ResumenParaCliente({ clientId }: { clientId?: string | null }) {
  const { t, i18n } = useTranslation();
  const agente = useAgente();
  const tiene = useEntitlement("vigia_pro");
  const [abierto, setAbierto] = useState(false);
  const [dias, setDias] = useState<"7" | "30" | "90">("7");
  const [idioma, setIdioma] = useState(() => idiomaDelServidor(i18n.language));
  const [r, setR] = useState<Resumen | null>(null);
  const [texto, setTexto] = useState("");
  const [cargando, setCargando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  if (!tiene || !clientId) return null;

  const generar = async () => {
    setCargando(true);
    try {
      const res = await vigiaProService.resumen(clientId, { dias: Number(dias), idioma });

      setR(res);
      setTexto(res.texto);
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || t("vigiaPro.partes.error"));
    } finally {
      setCargando(false);
    }
  };

  const enviar = async () => {
    if (!r) return;
    setEnviando(true);
    try {
      const res = await vigiaProService.enviarResumen(clientId, { texto, desde: r.desde, hasta: r.hasta, idioma: r.idioma });

      toast.success(t("vigiaPro.resumenCliente.enviado", { correo: res.a }));
      setAbierto(false);
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || t("vigiaPro.partes.error"));
    } finally {
      setEnviando(false);
    }
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success(t("vigiaPro.resumenCliente.copiado"));
    } catch {
      toast.error(t("vigiaPro.partes.error"));
    }
  };

  const c = r?.conteos;

  return (
    <>
      <Button size="sm" type="button" variant="outline" onClick={() => setAbierto(true)}>
        <FileText className="mr-1.5 h-4 w-4" />
        {t("vigiaPro.resumenCliente.boton")}
      </Button>
      <Modal
        description={t("vigiaPro.resumenCliente.desc", { agente: agente.nombre })}
        footer={
          r ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Button disabled={!texto.trim()} type="button" variant="outline" onClick={copiar}>
                <Copy className="mr-1.5 h-4 w-4" />
                {t("vigiaPro.resumenCliente.copiar")}
              </Button>
              <Button disabled={!texto.trim() || enviando} type="button" variant="brand" onClick={enviar}>
                <Send className="mr-1.5 h-4 w-4" />
                {enviando ? t("vigiaPro.resumenCliente.enviando") : t("vigiaPro.resumenCliente.enviar")}
              </Button>
            </div>
          ) : undefined
        }
        icon={<FileText />}
        open={abierto}
        size="lg"
        title={t("vigiaPro.resumenCliente.boton")}
        onOpenChange={setAbierto}
      >
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              options={[
                { value: "7", label: t("vigiaPro.resumenCliente.dias", { n: 7 }) },
                { value: "30", label: t("vigiaPro.resumenCliente.dias", { n: 30 }) },
                { value: "90", label: t("vigiaPro.resumenCliente.dias", { n: 90 }) },
              ]}
              value={dias}
              onChange={(v) => setDias(v)}
            />
            <Select value={idioma} onValueChange={setIdioma}>
              <SelectTrigger className="h-9 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IDIOMAS_DE_PARTE.map((l) => (
                  <SelectItem key={l} value={l}>
                    {t(`vigiaPro.idiomas.${l}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button disabled={cargando} type="button" variant="outline" onClick={generar}>
              {cargando ? t("vigiaPro.resumenCliente.generando", { agente: agente.nombre }) : t("vigiaPro.resumenCliente.generar")}
            </Button>
          </div>

          {r && c && c.total === 0 && (
            <InfoNote tone="neutral">{t("vigiaPro.resumenCliente.sinNovedades", { desde: soloFechaCivil(r.desde), hasta: soloFechaCivil(r.hasta) })}</InfoNote>
          )}

          {r && c && c.total > 0 && (
            <>
              <p style={{ color: "var(--ink-soft)" }}>
                {t("vigiaPro.resumenCliente.cifras", { total: c.total, desde: soloFechaCivil(r.desde), hasta: soloFechaCivil(r.hasta) })}{" "}
                {Object.entries(c.porPrioridad)
                  .map(([k, n]) => `${t(`vigiaPro.prioridad.${k}`, { defaultValue: k })}: ${n}`)
                  .join(" · ")}
              </p>
              <Textarea rows={14} value={texto} onChange={(e) => setTexto(e.target.value)} />
              <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
                {t("vigiaPro.resumenCliente.revisa")}
              </p>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
