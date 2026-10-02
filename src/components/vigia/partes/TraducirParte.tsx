import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEntitlement } from "@/hooks/useEntitlement";
import { useAgente } from "@/lib/agenteDeMarca";
import {
  vigiaProService,
  IDIOMAS_DE_PARTE,
  idiomaDelServidor,
  type TextoDeParte,
} from "@/lib/api/vigiaProService";

/**
 * «Traducir este parte» (VigIA Pro). La traducción se guarda en el servidor por
 * idioma: la segunda vez sale al instante y no cuesta nada. Sin el módulo no
 * se pinta nada — el botón de una función que no se tiene sólo estorba.
 */
export default function TraducirParte({ incidentId }: { incidentId?: string | null }) {
  const { t, i18n } = useTranslation();
  const agente = useAgente();
  const tiene = useEntitlement("vigia_pro");
  const [idioma, setIdioma] = useState(() => idiomaDelServidor(i18n.language));
  const [r, setR] = useState<(TextoDeParte & { idioma: string }) | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!tiene || !incidentId) return null;

  const traducir = async () => {
    setCargando(true);
    setError(null);
    try {
      setR(await vigiaProService.traducir(incidentId, idioma));
    } catch (e: any) {
      setError(e?.data?.message || e?.message || t("vigiaPro.partes.error"));
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="cg-card overflow-hidden p-0">
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-4 py-2.5 text-sm font-semibold">
        <Languages className="h-4 w-4" />
        <span className="mr-auto">{t("vigiaPro.partes.traducirTitulo")}</span>
        <Select value={idioma} onValueChange={setIdioma}>
          <SelectTrigger className="h-8 w-40">
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
        <Button disabled={cargando} size="sm" type="button" variant="outline" onClick={traducir}>
          {cargando ? t("vigiaPro.partes.traduciendo") : t("vigiaPro.partes.traducir")}
        </Button>
      </div>
      {(r || error) && (
        <div className="space-y-2 p-4 text-sm">
          {error ? (
            <p style={{ color: "var(--bad)" }}>{error}</p>
          ) : r ? (
            <>
              {r.titulo && <p className="font-semibold">{r.titulo}</p>}
              <p className="whitespace-pre-wrap">{r.descripcion}</p>
              {r.acciones && (
                <p className="whitespace-pre-wrap" style={{ color: "var(--ink-soft)" }}>
                  <strong>{t("dispatcher.action_taken")}:</strong> {r.acciones}
                </p>
              )}
              <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
                {t("vigiaPro.partes.traducidoPor", { agente: agente.nombre })}
              </p>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
