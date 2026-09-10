import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Bell,
  Moon,
  Sun,
  ShieldCheck,
  AlertTriangle,
  Footprints,
  Building2,
  Home,
  ShieldAlert,
  User2,
  ChevronRight,
  ChevronLeft,
  Camera,
  Siren,
  KeyRound,
  Truck,
  UserCheck,
  Cpu,
  PhoneCall,
  Eye,
  Lock,
  Radio,
  Dog,
  Flame,
  Search,
  Fingerprint,
  Package,
  Banknote,
  Landmark,
  Factory,
  HardHat,
  Users,
  Ticket,
  Navigation,
  DoorOpen,
  HeartPulse,
  ScanLine,
  Briefcase,
  Gauge,
  ClipboardCheck,
  Car,
  Crosshair,
  Plane,
  Warehouse,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { Segmented } from "@/components/kit";

/** Named icons templated services can pass to the app (no upload needed). */
export const SERVICE_ICONS: Record<string, LucideIcon> = {
  // core
  shield: ShieldCheck,
  guard: User2,
  cctv: Camera,
  alarm: Siren,
  panic: Siren,
  patrol: Footprints,
  access: KeyRound,
  escort: UserCheck,
  electronic: Cpu,
  response: PhoneCall,
  monitoring: Eye,
  lock: Lock,
  radio: Radio,
  k9: Dog,
  fire: Flame,
  // industry-specific
  investigation: Search,
  fingerprint: Fingerprint,
  verification: ClipboardCheck,
  custody: Package,
  valuables: Truck,
  cash: Banknote,
  warehouse: Warehouse,
  bank: Landmark,
  industrial: Factory,
  construction: HardHat,
  residential: Home,
  events: Ticket,
  crowd: Users,
  gps: Navigation,
  vehicle: Car,
  drone: Plane,
  reception: DoorOpen,
  firstaid: HeartPulse,
  scanner: ScanLine,
  advisory: Briefcase,
  risk: Gauge,
  cyber: ShieldAlert,
  tactical: Crosshair,
  maintenance: Wrench,
};
export function serviceIcon(name?: string | null): LucideIcon {
  return (name && SERVICE_ICONS[name]) || ShieldCheck;
}

export interface PreviewBanner {
  title?: string;
  description?: string;
  image?: string | null;
}
export interface PreviewService {
  title?: string;
  description?: string;
  image?: string | null;
  iconName?: string | null;
}
export interface PreviewCertification {
  title?: string;
  description?: string;
  image?: string | null;
}

/**
 * Live phone preview of the Mi Seguridad (customer) app home — greeting, PROTECTED
 * card, stat tiles, the configurable BANNER carousel, the SERVICES and CERTIFICATIONS
 * horizontal collections (≈2.5 cards per view, arrow-paginated like the app), recent
 * activity and a sticky bottom nav. Everything configured on the page renders here.
 */
export default function CustomerAppPreview({
  banners,
  services,
  certifications,
}: {
  banners: PreviewBanner[];
  services: PreviewService[];
  certifications: PreviewCertification[];
}) {
  /* OJO: los colores de DENTRO de la pantalla (el objeto `t` de abajo) son los de
     la app Mi Seguridad, NO los del CRM. La app tiene su propio tema oscuro/claro
     y su propio acento; si aquí usáramos los tokens del panel, la vista previa
     mentiría sobre lo que verá el cliente. El chasis del teléfono y los controles
     de alrededor sí van con el sistema de cristal. */
  const { t: tr } = useTranslation();
  const [dark, setDark] = useState(true);
  const [slide, setSlide] = useState(0);
  const bannerItems = banners.length
    ? banners
    : [
        {
          title: tr(
            "settings.mobil.preview.bannerPlaceholderTitle",
            "Tu banner aquí",
          ),
          description: tr(
            "settings.mobil.preview.bannerPlaceholderDesc",
            "Agrega un banner para promocionar tus servicios.",
          ),
          image: null,
        },
      ];
  const active = bannerItems[Math.min(slide, bannerItems.length - 1)];

  const t = dark
    ? {
        screen: "bg-[#0a0a0b] text-white",
        sub: "text-white/55",
        card: "bg-white/[0.04] border-white/10",
        tile: "bg-white/[0.04] border-white/10",
        nav: "bg-[#141416] border-white/10",
        navActive: "bg-white/10 text-white",
        navIdle: "text-white/50",
        chip: "bg-white/[0.05] border-white/10",
        iconWrap: "bg-blue-500/15 text-blue-400",
        bannerFallback: "from-blue-600 to-indigo-700",
        activity: "bg-white/[0.03] border-white/[0.07]",
        arrow: "bg-white/10 text-white",
      }
    : {
        screen: "bg-[#f4f7fb] text-slate-900",
        sub: "text-slate-500",
        card: "bg-white border-slate-200 shadow-sm",
        tile: "bg-white border-slate-200 shadow-sm",
        nav: "bg-white border-slate-200",
        navActive: "bg-blue-600 text-white",
        navIdle: "text-slate-400",
        chip: "bg-white border-slate-200 shadow-sm",
        iconWrap: "bg-blue-50 text-blue-600",
        bannerFallback: "from-blue-500 to-blue-700",
        activity: "bg-white border-slate-200 shadow-sm",
        arrow: "bg-blue-600 text-white",
      };

  return (
    <div className="flex flex-col items-center gap-3">
      <Segmented
        options={[
          {
            value: "dark",
            label: (
              <span className="inline-flex items-center gap-1">
                <Moon className="size-3.5" /> Oscuro
              </span>
            ),
          },
          {
            value: "light",
            label: (
              <span className="inline-flex items-center gap-1">
                <Sun className="size-3.5" /> Claro
              </span>
            ),
          },
        ]}
        value={dark ? "dark" : "light"}
        onChange={(v) => setDark(v === "dark")}
      />

      <div
        className="relative w-[300px] rounded-[2.6rem] border-[11px]"
        style={{
          background: "oklch(0.18 0 0)",
          borderColor: "oklch(0.18 0 0)",
          boxShadow: "var(--lift-4)",
        }}
      >
        <div
          className="absolute left-1/2 top-0 z-20 h-6 w-32 -translate-x-1/2 rounded-b-2xl"
          style={{ background: "oklch(0.18 0 0)" }}
        />
        {/* flex column: scrollable content + sticky bottom nav */}
        <div className={`flex h-[600px] flex-col rounded-[1.7rem] ${t.screen}`}>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex items-center justify-between px-5 pt-3 text-[11px] font-medium">
              <span>00:14</span>
              <span className="opacity-70">▪▪▪ ▾ 6</span>
            </div>
            <div className="space-y-4 px-4 pb-4 pt-3">
              {/* greeting */}
              <div className="flex items-center justify-between">
                <div>
                  <div className={`text-xs ${t.sub}`}>Good evening 🌙</div>
                  <div className="text-lg font-bold leading-tight">
                    Michael Urresta
                  </div>
                </div>
                <div className="relative">
                  <span
                    className={`grid size-9 place-items-center rounded-full border ${t.card}`}
                  >
                    <Bell className="size-4" />
                  </span>
                  <span className="absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                    3
                  </span>
                </div>
              </div>

              {/* PROTECTED */}
              <div className={`rounded-2xl border p-4 ${t.card}`}>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-500">
                    <span className="size-2 rounded-full bg-emerald-500" />{" "}
                    Protected
                  </span>
                  <ShieldCheck className="size-5 text-emerald-500" />
                </div>
                <div className="mt-2 text-[15px] font-bold leading-snug">
                  Innovation Grounds · Puerta principal
                </div>
                <div className={`mt-0.5 text-xs ${t.sub}`}>1 guard on duty</div>
              </div>

              {/* stats */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { icon: <User2 className="size-4" />, n: "1", l: "On duty" },
                  {
                    icon: <AlertTriangle className="size-4" />,
                    n: "7",
                    l: "Incidents",
                  },
                  {
                    icon: <Footprints className="size-4" />,
                    n: "0",
                    l: "Patrols",
                  },
                  {
                    icon: <Building2 className="size-4" />,
                    n: "1",
                    l: "Sites",
                  },
                ].map((s, i) => (
                  <div
                    key={i}
                    className={`flex flex-col items-center gap-1 rounded-xl border py-2.5 ${t.tile}`}
                  >
                    <span className={dark ? "text-white/60" : "text-blue-600"}>
                      {s.icon}
                    </span>
                    <span className="text-sm font-bold">{s.n}</span>
                    <span className={`text-[9px] ${t.sub}`}>{s.l}</span>
                  </div>
                ))}
              </div>

              {/* BANNER carousel */}
              <div>
                <div className="relative overflow-hidden rounded-2xl">
                  {active.image ? (
                    <div className="relative h-32 w-full">
                      <img
                        alt={active.title || "Banner"}
                        className="h-full w-full object-cover"
                        src={active.image}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                      <div className="absolute inset-x-0 bottom-0 p-3 text-white">
                        <div className="text-sm font-bold leading-tight">
                          {active.title || "Banner"}
                        </div>
                        {active.description && (
                          <div className="mt-0.5 line-clamp-2 text-[10px] opacity-85">
                            {active.description}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`flex h-32 w-full flex-col justify-end bg-gradient-to-br ${t.bannerFallback} p-3 text-white`}
                    >
                      <div className="text-sm font-bold leading-tight">
                        {active.title || "Banner"}
                      </div>
                      {active.description && (
                        <div className="mt-0.5 line-clamp-2 text-[10px] opacity-90">
                          {active.description}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {bannerItems.length > 1 && (
                  <div className="mt-2 flex justify-center gap-1.5">
                    {bannerItems.map((_, i) => (
                      <button
                        key={i}
                        className={`h-1.5 rounded-full transition-all ${i === slide ? "w-4 bg-primary" : `w-1.5 ${dark ? "bg-white/25" : "bg-slate-300"}`}`}
                        onClick={() => setSlide(i)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* SERVICES — horizontal collection ≈2.5 per view */}
              {services.length > 0 && (
                <HCollection
                  arrow={t.arrow}
                  sub={t.sub}
                  title="Nuestros servicios"
                >
                  {services.map((s, i) => (
                    <div
                      key={i}
                      className={`w-[40%] shrink-0 snap-start overflow-hidden rounded-xl border ${t.chip}`}
                    >
                      {s.image ? (
                        <img
                          alt={s.title || "Servicio"}
                          className="h-16 w-full object-cover"
                          src={s.image}
                        />
                      ) : (
                        <div
                          className={`flex h-16 items-center justify-center ${t.iconWrap}`}
                        >
                          {(() => {
                            const Ic = serviceIcon(s.iconName);

                            return <Ic className="size-6" />;
                          })()}
                        </div>
                      )}
                      <div className="p-2">
                        <div className="flex items-center gap-1.5">
                          {s.image &&
                            (() => {
                              const Ic = serviceIcon(s.iconName);

                              return (
                                <Ic
                                  className={`size-3.5 ${dark ? "text-blue-400" : "text-blue-600"}`}
                                />
                              );
                            })()}
                          <div className="truncate text-[11px] font-semibold">
                            {s.title || "Servicio"}
                          </div>
                        </div>
                        {s.description && (
                          <div
                            className={`mt-0.5 line-clamp-2 text-[9px] ${t.sub}`}
                          >
                            {s.description}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </HCollection>
              )}

              {/* CERTIFICATIONS — horizontal collection ≈2.5 per view */}
              {certifications.length > 0 && (
                <HCollection
                  arrow={t.arrow}
                  sub={t.sub}
                  title="Certificaciones"
                >
                  {certifications.map((c, i) => (
                    <div
                      key={i}
                      className={`w-[40%] shrink-0 snap-start overflow-hidden rounded-xl border ${t.chip}`}
                    >
                      {c.image ? (
                        <img
                          alt={
                            c.title ||
                            tr(
                              "settings.mobil.preview.certification",
                              "Certificación",
                            )
                          }
                          className="h-20 w-full object-contain bg-white p-1"
                          src={c.image}
                        />
                      ) : (
                        <div
                          className={`flex h-20 items-center justify-center ${t.iconWrap}`}
                        >
                          <ShieldCheck className="size-6" />
                        </div>
                      )}
                      <div className="p-2">
                        <div className="truncate text-[11px] font-semibold">
                          {c.title ||
                            tr(
                              "settings.mobil.preview.certification",
                              "Certificación",
                            )}
                        </div>
                        {c.description && (
                          <div
                            className={`mt-0.5 line-clamp-2 text-[9px] ${t.sub}`}
                          >
                            {c.description}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </HCollection>
              )}

              {/* recent activity */}
              <div>
                <div
                  className={`mb-2 text-[10px] font-semibold uppercase tracking-wider ${t.sub}`}
                >
                  Recent activity
                </div>
                <div className="space-y-2">
                  {[1, 2].map((i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-2.5 rounded-xl border p-2.5 ${t.activity}`}
                    >
                      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-red-500/15 text-red-500">
                        <ShieldAlert className="size-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[11px] font-medium">
                          SOS — Solicitud de emergencia
                        </div>
                        <div className={`text-[9px] ${t.sub}`}>
                          28 jun, 22:38
                        </div>
                      </div>
                      <ChevronRight className={`size-4 ${t.sub}`} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* sticky bottom nav (outside the scroll area) */}
          <div
            className={`flex shrink-0 items-center justify-around border-t px-2 py-2 ${t.nav}`}
          >
            {[
              { icon: <Home className="size-4" />, l: "Inicio", active: true },
              {
                icon: <ShieldCheck className="size-4" />,
                l: "Mi Seguridad",
                active: false,
              },
              {
                icon: <User2 className="size-4" />,
                l: "Mi Cuenta",
                active: false,
              },
            ].map((n, i) => (
              <span
                key={i}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-medium ${n.active ? t.navActive : t.navIdle}`}
              >
                {n.icon} {n.l}
              </span>
            ))}
          </div>
        </div>
      </div>
      <p className="text-center text-xs" style={{ color: "var(--ink-faint)" }}>
        Vista previa · app Mi Seguridad (cliente)
      </p>
    </div>
  );
}

/** Horizontal, snap-scrolling collection (~2.5 cards/view) with arrow pagination. */
function HCollection({
  title,
  sub,
  arrow,
  children,
}: {
  title: string;
  sub: string;
  arrow: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const page = (dir: number) =>
    ref.current?.scrollBy({
      left: dir * (ref.current.clientWidth * 0.8),
      behavior: "smooth",
    });

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <div
          className={`text-[10px] font-semibold uppercase tracking-wider ${sub}`}
        >
          {title}
        </div>
        <div className="flex gap-1">
          <button
            aria-label="Anterior"
            className={`grid size-5 place-items-center rounded-full ${arrow}`}
            onClick={() => page(-1)}
          >
            <ChevronLeft className="size-3" />
          </button>
          <button
            aria-label="Siguiente"
            className={`grid size-5 place-items-center rounded-full ${arrow}`}
            onClick={() => page(1)}
          >
            <ChevronRight className="size-3" />
          </button>
        </div>
      </div>
      <div
        ref={ref}
        className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
    </div>
  );
}
