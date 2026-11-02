/**
 * MULTIMARCA · PHASE 5 — «Portal de clientes» in the brand editor.
 *
 * A brand is a separate company, and its clients open their portal on a name
 * of THAT company (`portal.sumarca.com`). The flow is the partners' one: type
 * a subdomain, add ONE CNAME to our edge, press «Comprobar». Once the edge
 * routes it with a certificate, every link its clients get (invoices, quotes,
 * password resets) points there and the portal paints the brand before login.
 *
 * Who sees it: a company admin (any brand) and a brand admin (their own
 * brand). Anyone the server refuses simply does not get the section.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  Globe,
  Loader2,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import { guiasDns, rellenarDominio } from "./guiasDnsDeMarca";
import { mensajeDeMarca } from "./mensajesDeMarca";

import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { FIELD_CLS, FormField } from "@/components/kit";
import {
  codigoDeError,
  dominioDeMarcaService,
  type EstadoDeDominioDeMarca,
  type PortalDeMarca,
} from "@/lib/api/marcasService";

const CLAVE_PROVEEDOR = "crm:marca:proveedorDns";

/** The colour family and icon of each status. */
const TONO: Record<EstadoDeDominioDeMarca, "ok" | "warn" | "bad"> = {
  activo: "ok",
  pendiente_dns: "warn",
  verificando: "warn",
  pendiente_tls: "warn",
  mal_configurado: "bad",
  desactivado: "bad",
};

function leerProveedor(): string {
  try {
    return localStorage.getItem(CLAVE_PROVEEDOR) || "";
  } catch {
    return "";
  }
}

/** A step with the values to type shown as code, so nobody retypes them wrong. */
function Paso({ texto, host, destino }: { texto: string; host: string; destino: string }) {
  return (
    <>
      {texto.split(/(\{host\}|\{destino\})/).map((p, i) => {
        if (p === "{host}") return <code key={i} className="rounded px-1 font-mono text-[12px]" style={{ background: "color-mix(in oklab, var(--ink) 7%, transparent)" }}>{host}</code>;
        if (p === "{destino}") return <code key={i} className="rounded px-1 font-mono text-[12px]" style={{ background: "color-mix(in oklab, var(--ink) 7%, transparent)" }}>{destino}</code>;

        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

export default function PortalDeClientesDeMarca({ brandId }: { brandId: string }) {
  const { t, i18n } = useTranslation();
  const [datos, setDatos] = useState<PortalDeMarca | null>(null);
  const [oculto, setOculto] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState<"" | "fijar" | "comprobar" | "quitar">("");
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [proveedor, setProveedor] = useState(leerProveedor);

  useEffect(() => {
    let vivo = true;

    setCargando(true);
    dominioDeMarcaService
      .ver(brandId)
      .then((d) => vivo && setDatos(d))
      .catch(() => vivo && setOculto(true))
      .finally(() => vivo && setCargando(false));

    return () => {
      vivo = false;
    };
  }, [brandId]);

  const guias = useMemo(() => guiasDns(i18n.language), [i18n.language]);
  const guia = guias.find((g) => g.id === proveedor) || null;

  if (oculto) return null;

  const etiquetaDeEstado = (s: EstadoDeDominioDeMarca): string => {
    switch (s) {
      case "activo":
        return t("ui.PortalDeMarca.estado.activo", "Activo");
      case "verificando":
        return t("ui.PortalDeMarca.estado.verificando", "Verificando");
      case "pendiente_tls":
        return t("ui.PortalDeMarca.estado.pendienteTls", "Preparando HTTPS");
      case "mal_configurado":
        return t("ui.PortalDeMarca.estado.malConfigurado", "Revisa el DNS");
      case "desactivado":
        return t("ui.PortalDeMarca.estado.desactivado", "Desactivado");
      default:
        return t("ui.PortalDeMarca.estado.pendienteDns", "Esperando el DNS");
    }
  };

  const mensajeDeError = (e: unknown): string => {
    const code = codigoDeError(e);
    const clave = String((e as any)?.data?.messageCode || (e as any)?.response?.data?.messageCode || "");

    switch (code) {
      case "brand_domain_invalid":
        if (/\.apex$/.test(clave))
          return t("ui.PortalDeMarca.errores.apex", "Usa un subdominio, por ejemplo «portal.sumarca.com». Así su sitio web sigue funcionando como hasta ahora.");
        if (/\.(zona_de_plataforma|anfitrion_reservado)$/.test(clave))
          return t("ui.PortalDeMarca.errores.reservado", "Ese nombre no se puede usar. Escribe un dominio de la marca.");

        return t("ui.PortalDeMarca.errores.invalido", "Ese dominio no es válido. Revisa que esté bien escrito.");
      case "brand_domain_taken":
        return t("ui.PortalDeMarca.errores.ocupado", "Ese dominio ya está en uso.");
      case "brand_domain_disabled":
        return t("ui.PortalDeMarca.errores.apagado", "Los dominios propios todavía no están disponibles.");
      case "brand_domain_edge_unavailable":
      case "brand_domain_not_registered":
        return t("ui.PortalDeMarca.errores.borde", "El servicio de dominios no respondió. Vuelve a comprobarlo en unos minutos.");
      default:
        return mensajeDeMarca(t, code);
    }
  };

  const correr = async (que: "fijar" | "comprobar" | "quitar", fn: () => Promise<void>) => {
    setOcupado(que);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setOcupado("");
    }
  };

  const fijar = () =>
    correr("fijar", async () => {
      const d = await dominioDeMarcaService.fijar(brandId, nombre.trim());

      setDatos(d);
      setEditando(false);
      setNombre("");
      toast.success(t("ui.PortalDeMarca.guardado", "Dominio guardado. Ahora crea el registro en tu DNS."));
    });

  const comprobar = () =>
    correr("comprobar", async () => {
      const d = await dominioDeMarcaService.comprobar(brandId);

      setDatos(d);
      if (d.domain?.isActive) toast.success(t("ui.PortalDeMarca.listo", "El portal de esta marca ya funciona en su dominio."));
      else toast.message(t("ui.PortalDeMarca.todaviaNo", "Todavía no está listo. El DNS puede tardar unos minutos en propagarse."));
    });

  const quitar = async () => {
    const host = datos?.domain?.hostname || "";
    const ok = await confirmDialog({
      title: t("ui.PortalDeMarca.quitarTitulo", "¿Quitar {{host}}?", { host }),
      message: t(
        "ui.PortalDeMarca.quitarMensaje",
        "Sus clientes volverán a recibir los enlaces del portal de la empresa. Puedes volver a conectarlo cuando quieras.",
      ),
      confirmText: t("ui.PortalDeMarca.quitar", "Quitar dominio"),
      cancelText: t("common.cancel", { defaultValue: "Cancelar" }),
      tone: "danger",
    });

    if (!ok) return;
    await correr("quitar", async () => {
      await dominioDeMarcaService.quitar(brandId);
      setDatos((d) => (d ? { ...d, domain: null, dns: null, instructions: [] } : d));
    });
  };

  const copiar = async (v: string) => {
    try {
      await navigator.clipboard.writeText(v);
      toast.success(t("ui.PortalDeMarca.copiado", "Copiado"));
    } catch {
      /* the value is on screen to copy by hand */
    }
  };

  const elegirProveedor = (id: string) => {
    setProveedor(id);
    try {
      localStorage.setItem(CLAVE_PROVEEDOR, id);
    } catch {
      /* a per-browser convenience only */
    }
  };

  const d = datos?.domain || null;
  const disponible = !!datos?.enabled;
  const mostrarFormulario = !d || editando;
  const host = datos?.dns?.host || d?.hostname || "";
  const destino = datos?.cnameTarget || "";
  const tono = d ? TONO[d.status] : "warn";

  return (
    <section
      aria-labelledby="marca-portal-titulo"
      className="space-y-3 rounded-xl border p-3"
      data-testid="portal-de-marca"
      style={{ borderColor: "var(--hairline)" }}
    >
      <div className="flex items-start gap-2">
        <Globe className="mt-0.5 size-4 shrink-0" style={{ color: "var(--ink-soft)" }} />
        <div className="min-w-0">
          <div className="text-sm font-medium" id="marca-portal-titulo">
            {t("ui.PortalDeMarca.titulo", "Portal de clientes")}
          </div>
          <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
            {t(
              "ui.PortalDeMarca.ayuda",
              "Sus clientes abren el portal en una dirección de esta marca. Los enlaces de facturas, cotizaciones y contraseñas llevan a esa dirección.",
            )}
          </p>
        </div>
      </div>

      {cargando ? (
        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--ink-faint)" }}>
          <Loader2 className="size-3.5 animate-spin" />
          {t("ui.PortalDeMarca.cargando", "Cargando…")}
        </div>
      ) : (
        <>
          {!disponible && (
            <div className="flex items-start gap-2 rounded-lg p-2 text-xs" style={{ background: "color-mix(in oklab, var(--warn) 12%, transparent)", color: "var(--warn-text)" }}>
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {t("ui.PortalDeMarca.noDisponible", "Los dominios propios todavía no están disponibles en esta instalación.")}
            </div>
          )}

          {d && !editando && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 truncate font-mono text-sm" title={d.hostname}>
                {d.hostname}
              </span>
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                data-estado={d.status}
                style={{
                  background: `color-mix(in oklab, var(--${tono}) 14%, transparent)`,
                  color: `var(--${tono}-text)`,
                }}
              >
                {tono === "ok" ? <CheckCircle2 className="size-3" /> : tono === "bad" ? <AlertTriangle className="size-3" /> : <Clock className="size-3" />}
                {etiquetaDeEstado(d.status)}
              </span>
              <div className="ml-auto flex flex-wrap gap-1.5">
                <Button disabled={!!ocupado || !disponible} size="sm" type="button" variant="outline" onClick={comprobar}>
                  {ocupado === "comprobar" ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <RefreshCw className="mr-1 size-3.5" />}
                  {t("ui.PortalDeMarca.comprobar", "Comprobar")}
                </Button>
                <Button disabled={!!ocupado || !disponible} size="sm" type="button" variant="ghost" onClick={() => { setEditando(true); setNombre(d.hostname); }}>
                  <Pencil className="mr-1 size-3.5" />
                  {t("ui.PortalDeMarca.cambiar", "Cambiar")}
                </Button>
                <Button disabled={!!ocupado} size="sm" type="button" variant="ghost" onClick={quitar}>
                  {ocupado === "quitar" ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Trash2 className="mr-1 size-3.5" />}
                  {t("ui.PortalDeMarca.quitar", "Quitar dominio")}
                </Button>
              </div>
            </div>
          )}

          {d?.isActive && !editando && (
            <p className="flex items-start gap-1.5 text-xs" style={{ color: "var(--ok-text)" }}>
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
              {t("ui.PortalDeMarca.activoAyuda", "Funciona con HTTPS. Sus clientes ya reciben los enlaces a esta dirección.")}
            </p>
          )}

          {mostrarFormulario && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <FormField
                className="min-w-0 flex-1"
                hint={t("ui.PortalDeMarca.nombreAyuda", "Un subdominio de la marca, por ejemplo portal.sumarca.com.")}
                htmlFor={`marca-portal-${brandId}`}
                label={t("ui.PortalDeMarca.nombre", "Dirección del portal")}
              >
                <input
                  autoCapitalize="none"
                  autoComplete="off"
                  className={`${FIELD_CLS} font-mono`}
                  disabled={!disponible}
                  id={`marca-portal-${brandId}`}
                  inputMode="url"
                  maxLength={253}
                  placeholder="portal.sumarca.com"
                  spellCheck={false}
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && nombre.trim()) {
                      e.preventDefault();
                      fijar();
                    }
                  }}
                />
              </FormField>
              <div className="flex gap-1.5">
                {editando && (
                  <Button size="sm" type="button" variant="ghost" onClick={() => { setEditando(false); setError(null); }}>
                    {t("common.cancel", { defaultValue: "Cancelar" })}
                  </Button>
                )}
                <Button disabled={!nombre.trim() || !!ocupado || !disponible} size="sm" type="button" variant="brand" onClick={fijar}>
                  {ocupado === "fijar" ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Globe className="mr-1 size-3.5" />}
                  {t("ui.PortalDeMarca.conectar", "Conectar dominio")}
                </Button>
              </div>
            </div>
          )}

          {error && (
            <p className="flex items-start gap-1.5 text-xs" role="alert" style={{ color: "var(--bad-text)" }}>
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {error}
            </p>
          )}

          {d && !d.isActive && !editando && (
            <div className="space-y-3">
              {d.failure && (
                <p className="text-xs" style={{ color: "var(--warn-text)" }}>
                  {d.failure.code === "verification"
                    ? t("ui.PortalDeMarca.fallo.dns", "Todavía no vemos el registro. Respuesta del servicio de dominios: {{detalle}}", { detalle: d.failure.detail || "—" })
                    : d.failure.code === "no_configurado"
                      ? t("ui.PortalDeMarca.noDisponible", "Los dominios propios todavía no están disponibles en esta instalación.")
                      : t("ui.PortalDeMarca.errores.borde", "El servicio de dominios no respondió. Vuelve a comprobarlo en unos minutos.")}
                </p>
              )}

              <div>
                <div className="mb-1 text-xs font-medium">
                  {t("ui.PortalDeMarca.dnsTitulo", "Crea este registro en el DNS de la marca")}
                </div>
                {/* Stacked on a phone (label + value), three columns from sm up. */}
                <div className="rounded-lg border text-xs" style={{ borderColor: "var(--hairline)" }}>
                  <div className="hidden grid-cols-[5rem_1fr_1fr] gap-2 px-2 py-1.5 sm:grid" style={{ color: "var(--ink-faint)" }}>
                    <span className="font-medium">{t("ui.PortalDeMarca.tipo", "Tipo")}</span>
                    <span className="font-medium">{t("ui.PortalDeMarca.nombreDns", "Nombre")}</span>
                    <span className="font-medium">{t("ui.PortalDeMarca.valor", "Valor")}</span>
                  </div>
                  {(datos?.instructions?.length ? datos.instructions : [{ type: "CNAME", name: d.hostname, value: destino, purpose: "enrutado" }]).map((r, i) => {
                    const corto = r.type === "CNAME" && r.name === d.hostname ? host : r.name;
                    const etiqueta = (texto: string) => (
                      <span className="sm:hidden" style={{ color: "var(--ink-faint)" }}>{texto}</span>
                    );
                    const valor = (v: string) => (
                      <button
                        className="cg-focus inline-flex min-w-0 items-center gap-1 text-left font-mono"
                        title={t("ui.PortalDeMarca.copiar", "Copiar")}
                        type="button"
                        onClick={() => copiar(v)}
                      >
                        <span className="break-all">{v}</span>
                        <Copy className="size-3 shrink-0 opacity-60" />
                      </button>
                    );

                    return (
                      <div
                        key={i}
                        className="grid grid-cols-[4.5rem_1fr] items-center gap-x-2 gap-y-1.5 border-t px-2 py-2 sm:grid-cols-[5rem_1fr_1fr] sm:gap-y-0"
                        data-registro-dns={r.type}
                        style={{ borderColor: "var(--hairline)" }}
                      >
                        {etiqueta(t("ui.PortalDeMarca.tipo", "Tipo"))}
                        <span className="font-mono">{r.type}</span>
                        {etiqueta(t("ui.PortalDeMarca.nombreDns", "Nombre"))}
                        {valor(corto)}
                        {etiqueta(t("ui.PortalDeMarca.valor", "Valor"))}
                        {valor(r.value)}
                      </div>
                    );
                  })}
                </div>
                <p className="mt-1 text-[11px]" style={{ color: "var(--ink-faint)" }}>
                  {t("ui.PortalDeMarca.nombreCompleto", "Si tu proveedor pide el nombre completo, escribe {{completo}}.", { completo: d.hostname })}
                </p>
              </div>

              <div>
                <div className="mb-1 text-xs font-medium">{t("ui.PortalDeMarca.guiaTitulo", "¿Dónde administras el DNS?")}</div>
                <div className="flex flex-wrap gap-1.5" role="tablist">
                  {guias.map((g) => (
                    <button
                      key={g.id}
                      aria-selected={g.id === proveedor}
                      className="cg-focus rounded-full border px-2.5 py-1 text-xs"
                      role="tab"
                      style={{
                        borderColor: g.id === proveedor ? "var(--brand)" : "var(--hairline)",
                        background: g.id === proveedor ? "color-mix(in oklab, var(--brand) 10%, var(--float))" : "var(--float)",
                      }}
                      type="button"
                      onClick={() => elegirProveedor(g.id)}
                    >
                      {g.nombre}
                    </button>
                  ))}
                </div>
                {guia && (
                  <div className="mt-2 space-y-2 text-xs" role="tabpanel">
                    <ol className="list-decimal space-y-1 pl-5">
                      {guia.pasos.map((p, i) => (
                        <li key={i}>
                          <Paso destino={destino} host={host} texto={rellenarDominio(p, datos?.dns?.domain || d.hostname)} />
                        </li>
                      ))}
                    </ol>
                    {(guia.ojo || []).map((o, i) => (
                      <p key={i} className="flex items-start gap-1.5" style={{ color: "var(--warn-text)" }}>
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                        <span>
                          <Paso destino={destino} host={host} texto={rellenarDominio(o, datos?.dns?.domain || d.hostname)} />
                        </span>
                      </p>
                    ))}
                    <p style={{ color: "var(--ink-faint)" }}>
                      {t("ui.PortalDeMarca.guiaDespues", "Después pulsa «Comprobar». El DNS suele tardar unos minutos; el certificado HTTPS se emite solo.")}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {d?.lastCheckedAt && !editando && (
            <p className="text-[11px]" style={{ color: "var(--ink-faint)" }}>
              {t("ui.PortalDeMarca.ultimaComprobacion", "Última comprobación: {{fecha}}", {
                fecha: new Date(d.lastCheckedAt).toLocaleString(i18n.language),
              })}
            </p>
          )}
        </>
      )}
    </section>
  );
}
