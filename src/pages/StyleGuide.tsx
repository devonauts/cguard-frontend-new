/**
 * ════════════════════════════════════════════════════════════════════════════
 * C-GUARD PRO — GUÍA DE ESTILO
 * La galería viva del sistema. Todo lo que se ve aquí es lo que hay que usar;
 * si algo no está aquí, no se inventa: se añade aquí primero.
 *
 * Cada bloque lleva a la vista el NOMBRE con el que se importa o la CLASE con
 * la que se aplica, y una frase de cuándo usarlo. Sin eso una guía de estilo es
 * un escaparate bonito del que nadie sabe sacar nada.
 *
 * Cambia el acento en la primera sección y observa la página entera: nada más
 * abajo tiene un color escrito a mano.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  Building2,
  Calendar as CalendarIcon,
  Check,
  ChevronDown,
  Clock,
  Copy,
  Download,
  FileText,
  Filter,
  Info,
  Mail,
  MapPin,
  MoreHorizontal,
  Plus,
  Radio,
  RotateCw,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Users,
  Video,
} from "lucide-react";

import BrandLockup from "@/components/BrandLockup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  PageContainer,
  PageHeader,
  Section,
  StatCard,
  MetricTile,
  DeltaPill,
  StatusBadge,
  EmptyState,
  SkeletonCards,
  SkeletonBlock,
  Modal,
  Field,
  IconTile,
  Segmented,
  Toolbar,
  Stagger,
  FadeIn,
  InfoNote,
  TabNav,
  Avatar,
  ListRow,
  CatalogTile,
  FormField,
  SearchInput,
  Meter,
  Pagination,
  Stepper,
  StatusDot,
  FIELD_CLS,
  FIELD_CLS_LG,
} from "@/components/kit";
import {
  AreaChart,
  BarChart,
  Donut,
  MeterBar,
  ProgressRing,
  Sparkline,
} from "@/components/charts";
import {
  useAccent,
  ACCENT_PRESETS,
  type Accent,
} from "@/contexts/AccentContext";
import { useThemeContext } from "@/contexts/ThemeContext";

/* ════════════════════════════════════════════════════════════════════════════
   ANDAMIO DE LA GUÍA
   ════════════════════════════════════════════════════════════════════════════ */

/** La etiqueta con el nombre real: lo que hay que teclear para usar la pieza. */
function Api({
  children,
  tipo = "comp",
}: {
  children: string;
  tipo?: "comp" | "clase" | "token";
}) {
  const [copiado, setCopiado] = useState(false);
  const copiar = () => {
    navigator.clipboard?.writeText(children).then(
      () => {
        setCopiado(true);
        setTimeout(() => setCopiado(false), 1200);
      },
      () => {},
    );
  };

  return (
    <button
      className="cg-focus inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[11px] leading-5 transition-colors motion-reduce:transition-none"
      style={
        tipo === "clase"
          ? {
              borderColor: "var(--brand-line)",
              background: "var(--brand-wash)",
              color: "var(--brand-text)",
            }
          : {
              borderColor: "var(--hairline)",
              background: "var(--glass-sunken)",
              color: "var(--ink-soft)",
            }
      }
      title="Copiar"
      type="button"
      onClick={copiar}
    >
      <span className="truncate">{children}</span>
      {copiado ? (
        <Check className="size-3 shrink-0" />
      ) : (
        <Copy className="size-3 shrink-0 opacity-50" />
      )}
    </button>
  );
}

/**
 * Un bloque de la guía: título, para QUÉ sirve, con qué nombre se usa, y la
 * muestra. `uso` no es decorativo — es la mitad del valor de la guía.
 */
function Bloque({
  titulo,
  uso,
  api,
  nota,
  children,
  className,
}: {
  titulo: string;
  uso?: string;
  api?: string[];
  nota?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`glass p-5 ${className || ""}`}>
      <header className="mb-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <h3 className="font-display text-base font-bold tracking-tight">
            {titulo}
          </h3>
          {api && api.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {api.map((a) => (
                <Api
                  key={a}
                  tipo={
                    a.startsWith(".") || a.startsWith("--") ? "clase" : "comp"
                  }
                >
                  {a}
                </Api>
              ))}
            </div>
          )}
        </div>
        {uso && (
          <p className="mt-1.5 text-sm" style={{ color: "var(--ink-soft)" }}>
            {uso}
          </p>
        )}
        {nota && (
          <p
            className="mt-2 text-xs leading-relaxed"
            style={{ color: "var(--ink-faint)" }}
          >
            {nota}
          </p>
        )}
      </header>
      {children}
    </section>
  );
}

/** Cabecera de capítulo: separa los grandes bloques de la guía. */
function Capitulo({
  numero,
  titulo,
  bajada,
}: {
  numero: string;
  titulo: string;
  bajada: string;
}) {
  return (
    <div className="mt-4 flex items-start gap-4 px-1 pt-6">
      <span
        className="font-display shrink-0 text-4xl font-bold leading-none tabular-nums"
        style={{ color: "var(--brand-line)" }}
      >
        {numero}
      </span>
      <div className="min-w-0">
        <h2 className="font-display text-xl font-bold tracking-tight">
          {titulo}
        </h2>
        <p className="mt-0.5 text-sm" style={{ color: "var(--ink-soft)" }}>
          {bajada}
        </p>
      </div>
    </div>
  );
}

/** Una muestra dentro de una rejilla, con su pie. */
function Muestra({
  pie,
  className,
  children,
}: {
  pie: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`min-w-0 ${className || ""}`}>
      <div
        className="flex min-h-[68px] items-center justify-center rounded-xl p-3"
        style={{ background: "var(--glass-sunken)" }}
      >
        {children}
      </div>
      <div
        className="mt-1.5 text-center text-[11px] leading-tight"
        style={{ color: "var(--ink-faint)" }}
      >
        {pie}
      </div>
    </div>
  );
}

/** Muestra de un token de color, con su nombre de variable. */
function Token({ nombre, variable }: { nombre: string; variable: string }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="h-11 w-11 shrink-0 rounded-xl border"
        style={{
          background: `var(${variable})`,
          borderColor: "var(--hairline)",
        }}
      />
      <div className="min-w-0">
        <div className="truncate text-xs font-semibold">{nombre}</div>
        <code
          className="block truncate text-[11px]"
          style={{ color: "var(--ink-faint)" }}
        >
          {variable}
        </code>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   LA GUÍA
   ════════════════════════════════════════════════════════════════════════════ */

export default function StyleGuide() {
  const { accent, setAccent, resetAccent } = useAccent();
  const { theme, toggleTheme } = useThemeContext();

  // Estado de las demostraciones interactivas.
  const [rango, setRango] = useState<"dia" | "semana" | "mes">("semana");
  const [abierto, setAbierto] = useState(false);
  const [pestana, setPestana] = useState<"resumen" | "turnos" | "incidentes">(
    "resumen",
  );
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(2);
  const [tamPagina, setTamPagina] = useState(25);
  const [paso, setPaso] = useState(1);
  const [interruptor, setInterruptor] = useState(true);
  const [casilla, setCasilla] = useState(true);
  const [opcion, setOpcion] = useState("fijo");
  const [deslizador, setDeslizador] = useState(60);
  const [fecha, setFecha] = useState<Date | undefined>(new Date());
  const [otp, setOtp] = useState("");
  const [vista, setVista] = useState("lista");
  const [repeticion, setRepeticion] = useState(0);

  const aplicar = (a: Accent) => setAccent(a);

  return (
    <TooltipProvider>
      <PageContainer width="wide">
        <PageHeader
          actions={
            <>
              <Button variant="outline" onClick={toggleTheme}>
                Ver en {theme === "dark" ? "claro" : "oscuro"}
              </Button>
              <Button>
                <Plus /> Acción principal
              </Button>
            </>
          }
          badges={
            <>
              <StatusBadge tone="brand">Sistema v2</StatusBadge>
              <StatusBadge tone="ok">Claro y oscuro</StatusBadge>
              <StatusBadge tone="info">Movimiento reducido</StatusBadge>
            </>
          }
          icon={<Shield />}
          subtitle="El sistema de cristal de C-Guard Pro. Superficie acromática, un acento configurable, un solo tema escrito para claro y oscuro."
          title="Guía de estilo"
        />

        <InfoNote icon={<Info />} title="Cómo se lee esta página" tone="brand">
          Cada bloque lleva a la derecha el nombre con el que se importa la
          pieza o la clase con la que se aplica — pulsa la etiqueta para
          copiarla. Debajo del título, la frase de cuándo usarla. Si tienes que
          elegir entre dos piezas parecidas, la respuesta está en esa frase.
        </InfoNote>

        {/* ══════════════════════════════════════════════════════════════════
            1 · FUNDAMENTOS
            ══════════════════════════════════════════════════════════════════ */}
        <Capitulo
          bajada="Color, tipografía, forma y profundidad. Todo lo demás se construye con esto."
          numero="1"
          titulo="Fundamentos"
        />

        <Bloque
          api={["--brand-h", "--brand-c"]}
          nota="La LUMINOSIDAD no se puede cambiar, y no es un olvido: es lo que garantiza que el texto contraste sobre el acento sea cual sea el tono. Medido sobre los 360 tonos — 5,09:1 en el peor caso claro, 8,5:1 en el peor oscuro. Entre L 0,54 y 0,58 hay una zona muerta donde ninguna tinta pasa, y por eso el sistema no deja entrar ahí."
          titulo="Acento configurable"
          uso="Elige un tono y mira la página entera: nada de lo que hay debajo tiene un color escrito a mano."
        >
          <div className="flex flex-wrap gap-2">
            {ACCENT_PRESETS.map((p) => {
              const activo =
                Math.abs(p.h - accent.h) < 1 &&
                Math.abs(p.c - accent.c) < 0.005;

              return (
                <button
                  key={p.id}
                  className="cg-focus flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition-all motion-reduce:transition-none"
                  style={{
                    borderColor: activo ? "var(--brand)" : "var(--hairline)",
                    background: activo
                      ? "var(--brand-wash)"
                      : "var(--glass-sunken)",
                    color: activo ? "var(--brand-text)" : "var(--ink-soft)",
                  }}
                  type="button"
                  onClick={() => aplicar({ h: p.h, c: p.c })}
                >
                  <span
                    className="h-4 w-4 rounded-full"
                    style={{
                      background: `oklch(${theme === "dark" ? 0.78 : 0.72} ${p.c} ${p.h})`,
                    }}
                  />
                  {p.label}
                </button>
              );
            })}
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <div className="cg-eyebrow mb-2">
                Tono — {Math.round(accent.h)}°
              </div>
              <input
                className="cg-focus w-full"
                max={360}
                min={0}
                style={{ accentColor: "var(--brand)" }}
                type="range"
                value={accent.h}
                onChange={(e) =>
                  aplicar({ ...accent, h: Number(e.target.value) })
                }
              />
            </label>
            <label className="block">
              <div className="cg-eyebrow mb-2">
                Intensidad — {accent.c.toFixed(3)}
              </div>
              <input
                className="cg-focus w-full"
                max={0.2}
                min={0}
                step={0.005}
                style={{ accentColor: "var(--brand)" }}
                type="range"
                value={accent.c}
                onChange={(e) =>
                  aplicar({ ...accent, c: Number(e.target.value) })
                }
              />
            </label>
          </div>
          <Button
            className="mt-3"
            size="sm"
            variant="ghost"
            onClick={resetAccent}
          >
            Volver al mostaza oro de la marca
          </Button>
        </Bloque>

        <Bloque
          api={[
            "--brand",
            "--brand-text",
            "--ink",
            "--ok",
            "--warn",
            "--bad",
            "--info",
          ]}
          nota="`--brand` es el RELLENO (botones, píldoras, barras) y lleva tinta `--brand-ink` encima. `--brand-text` es el mismo tono a la luminosidad que necesita el TEXTO: usar el de relleno como color de letra sobre blanco da 2,25:1, ilegible. Los semánticos son fijos a propósito — un pánico tiene que seguir siendo rojo aunque alguien elija rojo como acento."
          titulo="Color"
          uso="Los neutros van a croma 0 — negro y blanco puros — para que el acento sea lo único con color en pantalla."
        >
          <div className="cg-eyebrow mb-3">Marca</div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Token nombre="Relleno" variable="--brand" />
            <Token nombre="Texto e iconos" variable="--brand-text" />
            <Token nombre="Lavado" variable="--brand-wash" />
            <Token nombre="Línea" variable="--brand-line" />
          </div>

          <div className="cg-eyebrow mb-3 mt-6">Tinta y lienzo</div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Token nombre="Lienzo" variable="--canvas" />
            <Token nombre="Tinta" variable="--ink" />
            <Token nombre="Tinta suave" variable="--ink-soft" />
            <Token nombre="Tinta tenue" variable="--ink-faint" />
          </div>

          <div className="cg-eyebrow mb-3 mt-6">
            Semánticos — fijos, no siguen al acento
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Token nombre="Correcto" variable="--ok" />
            <Token nombre="Aviso" variable="--warn" />
            <Token nombre="Peligro" variable="--bad" />
            <Token nombre="Información" variable="--info" />
          </div>
        </Bloque>

        <Bloque
          api={["BrandLockup", "cg-lockup"]}
          nota="El lema NO es parte de la imagen. Estaba dibujado dentro del PNG, y por eso decía «Seguridad Inteligente» también en inglés y en portugués: ahora sale de `brand.tagline` y se estira al ancho del wordmark, porque cada idioma mide distinto y si no el bloque bailaría al cambiarlo. El arte tiene dos versiones, clara y oscura, porque el cristal lleva color propio: el viejo truco de invertir el PNG negro con `dark:brightness-0 dark:invert` ya no sirve. Las medidas del hueco del lema salen del alfa del arte original (6477×1119), no de ajustarlas a ojo — si se rehace el logo, hay que volver a medirlas."
          titulo="Bloque de marca"
          uso="El logotipo con el lema. Se usa en el acceso y en el arranque; en cualquier otro sitio, consúltalo antes."
        >
          <div className="space-y-6">
            <div>
              <div className="cg-eyebrow mb-2">
                Completo · con lema · animado
              </div>
              <BrandLockup className="w-[260px]" />
            </div>
            <div>
              <div className="cg-eyebrow mb-2">
                Sin lema · para tamaños pequeños (por debajo de ~160 px el lema
                no se lee)
              </div>
              <BrandLockup className="w-[150px]" showTagline={false} />
            </div>
            <div>
              <div className="cg-eyebrow mb-2">Quieto · sin destello</div>
              <BrandLockup animated={false} className="w-[260px]" />
            </div>
            <div>
              <div className="cg-eyebrow mb-2">
                El lema por idioma · clave brand.tagline
              </div>
              <ul className="space-y-1 text-sm text-ink-soft">
                <li>
                  <span className="font-mono text-xs text-ink-faint">es</span> ·
                  Seguridad Inteligente
                </li>
                <li>
                  <span className="font-mono text-xs text-ink-faint">en</span> ·
                  Intelligent Security
                </li>
                <li>
                  <span className="font-mono text-xs text-ink-faint">pt</span> ·
                  Segurança Inteligente
                </li>
              </ul>
            </div>
            <p className="text-sm text-ink-soft">
              El destello cruza una vez cada 6 s y se está quieto el resto: esta
              pantalla se mira ocho horas seguidas. Respeta{" "}
              <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">
                prefers-reduced-motion
              </code>
              . La banda cambia de signo con el tema — luz sobre el logotipo
              oscuro, sombra sobre el claro — por lo mismo que el icono lleva
              contorno oscuro y filo claro a la vez: cada uno sólo se ve en el
              fondo donde el otro desaparece.
            </p>
          </div>
        </Bloque>

        <Bloque
          api={["og:image", "/assets/og/"]}
          nota="Se diseña para el tamaño CHICO, no para el grande: WhatsApp la muestra a unos 300 px de ancho, así que si el titular no se lee ahí, no se lee. De ahí el titular a dos líneas y corto, y nada de texto secundario que dependa de leerse. El escudo va SIEMPRE en su variante oscura sobre estos fondos — la clara puesta encima de un fondo oscuro se lee plateada, que es un error fácil de colar. Y va UNA POR IDIOMA: el titular y el lema son texto, no están dibujados en la imagen, así que el enlace en español se comparte en español. Antes había una sola en inglés con el lema en español."
          titulo="Miniatura al compartir"
          uso="La imagen que sale cuando alguien pega el enlace en WhatsApp, X, LinkedIn o Slack. 1200×630, JPG."
        >
          <div className="space-y-6">
            {[
              {
                src: "miniatura-es",
                n: "Español",
                d: "La que sirve cguardpro.com",
              },
              {
                src: "miniatura-en",
                n: "English",
                d: "La que sirve cguardpro.com/en",
              },
              {
                src: "miniatura-pt",
                n: "Português",
                d: "Generada y lista; el sitio aún no habla portugués, el CRM sí.",
              },
              {
                src: "miniatura-producto",
                n: "Alternativa · Producto",
                d: "Enseña el panel real. Cuenta mejor qué es el producto.",
              },
              {
                src: "miniatura-marca",
                n: "Alternativa · Marca",
                d: "La más limpia: el escudo se reconoce incluso a 300 px.",
              },
            ].map((m) => (
              <div key={m.src}>
                <div className="cg-eyebrow mb-2">{m.n}</div>
                <img
                  alt={`Miniatura ${m.n}`}
                  className="w-full max-w-[520px] rounded-xl border border-line"
                  src={`/assets/og/${m.src}.jpg`}
                />
                <p className="mt-2 max-w-[520px] text-sm text-ink-soft">
                  {m.d}
                </p>
              </div>
            ))}
            <p className="text-sm text-ink-soft">
              Se generan con{" "}
              <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">
                npm run og
              </code>{" "}
              en el sitio: el diseño es HTML y se fotografía con Chrome sin
              ventana a 1200×630 exactos. Se hace así y no a mano para que el
              día que cambie el titular, el lema o un idioma la imagen se rehaga
              sola, en vez de acabar con un JPG suelto que ya nadie sabe
              reconstruir — que es exactamente cómo se había quedado la anterior
              en inglés.
            </p>
          </div>
        </Bloque>

        <Bloque
          api={["font-display", "font-sans", "tabular-nums"]}
          nota="Los datos van SIEMPRE con cero barrado y ancho fijo de cifra. En una consola de operaciones se leen matrículas, identificadores y coordenadas: distinguir 0 de O no es un capricho tipográfico, es evitar que alguien teclee mal una placa."
          titulo="Tipografía"
          uso="Space Grotesk para titulares y cifras; Inter para todo lo demás."
        >
          <div className="space-y-4">
            <div>
              <div className="cg-eyebrow mb-1">
                Titular · font-display · 2rem/bold
              </div>
              <p className="font-display text-[2rem] font-bold leading-tight tracking-tight">
                Cobertura del turno
              </p>
            </div>
            <div>
              <div className="cg-eyebrow mb-1">
                Título de página · font-display · 1.5rem/bold
              </div>
              <p className="font-display text-2xl font-bold tracking-tight">
                Puestos y vigilantes
              </p>
            </div>
            <div>
              <div className="cg-eyebrow mb-1">
                Título de sección · 0.875rem/semibold
              </div>
              <p className="text-sm font-semibold tracking-tight">
                Novedades del relevo
              </p>
            </div>
            <div>
              <div className="cg-eyebrow mb-1">
                Cuerpo · font-sans · 0.875rem
              </div>
              <p className="text-sm">
                El vigilante marcó entrada a las 06:02 en el acceso principal.
                La ronda de las 08:00 quedó completa y no se registraron
                novedades.
              </p>
            </div>
            <div>
              <div className="cg-eyebrow mb-1">
                Apoyo · 0.75rem · --ink-soft
              </div>
              <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                Actualizado hace 4 minutos
              </p>
            </div>
            <div>
              <div className="cg-eyebrow mb-1">Cintillo · .cg-eyebrow</div>
              <p className="cg-eyebrow">Turno de la mañana</p>
            </div>
          </div>

          <Separator className="my-5" />

          <div className="grid gap-4 sm:grid-cols-2">
            <div
              className="rounded-xl p-4"
              style={{ background: "var(--glass-sunken)" }}
            >
              <div className="cg-eyebrow mb-2">
                Con cero barrado — así se ven los datos
              </div>
              <p className="font-display text-2xl font-bold tabular-nums">
                0O 1Il 8B 5S
              </p>
              <p className="mt-1 text-sm tabular-nums">
                PBA-0842 · 0,0 % · 00:00
              </p>
            </div>
            <div
              className="rounded-xl p-4"
              style={{ background: "var(--glass-sunken)" }}
            >
              <div className="cg-eyebrow mb-2">
                Sin él — el 0 y la O se confunden
              </div>
              <p
                className="font-display text-2xl font-bold"
                style={{ fontVariantNumeric: "normal" }}
              >
                0O 1Il 8B 5S
              </p>
              <p
                className="mt-1 text-sm"
                style={{ fontVariantNumeric: "normal" }}
              >
                PBA-0842 · 0,0 % · 00:00
              </p>
            </div>
          </div>
        </Bloque>

        <Bloque
          api={["--r-sm", "--r-md", "--r-lg", "--r-xl", "--r-2xl"]}
          nota="Las piezas del kit ya los llevan: `Section` y `GlassPanel` van a --r-xl, `glass-flat` a --r-lg, los campos a --r-md. Las superficies `.glass*` viven en `@layer components`, así que un `rounded-*` de Tailwind por encima SÍ manda cuando de verdad hace falta salirse de la escala."
          titulo="Radios"
          uso="La escala de esquinas. Cuanto más grande la superficie, más grande el radio."
        >
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {(["--r-sm", "--r-md", "--r-lg", "--r-xl", "--r-2xl"] as const).map(
              (r) => (
                <Muestra key={r} pie={r}>
                  <div
                    className="h-16 w-full border"
                    style={{
                      borderRadius: `var(${r})`,
                      background: "var(--glass-raised)",
                      borderColor: "var(--hairline)",
                    }}
                  />
                </Muestra>
              ),
            )}
          </div>
        </Bloque>

        <Bloque
          api={["--lift-1", "--lift-2", "--lift-3", "--lift-4"]}
          nota="Las sombras son ACROMÁTICAS — sin tinte de color — para no pelearse con el acento elegido. En oscuro son mucho más profundas: sobre negro una sombra suave no se ve."
          titulo="Elevación"
          uso="Cuánto se despega del lienzo. Sube con la importancia: una tarjeta flota poco, un diálogo flota mucho."
        >
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {(
              [
                ["--lift-1", "Reposo, casi pegado"],
                ["--lift-2", "Tarjeta de lista"],
                ["--lift-3", "Panel de cristal"],
                ["--lift-4", "Diálogo y menús"],
              ] as const
            ).map(([v, uso]) => (
              <Muestra
                key={v}
                pie={
                  <>
                    <code>{v}</code>
                    <br />
                    {uso}
                  </>
                }
              >
                <div
                  className="h-14 w-full rounded-xl border"
                  style={{
                    background: "var(--glass-solid)",
                    borderColor: "var(--hairline)",
                    boxShadow: `var(${v})`,
                  }}
                />
              </Muestra>
            ))}
          </div>
        </Bloque>

        {/* ══════════════════════════════════════════════════════════════════
            2 · SUPERFICIES
            ══════════════════════════════════════════════════════════════════ */}
        <Capitulo
          bajada="El lienzo, las cuatro clases de cristal y los dos velos. Elegir mal aquí cuesta fotogramas."
          numero="2"
          titulo="Superficies"
        />

        <Bloque
          api={[".app-shell"]}
          nota="No es decoración. El cristal necesita algo DETRÁS que desenfocar: sobre un fondo plano y liso el desenfoque no se percibe y la superficie se lee como un rectángulo gris con opacidad."
          titulo="El lienzo"
          uso="El fondo de la aplicación: dos halos muy difusos del acento sobre un plano acromático."
        >
          <div
            className="relative h-44 overflow-hidden rounded-2xl border"
            style={{
              borderColor: "var(--hairline)",
              background: "var(--canvas)",
            }}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute -right-10 -top-16 h-52 w-52 rounded-full blur-3xl"
              style={{
                background:
                  "radial-gradient(circle, var(--brand) 0%, transparent 68%)",
                opacity: theme === "dark" ? 0.14 : 0.1,
              }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-20 -left-10 h-52 w-52 rounded-full blur-3xl"
              style={{
                background:
                  "radial-gradient(circle, var(--ink) 0%, transparent 66%)",
                opacity: theme === "dark" ? 0.1 : 0.06,
              }}
            />
            <div className="relative flex h-full items-center justify-center p-6">
              <div className="glass px-5 py-4 text-sm font-semibold">
                Cristal sobre el lienzo
              </div>
            </div>
          </div>
        </Bloque>

        <Bloque
          api={[
            ".glass",
            ".glass-flat",
            ".glass-raised",
            ".glass-sunken",
            "GlassPanel",
          ]}
          nota="Lo que hace que algo parezca vidrio no es la transparencia: es el filo de 1 px MÁS CLARO ARRIBA que abajo — la luz cayendo sobre el canto. Quitarlo deja una tarjeta normal con opacidad. `glass-sunken` invierte esa luz: el filo claro pasa abajo, y eso es lo que se lee como hundido."
          titulo="Las cuatro superficies"
          uso="glass para paneles; glass-flat para lo que se repite; glass-raised para lo que flota; glass-sunken para huecos."
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="glass p-4">
              <div className="text-xs font-semibold">.glass</div>
              <p className="mt-1 text-xs" style={{ color: "var(--ink-faint)" }}>
                Panel estándar. Con desenfoque.
              </p>
            </div>
            <div className="glass-flat p-4">
              <div className="text-xs font-semibold">.glass-flat</div>
              <p className="mt-1 text-xs" style={{ color: "var(--ink-faint)" }}>
                Mismo aspecto, SIN desenfoque.
              </p>
            </div>
            <div className="glass-raised p-4">
              <div className="text-xs font-semibold">.glass-raised</div>
              <p className="mt-1 text-xs" style={{ color: "var(--ink-faint)" }}>
                Diálogos y menús. Flota.
              </p>
            </div>
            <div className="glass-sunken p-4">
              <div className="text-xs font-semibold">.glass-sunken</div>
              <p className="mt-1 text-xs" style={{ color: "var(--ink-faint)" }}>
                Huecos, pozos y campos.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="glass glass-hover p-4">
              <div className="text-xs font-semibold">.glass + .glass-hover</div>
              <p className="mt-1 text-xs" style={{ color: "var(--ink-faint)" }}>
                Pasa el puntero: sube 2 px y el filo coge el acento.
              </p>
            </div>
            <div className="glass glass-brand p-4">
              <div className="text-xs font-semibold">.glass + .glass-brand</div>
              <p className="mt-1 text-xs" style={{ color: "var(--ink-faint)" }}>
                La tarjeta seleccionada, la fila activa.
              </p>
            </div>
          </div>

          <InfoNote
            className="mt-5"
            icon={<TriangleAlert />}
            title="glass vs glass-flat es una decisión de RENDIMIENTO, no de gusto"
            tone="warn"
          >
            <code>backdrop-filter</code> obliga al navegador a rasterizar todo
            lo que hay detrás en cada fotograma. Una sola superficie sale
            gratis; quinientas filas de tabla con cristal por fila tumban el
            desplazamiento. La regla: <strong>cristal para SUPERFICIES</strong>{" "}
            (tarjetas, paneles, barras),{" "}
            <strong>
              <code>glass-flat</code> para todo lo que salga de un{" "}
              <code>map()</code>
            </strong>{" "}
            — filas, listas, rejillas de tarjetas, esqueletos de carga.
          </InfoNote>
        </Bloque>

        <Bloque
          api={[".glass-scrim", "body::before"]}
          nota="La diferencia no es estética: el del modal captura el clic para cerrar y atrapa el foco; el del desplegable NO lo captura, porque pulsar otro botón con un menú abierto debe cerrarlo Y activar ese botón en una sola pulsación."
          titulo="Los dos velos"
          uso="El modal usa `.glass-scrim` sobre el velo de Radix, que captura el clic. El desplegable no tiene velo propio en Radix, así que lo pinta `body::before` cuando hay algo flotando abierto."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div
              className="relative h-40 overflow-hidden rounded-2xl border"
              style={{ borderColor: "var(--hairline)" }}
            >
              <div className="absolute inset-0 grid grid-cols-3 gap-2 p-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="rounded-lg"
                    style={{ background: "var(--glass-sunken)" }}
                  />
                ))}
              </div>
              <div className="glass-scrim absolute inset-0 grid place-items-center">
                <div className="glass-raised px-4 py-3 text-xs font-semibold">
                  Diálogo por encima
                </div>
              </div>
              <span
                className="absolute bottom-2 left-2 rounded-md px-1.5 py-0.5 font-mono text-[10px]"
                style={{
                  background: "var(--glass-raised)",
                  color: "var(--ink-soft)",
                }}
              >
                .glass-scrim
              </span>
            </div>

            <div
              className="relative h-40 overflow-hidden rounded-2xl border"
              style={{ borderColor: "var(--hairline)" }}
            >
              <div className="absolute inset-0 grid grid-cols-3 gap-2 p-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="rounded-lg"
                    style={{ background: "var(--glass-sunken)" }}
                  />
                ))}
              </div>
              <div
                className="absolute inset-0"
                style={{
                  background: "oklch(0 0 0 / 0.14)",
                  backdropFilter: "blur(7px) saturate(115%)",
                  WebkitBackdropFilter: "blur(7px) saturate(115%)",
                }}
              />
              <div
                className="absolute right-3 top-3 rounded-xl px-3 py-2 text-xs font-semibold"
                style={{
                  background: "var(--glass-raised)",
                  boxShadow: "var(--lift-4)",
                }}
              >
                Menú abierto
              </div>
              <span
                className="absolute bottom-2 left-2 rounded-md px-1.5 py-0.5 font-mono text-[10px]"
                style={{
                  background: "var(--glass-raised)",
                  color: "var(--ink-soft)",
                }}
              >
                .glass-scrim-soft
              </span>
            </div>
          </div>
        </Bloque>

        <Bloque
          api={[
            "Section",
            "GlassPanel",
            "Toolbar",
            "PageContainer",
            "PageHeader",
          ]}
          nota="`bare` existe porque una rejilla de tarjetas de cristal dentro de otro cristal deja dos filos concéntricos, y el segundo no significa nada."
          titulo="Contenedores del kit"
          uso="Section envuelve un bloque de contenido en cristal; con `bare` deja sólo la cabecera sobre el lienzo."
        >
          <div className="space-y-4">
            <Section
              action={
                <Button size="sm" variant="ghost">
                  Ver todo
                </Button>
              }
              icon={<Radio />}
              title="Sección normal"
            >
              <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                El contenido va sobre cristal.
              </p>
            </Section>

            <Section
              bare
              action={
                <Button size="sm" variant="ghost">
                  Ver todo
                </Button>
              }
              icon={<MapPin />}
              title="Sección `bare`"
            >
              <div className="grid gap-3 sm:grid-cols-3">
                {["Torre Norte", "Planta Sur", "Acceso 3"].map((n) => (
                  <div key={n} className="glass-flat p-3 text-xs font-semibold">
                    {n}
                  </div>
                ))}
              </div>
            </Section>

            <Toolbar>
              <SearchInput
                className="w-56"
                placeholder="Buscar vigilante…"
                value={busqueda}
                onChange={setBusqueda}
              />
              <Button size="sm" variant="ghost">
                <Filter /> Filtros
              </Button>
              <div className="flex-1" />
              <Button size="sm">
                <Plus /> Añadir
              </Button>
            </Toolbar>
          </div>
        </Bloque>

        {/* ══════════════════════════════════════════════════════════════════
            3 · ESTADOS
            ══════════════════════════════════════════════════════════════════ */}
        <Capitulo
          bajada="Los siete estados de cualquier control, uno al lado del otro. Si un componente nuevo no los cubre todos, no está terminado."
          numero="3"
          titulo="Estados"
        />

        <Bloque
          api={[".cg-focus", ":focus-visible"]}
          nota="Las muestras de «puntero» y «pulsado» llevan el estilo aplicado a la fuerza para poder verse quietas; la columna de la derecha es real, pruébala con el ratón y con el tabulador. El foco es `:focus-visible` y no `:focus`: así el anillo aparece al tabular pero no al hacer clic, que es cuando molesta."
          titulo="Los siete estados"
          uso="Reposo, puntero encima, foco de teclado, pulsado, deshabilitado, cargando y error."
        >
          <div className="space-y-3">
            {(
              [
                {
                  nombre: "Reposo",
                  desc: "Como aparece sin tocarlo.",
                  btn: {},
                  campo: {},
                },
                {
                  nombre: "Puntero encima",
                  desc: "Se aclara y el halo crece.",
                  btn: {
                    filter: "brightness(1.06)",
                    boxShadow:
                      "0 1px 0 0 oklch(1 0 0 / 0.3) inset, 0 10px 28px -8px var(--brand-glow)",
                  },
                  campo: { borderColor: "var(--brand-line)" },
                },
                {
                  nombre: "Foco de teclado",
                  desc: "Anillo del acento a 3 px. Obligatorio en TODO lo interactivo.",
                  btn: {
                    boxShadow:
                      "0 0 0 3px color-mix(in oklch, var(--ring) 45%, transparent)",
                  },
                  campo: {
                    borderColor: "var(--brand)",
                    boxShadow: "0 0 0 3px var(--brand-glow)",
                    background: "var(--glass-raised)",
                  },
                },
                {
                  nombre: "Pulsado",
                  desc: "Encoge al 97 %: la confirmación táctil.",
                  btn: { transform: "scale(0.97)" },
                  campo: { borderColor: "var(--brand)" },
                },
                {
                  nombre: "Deshabilitado",
                  desc: "Opacidad 45 % y sin puntero. Nunca se esconde.",
                  btn: { opacity: 0.45 },
                  campo: { opacity: 0.5 },
                },
              ] as const
            ).map((e) => (
              <div
                key={e.nombre}
                className="grid items-center gap-3 rounded-xl px-3 py-2.5 sm:grid-cols-[10rem_1fr_1fr]"
                style={{ background: "var(--glass-sunken)" }}
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold">{e.nombre}</div>
                  <div
                    className="text-[11px] leading-tight"
                    style={{ color: "var(--ink-faint)" }}
                  >
                    {e.desc}
                  </div>
                </div>
                <div>
                  <span
                    className="cg-btn-brand inline-flex h-9 items-center justify-center rounded-full px-4 text-sm font-semibold"
                    style={e.btn as React.CSSProperties}
                  >
                    Guardar
                  </span>
                </div>
                <div>
                  <input
                    readOnly
                    className="cg-input h-9 w-full px-3 text-sm"
                    style={e.campo as React.CSSProperties}
                    value="Torre Norte"
                  />
                </div>
              </div>
            ))}

            {/* Cargando */}
            <div
              className="grid items-center gap-3 rounded-xl px-3 py-2.5 sm:grid-cols-[10rem_1fr_1fr]"
              style={{ background: "var(--glass-sunken)" }}
            >
              <div className="min-w-0">
                <div className="text-xs font-semibold">Cargando</div>
                <div
                  className="text-[11px] leading-tight"
                  style={{ color: "var(--ink-faint)" }}
                >
                  El botón se bloquea; el dato se sustituye por su esqueleto.
                </div>
              </div>
              <div>
                <Button disabled>
                  <RotateCw className="animate-spin motion-reduce:animate-none" />{" "}
                  Guardando…
                </Button>
              </div>
              <div>
                <SkeletonBlock className="h-9 rounded-[var(--r-md)]" />
              </div>
            </div>

            {/* Error */}
            <div
              className="grid items-start gap-3 rounded-xl px-3 py-2.5 sm:grid-cols-[10rem_1fr_1fr]"
              style={{ background: "var(--glass-sunken)" }}
            >
              <div className="min-w-0">
                <div className="text-xs font-semibold">Error</div>
                <div
                  className="text-[11px] leading-tight"
                  style={{ color: "var(--ink-faint)" }}
                >
                  Filo y mensaje del MISMO rojo del sistema, nunca un rojo
                  suelto.
                </div>
              </div>
              <div>
                <Button variant="destructive">
                  <Trash2 /> Eliminar
                </Button>
              </div>
              <div>
                <input
                  aria-invalid
                  readOnly
                  className="cg-input h-9 w-full px-3 text-sm"
                  placeholder="Obligatorio"
                  style={{
                    borderColor: "var(--bad)",
                    boxShadow:
                      "0 0 0 3px color-mix(in oklab, var(--bad) 22%, transparent)",
                  }}
                  value=""
                />
                <p
                  className="mt-1.5 text-xs"
                  style={{ color: "var(--bad-text)" }}
                >
                  El nombre del puesto es obligatorio.
                </p>
              </div>
            </div>

            {/* Real */}
            <div
              className="grid items-center gap-3 rounded-xl border border-dashed px-3 py-2.5 sm:grid-cols-[10rem_1fr_1fr]"
              style={{ borderColor: "var(--brand-line)" }}
            >
              <div className="min-w-0">
                <div
                  className="text-xs font-semibold"
                  style={{ color: "var(--brand-text)" }}
                >
                  De verdad
                </div>
                <div
                  className="text-[11px] leading-tight"
                  style={{ color: "var(--ink-faint)" }}
                >
                  Pásale el ratón y llega con el tabulador.
                </div>
              </div>
              <div>
                <Button>Guardar</Button>
              </div>
              <div>
                <Input defaultValue="Torre Norte" />
              </div>
            </div>
          </div>
        </Bloque>

        {/* ══════════════════════════════════════════════════════════════════
            4 · ACCIONES
            ══════════════════════════════════════════════════════════════════ */}
        <Capitulo
          bajada="Botones, píldoras y conmutadores. Una acción principal por pantalla."
          numero="4"
          titulo="Acciones"
        />

        <Bloque
          api={[
            "Button",
            ".cg-btn-brand",
            ".cg-btn-glass",
            ".cg-btn-ghost",
            ".cg-btn-bad",
          ]}
          nota="El relleno sale de `--brand` y la tinta de `--brand-ink`, así que se recalculan solos al cambiar el acento — por eso van en CSS y no en clases de Tailwind, que obligarían a enumerar un color por tono posible."
          titulo="Botones"
          uso="`default` para la acción principal, `outline` para la secundaria, `ghost` para la terciaria, `destructive` para lo que borra."
        >
          <div className="flex flex-wrap items-center gap-3">
            <Button>
              <Plus /> Principal
            </Button>
            <Button variant="outline">
              <Download /> Cristal
            </Button>
            <Button variant="ghost">Fantasma</Button>
            <Button variant="destructive">
              <Trash2 /> Destructivo
            </Button>
            <Button variant="danger-ghost">
              <Trash2 /> Peligro ligero
            </Button>
            <Button variant="link">Enlace</Button>
            <Button disabled>Deshabilitado</Button>
          </div>
          <p
            className="mt-3 max-w-2xl text-xs"
            style={{ color: "var(--ink-faint)" }}
          >
            <code>destructive</code> lleva relleno rojo y es para lo que no
            tiene vuelta atrás (eliminar un cliente). <code>danger-ghost</code>{" "}
            es la acción destructiva de bajo peso — quitar una fila, revocar un
            acceso — que no merece gritar desde la pantalla.
          </p>
          <Separator className="my-4" />
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Pequeño</Button>
            <Button>Normal</Button>
            <Button size="lg">Grande</Button>
            <Button aria-label="Buscar" size="icon">
              <Search />
            </Button>
            <Button aria-label="Avisos" size="icon-sm" variant="outline">
              <Bell />
            </Button>
            <Button aria-label="Ajustes" size="icon-lg" variant="ghost">
              <Settings />
            </Button>
          </div>
        </Bloque>

        <Bloque
          api={["Segmented", "ToggleGroup", "ToggleGroupItem"]}
          nota="La confusión habitual es usar pestañas para filtrar. Si lo de debajo sigue siendo la misma lista con otro recorte, es un conmutador; si es otro contenido, son pestañas."
          titulo="Conmutadores"
          uso="Segmented filtra una MISMA lista; ToggleGroup elige un modo de ver; TabNav cambia de sección."
        >
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <div className="cg-eyebrow mb-2">Segmented</div>
              <Segmented
                options={[
                  { value: "dia", label: "Día" },
                  { value: "semana", label: "Semana" },
                  { value: "mes", label: "Mes" },
                ]}
                value={rango}
                onChange={setRango}
              />
            </div>
            <div>
              <div className="cg-eyebrow mb-2">ToggleGroup</div>
              <ToggleGroup
                type="single"
                value={vista}
                onValueChange={(v) => v && setVista(v)}
              >
                <ToggleGroupItem aria-label="Lista" value="lista">
                  Lista
                </ToggleGroupItem>
                <ToggleGroupItem aria-label="Tarjetas" value="tarjetas">
                  Tarjetas
                </ToggleGroupItem>
                <ToggleGroupItem aria-label="Mapa" value="mapa">
                  Mapa
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>
        </Bloque>

        {/* ══════════════════════════════════════════════════════════════════
            5 · FORMULARIOS
            ══════════════════════════════════════════════════════════════════ */}
        <Capitulo
          bajada="Todo lo que recoge un dato. Cada control con su etiqueta atada y su anillo de foco."
          numero="5"
          titulo="Formularios"
        />

        <Bloque
          api={["FormField", "Input", "Textarea", "SearchInput", ".cg-input"]}
          nota="`FormField` ata la etiqueta al control con `htmlFor` — es lo que hace que pulsar el texto ponga el cursor dentro — y anuncia el error con `role='alert'`. Ojo: `Field` (del kit) es otra cosa, es el par etiqueta/dato de SÓLO LECTURA."
          titulo="Campos de texto"
          uso="FormField envuelve cualquier control con su etiqueta, su pista y su error."
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              required
              hint="Como aparecerá en el parte del turno."
              htmlFor="sg-puesto"
              label="Nombre del puesto"
            >
              <Input
                id="sg-puesto"
                placeholder="Torre Norte — Acceso principal"
              />
            </FormField>
            <FormField
              error="Ya existe un puesto con ese código."
              htmlFor="sg-codigo"
              label="Código"
            >
              <Input aria-invalid defaultValue="TN-01" id="sg-codigo" />
            </FormField>
            <FormField
              hint="Con aspa para limpiar cuando hay texto."
              htmlFor="sg-buscar"
              label="Buscar"
            >
              <SearchInput
                placeholder="Buscar vigilante…"
                value={busqueda}
                onChange={setBusqueda}
              />
            </FormField>
            <FormField
              hint="Se muestra al vigilante al marcar entrada."
              htmlFor="sg-consigna"
              label="Consigna"
            >
              <Textarea
                id="sg-consigna"
                placeholder="Instrucciones del puesto…"
                rows={3}
              />
            </FormField>
          </div>

          <Separator className="my-5" />

          <div className="cg-eyebrow mb-2">
            Campo suelto — cuando no se puede usar &lt;Input&gt;
          </div>
          <div className="grid max-w-xl gap-4 sm:grid-cols-2">
            <FormField htmlFor="sg-nativo" label="Nativo con FIELD_CLS">
              <select className={FIELD_CLS} defaultValue="a" id="sg-nativo">
                <option value="a">Turno de mañana</option>
                <option value="b">Turno de tarde</option>
                <option value="c">Turno de noche</option>
              </select>
            </FormField>
            <FormField
              htmlFor="sg-nativo-lg"
              label="Variante alta — FIELD_CLS_LG"
            >
              <input
                className={FIELD_CLS_LG}
                id="sg-nativo-lg"
                placeholder="Observaciones"
              />
            </FormField>
          </div>
          <p
            className="mt-2 max-w-2xl text-xs"
            style={{ color: "var(--ink-faint)" }}
          >
            <code>.cg-input</code> da la SUPERFICIE (hueco, filo, tinta, aro de
            foco); <code>FIELD_CLS</code> da el TAMAÑO. Son decisiones distintas
            y por eso van separadas: el código de verificación mide 44×44, el
            área de texto crece con el contenido y el campo de las pantallas de
            acceso mide 48 de alto para el dedo — todos sobre la misma
            superficie.
          </p>
        </Bloque>

        <Bloque
          api={["Select", "RadioGroup", "Checkbox", "Switch", "Label"]}
          nota="La diferencia entre casilla e interruptor: la casilla es un dato del formulario que se guarda al enviar; el interruptor aplica el cambio en el momento."
          titulo="Selección"
          uso="Select para una lista larga; Radio para pocas opciones visibles; Checkbox e interruptor para sí/no."
        >
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <FormField htmlFor="sg-cliente" label="Cliente">
              <Select defaultValue="andina">
                <SelectTrigger id="sg-cliente">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="andina">Corporación Andina</SelectItem>
                  <SelectItem value="delta">Grupo Delta</SelectItem>
                  <SelectItem value="norte">Industrias del Norte</SelectItem>
                </SelectContent>
              </Select>
            </FormField>

            <FormField label="Tipo de asignación">
              <RadioGroup
                className="gap-2"
                value={opcion}
                onValueChange={setOpcion}
              >
                {[
                  ["fijo", "Fijo"],
                  ["rotativo", "Rotativo"],
                  ["relevo", "Relevo"],
                ].map(([v, l]) => (
                  <div key={v} className="flex items-center gap-2">
                    <RadioGroupItem id={`sg-r-${v}`} value={v} />
                    <Label
                      className="text-sm font-normal"
                      htmlFor={`sg-r-${v}`}
                    >
                      {l}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </FormField>

            <FormField label="Opciones">
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={casilla}
                    id="sg-c1"
                    onCheckedChange={(v) => setCasilla(v === true)}
                  />
                  <Label className="text-sm font-normal" htmlFor="sg-c1">
                    Exigir escaneo de etiqueta
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="sg-c2" />
                  <Label className="text-sm font-normal" htmlFor="sg-c2">
                    Avisar si sale del geocerco
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox disabled id="sg-c3" />
                  <Label
                    className="text-sm font-normal opacity-50"
                    htmlFor="sg-c3"
                  >
                    No disponible en este plan
                  </Label>
                </div>
              </div>
            </FormField>

            <FormField hint="Se aplica al momento." label="Interruptor">
              <div className="flex items-center gap-2.5">
                <Switch
                  checked={interruptor}
                  id="sg-sw"
                  onCheckedChange={setInterruptor}
                />
                <Label className="text-sm font-normal" htmlFor="sg-sw">
                  {interruptor
                    ? "Notificaciones activas"
                    : "Notificaciones en pausa"}
                </Label>
              </div>
            </FormField>
          </div>
        </Bloque>

        <Bloque
          api={["input[type=range]", "accentColor: var(--brand)"]}
          nota="No hay primitivo propio: es el control nativo con `accent-color` apuntando al acento. El nativo trae gratis el teclado, el lector de pantalla y el comportamiento táctil de cada plataforma, que es mucho más de lo que compensa reimplementar."
          titulo="Deslizador"
          uso="Un valor continuo dentro de un rango, cuando el número exacto importa menos que la proporción."
        >
          <label className="block max-w-sm">
            <div className="cg-eyebrow mb-2">
              Radio del geocerco — {deslizador} m
            </div>
            <input
              className="cg-focus w-full"
              max={200}
              min={10}
              style={{ accentColor: "var(--brand)" }}
              type="range"
              value={deslizador}
              onChange={(e) => setDeslizador(Number(e.target.value))}
            />
          </label>
        </Bloque>

        <Bloque
          api={["Calendar", "DateRangePicker"]}
          titulo="Fecha"
          uso="Calendar para elegir un día; el selector de rango para acotar un informe."
        >
          <div className="flex flex-wrap items-start gap-6">
            <div className="glass-flat inline-block p-2">
              <Calendar mode="single" selected={fecha} onSelect={setFecha} />
            </div>
            <div className="min-w-0">
              <div className="cg-eyebrow mb-2">Dentro de un desplegable</div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline">
                    <CalendarIcon /> Elegir fecha <ChevronDown />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto p-2">
                  <Calendar
                    mode="single"
                    selected={fecha}
                    onSelect={setFecha}
                  />
                </PopoverContent>
              </Popover>
              <p
                className="mt-3 max-w-xs text-xs"
                style={{ color: "var(--ink-faint)" }}
              >
                Para acotar un informe se usa <code>DateRangePicker</code>, que
                es este mismo calendario con atajos («Hoy», «Ayer», «Últimos 7
                días») a la izquierda.
              </p>
            </div>
          </div>
        </Bloque>

        <Bloque
          api={["InputOTP", "InputOTPGroup", "InputOTPSlot"]}
          nota="Una casilla por dígito y no un campo de texto normal: pegar el código desde el mensaje reparte los dígitos solo, y el teclado del móvil sale numérico."
          titulo="Código de verificación"
          uso="Los códigos de un solo uso que llegan por correo o SMS."
        >
          <InputOTP maxLength={6} value={otp} onChange={setOtp}>
            <InputOTPGroup>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <InputOTPSlot key={i} index={i} />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </Bloque>

        {/* ══════════════════════════════════════════════════════════════════
            6 · NAVEGACIÓN
            ══════════════════════════════════════════════════════════════════ */}
        <Capitulo
          bajada="Moverse entre secciones de un registro, entre páginas de una lista y entre pasos de un asistente."
          numero="6"
          titulo="Navegación"
        />

        <Bloque
          api={["TabNav"]}
          nota="Cada elemento navega (`to`) o conmuta (`onChange`). El subrayado activo es un hijo posicionado y no un `border-bottom` porque lleva el halo del acento, y una sombra sobre un borde se recorta. Para filtrar una misma lista —«Día / Semana / Mes»— es `Segmented`, no esto."
          titulo="Pestañas de ficha"
          uso="Las secciones de UN registro: un cliente, un vigilante, un puesto."
        >
          <TabNav
            items={[
              { value: "resumen", label: "Resumen", icon: <Activity /> },
              { value: "turnos", label: "Turnos", icon: <Clock />, badge: 12 },
              {
                value: "incidentes",
                label: "Incidentes",
                icon: <AlertTriangle />,
                badge: 3,
              },
            ]}
            value={pestana}
            onChange={setPestana}
          />
          <div className="pt-4 text-sm" style={{ color: "var(--ink-soft)" }}>
            Contenido de «{pestana}».
          </div>

          <Separator className="my-5" />

          <div className="cg-eyebrow mb-2">
            Pestañas de contenido — Tabs de Radix
          </div>
          <p className="mb-3 text-xs" style={{ color: "var(--ink-faint)" }}>
            Cuando las pestañas viven DENTRO de un panel y no encabezan la ficha
            entera.
          </p>
          <Tabs defaultValue="general">
            <TabsList>
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="acceso">Acceso</TabsTrigger>
              <TabsTrigger value="avisos">Avisos</TabsTrigger>
            </TabsList>
            <TabsContent
              className="pt-3 text-sm"
              style={{ color: "var(--ink-soft)" }}
              value="general"
            >
              Datos generales del puesto.
            </TabsContent>
            <TabsContent
              className="pt-3 text-sm"
              style={{ color: "var(--ink-soft)" }}
              value="acceso"
            >
              Quién puede entrar y con qué credencial.
            </TabsContent>
            <TabsContent
              className="pt-3 text-sm"
              style={{ color: "var(--ink-soft)" }}
              value="avisos"
            >
              A quién se avisa y por qué canal.
            </TabsContent>
          </Tabs>
        </Bloque>

        <Bloque
          api={["Breadcrumb", "Pagination"]}
          nota="Veintidós archivos repetían la fila de paginación a mano, incluida la cadena «Elementos por página», y otra área había inventado un paginador numerado en paralelo. El rango va en `tabular-nums`: sin ancho fijo de cifra, «9 – 18 de 240» baila al cambiar de página."
          titulo="Migas y paginación"
          uso="Las migas dicen dónde estás; la paginación recorre una lista larga."
        >
          <nav className="mb-5 flex flex-wrap items-center gap-1 text-sm">
            {["Clientes", "Corporación Andina", "Torre Norte"].map(
              (m, i, a) => (
                <span key={m} className="flex items-center gap-1">
                  <span
                    style={{
                      color:
                        i === a.length - 1 ? "var(--ink)" : "var(--ink-soft)",
                      fontWeight: i === a.length - 1 ? 600 : 500,
                    }}
                  >
                    {m}
                  </span>
                  {i < a.length - 1 && (
                    <ArrowRight
                      className="size-3"
                      style={{ color: "var(--ink-faint)" }}
                    />
                  )}
                </span>
              ),
            )}
          </nav>
          <div className="cg-eyebrow mb-2">
            Pie de tabla — con selector de tamaño
          </div>
          <Pagination
            page={pagina}
            pageSize={tamPagina}
            total={240}
            onPageChange={setPagina}
            onPageSizeChange={(n) => {
              setTamPagina(n);
              setPagina(1);
            }}
          />

          <div className="cg-eyebrow mb-2 mt-6">
            Numerada — cuando conviene saltar de página
          </div>
          <Pagination
            numbered
            noun="resultados"
            page={pagina}
            pageSize={tamPagina}
            total={240}
            onPageChange={setPagina}
          />

          <InfoNote className="mt-5" icon={<Info />} tone="neutral">
            Había DOS paginadores en el producto: uno con «Elementos por página»
            y anterior/siguiente (22 archivos) y otro numerado con «Mostrando X
            a Y de Z» (las pestañas de cliente). Ahora es uno solo:{" "}
            <code>numbered</code> saca los números y <code>noun</code> el
            sustantivo. La ventana de cinco números va centrada en la página
            actual — la versión anterior empezaba siempre por el 1, así que en
            la página 9 de 12 ofrecía saltar a la 1, 2, 3, 4 o 5 y a ninguna de
            las cercanas.
          </InfoNote>
        </Bloque>

        <Bloque
          api={["Stepper"]}
          nota="El paso activo va sobre el relleno del acento con tinta `--brand-ink`; los ya hechos, en el lavado. El conector se llena al completarse, que es lo que da la sensación de avance."
          titulo="Pasos"
          uso="Un asistente con principio y fin: alta guiada, configuración inicial, importación."
        >
          <Stepper
            current={paso}
            steps={[
              { label: "Datos" },
              { label: "Puestos" },
              { label: "Vigilantes" },
              { label: "Revisión" },
            ]}
            onStepClick={setPaso}
          />
          <div className="mt-5 flex gap-2">
            <Button
              disabled={paso === 0}
              size="sm"
              variant="outline"
              onClick={() => setPaso((p) => Math.max(0, p - 1))}
            >
              Atrás
            </Button>
            <Button
              disabled={paso === 3}
              size="sm"
              onClick={() => setPaso((p) => Math.min(3, p + 1))}
            >
              Siguiente
            </Button>
          </div>
        </Bloque>

        {/* ══════════════════════════════════════════════════════════════════
            7 · CAPAS
            ══════════════════════════════════════════════════════════════════ */}
        <Capitulo
          bajada="Lo que flota por encima de la página. De menos a más interrupción."
          numero="7"
          titulo="Capas"
        />

        <Bloque
          api={["Tooltip", "Popover", "DropdownMenu"]}
          nota="Un tooltip nunca puede llevar la única copia de una información importante: no existe en táctil ni para el teclado. Si el dato hace falta, va en la página."
          titulo="Pista y desplegables"
          uso="Tooltip para una aclaración de una línea; Popover para contenido; DropdownMenu para acciones."
        >
          <div className="flex flex-wrap items-center gap-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline">
                  <Info /> Pista
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Última señal recibida hace 4 minutos
              </TooltipContent>
            </Tooltip>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline">
                  <Filter /> Popover <ChevronDown />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72">
                <div className="cg-eyebrow mb-3">Filtrar por</div>
                <div className="space-y-3">
                  <FormField htmlFor="sg-pop-estado" label="Estado">
                    <Select defaultValue="todos">
                      <SelectTrigger id="sg-pop-estado">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos</SelectItem>
                        <SelectItem value="servicio">En servicio</SelectItem>
                        <SelectItem value="fuera">Fuera de servicio</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                  <Button className="w-full" size="sm">
                    Aplicar
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button aria-label="Más acciones" size="icon" variant="outline">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                <DropdownMenuItem>
                  <FileText /> Ver ficha
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Download /> Descargar parte
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <Trash2 /> Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </Bloque>

        <Bloque
          api={["Command", "CommandInput", "CommandItem"]}
          titulo="Paleta de comandos"
          uso="Saltar a cualquier sitio escribiendo. El atajo del CRM para quien ya sabe a dónde va."
        >
          <div className="glass-flat max-w-md overflow-hidden">
            <Command>
              <CommandInput placeholder="Escribe un puesto, un vigilante, una acción…" />
              <CommandList>
                <CommandEmpty>Sin resultados.</CommandEmpty>
                <CommandGroup heading="Ir a">
                  <CommandItem>
                    <MapPin /> Torre Norte — Acceso principal
                  </CommandItem>
                  <CommandItem>
                    <Users /> Vigilantes en servicio
                  </CommandItem>
                  <CommandItem>
                    <Video /> Cámaras del cliente
                  </CommandItem>
                </CommandGroup>
                <CommandGroup heading="Acciones">
                  <CommandItem>
                    <Plus /> Crear puesto
                  </CommandItem>
                  <CommandItem>
                    <Radio /> Pase de novedades
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          </div>
        </Bloque>

        <Bloque
          api={["Sheet", "Modal"]}
          nota="Los dos oscurecen y desenfocan lo de detrás con `.glass-scrim`. Si la respuesta es sí o no, es un diálogo; si hay que rellenar seis campos, es una hoja."
          titulo="Hoja lateral y diálogo"
          uso="La hoja para un formulario largo sin perder el contexto; el diálogo para una decisión corta."
        >
          <div className="flex flex-wrap items-center gap-3">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline">
                  <Filter /> Abrir hoja
                </Button>
              </SheetTrigger>
              <SheetContent className="w-[400px] sm:w-[460px]" side="right">
                <SheetHeader>
                  <SheetTitle>Filtros</SheetTitle>
                  <SheetDescription>
                    Acota la lista sin salir de la página.
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-6 space-y-5">
                  <FormField htmlFor="sg-sheet-cliente" label="Cliente">
                    <Select defaultValue="todos">
                      <SelectTrigger id="sg-sheet-cliente">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos</SelectItem>
                        <SelectItem value="andina">
                          Corporación Andina
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField htmlFor="sg-sheet-estado" label="Estado">
                    <Select defaultValue="todos">
                      <SelectTrigger id="sg-sheet-estado">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos</SelectItem>
                        <SelectItem value="activo">En servicio</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                  <Button className="w-full">Aplicar filtros</Button>
                  <Button className="w-full" variant="outline">
                    Limpiar filtros
                  </Button>
                </div>
              </SheetContent>
            </Sheet>

            <Button variant="outline" onClick={() => setAbierto(true)}>
              Abrir diálogo
            </Button>
          </div>

          <Modal
            description="El vigilante quedará asignado al puesto de destino durante el turno."
            footer={
              <>
                <Button variant="ghost" onClick={() => setAbierto(false)}>
                  Cancelar
                </Button>
                <Button onClick={() => setAbierto(false)}>
                  <Check /> Confirmar
                </Button>
              </>
            }
            icon={<Shield />}
            open={abierto}
            title="Confirmar traslado"
            onOpenChange={setAbierto}
          >
            <FadeIn className="space-y-3">
              <Field label="Desde" value="Torre Norte — Acceso principal" />
              <Field label="Hacia" value="Planta Sur — Garita 2" />
              <StatusBadge tone="warn">
                Deja el puesto de origen sin cubrir
              </StatusBadge>
            </FadeIn>
          </Modal>
        </Bloque>

        {/* ══════════════════════════════════════════════════════════════════
            8 · RETROALIMENTACIÓN
            ══════════════════════════════════════════════════════════════════ */}
        <Capitulo
          bajada="Decirle al usuario qué ha pasado, qué falta y qué está cargando."
          numero="8"
          titulo="Retroalimentación"
        />

        <Bloque
          api={["InfoNote", "Alert", "AlertTitle", "AlertDescription"]}
          nota="`InfoNote` sustituye a los `bg-yellow-50 border-yellow-300 text-yellow-800` con su gemelo `dark:` — que era escribir dos temas a mano por cada tono. Aquí el tono se pide por nombre y los dos temas salen solos."
          titulo="Avisos"
          uso="InfoNote va ligado a lo que tiene al lado; Alert encabeza una página o un panel entero."
        >
          <div className="space-y-3">
            <InfoNote icon={<Info />} tone="info">
              El turno de la noche todavía no tiene relevo asignado.
            </InfoNote>
            <InfoNote icon={<Check />} title="Ronda completa" tone="ok">
              Los ocho puntos se escanearon dentro de la ventana.
            </InfoNote>
            <InfoNote
              icon={<TriangleAlert />}
              title="Cobertura incompleta"
              tone="warn"
            >
              Faltan 2 vigilantes para cubrir el fin de semana.
            </InfoNote>
            <InfoNote
              icon={<AlertTriangle />}
              title="Botón de pánico"
              tone="bad"
            >
              Torre Norte — hace 40 segundos, sin confirmar.
            </InfoNote>
            <InfoNote icon={<ShieldCheck />} tone="brand">
              El acento configurado se aplica a toda la organización.
            </InfoNote>
            <InfoNote icon={<Info />} tone="neutral">
              Este puesto no ha tenido novedades en los últimos 30 días.
            </InfoNote>
          </div>

          <Separator className="my-5" />

          <div className="space-y-3">
            <Alert>
              <ShieldCheck />
              <AlertTitle>Cobertura al día</AlertTitle>
              <AlertDescription>
                Todos los puestos del turno actual tienen vigilante asignado.
              </AlertDescription>
            </Alert>
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertTitle>Puesto sin cubrir</AlertTitle>
              <AlertDescription>
                Planta Sur — Garita 2 lleva 25 minutos sin nadie asignado.
              </AlertDescription>
            </Alert>
          </div>
        </Bloque>

        <Bloque
          api={["toast()", "[data-sonner-toast]"]}
          nota="La caja es acromática en los cinco casos y el tono lo lleva SÓLO la placa del icono. Pintar el fondo entero de verde o rojo —lo que hacía `richColors`— tapaba el cristal y metía en pantalla un color que compite con el acento configurado. Los colores de estado son los fijos de tokens.css: un error sigue siendo rojo aunque el acento sea rojo."
          titulo="Avisos flotantes"
          uso="Confirman una acción que acaba de ocurrir. Pruébalos: aparecen arriba, se apilan y se descartan deslizando."
        >
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => toast.success("Turno guardado")}
            >
              Correcto
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => toast.error("No se pudo guardar el turno")}
            >
              Error
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => toast.warning("Este puesto queda sin cubrir")}
            >
              Atención
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => toast.info("El vigilante fichó entrada")}
            >
              Información
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => toast("Ronda registrada")}
            >
              Neutro
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                toast.success("Ronda completa", {
                  description:
                    "Los ocho puntos se escanearon dentro de la ventana prevista.",
                })
              }
            >
              Con detalle
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                toast.warning("Cobertura incompleta", {
                  description: "Faltan 2 vigilantes para el fin de semana.",
                  action: {
                    label: "Asignar",
                    onClick: () => toast.success("Asignado"),
                  },
                })
              }
            >
              Con acción
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                toast.promise(new Promise((r) => setTimeout(r, 1800)), {
                  loading: "Optimizando la ruta…",
                  success: "Ruta optimizada: 127,8 km menos",
                  error: "No se pudo optimizar",
                })
              }
            >
              En curso
            </Button>
          </div>
        </Bloque>

        <Bloque
          api={["StatusBadge", "DeltaPill", "Badge"]}
          nota="`StatusBadge` acepta los tonos heredados (`green`, `blue`, `red`, `orange`) y los remapea al semántico equivalente, así que decenas de páginas antiguas siguen funcionando sin pintar un color de Tailwind."
          titulo="Estado y variación"
          uso="StatusBadge nombra un estado; DeltaPill dice cuánto ha cambiado una cifra; Badge etiqueta."
        >
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="ok">En servicio</StatusBadge>
            <StatusBadge tone="warn">Por confirmar</StatusBadge>
            <StatusBadge tone="bad">Sin cubrir</StatusBadge>
            <StatusBadge tone="info">Programado</StatusBadge>
            <StatusBadge tone="brand">Destacado</StatusBadge>
            <StatusBadge tone="neutral">Archivado</StatusBadge>
            <StatusBadge dot={false} tone="ok">
              Sin punto
            </StatusBadge>
          </div>

          <Separator className="my-5" />

          <div className="cg-eyebrow mb-2">
            StatusDot — donde no cabe una etiqueta
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <span className="inline-flex items-center gap-2 text-xs">
              <StatusDot pulse label="Emitiendo" tone="ok" /> Emitiendo
            </span>
            <span className="inline-flex items-center gap-2 text-xs">
              <StatusDot label="Señal débil" tone="warn" /> Señal débil
            </span>
            <span className="inline-flex items-center gap-2 text-xs">
              <StatusDot label="Sin conexión" tone="bad" /> Sin conexión
            </span>
            <span className="inline-flex items-center gap-2 text-xs">
              <StatusDot label="Apagada" tone="neutral" /> Apagada
            </span>
            <div
              className="relative h-14 w-24 overflow-hidden rounded-lg"
              style={{ background: "var(--glass-sunken)" }}
            >
              <StatusDot
                pulse
                className="absolute right-1.5 top-1.5"
                label="Cámara en directo"
                tone="ok"
              />
              <span
                className="absolute bottom-1 left-1.5 text-[10px]"
                style={{ color: "var(--ink-faint)" }}
              >
                Cámara 3
              </span>
            </div>
          </div>
          <p
            className="mt-2 max-w-2xl text-xs"
            style={{ color: "var(--ink-faint)" }}
          >
            No es el punto de <code>StatusBadge</code>: aquel mide 6 px y
            siempre lleva texto al lado. El nombre del estado va en{" "}
            <code>label</code> — un color por sí solo no es información
            accesible. <code>pulse</code> sólo para lo que está vivo ahora
            mismo: un punto que late sin significar nada compite con las
            alarmas.
          </p>
          <Separator className="my-5" />

          <div className="cg-eyebrow mb-2">
            Variación — la flecha dice hacia dónde, el color si eso es bueno
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DeltaPill direction="up">12,4 %</DeltaPill>
            <DeltaPill direction="down">3,1 %</DeltaPill>
            <DeltaPill direction="flat">sin cambio</DeltaPill>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <DeltaPill direction="down" valence="good">
              incidentes −18 %
            </DeltaPill>
            <DeltaPill direction="up" valence="bad">
              incidentes +18 %
            </DeltaPill>
            <DeltaPill direction="up" valence="neutral">
              rotación +4 %
            </DeltaPill>
          </div>
          <InfoNote className="mt-4" icon={<TriangleAlert />} tone="warn">
            Por omisión el color va atado a la flecha: sube = verde, baja =
            rojo. Eso vale para cobertura y para cumplimiento, y es{" "}
            <strong>mentira</strong> para media consola de seguridad —
            «incidentes −18 %» es una flecha hacia abajo y una buena noticia.{" "}
            <code>valence</code> separa <em>hacia dónde se mueve</em> de{" "}
            <em>si eso es bueno</em>. Sin el prop, se comporta como siempre.
          </InfoNote>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge>Nuevo</Badge>
            <Badge variant="secondary">Borrador</Badge>
            <Badge variant="outline">Externo</Badge>
            <Badge variant="destructive">Vencido</Badge>
          </div>
        </Bloque>

        <Bloque
          api={["EmptyState", "SkeletonCards", "SkeletonBlock"]}
          nota="Los dos comparten familia a propósito: borde punteado y hueco `glass-sunken` el vacío, `glass-flat` el esqueleto — nunca `glass`, porque son N tarjetas dentro de un `map()` y el desenfoque se pagaría justo mientras la página aún está cargando."
          titulo="Vacío y carga"
          uso="EmptyState cuando no hay nada que enseñar; los esqueletos mientras se va a buscarlo."
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <div className="cg-eyebrow mb-2">Sin contenido</div>
              <EmptyState
                action={
                  <Button size="sm">
                    <Plus /> Crear puesto
                  </Button>
                }
                description="Los puestos que des de alta aparecerán aquí con su cobertura del día."
                icon={<MapPin />}
                title="Ningún puesto todavía"
              />
            </div>
            <div>
              <div className="cg-eyebrow mb-2">Cargando</div>
              <SkeletonCards count={2} />
              <div className="mt-4 space-y-2">
                <SkeletonBlock className="h-3 w-3/4" />
                <SkeletonBlock className="h-3 w-1/2" />
              </div>
            </div>
          </div>
        </Bloque>

        <Bloque
          api={["Meter"]}
          nota="Es un `role='progressbar'` de verdad: un lector de pantalla anuncia el valor en vez de leer dos divs vacíos. Seis áreas lo tenían escrito a mano, idéntico."
          titulo="Progreso"
          uso="Meter para una proporción dentro de una fila o una tarjeta."
        >
          <div className="grid max-w-xl gap-4">
            <Meter showValue label="Cumplimiento de rondas" value={87} />
            <Meter
              showValue
              label="Cobertura del turno"
              tone="warn"
              value={64}
            />
            <Meter showValue label="Puestos sin cubrir" tone="bad" value={12} />
            <Meter showValue label="Documentos al día" tone="ok" value={100} />
          </div>
        </Bloque>

        {/* ══════════════════════════════════════════════════════════════════
            9 · DATOS
            ══════════════════════════════════════════════════════════════════ */}
        <Capitulo
          bajada="Cifras, personas, listas y tablas. Lo que llena el CRM de verdad."
          numero="9"
          titulo="Datos"
        />

        <Bloque
          api={["StatCard", "MetricTile", "IconTile"]}
          titulo="Métricas"
          uso="StatCard para la rejilla compacta de cabecera; MetricTile cuando el número es el protagonista."
        >
          <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              hint="+12 desde ayer"
              icon={<Users />}
              label="Vigilantes en servicio"
              value="128"
            />
            <StatCard
              accent="warn"
              hint="2 sin cerrar"
              icon={<AlertTriangle />}
              label="Incidentes hoy"
              value="7"
            />
            <StatCard
              accent="ok"
              hint="de 35"
              icon={<MapPin />}
              label="Puestos cubiertos"
              value="35"
            />
            <StatCard
              accent="bad"
              hint="pase de novedades"
              icon={<Radio />}
              label="Sin responder"
              value="3"
            />
          </Stagger>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <MetricTile
              delta={{ value: "12,4 %", direction: "up" }}
              hint="Arranques en las próximas 24 h"
              icon={<Clock />}
              label="Próximos servicios"
              value="54"
            />
            <MetricTile
              delta={{ value: "2,1 %", direction: "down" }}
              hint="Últimos 7 días"
              icon={<Activity />}
              label="Cumplimiento de rondas"
              value="87 %"
            />
            <MetricTile
              delta={{ value: "sin cambio", direction: "flat" }}
              hint="Mediana del turno"
              icon={<Shield />}
              label="Tiempo de respuesta"
              value="4,2 min"
            />
          </div>

          <Separator className="my-5" />

          <div className="cg-eyebrow mb-3">Fichas de icono — IconTile</div>
          <div className="flex flex-wrap items-center gap-3">
            <IconTile tone="brand">
              <Shield />
            </IconTile>
            <IconTile tone="neutral">
              <Users />
            </IconTile>
            <IconTile tone="ok">
              <Check />
            </IconTile>
            <IconTile tone="warn">
              <Clock />
            </IconTile>
            <IconTile tone="bad">
              <AlertTriangle />
            </IconTile>
            <IconTile tone="info">
              <MapPin />
            </IconTile>
            <IconTile size="lg" tone="brand">
              <Radio />
            </IconTile>
            <IconTile size="sm" tone="neutral">
              <Bell />
            </IconTile>
          </div>
        </Bloque>

        <Bloque
          api={["Avatar", "initialsOf", "ListRow"]}
          nota="Las iniciales estaban resueltas de OCHO formas distintas por el CRM, cada una fallando con un caso de borde diferente. El fondo NO se deriva del nombre: un tono por persona mete color aleatorio en una superficie acromática y choca con la mitad de los acentos posibles."
          titulo="Personas y filas"
          uso="Avatar para el retrato; ListRow para la fila de una lista de personas o registros."
        >
          <div className="mb-5 flex flex-wrap items-end gap-3">
            <Muestra pie="sm · 36 px">
              <Avatar name="María Fernanda Rojas" size="sm" />
            </Muestra>
            <Muestra pie="md · 44 px">
              <Avatar name="María Fernanda Rojas" />
            </Muestra>
            <Muestra pie="lg · 56 px">
              <Avatar name="María Fernanda Rojas" size="lg" />
            </Muestra>
            <Muestra pie="tone=neutral">
              <Avatar name="Carlos Pérez" tone="neutral" />
            </Muestra>
            <Muestra
              pie={
                <>
                  tone=solid
                  <br />
                  el titular
                </>
              }
            >
              <Avatar name="Ana Vega" tone="solid" />
            </Muestra>
            <Muestra pie="icono">
              <Avatar icon={<Building2 />} tone="neutral" />
            </Muestra>
          </div>

          <InfoNote className="mb-5" icon={<Info />} tone="neutral">
            La escala es la MISMA que la de <code>IconTile</code> — 36 / 44 / 56
            px. Un retrato y una ficha de icono son el mismo objeto para la
            maquetación: si no miden igual, una fila que mezcle los dos queda
            escalonada.
          </InfoNote>

          <div
            className="glass-flat divide-y"
            style={{ borderColor: "var(--hairline)" }}
          >
            {[
              {
                n: "María Fernanda Rojas",
                p: "Torre Norte — Acceso principal",
                t: "ok" as const,
                e: "En servicio",
                m: "06:02",
              },
              {
                n: "Carlos Pérez",
                p: "Planta Sur — Garita 2",
                t: "warn" as const,
                e: "Por confirmar",
                m: "14:00",
              },
              {
                n: "Ana Lucía Vega",
                p: "Sin asignar",
                t: "neutral" as const,
                e: "Descanso",
                m: "—",
              },
            ].map((r) => (
              <ListRow
                key={r.n}
                actions={
                  <Button aria-label="Más" size="icon-sm" variant="ghost">
                    <MoreHorizontal />
                  </Button>
                }
                avatar={<Avatar name={r.n} size="sm" />}
                badges={<StatusBadge tone={r.t}>{r.e}</StatusBadge>}
                meta={r.m}
                subtitle={r.p}
                title={r.n}
              />
            ))}
          </div>
          <p className="mt-2 text-xs" style={{ color: "var(--ink-faint)" }}>
            Con <code>onClick</code> o <code>to</code>, la fila se vuelve
            pulsable y coge foco de teclado. Sólo cambia el fondo al pasar el
            puntero: una fila que se levanta 2 px hace saltar a las de al lado.
          </p>
        </Bloque>

        <Bloque
          api={["CatalogTile"]}
          nota="`glass-flat` y no `glass`: van en rejillas de ocho o diez, y el desenfoque por tarjeta se paga en cada fotograma."
          titulo="Catálogo"
          uso="La rejilla de destinos: Ajustes, Informes, Nómina."
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <CatalogTile
              description="Altas, documentos y asignaciones."
              icon={<Users />}
              title="Vigilantes"
              onClick={() => {}}
            />
            <CatalogTile
              description="Geocercos, consignas y cobertura."
              icon={<MapPin />}
              title="Puestos"
              onClick={() => {}}
            />
            <CatalogTile
              badge={
                <StatusBadge dot={false} tone="brand">
                  Nuevo
                </StatusBadge>
              }
              description="Relevos y comunicaciones del turno."
              icon={<Radio />}
              title="Pase de novedades"
              onClick={() => {}}
            />
            <CatalogTile
              description="Partes, rondas y asistencia."
              icon={<FileText />}
              title="Informes"
              tone="neutral"
              onClick={() => {}}
            />
            <CatalogTile
              description="Correo, WhatsApp y SMS."
              icon={<Mail />}
              title="Comunicaciones"
              tone="neutral"
              onClick={() => {}}
            />
            <CatalogTile
              description="Marca, roles y preferencias."
              icon={<Settings />}
              title="Ajustes"
              tone="neutral"
              onClick={() => {}}
            />
          </div>
        </Bloque>

        <Bloque
          api={["Field", "Table", "TableHead", "TableRow", "TableCell"]}
          nota="Las celdas heredan `tabular-nums slashed-zero` de globals.css: las horas y los importes quedan alineados en columna sin pedirlo."
          titulo="Ficha y tabla"
          uso="Field para el par etiqueta/dato de sólo lectura; Table para una lista con columnas."
        >
          <div className="mb-5 grid gap-4 sm:grid-cols-3">
            <Field label="Cliente" value="Corporación Andina" />
            <Field label="Turno" value="06:00 – 18:00" />
            <Field label="Supervisor" value="—" />
          </div>

          <div className="glass-flat overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vigilante</TableHead>
                  <TableHead>Puesto</TableHead>
                  <TableHead>Entrada</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Horas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  [
                    "María Fernanda Rojas",
                    "Torre Norte",
                    "06:02",
                    "ok",
                    "En servicio",
                    "11,9",
                  ],
                  [
                    "Carlos Pérez",
                    "Planta Sur",
                    "14:00",
                    "warn",
                    "Por confirmar",
                    "0,0",
                  ],
                  [
                    "Ana Lucía Vega",
                    "Acceso 3",
                    "22:05",
                    "ok",
                    "En servicio",
                    "7,8",
                  ],
                  ["Jorge Salas", "Garita 2", "—", "bad", "Sin cubrir", "0,0"],
                ].map((f) => (
                  <TableRow key={f[0]}>
                    <TableCell className="font-medium">{f[0]}</TableCell>
                    <TableCell style={{ color: "var(--ink-soft)" }}>
                      {f[1]}
                    </TableCell>
                    <TableCell className="tabular-nums">{f[2]}</TableCell>
                    <TableCell>
                      <StatusBadge tone={f[3]}>{f[4]}</StatusBadge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {f[5]}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Bloque>

        <Bloque
          api={[
            "Accordion",
            "AccordionItem",
            "AccordionTrigger",
            "AccordionContent",
          ]}
          nota="No se usa para esconder algo obligatorio. Si el usuario TIENE que rellenarlo, no puede estar plegado."
          titulo="Acordeón"
          uso="Contenido secundario que la mayoría no necesita ver: detalles técnicos, historial, ayuda."
        >
          <Accordion collapsible className="max-w-2xl" type="single">
            <AccordionItem value="a">
              <AccordionTrigger>
                ¿Qué pasa si el vigilante no marca salida?
              </AccordionTrigger>
              <AccordionContent>
                El turno queda abierto y a las dos horas del fin previsto se
                genera una novedad automática para el supervisor de zona.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="b">
              <AccordionTrigger>
                ¿Se puede marcar fuera del geocerco?
              </AccordionTrigger>
              <AccordionContent>
                Sólo si el puesto lo permite. Si no, la app bloquea el marcaje y
                ofrece avisar al supervisor.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="c">
              <AccordionTrigger>
                ¿Cada cuánto se actualiza la posición?
              </AccordionTrigger>
              <AccordionContent>
                Cada 60 segundos con la app en primer plano y cada 5 minutos en
                segundo plano.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </Bloque>

        {/* ══════════════════════════════════════════════════════════════════
            10 · GRÁFICOS
            ══════════════════════════════════════════════════════════════════ */}
        <Capitulo
          bajada="Seis formas. Elegir la forma va ANTES que elegir el color."
          numero="10"
          titulo="Gráficos"
        />

        <Bloque
          api={[
            "ProgressRing",
            "Donut",
            "Sparkline",
            "BarChart",
            "MeterBar",
            "AreaChart",
          ]}
          nota="Ninguno escribe un color a mano: todos salen de `--chart-1..5`, que derivan del acento. Cambia el tono arriba y se repintan los seis. Un anillo no compara categorías y unas barras no enseñan la evolución de una sola cifra — la forma es la decisión, el color viene después."
          titulo="Las seis formas"
          uso="Anillo para un valor contra su máximo; rosco para un reparto; línea para una tendencia; barras para comparar; medidor para una sola proporción; área para una serie temporal."
        >
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <Muestra
              pie={
                <>
                  <code>ProgressRing</code>
                  <br />
                  Un valor contra su máximo
                </>
              }
            >
              <ProgressRing
                caption="Rondas"
                centerLabel="87 %"
                max={100}
                size={104}
                value={87}
              />
            </Muestra>

            <Muestra
              pie={
                <>
                  <code>Donut</code>
                  <br />
                  Un total repartido en trozos
                </>
              }
            >
              <Donut
                centerBottom="turnos"
                centerTop="92"
                segments={[
                  { value: 62, label: "En servicio", tone: "brand" },
                  { value: 21, label: "Descanso", tone: "neutral" },
                  { value: 9, label: "Ausencia", tone: "warn" },
                ]}
                size={104}
              />
            </Muestra>

            <Muestra
              pie={
                <>
                  <code>Sparkline</code>
                  <br />
                  La forma de una tendencia
                </>
              }
            >
              <div className="w-full px-2">
                <Sparkline
                  area
                  data={[12, 18, 14, 22, 19, 28, 24, 31, 27, 34]}
                  height={56}
                />
              </div>
            </Muestra>

            <Muestra
              className="sm:col-span-2 lg:col-span-1"
              pie={
                <>
                  <code>MeterBar</code>
                  <br />
                  Una proporción contra su canal
                </>
              }
            >
              <div className="w-full space-y-2.5 px-2">
                <MeterBar pct={78} />
                <MeterBar pct={45} series={1} />
                <MeterBar pct={22} series={2} />
              </div>
            </Muestra>

            <Muestra
              className="sm:col-span-2"
              pie={
                <>
                  <code>BarChart</code>
                  <br />
                  Categorías comparadas
                </>
              }
            >
              <div className="w-full px-1">
                <BarChart
                  data={[
                    { label: "Lun", value: 18 },
                    { label: "Mar", value: 24 },
                    { label: "Mié", value: 21 },
                    { label: "Jue", value: 30 },
                    { label: "Vie", value: 27 },
                    { label: "Sáb", value: 12 },
                    { label: "Dom", value: 9 },
                  ]}
                  height={120}
                />
              </div>
            </Muestra>
          </div>

          <div className="mt-6">
            <div className="cg-eyebrow mb-2">
              Barras con tono propio — cuando la categoría SIGNIFICA algo
            </div>
            <div className="glass-flat p-4">
              <BarChart
                data={[
                  { label: "P1 — Crítica", value: 4, tone: "bad" },
                  { label: "P2 — Alta", value: 11, tone: "bad" },
                  { label: "P3 — Media", value: 26, tone: "warn" },
                  { label: "P4 — Baja", value: 38, tone: "info" },
                  { label: "P5 — Informativa", value: 52, tone: "neutral" },
                ]}
                height={120}
              />
            </div>
            <InfoNote className="mt-3" icon={<AlertTriangle />} tone="bad">
              Un «por prioridad» con todas las barras del mismo color hace que{" "}
              <strong>P1 parezca P5</strong>. Y un pánico pintado con el acento
              configurable puede salir en dorado con la píldora de al lado
              diciendo «Crítica» en rojo. La severidad es un DATO: se dice con{" "}
              <code>tone</code> por barra y con los semánticos fijos, que no
              cambian aunque el usuario elija otro acento.
            </InfoNote>
          </div>

          <div className="mt-6">
            <div className="cg-eyebrow mb-2">
              AreaChart — serie temporal con cruceta y globo de datos
            </div>
            <div className="glass-flat p-4">
              <AreaChart
                data={Array.from({ length: 24 }).map((_, i) => ({
                  label: `${String(i).padStart(2, "0")}:00`,
                  value: Math.round(40 + 30 * Math.sin(i / 3) + (i % 5) * 4),
                }))}
                formatValue={(v) => `${v} vig.`}
                height={180}
              />
            </div>
          </div>
        </Bloque>

        {/* ══════════════════════════════════════════════════════════════════
            11 · MOVIMIENTO
            ══════════════════════════════════════════════════════════════════ */}
        <Capitulo
          bajada="Entradas, énfasis y espera. Todo se apaga solo con «reducir movimiento» activado en el sistema."
          numero="11"
          titulo="Movimiento"
        />

        <Bloque
          api={[
            "FadeIn",
            "Stagger",
            ".animate-fade-up",
            ".cc-rise",
            ".cg-stagger",
          ]}
          nota="Todas las entradas viven dentro de `@media (prefers-reduced-motion: no-preference)`: quien pide movimiento reducido ve el contenido colocado, no una versión más lenta. Los velos además apagan el desenfoque, que es justo lo que marea a quien activa esa preferencia."
          titulo="Animaciones"
          uso="Pulsa «Repetir» para verlas otra vez. Debajo de cada una, la clase o el componente con el que se aplica."
        >
          <Button
            className="mb-4"
            size="sm"
            variant="outline"
            onClick={() => setRepeticion((r) => r + 1)}
          >
            <RotateCw /> Repetir
          </Button>

          <div
            key={repeticion}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <div>
              <FadeIn className="glass-flat p-4 text-xs font-semibold">
                Entra desvaneciendo y subiendo
              </FadeIn>
              <div className="mt-1.5 text-center">
                <Api>FadeIn</Api>
              </div>
            </div>
            <div>
              <div className="animate-fade-up glass-flat p-4 text-xs font-semibold">
                Lo mismo, en CSS
              </div>
              <div className="mt-1.5 text-center">
                <Api tipo="clase">.animate-fade-up</Api>
              </div>
            </div>
            <div>
              <div className="animate-scale-in glass-flat p-4 text-xs font-semibold">
                Crece desde el 96 %
              </div>
              <div className="mt-1.5 text-center">
                <Api tipo="clase">.animate-scale-in</Api>
              </div>
            </div>
            <div>
              <div className="animate-slide-left glass-flat p-4 text-xs font-semibold">
                Entra desde la derecha
              </div>
              <div className="mt-1.5 text-center">
                <Api tipo="clase">.animate-slide-left</Api>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <div className="cg-eyebrow mb-2">
              Secuencia — los hijos entran uno detrás de otro
            </div>
            <Stagger
              key={`s-${repeticion}`}
              className="grid gap-3 sm:grid-cols-4"
            >
              {["Uno", "Dos", "Tres", "Cuatro"].map((n) => (
                <div key={n} className="glass-flat p-4 text-xs font-semibold">
                  {n}
                </div>
              ))}
            </Stagger>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Api>Stagger</Api>
              <Api tipo="clase">.cg-stagger</Api>
            </div>
          </div>

          <Separator className="my-6" />

          <div className="cg-eyebrow mb-3">
            Movimiento continuo — señala, no decora
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Muestra
              pie={
                <>
                  <code>.cc-dot</code>
                  <br />
                  Latido de «en directo»
                </>
              }
            >
              <span className="cc-dot" style={{ background: "var(--ok)" }} />
            </Muestra>
            <Muestra
              pie={
                <>
                  <code>.animate-pulse-ring</code>
                  <br />
                  Reclama atención
                </>
              }
            >
              <span
                className="animate-pulse-ring inline-flex h-9 items-center rounded-full px-3 text-xs font-semibold"
                style={{
                  background: "var(--brand-wash)",
                  color: "var(--brand-text)",
                }}
              >
                Pánico
              </span>
            </Muestra>
            <Muestra
              pie={
                <>
                  <code>.cg-skeleton</code>
                  <br />
                  Barrido de carga
                </>
              }
            >
              <div className="w-full space-y-2">
                <SkeletonBlock className="h-3 w-full" />
                <SkeletonBlock className="h-3 w-2/3" />
              </div>
            </Muestra>
            <Muestra
              pie={
                <>
                  <code>.animate-spin</code>
                  <br />
                  Espera indeterminada
                </>
              }
            >
              <RotateCw
                className="size-6 animate-spin motion-reduce:animate-none"
                style={{ color: "var(--brand-text)" }}
              />
            </Muestra>
          </div>

          <InfoNote className="mt-5" icon={<Info />} tone="neutral">
            Prueba a activar «Reducir movimiento» en las preferencias del
            sistema y vuelve a cargar: las entradas desaparecen, el latido se
            para, el barrido del esqueleto se detiene y los velos dejan de
            desenfocar. Sin tocar una línea del componente.
          </InfoNote>
        </Bloque>

        <div
          className="pt-4 text-center text-xs"
          style={{ color: "var(--ink-faint)" }}
        >
          Si necesitas algo que no está aquí, se añade aquí primero y luego se
          usa.
        </div>
      </PageContainer>
    </TooltipProvider>
  );
}
