import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileUp, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  hojaDeVidaService, aCamposDelFormulario, type CamposFormulario,
} from "@/lib/api/hojaDeVidaService";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * IMPORTAR HOJA DE VIDA.
 *
 * Sube el CV del candidato y rellena el formulario de alta con lo que se pudo
 * leer. Lo que hace por dentro no es asunto de quien lo pulsa: el CV puede ser
 * un PDF, un escaneo o una foto, y el camino que sigue cada uno lo decide el
 * servidor.
 *
 * ── ESTO NO GUARDA NADA ────────────────────────────────────────────────────
 * Rellena campos, y ya. Quien pulsa sigue viendo el formulario entero, corrige
 * lo que haga falta y guarda cuando quiere. Se hizo así a propósito: un CV mal
 * leído que diera de alta personal solo sería mucho peor que teclear.
 * ════════════════════════════════════════════════════════════════════════════
 */
export function ImportarHojaDeVida({
  onDatos,
  onArchivo,
  className,
}: {
  /** Los campos ya traducidos a lo que el formulario acepta. */
  onDatos: (campos: CamposFormulario) => void;
  /** El archivo, para adjuntarlo al expediente al guardar. */
  onArchivo?: (archivo: File) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [leyendo, setLeyendo] = useState(false);

  const alElegir = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    // El valor se limpia SIEMPRE: sin esto, elegir el mismo archivo dos veces
    // seguidas no dispara `change` y el botón parece muerto.
    e.target.value = "";
    if (!archivo) return;

    setLeyendo(true);
    try {
      const r = await hojaDeVidaService.leer(archivo);
      onDatos(aCamposDelFormulario(r.datos));
      onArchivo?.(archivo);

      const leidos = Object.values(r.datos).filter(
        (v) => v !== null && v !== "" && !(Array.isArray(v) && v.length === 0),
      ).length;

      if (leidos === 0) {
        // Pasa con un escaneo torcido o una foto movida. Se dice qué hacer, no
        // que «falló la extracción».
        toast.warning("No pudimos sacar datos de ese archivo", {
          description: "Revisa que se lea bien, o llena el formulario a mano.",
        });
      } else if (r.faltantes.length) {
        toast.success(`Leímos ${leidos} datos de la hoja de vida`, {
          description: r.faltantes.includes("contacto")
            ? "Falta el correo o el teléfono: sin uno de los dos no se puede invitar."
            : "Revisa lo que quedó vacío antes de guardar.",
        });
      } else {
        toast.success(`Leímos ${leidos} datos de la hoja de vida`, {
          description: t("ui.ImportarHojaDeVida.revisalosAntesDeGuardar", "Revísalos antes de guardar."),
        });
      }
    } catch (err: any) {
      toast.error(err?.message || t("vigia.cvError", "No pudimos leer la hoja de vida."));
    } finally {
      setLeyendo(false);
    }
  };

  return (
    <div className={className}>
      <input
        ref={input}
        type="file"
        // Se aceptan las dos cosas porque llegan las dos: el CV en PDF por
        // correo, y la foto del CV en papel que trae el candidato a la oficina.
        accept=".pdf,image/*"
        className="hidden"
        onChange={alElegir}
      />
      <Button
        type="button"
        variant="outline"
        disabled={leyendo}
        onClick={() => input.current?.click()}
        className="gap-2"
      >
        {leyendo ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
        {leyendo ? "Leyendo la hoja de vida…" : "Importar hoja de vida"}
        {!leyendo && <Sparkles className="size-3.5 opacity-60" />}
      </Button>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {leyendo
          // Un escaneo tarda de verdad. Decir cuánto evita que se pulse otra vez.
          ? "Puede tardar hasta un minuto si es un escaneo."
          : "PDF o foto. Rellena el formulario; nada se guarda hasta que tú lo guardes."}
      </p>
    </div>
  );
}

export default ImportarHojaDeVida;
