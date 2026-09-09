/**
 * ════════════════════════════════════════════════════════════════════════════
 * EL MENÚ DE EXPORTAR — UNO SOLO, Y PENSADO PARA EL PULGAR
 *
 * ── QUÉ HABÍA ──────────────────────────────────────────────────────────────
 * Cada pantalla resolvía «exportar» a su manera: un botón «CSV» suelto en
 * Nómina, un `<select>` nativo en Registros, tres botones seguidos en Horas, y
 * en los informes un icono de tres puntos sin rótulo. Además de no parecerse
 * entre sí, ninguna decía qué archivo iba a caer.
 *
 * ── POR QUÉ UNA HOJA INFERIOR EN MÓVIL ─────────────────────────────────────
 * El menú desplegable de Radix es correcto con ratón y malo con un pulgar: se
 * ancla al botón (que está arriba, en la barra de herramientas, o sea en la
 * zona más lejana de la mano), y sus filas miden 32 px cuando el mínimo táctil
 * recomendado son 44. En un teléfono, esto abre en su lugar una hoja pegada al
 * borde inferior, con filas de 56 px, el nombre del formato y —esto es lo que
 * de verdad faltaba— la extensión que va a descargar. En pantalla grande sigue
 * siendo el desplegable de siempre, que ahí sí es lo correcto.
 *
 * Los dos caminos comparten la MISMA lista de acciones: no hay forma de que el
 * móvil ofrezca una exportación que el escritorio no tenga.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { useState, type ReactNode } from "react";
import { Download, FileSpreadsheet, FileText, FileType2, Loader2, Mail, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { ExportFormat } from "@/lib/export/reportExport";

interface Accion {
  key: string;
  label: string;
  /** Lo que va a pasar, en una línea. En móvil se lee; en escritorio, no cabe. */
  hint: string;
  icon: ReactNode;
  run: () => void;
}

export interface ExportMenuProps {
  /** Se llama con el formato elegido. Si devuelve promesa, el botón espera. */
  onExport: (format: ExportFormat) => void | Promise<void>;
  /** Qué formatos ofrecer. Por defecto los tres. */
  formats?: ExportFormat[];
  /** Abrir la vista de impresión (fidelidad total de idioma — ver `lazyPdf`). */
  onPrint?: () => void;
  onEmail?: () => void;
  /** Sin filas que exportar: el botón se deshabilita en vez de bajar un archivo vacío. */
  disabled?: boolean;
  /** Exportación en curso — la manda el llamador si tiene su propio estado. */
  busy?: boolean;
  size?: "sm" | "default";
  /** `false` deja sólo el icono (barras muy apretadas). Por defecto se rotula. */
  showLabel?: boolean;
  label?: string;
  className?: string;
}

const META: Record<ExportFormat, { label: string; hint: string; icon: ReactNode }> = {
  excel: { label: "Excel", hint: "Hoja de cálculo .xlsx", icon: <FileSpreadsheet className="h-4 w-4" /> },
  pdf: { label: "PDF", hint: "Documento .pdf listo para enviar", icon: <FileType2 className="h-4 w-4" /> },
  csv: { label: "CSV", hint: "Texto plano .csv para otros sistemas", icon: <FileText className="h-4 w-4" /> },
};

/* Excel primero a propósito: es el que pide el 90 % de la gente, y hasta ahora
   era justo el que no existía (el menú lo prometía y bajaba un CSV). */
const ORDEN: ExportFormat[] = ["excel", "pdf", "csv"];

export default function ExportMenu({
  onExport, formats, onPrint, onEmail, disabled = false, busy = false,
  size = "default", showLabel = true, label = "Exportar", className,
}: ExportMenuProps) {
  const [hojaAbierta, setHojaAbierta] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const ocupado = busy || trabajando;

  const lanzar = async (f: ExportFormat) => {
    setHojaAbierta(false);
    try {
      setTrabajando(true);
      await onExport(f);
    } finally {
      setTrabajando(false);
    }
  };

  // `undefined` = los tres. Un array vacío SÍ significa «ninguno» (el informe
  // sólo ofrece imprimir o enviar): tratarlo como «por defecto» ofrecía
  // descargas que el llamador no sabe generar.
  const elegidos = formats === undefined ? ORDEN : formats;
  const acciones: Accion[] = ORDEN.filter((f) => elegidos.includes(f)).map((f) => ({
    key: f,
    label: META[f].label,
    hint: META[f].hint,
    icon: META[f].icon,
    run: () => void lanzar(f),
  }));

  const extras: Accion[] = [];
  if (onPrint) {
    extras.push({
      key: "print",
      label: "Imprimir",
      hint: "Abre la vista de impresión del navegador",
      icon: <Printer className="h-4 w-4" />,
      run: () => { setHojaAbierta(false); onPrint(); },
    });
  }
  if (onEmail) {
    extras.push({
      key: "email",
      label: "Enviar por correo",
      hint: "Manda el informe a un destinatario",
      icon: <Mail className="h-4 w-4" />,
      run: () => { setHojaAbierta(false); onEmail(); },
    });
  }

  const icono = ocupado
    ? <Loader2 className="h-4 w-4 animate-spin" />
    : <Download className="h-4 w-4" />;

  const disparador = (onClick?: () => void) => (
    <Button
      variant="outline"
      size={showLabel ? size : size === "sm" ? "icon-sm" : "icon"}
      disabled={disabled || ocupado}
      onClick={onClick}
      // Con rótulo el nombre accesible ya lo da el texto; sin rótulo hay que darlo.
      aria-label={showLabel ? undefined : label}
      title={label}
      className={className}
    >
      {icono}
      {showLabel && <span>{ocupado ? "Exportando…" : label}</span>}
    </Button>
  );

  return (
    <>
      {/* ── Teléfono: hoja pegada al borde inferior ── */}
      <div className="sm:hidden">
        {disparador(() => setHojaAbierta(true))}
        <Sheet open={hojaAbierta} onOpenChange={setHojaAbierta}>
          <SheetContent side="bottom" className="pb-[max(1rem,env(safe-area-inset-bottom))]">
            <SheetHeader className="text-left">
              <SheetTitle>{label}</SheetTitle>
            </SheetHeader>
            <div className="mt-4 space-y-1.5">
              {[...acciones, ...extras].map((a) => (
                <button
                  key={a.key}
                  type="button"
                  onClick={a.run}
                  // 56 px de alto: el mínimo táctil cómodo, no el mínimo legal.
                  className="cg-focus flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors active:scale-[0.99]"
                  style={{ background: "var(--glass-sunken)" }}
                >
                  <span
                    className="flex size-10 shrink-0 items-center justify-center rounded-xl"
                    style={{ background: "var(--glass)", color: "var(--brand)" }}
                  >
                    {a.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{a.label}</span>
                    <span className="block truncate text-xs" style={{ color: "var(--ink-faint)" }}>
                      {a.hint}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* ── Pantalla grande: el desplegable de siempre ── */}
      <div className="hidden sm:block">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>{disparador()}</DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="text-xs" style={{ color: "var(--ink-faint)" }}>
              Descargar como
            </DropdownMenuLabel>
            {acciones.map((a) => (
              <DropdownMenuItem key={a.key} className="gap-2" onSelect={a.run}>
                {a.icon}
                <span className="flex-1">{a.label}</span>
                <span className="text-[11px] uppercase" style={{ color: "var(--ink-faint)" }}>
                  {a.key === "excel" ? "xlsx" : a.key}
                </span>
              </DropdownMenuItem>
            ))}
            {extras.length > 0 && <DropdownMenuSeparator />}
            {extras.map((a) => (
              <DropdownMenuItem key={a.key} className="gap-2" onSelect={a.run}>
                {a.icon} {a.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
