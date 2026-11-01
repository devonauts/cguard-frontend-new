/**
 * ════════════════════════════════════════════════════════════════════════════
 * «APP DE ESCRITORIO» — the page every office user of the company can open to
 * get the desktop program (owner, 2026-10-31: «una página exclusiva dentro de
 * cguardpro que permita a los tenants descargar la app en su computadora»;
 * look: «como Apple, liquid glass y glassmorphism en todo» → `vidrio.css`).
 *
 *   · Hero: the installer for THIS computer (macOS chip detected when the
 *     browser tells), the others as secondary options (Windows «coming soon» only while no installer is published)
 *     until a signed installer is published.
 *   · The 3 steps, following the person's real state: a request waiting for
 *     approval shows its pairing code on step 3 (and «approve now» to admins).
 *   · «Mis computadoras», requirements, the security note and a short FAQ.
 *
 * Downloads are links the server signs for 10 minutes (`POST
 * /desktop/downloads/link`); the page never holds an installer URL of its own.
 * Not offered on a partner's host: the program carries the platform's name.
 * ════════════════════════════════════════════════════════════════════════════
 */
import type { TFunction } from "i18next";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  Download,
  HardDrive,
  Hourglass,
  KeyRound,
  Laptop,
  LockKeyhole,
  LogIn,
  Monitor,
  MonitorCheck,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wifi,
} from "lucide-react";

import {
  clasificarFallo,
  elegirDescarga,
  estadoDelAsistente,
  sinDescargas,
  type EstadoDePaso,
  type FalloDeDescargas,
} from "./computadoras";
import {
  CodigoDeEmparejamiento,
  TarjetaDeComputadora,
} from "./TarjetaDeComputadora";
import { useComputadoras, type Computadoras } from "./useComputadoras";
import {
  AvisoDeVidrio,
  FondoDeColor,
  SeccionDeVidrio,
  TarjetaDeVidrio,
  VentanaDeMuestra,
} from "./vidrio";

import AppLayout from "@/layouts/app-layout";
import { FadeIn, PageContainer, SkeletonBlock } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { useWhiteLabel } from "@/contexts/WhiteLabelContext";
import { desktopService, type DesktopDownload } from "@/lib/api/desktopService";
import { isDesktop } from "@/lib/desktop";
import {
  detectarEquipo,
  tamanoLegible,
  type ChipDelMac,
  type SistemaDelEquipo,
} from "@/lib/sistemaDelEquipo";
import { cn } from "@/lib/utils";

type EstadoDescargas =
  | { fase: "cargando" }
  | { fase: "fallo"; motivo: FalloDeDescargas }
  | { fase: "lista"; descargas: DesktopDownload[] };

const claveDe = (d: Pick<DesktopDownload, "platform" | "arch">) =>
  `${d.platform}/${d.arch}`;

function nombreDe(
  d: Pick<DesktopDownload, "platform" | "arch">,
  t: TFunction,
): string {
  if (d.platform === "win32") return t("desktopApp.download.windows");

  return d.arch === "arm64"
    ? t("desktopApp.download.macAppleSilicon")
    : t("desktopApp.download.macIntel");
}

/* ── One installer ────────────────────────────────────────────────────────── */
function BotonPrincipal({
  d,
  ocupada,
  onDescargar,
  secundario = false,
}: {
  d: DesktopDownload;
  ocupada: boolean;
  onDescargar: (d: DesktopDownload) => void;
  secundario?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const tamano = tamanoLegible(d.size, i18n.language);
  const detalle = d.available
    ? [
        d.version
          ? t("desktopApp.download.version", { version: d.version })
          : null,
        tamano,
      ]
        .filter(Boolean)
        .join(" · ")
    : t("desktopApp.download.comingSoonHint");

  return (
    <div className="flex flex-col items-stretch gap-1.5 sm:items-start">
      <Button
        className={cn(
          "lg-btn lg-btn-big",
          secundario ? "lg-btn-glass" : "lg-btn-primary",
        )}
        disabled={!d.available || ocupada}
        type="button"
        onClick={() => onDescargar(d)}
      >
        {ocupada ? (
          <RefreshCw className="animate-spin motion-reduce:animate-none" />
        ) : (
          <Download />
        )}
        {d.available
          ? t("desktopApp.download.downloadFor", { sistema: nombreDe(d, t) })
          : t("desktopApp.download.comingSoonFor", {
              sistema: nombreDe(d, t),
            })}
      </Button>
      <span
        className="px-1 text-center text-xs sm:text-left"
        style={{ color: "var(--ink-soft)" }}
      >
        {detalle}
      </span>
    </div>
  );
}

function OtraOpcion({
  d,
  ocupada,
  onDescargar,
}: {
  d: DesktopDownload;
  ocupada: boolean;
  onDescargar: (d: DesktopDownload) => void;
}) {
  const { t, i18n } = useTranslation();
  const Icono = d.platform === "win32" ? Monitor : Laptop;
  const tamano = tamanoLegible(d.size, i18n.language);
  const detalle = d.available
    ? [
        d.version
          ? t("desktopApp.download.version", { version: d.version })
          : null,
        tamano,
      ]
        .filter(Boolean)
        .join(" · ")
    : t("desktopApp.download.comingSoonHint");

  return (
    <div className="lg-row flex items-center gap-3 p-3.5">
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
        style={{ background: "var(--brand-wash)", color: "var(--brand-text)" }}
      >
        <Icono className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{nombreDe(d, t)}</div>
        <div className="truncate text-xs" style={{ color: "var(--ink-soft)" }}>
          {detalle}
        </div>
      </div>
      {d.available ? (
        <Button
          aria-label={t("desktopApp.download.downloadFor", {
            sistema: nombreDe(d, t),
          })}
          className="lg-btn lg-btn-glass"
          disabled={ocupada}
          size="sm"
          type="button"
          onClick={() => onDescargar(d)}
        >
          {ocupada ? (
            <RefreshCw className="animate-spin motion-reduce:animate-none" />
          ) : (
            <Download />
          )}
          {t("desktopApp.download.download")}
        </Button>
      ) : (
        <span
          className="lg-row shrink-0 px-3 py-1 text-xs font-semibold"
          style={{ color: "var(--ink-soft)" }}
        >
          {t("desktopApp.download.comingSoon")}
        </span>
      )}
    </div>
  );
}

/* ── The 3 steps ─────────────────────────────────────────────────────────── */
function Paso({
  n,
  estado,
  icono,
  titulo,
  texto,
  children,
}: {
  n: number;
  estado: EstadoDePaso;
  icono: ReactNode;
  titulo: string;
  texto: string;
  children?: ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <li
      aria-current={estado === "actual" ? "step" : undefined}
      className={cn(
        "lg-card flex flex-col gap-4 p-5",
        estado === "actual" && "lg-step-actual",
        estado === "pendiente" && "opacity-75",
      )}
    >
      <div className="flex items-center justify-between">
        <span className={`lg-dot lg-dot-${estado}`}>
          {estado === "hecho" ? <Check className="h-4 w-4" /> : n}
        </span>
        <span
          className="[&_svg]:size-5"
          style={{
            color:
              estado === "actual" ? "var(--brand-text)" : "var(--ink-faint)",
          }}
        >
          {icono}
        </span>
        <span className="sr-only">{t(`desktopApp.steps.state.${estado}`)}</span>
      </div>
      <div>
        <h3 className="text-[15px] font-semibold leading-snug">{titulo}</h3>
        <p
          className="mt-1.5 text-[13px] leading-relaxed"
          style={{ color: "var(--ink-soft)" }}
        >
          {texto}
        </p>
      </div>
      {children}
    </li>
  );
}

export default function EscritorioPage() {
  const { t } = useTranslation();
  const { puedeUsarArteDePlataforma } = useWhiteLabel();
  const c = useComputadoras();
  const enEscritorio = isDesktop();
  const [equipo, setEquipo] = useState<{
    sistema: SistemaDelEquipo;
    chip: ChipDelMac;
  } | null>(null);
  const [estado, setEstado] = useState<EstadoDescargas>({ fase: "cargando" });
  const [descargando, setDescargando] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vivo = true;

    void detectarEquipo().then(
      (e) => vivo && setEquipo(e),
      () => vivo && setEquipo({ sistema: "otro", chip: null }),
    );

    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    if (!puedeUsarArteDePlataforma || enEscritorio) return;
    let vivo = true;

    setEstado({ fase: "cargando" });
    desktopService.downloads().then(
      (descargas) => vivo && setEstado({ fase: "lista", descargas }),
      (e: any) =>
        vivo &&
        setEstado({
          fase: "fallo",
          motivo: clasificarFallo(
            e?.status,
            e?.data?.code ?? e?.data?.messageCode,
          ),
        }),
    );

    return () => {
      vivo = false;
    };
  }, [puedeUsarArteDePlataforma, enEscritorio, intento]);

  const eleccion = useMemo(
    () =>
      estado.fase === "lista" && equipo
        ? elegirDescarga(estado.descargas, equipo.sistema, equipo.chip)
        : null,
    [estado, equipo],
  );
  const asistente = estadoDelAsistente(c.grupos.mias, enEscritorio);
  const pendientesDeLaEmpresa = c.administra ? c.grupos.pendientes.length : 0;

  const descargar = async (d: DesktopDownload) => {
    setDescargando(claveDe(d));
    try {
      const url = await desktopService.downloadLink(d.platform, d.arch);

      if (!url) throw new Error("no link");
      toast.success(t("desktopApp.download.started"));
      window.location.assign(url);
    } catch (e: any) {
      const motivo = clasificarFallo(
        e?.status,
        e?.data?.code ?? e?.data?.messageCode,
      );

      toast.error(
        motivo === "suspendida"
          ? t("desktopApp.download.suspendedTitle")
          : motivo === "noElegible"
            ? t("desktopApp.download.notEligibleTitle")
            : t("desktopApp.download.linkError"),
      );
    } finally {
      setDescargando(null);
    }
  };

  /* ── What the hero offers ─────────────────────────────────────────────── */
  const zonaDeDescarga = (() => {
    if (enEscritorio) {
      const version = window.cguardDesktop?.version;

      return (
        <AvisoDeVidrio
          icon={<MonitorCheck />}
          title={t("desktopApp.download.inDesktopTitle")}
          tono="ok"
        >
          {version
            ? t("desktopApp.download.inDesktopVersion", { version })
            : t("desktopApp.download.inDesktop")}
        </AvisoDeVidrio>
      );
    }
    if (!puedeUsarArteDePlataforma) {
      return (
        <AvisoDeVidrio icon={<AlertTriangle />} tono="neutral">
          {t("desktopApp.download.partnerHost")}
        </AvisoDeVidrio>
      );
    }
    if (estado.fase === "cargando" || !equipo) {
      return (
        <div className="space-y-2">
          <SkeletonBlock className="h-[52px] w-72 rounded-full" />
          <SkeletonBlock className="h-4 w-40" />
        </div>
      );
    }
    if (estado.fase === "fallo") {
      const m = estado.motivo;

      return (
        <AvisoDeVidrio
          icon={<AlertTriangle />}
          title={
            m === "suspendida"
              ? t("desktopApp.download.suspendedTitle")
              : m === "noElegible"
                ? t("desktopApp.download.notEligibleTitle")
                : t("desktopApp.download.loadError")
          }
          tono={m === "red" ? "warn" : "bad"}
        >
          <p>
            {m === "suspendida"
              ? t("desktopApp.download.suspendedText")
              : m === "noElegible"
                ? t("desktopApp.download.notEligibleText")
                : t("desktopApp.download.loadErrorText")}
          </p>
          {m !== "noElegible" ? (
            <div className="mt-3">
              {m === "suspendida" ? (
                <Button asChild className="lg-btn lg-btn-glass" size="sm">
                  <Link to="/setting/billing">
                    {t("desktopApp.download.goToBilling")} <ArrowRight />
                  </Link>
                </Button>
              ) : (
                <Button
                  className="lg-btn lg-btn-glass"
                  size="sm"
                  type="button"
                  onClick={() => setIntento((n) => n + 1)}
                >
                  <RefreshCw /> {t("desktopApp.devices.retry")}
                </Button>
              )}
            </div>
          ) : null}
        </AvisoDeVidrio>
      );
    }
    if (sinDescargas(estado.descargas)) {
      return (
        <AvisoDeVidrio
          icon={<Hourglass />}
          title={t("desktopApp.download.soonTitle")}
          tono="info"
        >
          {t("desktopApp.download.soonText")}
        </AvisoDeVidrio>
      );
    }
    if (!eleccion?.principal) {
      return (
        <AvisoDeVidrio icon={<Laptop />} tono="neutral">
          {t("desktopApp.download.otherSystem")}
        </AvisoDeVidrio>
      );
    }

    return (
      <div className="space-y-3">
        <div className="lg-eyebrow flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          {equipo.sistema === "mac"
            ? equipo.chip
              ? t("desktopApp.download.detectedMac", {
                  chip: nombreDe(eleccion.principal, t),
                })
              : t("desktopApp.download.detectedMacUnknownChip")
            : t("desktopApp.download.detectedWindows")}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start">
          <BotonPrincipal
            d={eleccion.principal}
            ocupada={descargando === claveDe(eleccion.principal)}
            onDescargar={descargar}
          />
          {eleccion.alternativa ? (
            <BotonPrincipal
              secundario
              d={eleccion.alternativa}
              ocupada={descargando === claveDe(eleccion.alternativa)}
              onDescargar={descargar}
            />
          ) : null}
        </div>
        {equipo.sistema === "mac" && !equipo.chip ? (
          <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
            {t("desktopApp.download.chipHelp")}
          </p>
        ) : null}
      </div>
    );
  })();

  const otras =
    !enEscritorio &&
    puedeUsarArteDePlataforma &&
    estado.fase === "lista" &&
    !sinDescargas(estado.descargas)
      ? (eleccion?.otras ?? [])
      : [];

  return (
    <AppLayout>
      <PageContainer className="lg-scope space-y-8 pt-4" width="wide">
        <FondoDeColor />

        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <FadeIn>
          <TarjetaDeVidrio
            as="section"
            className="lg-hero overflow-hidden p-6 sm:p-10"
          >
            <div className="flex flex-col gap-10 lg:flex-row lg:items-center">
              <div className="min-w-0 flex-1 space-y-6">
                <div className="space-y-3">
                  <div className="lg-eyebrow">
                    {t("desktopApp.download.eyebrow")}
                  </div>
                  <h1 className="lg-title">{t("desktopApp.download.title")}</h1>
                  <p className="lg-lead max-w-xl">
                    {t("desktopApp.download.valueProp")}
                  </p>
                </div>
                {zonaDeDescarga}
              </div>
              <div className="flex shrink-0 justify-center lg:w-[420px]">
                <VentanaDeMuestra aviso={t("desktopApp.download.mockAlert")} />
              </div>
            </div>
            {otras.length ? (
              <div
                className="mt-8 border-t pt-6"
                style={{ borderColor: "var(--hairline)" }}
              >
                <div className="lg-eyebrow mb-3">
                  {t("desktopApp.download.otherOptions")}
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  {otras.map((d) => (
                    <OtraOpcion
                      key={claveDe(d)}
                      d={d}
                      ocupada={descargando === claveDe(d)}
                      onDescargar={descargar}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </TarjetaDeVidrio>
        </FadeIn>

        {/* ── Admin shortcut: requests waiting ──────────────────────────── */}
        {pendientesDeLaEmpresa > 0 ? (
          <AvisoDeVidrio
            icon={<KeyRound />}
            title={t("desktopApp.download.adminPendingTitle", {
              n: pendientesDeLaEmpresa,
            })}
            tono="warn"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{t("desktopApp.download.adminPendingText")}</span>
              <Button asChild className="lg-btn lg-btn-glass" size="sm">
                <Link to="/setting/computadoras">
                  {t("desktopApp.download.reviewRequests")} <ArrowRight />
                </Link>
              </Button>
            </div>
          </AvisoDeVidrio>
        ) : null}

        {/* ── The 3 steps ─────────────────────────────────────────────── */}
        <section className="space-y-4">
          <h2 className="lg-h2 px-1">{t("desktopApp.steps.title")}</h2>
          <ol className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Paso
              estado={asistente.pasos[0]}
              icono={<Download />}
              n={1}
              texto={t("desktopApp.steps.installText")}
              titulo={t("desktopApp.steps.installTitle")}
            />
            <Paso
              estado={asistente.pasos[1]}
              icono={<LogIn />}
              n={2}
              texto={t("desktopApp.steps.signInText")}
              titulo={t("desktopApp.steps.signInTitle")}
            />
            <Paso
              estado={asistente.pasos[2]}
              icono={<ShieldCheck />}
              n={3}
              texto={
                asistente.lista
                  ? t("desktopApp.steps.approvedText")
                  : asistente.pendiente
                    ? t("desktopApp.steps.waitingText", {
                        equipo: c.equipoDe(asistente.pendiente),
                      })
                    : t("desktopApp.steps.approveText")
              }
              titulo={t("desktopApp.steps.approveTitle")}
            >
              {asistente.pendiente ? (
                <div className="flex flex-wrap items-center gap-3">
                  <CodigoDeEmparejamiento
                    codigo={asistente.pendiente.pairingCode}
                  />
                  {c.administra ? (
                    <Button
                      className="lg-btn lg-btn-primary"
                      disabled={c.ocupado === asistente.pendiente.id}
                      size="sm"
                      type="button"
                      onClick={() =>
                        void c.decidir("approve", asistente.pendiente!)
                      }
                    >
                      <Check /> {t("desktopApp.steps.approveNow")}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </Paso>
          </ol>
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <MisComputadoras c={c} />
          </div>
          <div className="space-y-6">
            <SeccionDeVidrio
              icon={<HardDrive />}
              title={t("desktopApp.requirements.title")}
            >
              <ul className="space-y-3.5 text-sm">
                {(
                  [
                    [Laptop, "desktopApp.requirements.mac"],
                    [Monitor, "desktopApp.requirements.windows"],
                    [Wifi, "desktopApp.requirements.internet"],
                  ] as const
                ).map(([Icono, clave]) => (
                  <li key={clave} className="flex items-start gap-3">
                    <Icono
                      className="mt-0.5 h-4 w-4 shrink-0"
                      style={{ color: "var(--ink-faint)" }}
                    />
                    <span>{t(clave)}</span>
                  </li>
                ))}
              </ul>
            </SeccionDeVidrio>
            <SeccionDeVidrio
              icon={<LockKeyhole />}
              title={t("desktopApp.security.title")}
            >
              <div
                className="space-y-3 text-sm leading-relaxed"
                style={{ color: "var(--ink-soft)" }}
              >
                <p>{t("desktopApp.security.approval")}</p>
                <p>{t("desktopApp.security.encrypted")}</p>
                <p>{t("desktopApp.security.revoke")}</p>
              </div>
            </SeccionDeVidrio>
          </div>
        </div>

        {/* ── FAQ ───────────────────────────────────────────────────────── */}
        <SeccionDeVidrio title={t("desktopApp.faq.title")}>
          <div className="space-y-2.5">
            {(
              ["why", "code", "updates", "lost", "several", "windows"] as const
            ).map((k) => (
              <details key={k} className="lg-faq lg-row group px-4 py-3.5">
                <summary className="flex items-center justify-between gap-3 text-sm font-semibold">
                  {t(`desktopApp.faq.${k}Q`)}
                  <ChevronDown
                    className="lg-faq-chevron h-4 w-4 shrink-0"
                    style={{ color: "var(--ink-faint)" }}
                  />
                </summary>
                <p
                  className="mt-2.5 text-sm leading-relaxed"
                  style={{ color: "var(--ink-soft)" }}
                >
                  {t(`desktopApp.faq.${k}A`)}
                </p>
              </details>
            ))}
          </div>
        </SeccionDeVidrio>
      </PageContainer>
    </AppLayout>
  );
}

/** The person's own computers (any status), with revoke on approved ones. */
export function MisComputadoras({ c }: { c: Computadoras }) {
  const { t } = useTranslation();

  return (
    <SeccionDeVidrio
      action={
        <Button
          className="lg-btn lg-btn-glass"
          size="sm"
          type="button"
          onClick={() => void c.recargar()}
        >
          <RefreshCw /> {t("desktopApp.devices.refresh")}
        </Button>
      }
      icon={<Laptop />}
      title={t("desktopApp.devices.mineTitle")}
    >
      {c.cargando ? (
        <div className="space-y-3">
          <SkeletonBlock className="h-20 w-full rounded-[22px]" />
          <SkeletonBlock className="h-20 w-full rounded-[22px]" />
        </div>
      ) : c.error ? (
        <AvisoDeVidrio
          icon={<AlertTriangle />}
          title={t("desktopApp.devices.loadError")}
          tono="warn"
        >
          <Button
            className="lg-btn lg-btn-glass mt-2"
            size="sm"
            type="button"
            onClick={() => void c.recargar()}
          >
            <RefreshCw /> {t("desktopApp.devices.retry")}
          </Button>
        </AvisoDeVidrio>
      ) : c.grupos.mias.length === 0 ? (
        <AvisoDeVidrio
          icon={<Laptop />}
          title={t("desktopApp.devices.mineEmpty")}
          tono="neutral"
        >
          {t("desktopApp.devices.mineEmptyText")}
        </AvisoDeVidrio>
      ) : (
        <div className="space-y-3">
          {c.grupos.mias.map((d) => (
            <TarjetaDeComputadora
              key={d.id}
              esMia
              c={c}
              d={d}
              mostrarPersona={false}
            />
          ))}
        </div>
      )}
    </SeccionDeVidrio>
  );
}
