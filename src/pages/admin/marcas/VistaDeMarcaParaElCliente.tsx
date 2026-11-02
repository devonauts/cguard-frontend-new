/**
 * «ASÍ VE ESTA MARCA SU CLIENTE» — a live preview inside the brand editor
 * (Multimarca phase 3). What a client of this brand gets: the head of an
 * invoice (logo, colours, PDF layout, legal block and its own series), the
 * sender name of the mails and the portal's mark. It is a drawing, not the
 * real PDF: the server prints that one with the same data.
 *
 * Paper is white on purpose, in light and dark themes: it shows a document.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Globe, Mail, MonitorSmartphone, Info } from "lucide-react";

import { serieDeFactura, tintaSobre, webLegible } from "./identidadDeMarca";

import { terminosFiscales } from "@/lib/paisDeLaEmpresa";

export interface IdentidadEnVista {
  name: string;
  code: string;
  color: string;
  accentColor: string;
  logoUrl: string;
  legalName: string;
  taxId: string;
  country: string;
  address: string;
  email: string;
  phone: string;
  website: string;
  pdfTheme: string;
  senderName: string;
  invoicePrefix: string;
  isPrincipal: boolean;
}

const PAPEL_TINTA = "#0f172a";
const PAPEL_SUAVE = "#64748b";
const PAPEL_LINEA = "#e2e8f0";

function Logo({ b, size, sobre }: { b: IdentidadEnVista; size: number; sobre?: string }) {
  const [roto, setRoto] = useState(false);

  if (b.logoUrl && !roto)
    return (
      <img
        alt=""
        className="shrink-0 rounded object-contain"
        src={b.logoUrl}
        style={{ width: size, height: size, background: "#ffffff" }}
        onError={() => setRoto(true)}
      />
    );

  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded font-bold"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.45),
        background: sobre ? "rgba(255,255,255,0.18)" : `${b.color}22`,
        color: sobre || b.color,
      }}
    >
      {(b.name || "?").trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

export default function VistaDeMarcaParaElCliente({
  b,
  idioma,
}: {
  b: IdentidadEnVista;
  idioma: string;
}) {
  const { t } = useTranslation();
  const color = /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : "#2563eb";
  const acento = /^#[0-9a-f]{6}$/i.test(b.accentColor) ? b.accentColor : color;
  const estilo = b.pdfTheme || "classic";
  const terminos = terminosFiscales(b.country, idioma, {
    razonSocial: t("ui.EditorDeMarca.razonSocial", "Razón social"),
    idFiscal: t("ui.EditorDeMarca.identificador", "Identificador fiscal"),
  });
  const serie = serieDeFactura(
    { invoicePrefix: b.invoicePrefix, code: b.code, isPrincipal: b.isPrincipal },
    t("ui.VistaDeMarca.prefijoEmpresa", "FAC"),
  );
  const nombreVisible = b.name || t("ui.VistaDeMarca.sinNombre", "Tu marca");
  const emisor = b.legalName || nombreVisible;
  const remitente = b.senderName || nombreVisible;
  const web = webLegible(b.website);
  const titulo = t("ui.VistaDeMarca.factura", "Factura");
  const numero = `${serie}-000124`;

  const bloqueLegal = (
    <div className="space-y-0.5 text-[10px] leading-snug" style={{ color: PAPEL_SUAVE }}>
      <div className="font-semibold" style={{ color: PAPEL_TINTA }}>
        {emisor}
      </div>
      {b.taxId && (
        <div>
          {terminos.idFiscalLocal || terminos.idFiscal}: {b.taxId}
        </div>
      )}
      {b.address && <div className="truncate">{b.address}</div>}
      {(b.email || b.phone) && (
        <div className="truncate">{[b.email, b.phone].filter(Boolean).join(" · ")}</div>
      )}
      {web && <div className="truncate">{web}</div>}
    </div>
  );

  const cabecera =
    estilo === "band" ? (
      <div
        className="flex items-center justify-between gap-3 px-4 py-3"
        style={{ background: color, color: tintaSobre(color) }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <Logo b={{ ...b, color }} size={28} sobre={tintaSobre(color)} />
          <span className="truncate text-sm font-bold">{nombreVisible}</span>
        </div>
        <div className="text-right">
          <div className="text-sm font-bold uppercase tracking-wide">{titulo}</div>
          <div className="font-mono text-[10px] opacity-90">{numero}</div>
        </div>
      </div>
    ) : estilo === "minimal" ? (
      <div className="px-4 pt-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Logo b={{ ...b, color }} size={24} />
            <span className="truncate text-sm font-semibold" style={{ color: PAPEL_TINTA }}>
              {nombreVisible}
            </span>
          </div>
          <div className="text-right text-xs" style={{ color: PAPEL_TINTA }}>
            {titulo} <span className="font-mono">{numero}</span>
          </div>
        </div>
        <div className="mt-2 h-px" style={{ background: acento }} />
      </div>
    ) : (
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        <div className="flex min-w-0 items-center gap-2">
          <Logo b={{ ...b, color }} size={32} />
          <span className="truncate text-sm font-bold" style={{ color: PAPEL_TINTA }}>
            {nombreVisible}
          </span>
        </div>
        <div className="text-right">
          <div className="text-base font-bold uppercase" style={{ color }}>
            {titulo}
          </div>
          <div className="font-mono text-[10px]" style={{ color: PAPEL_SUAVE }}>
            {numero}
          </div>
        </div>
      </div>
    );

  return (
    <section
      aria-label={t("ui.VistaDeMarca.titulo", "Así ve esta marca su cliente")}
      className="space-y-3 rounded-xl border p-3"
      data-testid="vista-de-marca"
      style={{ borderColor: "var(--hairline)" }}
    >
      <div>
        <div className="text-sm font-medium">
          {t("ui.VistaDeMarca.titulo", "Así ve esta marca su cliente")}
        </div>
        <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
          {b.isPrincipal
            ? t(
                "ui.VistaDeMarca.principalAyuda",
                "Es la marca principal: sus clientes siguen viendo la empresa como hasta ahora.",
              )
            : t(
                "ui.VistaDeMarca.ayuda",
                "Sus facturas, cotizaciones, informes y correos salen con estos datos. Ningún cliente de esta marca ve el nombre de otra.",
              )}
        </p>
      </div>

      {/* ── The head of an invoice ───────────────────────────────── */}
      <div
        className="overflow-hidden rounded-lg border shadow-sm"
        style={{ background: "#ffffff", borderColor: PAPEL_LINEA }}
      >
        {cabecera}
        <div className="grid grid-cols-1 gap-3 px-4 py-3 sm:grid-cols-2">
          <div>
            <div
              className="mb-1 text-[9px] font-semibold uppercase tracking-wider"
              style={{ color: PAPEL_SUAVE }}
            >
              {t("ui.VistaDeMarca.emite", "Emite")}
            </div>
            {bloqueLegal}
          </div>
          <div>
            <div
              className="mb-1 text-[9px] font-semibold uppercase tracking-wider"
              style={{ color: PAPEL_SUAVE }}
            >
              {t("ui.VistaDeMarca.cliente", "Cliente")}
            </div>
            <div className="space-y-1">
              <div className="h-2 w-28 rounded-sm" style={{ background: PAPEL_LINEA }} />
              <div className="h-2 w-20 rounded-sm" style={{ background: PAPEL_LINEA }} />
            </div>
          </div>
        </div>
        <div className="px-4 pb-4">
          <div
            className="flex justify-between rounded-sm px-2 py-1 text-[9px] font-semibold uppercase"
            style={{
              background: estilo === "classic" ? "#f1f5f9" : `${acento}1a`,
              color: estilo === "classic" ? PAPEL_SUAVE : acento,
            }}
          >
            <span>{t("ui.VistaDeMarca.concepto", "Concepto")}</span>
            <span>{t("ui.VistaDeMarca.total", "Total")}</span>
          </div>
          {[0, 1].map((i) => (
            <div
              key={i}
              className="flex justify-between border-b px-2 py-1.5"
              style={{ borderColor: PAPEL_LINEA }}
            >
              <div className="h-2 w-32 rounded-sm" style={{ background: PAPEL_LINEA }} />
              <div className="h-2 w-10 rounded-sm" style={{ background: PAPEL_LINEA }} />
            </div>
          ))}
        </div>
      </div>

      {/* ── Mail and portal ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div
          className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs"
          style={{ borderColor: "var(--hairline)", background: "var(--float)" }}
        >
          <Mail className="size-4 shrink-0" style={{ color: "var(--ink-soft)" }} />
          <div className="min-w-0">
            <div style={{ color: "var(--ink-faint)" }}>
              {t("ui.VistaDeMarca.correoDe", "Los correos llegan de")}
            </div>
            <div className="truncate font-semibold">{remitente}</div>
          </div>
        </div>
        <div
          className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs"
          style={{ borderColor: "var(--hairline)", background: "var(--float)" }}
        >
          <MonitorSmartphone
            className="size-4 shrink-0"
            style={{ color: "var(--ink-soft)" }}
          />
          <div className="min-w-0 flex-1">
            <div style={{ color: "var(--ink-faint)" }}>
              {t("ui.VistaDeMarca.portal", "Portal y app del cliente")}
            </div>
            <div className="flex items-center gap-1.5">
              <Logo b={{ ...b, color }} size={16} />
              <span className="truncate font-semibold">{nombreVisible}</span>
              <span
                aria-hidden
                className="ml-auto h-2 w-6 shrink-0 rounded-full"
                style={{ background: `linear-gradient(90deg, ${color}, ${acento})` }}
              />
            </div>
          </div>
        </div>
      </div>
      {web && (
        <p
          className="inline-flex items-center gap-1 text-[11px]"
          style={{ color: "var(--ink-faint)" }}
        >
          <Globe className="size-3" />
          {web}
        </p>
      )}
      <p className="flex items-start gap-1.5 text-[11px]" style={{ color: "var(--ink-faint)" }}>
        <Info className="mt-px size-3 shrink-0" />
        {t(
          "ui.VistaDeMarca.direccionDelCorreo",
          "La dirección de envío es la de la plataforma; el cliente ve el nombre de la marca.",
        )}
      </p>
    </section>
  );
}
