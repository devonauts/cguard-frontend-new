/**
 * «WhatsApp y SMS» — the brand editor section of MULTIMARCA phase 5.
 *
 * Each brand is a separate company: its clients and its staff should hear
 * from ITS number. Here the brand gets:
 *
 *   · SMS — one of the company's numbers (same Twilio account), or a number
 *     bought for it (same flow and fee as the company's; company admin only);
 *   · WhatsApp — another number of the company's WhatsApp Business account,
 *     or its own WhatsApp Business account (Meta's popup, like the company's).
 *
 * Without a sender of its own the brand uses the company's, and its messages
 * carry the brand name: the section says so with a warning. The company
 * wallet pays every message either way; login codes stay on the company's.
 *
 * Who manages: the company admin, or the brand admin of THIS brand.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  MessageCircle,
  MessageSquareText,
  Search,
  Send,
  ShoppingCart,
  Undo2,
  Unplug,
} from "lucide-react";

import { mensajeDeRemitente } from "./mensajesDeRemitentes";

import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { FIELD_CLS, FormField, Modal } from "@/components/kit";
import { codigoDeError } from "@/lib/api/marcasService";
import {
  remitentesDeMarcaService,
  type NumeroDisponible,
  type RemitentesDeMarca as Remitentes,
} from "@/lib/api/remitentesDeMarca";
import { abrirRegistroDeWhatsApp } from "@/lib/whatsapp/registroIncrustado";

const CAJA = "space-y-3 rounded-xl border p-3";

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex items-start gap-2 rounded-lg border px-2.5 py-2 text-xs"
      data-testid="aviso-numero-de-la-empresa"
      role="note"
      style={{
        borderColor: "color-mix(in oklab, var(--warn) 35%, var(--hairline))",
        background: "color-mix(in oklab, var(--warn) 10%, transparent)",
        color: "var(--warn-text)",
      }}
    >
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function Estado({
  propio,
  children,
}: {
  propio: boolean;
  children: React.ReactNode;
}) {
  const tono = propio ? "ok" : "warn";

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold"
      style={{
        borderColor: `color-mix(in oklab, var(--${tono}) 40%, var(--hairline))`,
        background: `color-mix(in oklab, var(--${tono}) 12%, transparent)`,
        color: `var(--${tono}-text)`,
      }}
    >
      {propio ? (
        <CheckCircle2 className="size-3" />
      ) : (
        <AlertTriangle className="size-3" />
      )}
      {children}
    </span>
  );
}

export default function RemitentesDeMarca({
  marcaId,
  nombre,
  esPrincipal,
  puedeGestionar,
  puedeComprar,
}: {
  marcaId: string;
  nombre: string;
  esPrincipal: boolean;
  /** Company admin, or the brand admin of this brand. */
  puedeGestionar: boolean;
  /** Buying a number costs the company money: company admin only. */
  puedeComprar: boolean;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const tenant =
    typeof window !== "undefined" ? localStorage.getItem("tenantId") : null;
  const datos = useQuery({
    queryKey: ["marcas", "remitentes", tenant, marcaId],
    queryFn: () => remitentesDeMarcaService.de(marcaId),
    retry: false,
  });
  const inventario = useQuery({
    queryKey: ["marcas", "remitentes", tenant, "inventario"],
    queryFn: () => remitentesDeMarcaService.inventario(),
    enabled: puedeGestionar,
    retry: false,
  });
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [smsElegido, setSmsElegido] = useState("");
  const [waElegido, setWaElegido] = useState("");
  const [compra, setCompra] = useState(false);
  const [prueba, setPrueba] = useState("");

  const r = datos.data;
  const marca = nombre || r?.name || "";

  const smsLibres = useMemo(
    () =>
      (inventario.data?.sms.numbers ?? []).filter(
        (n) =>
          !n.isCompanyNumber &&
          !n.taken &&
          (!n.brandId || n.brandId === marcaId) &&
          n.phoneNumber !== r?.sms.phoneNumber,
      ),
    [inventario.data, marcaId, r?.sms.phoneNumber],
  );
  const waLibres = useMemo(
    () =>
      (inventario.data?.whatsapp.numbers ?? []).filter(
        (n) =>
          !n.isCompanyNumber &&
          !n.taken &&
          (!n.brandId || n.brandId === marcaId) &&
          n.phoneNumberId !== r?.whatsapp.phoneNumberId,
      ),
    [inventario.data, marcaId, r?.whatsapp.phoneNumberId],
  );

  const refrescar = async (nuevo?: Remitentes) => {
    if (nuevo)
      qc.setQueryData(["marcas", "remitentes", tenant, marcaId], nuevo);
    await qc.invalidateQueries({ queryKey: ["marcas", "remitentes", tenant] });
  };

  const hacer = async (
    clave: string,
    fn: () => Promise<Remitentes | void>,
    ok: string,
  ) => {
    setOcupado(clave);
    try {
      const nuevo = await fn();

      await refrescar(nuevo || undefined);
      toast.success(ok);
    } catch (e) {
      toast.error(mensajeDeRemitente(t, codigoDeError(e)));
    } finally {
      setOcupado(null);
    }
  };

  const asignarSms = () =>
    smsElegido &&
    hacer(
      "sms",
      () => remitentesDeMarcaService.asignarSms(marcaId, smsElegido),
      t("ui.RemitentesDeMarca.smsAsignado", "Número asignado a {{marca}}", {
        marca,
      }),
    ).then(() => setSmsElegido(""));

  const volverSms = async () => {
    const ok = await confirmDialog({
      title: t(
        "ui.RemitentesDeMarca.volverSmsTitulo",
        "¿Usar el número de la empresa?",
      ),
      message: t(
        "ui.RemitentesDeMarca.volverSmsMensaje",
        "Los SMS de {{marca}} saldrán del número de la empresa y llevarán el nombre de la marca en el texto. El número queda libre para otra marca.",
        { marca },
      ),
      confirmText: t(
        "ui.RemitentesDeMarca.usarEmpresa",
        "Usar el de la empresa",
      ),
      cancelText: t("common.cancel", { defaultValue: "Cancelar" }),
    });

    if (ok)
      await hacer(
        "sms",
        () => remitentesDeMarcaService.asignarSms(marcaId, null),
        t("ui.RemitentesDeMarca.guardado", "Cambios guardados"),
      );
  };

  const asignarWa = () =>
    waElegido &&
    hacer(
      "wa",
      () => remitentesDeMarcaService.asignarWhatsApp(marcaId, waElegido),
      t("ui.RemitentesDeMarca.waAsignado", "WhatsApp asignado a {{marca}}", {
        marca,
      }),
    ).then(() => setWaElegido(""));

  const volverWa = async () => {
    const ok = await confirmDialog({
      title: t(
        "ui.RemitentesDeMarca.volverWaTitulo",
        "¿Usar el WhatsApp de la empresa?",
      ),
      message: t(
        "ui.RemitentesDeMarca.volverWaMensaje",
        "Los WhatsApp de {{marca}} saldrán del número de la empresa con el nombre de la marca en el texto.",
        { marca },
      ),
      confirmText: t(
        "ui.RemitentesDeMarca.usarEmpresa",
        "Usar el de la empresa",
      ),
      cancelText: t("common.cancel", { defaultValue: "Cancelar" }),
      tone: "danger",
    });

    if (ok)
      await hacer(
        "wa",
        () => remitentesDeMarcaService.desconectarWhatsApp(marcaId),
        t("ui.RemitentesDeMarca.guardado", "Cambios guardados"),
      );
  };

  const conectarPropio = async () => {
    setOcupado("waPropio");
    try {
      const p = await remitentesDeMarcaService.parametrosDeRegistro(marcaId);

      if (!p.configured || !p.appId || !p.configId) {
        toast.error(
          t("comms.wa.notConfigured", {
            defaultValue:
              "La plataforma aún no tiene configurada la app de Meta (contacta a soporte).",
          }),
        );

        return;
      }
      const reg = await abrirRegistroDeWhatsApp({
        appId: p.appId,
        configId: p.configId,
        graphVersion: p.graphVersion,
      });

      if (!reg) {
        toast.info(
          t("comms.wa.cancelled", {
            defaultValue:
              "Conexión cancelada. Si no viste la ventana de Meta, permite ventanas emergentes para este sitio.",
          }),
        );

        return;
      }
      await refrescar(
        await remitentesDeMarcaService.conectarWhatsAppPropio(marcaId, reg),
      );
      toast.success(
        t("comms.wa.connected", { defaultValue: "WhatsApp conectado" }),
      );
    } catch (e) {
      toast.error(mensajeDeRemitente(t, codigoDeError(e)));
    } finally {
      setOcupado(null);
    }
  };

  const probar = async (channel: "sms" | "whatsapp") => {
    if (!prueba.trim()) {
      toast.error(
        t(
          "ui.RemitentesDeMarca.faltaTelefono",
          "Escribe el teléfono al que enviar la prueba.",
        ),
      );

      return;
    }
    setOcupado(`prueba-${channel}`);
    try {
      const res = await remitentesDeMarcaService.probar({
        channel,
        phone: prueba.trim(),
        brandId: marcaId,
      });
      const sent = res.results.find((x) =>
        ["sent", "delivered", "queued"].includes(x.status),
      );

      if (sent)
        toast.success(
          t("ui.RemitentesDeMarca.pruebaEnviada", "Prueba enviada"),
        );
      else
        toast.error(
          t(
            "ui.RemitentesDeMarca.pruebaNoSalio",
            "La prueba no salió: {{motivo}}",
            {
              motivo: res.results
                .map((x) => x.skipReason || x.error || x.status)
                .join(", "),
            },
          ),
        );
    } catch (e) {
      toast.error(mensajeDeRemitente(t, codigoDeError(e)));
    } finally {
      setOcupado(null);
    }
  };

  if (datos.isLoading)
    return (
      <div className={CAJA} style={{ borderColor: "var(--hairline)" }}>
        <div className="cg-skeleton h-24 w-full" />
      </div>
    );
  if (!r) return null;

  const empresaSms = r.company.sms.phoneNumber;
  const empresaWa = r.company.whatsapp.displayPhoneNumber;
  const nombreEnTexto = !esPrincipal;

  return (
    <div
      className={CAJA}
      data-testid="remitentes-de-marca"
      style={{ borderColor: "var(--hairline)" }}
    >
      <div className="flex items-start gap-2">
        <MessageSquareText
          className="mt-0.5 size-4 shrink-0"
          style={{ color: "var(--ink-soft)" }}
        />
        <div>
          <div className="text-sm font-medium">
            {t("ui.RemitentesDeMarca.titulo", "WhatsApp y SMS")}
          </div>
          <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
            {t(
              "ui.RemitentesDeMarca.ayuda",
              "Los mensajes a los clientes de {{marca}} y a su personal salen de estos números. Los códigos de acceso siguen saliendo del número de la empresa y el saldo es el de la empresa.",
              { marca },
            )}
          </p>
        </div>
      </div>

      {/* ── SMS ─────────────────────────────────────────────────── */}
      <div
        className="space-y-2 rounded-lg border p-2.5"
        style={{ borderColor: "var(--hairline)" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <MessageSquareText
              className="size-4 shrink-0"
              style={{ color: "var(--ink-soft)" }}
            />
            <span className="text-sm font-medium">
              {t("ui.RemitentesDeMarca.sms", "SMS")}
            </span>
            <span
              className="truncate font-mono text-sm"
              data-testid="numero-sms"
            >
              {r.sms.phoneNumber ||
                empresaSms ||
                t("ui.RemitentesDeMarca.sinNumero", "Sin número")}
            </span>
          </div>
          {r.sms.phoneNumber ? (
            <Estado propio>
              {r.sms.origin === "purchased"
                ? t(
                    "ui.RemitentesDeMarca.propioComprado",
                    "Propio · comprado para la marca",
                  )
                : t("ui.RemitentesDeMarca.propio", "Número propio")}
            </Estado>
          ) : (
            <Estado propio={false}>
              {t("ui.RemitentesDeMarca.deLaEmpresa", "Número de la empresa")}
            </Estado>
          )}
        </div>

        {!r.sms.phoneNumber && nombreEnTexto && (
          <Aviso>
            {empresaSms
              ? t(
                  "ui.RemitentesDeMarca.avisoSms",
                  "{{marca}} usa el número de la empresa ({{numero}}): sus SMS llevan «{{marca}}» al principio del texto para que se sepa quién escribe.",
                  { marca, numero: empresaSms },
                )
              : t(
                  "ui.RemitentesDeMarca.avisoSmsSinEmpresa",
                  "La empresa aún no tiene número de SMS: hasta que {{marca}} o la empresa tengan uno, no salen SMS.",
                  { marca },
                )}
          </Aviso>
        )}

        {puedeGestionar && (
          <div className="flex flex-wrap items-end gap-2">
            {inventario.data && !inventario.data.sms.provisioned ? (
              <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
                {t(
                  "ui.RemitentesDeMarca.sinCuentaSms",
                  "La empresa aún no tiene cuenta de SMS. Créala en Configuración › SMS.",
                )}
              </p>
            ) : (
              <>
                <FormField
                  className="min-w-[12rem] flex-1"
                  htmlFor={`sms-${marcaId}`}
                  label={t(
                    "ui.RemitentesDeMarca.asignarSms",
                    "Asignar un número de la empresa",
                  )}
                >
                  <select
                    className={FIELD_CLS}
                    disabled={!smsLibres.length}
                    id={`sms-${marcaId}`}
                    value={smsElegido}
                    onChange={(e) => setSmsElegido(e.target.value)}
                  >
                    <option value="">
                      {smsLibres.length
                        ? t(
                            "ui.RemitentesDeMarca.eligeNumero",
                            "Elige un número",
                          )
                        : t(
                            "ui.RemitentesDeMarca.sinLibres",
                            "No hay números libres",
                          )}
                    </option>
                    {smsLibres.map((n) => (
                      <option key={n.phoneNumber} value={n.phoneNumber}>
                        {n.phoneNumber}
                      </option>
                    ))}
                  </select>
                </FormField>
                <Button
                  disabled={!smsElegido || ocupado === "sms"}
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={asignarSms}
                >
                  {ocupado === "sms" ? (
                    <Loader2 className="mr-1.5 size-4 animate-spin" />
                  ) : null}
                  {t("ui.RemitentesDeMarca.asignar", "Asignar")}
                </Button>
                {puedeComprar && (
                  <Button
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => setCompra(true)}
                  >
                    <ShoppingCart className="mr-1.5 size-4" />
                    {t("ui.RemitentesDeMarca.comprar", "Comprar un número")}
                  </Button>
                )}
                {r.sms.phoneNumber && (
                  <Button
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={volverSms}
                  >
                    <Undo2 className="mr-1.5 size-4" />
                    {t(
                      "ui.RemitentesDeMarca.usarEmpresa",
                      "Usar el de la empresa",
                    )}
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── WhatsApp ────────────────────────────────────────────── */}
      <div
        className="space-y-2 rounded-lg border p-2.5"
        style={{ borderColor: "var(--hairline)" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <MessageCircle
              className="size-4 shrink-0"
              style={{ color: "var(--ink-soft)" }}
            />
            <span className="text-sm font-medium">
              {t("ui.RemitentesDeMarca.whatsapp", "WhatsApp")}
            </span>
            <span
              className="truncate font-mono text-sm"
              data-testid="numero-whatsapp"
            >
              {r.whatsapp.displayPhoneNumber ||
                empresaWa ||
                t(
                  "ui.RemitentesDeMarca.numeroDeLaPlataforma",
                  "Número de la plataforma",
                )}
            </span>
          </div>
          {r.whatsapp.mode ? (
            <Estado propio>
              {r.whatsapp.mode === "own"
                ? t(
                    "ui.RemitentesDeMarca.cuentaPropia",
                    "Cuenta propia de la marca",
                  )
                : t(
                    "ui.RemitentesDeMarca.numeroDeLaCuenta",
                    "Número propio en la cuenta de la empresa",
                  )}
            </Estado>
          ) : (
            <Estado propio={false}>
              {t("ui.RemitentesDeMarca.deLaEmpresa", "Número de la empresa")}
            </Estado>
          )}
        </div>
        {r.whatsapp.mode &&
          (r.whatsapp.verifiedName || r.whatsapp.businessName) && (
            <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
              {t(
                "ui.RemitentesDeMarca.nombreEnWhatsApp",
                "Nombre que ven en WhatsApp: {{nombre}}",
                {
                  nombre: r.whatsapp.verifiedName || r.whatsapp.businessName,
                },
              )}
            </p>
          )}

        {!r.whatsapp.mode && nombreEnTexto && (
          <Aviso>
            {t(
              "ui.RemitentesDeMarca.avisoWa",
              "{{marca}} usa el WhatsApp de la empresa: sus mensajes llevan «{{marca}}» en el texto. Con un número propio sus clientes verán su nombre en WhatsApp.",
              { marca },
            )}
          </Aviso>
        )}

        {puedeGestionar && (
          <div className="flex flex-wrap items-end gap-2">
            {inventario.data?.whatsapp.connected ? (
              <>
                <FormField
                  className="min-w-[12rem] flex-1"
                  htmlFor={`wa-${marcaId}`}
                  label={t(
                    "ui.RemitentesDeMarca.asignarWa",
                    "Otro número de la cuenta de la empresa",
                  )}
                >
                  <select
                    className={FIELD_CLS}
                    disabled={!waLibres.length}
                    id={`wa-${marcaId}`}
                    value={waElegido}
                    onChange={(e) => setWaElegido(e.target.value)}
                  >
                    <option value="">
                      {waLibres.length
                        ? t(
                            "ui.RemitentesDeMarca.eligeNumero",
                            "Elige un número",
                          )
                        : t(
                            "ui.RemitentesDeMarca.sinLibres",
                            "No hay números libres",
                          )}
                    </option>
                    {waLibres.map((n) => (
                      <option key={n.phoneNumberId} value={n.phoneNumberId}>
                        {[n.displayPhoneNumber, n.verifiedName]
                          .filter(Boolean)
                          .join(" · ")}
                      </option>
                    ))}
                  </select>
                </FormField>
                <Button
                  disabled={!waElegido || ocupado === "wa"}
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={asignarWa}
                >
                  {ocupado === "wa" ? (
                    <Loader2 className="mr-1.5 size-4 animate-spin" />
                  ) : null}
                  {t("ui.RemitentesDeMarca.asignar", "Asignar")}
                </Button>
              </>
            ) : (
              inventario.data && (
                <p
                  className="w-full text-xs"
                  style={{ color: "var(--ink-faint)" }}
                >
                  {t(
                    "ui.RemitentesDeMarca.sinWaEmpresa",
                    "La empresa no tiene su WhatsApp Business conectado: la marca puede conectar el suyo.",
                  )}
                </p>
              )
            )}
            <Button
              disabled={ocupado === "waPropio"}
              size="sm"
              type="button"
              variant="outline"
              onClick={conectarPropio}
            >
              {ocupado === "waPropio" ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <MessageCircle className="mr-1.5 size-4" />
              )}
              {r.whatsapp.mode === "own"
                ? t(
                    "ui.RemitentesDeMarca.reconectarPropio",
                    "Volver a conectar su cuenta",
                  )
                : t(
                    "ui.RemitentesDeMarca.conectarPropio",
                    "Conectar su propio WhatsApp",
                  )}
            </Button>
            {r.whatsapp.mode && (
              <Button
                size="sm"
                type="button"
                variant="ghost"
                onClick={volverWa}
              >
                <Unplug className="mr-1.5 size-4" />
                {t("ui.RemitentesDeMarca.usarEmpresa", "Usar el de la empresa")}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* ── Test ─────────────────────────────────────────────────── */}
      {puedeGestionar && (
        <div className="flex flex-wrap items-end gap-2">
          <FormField
            className="min-w-[12rem] flex-1"
            hint={t(
              "ui.RemitentesDeMarca.pruebaAyuda",
              "Se envía como un mensaje real de la marca y se cobra del saldo de la empresa.",
            )}
            htmlFor={`prueba-${marcaId}`}
            label={t("ui.RemitentesDeMarca.prueba", "Enviar una prueba a")}
          >
            <input
              className={FIELD_CLS}
              id={`prueba-${marcaId}`}
              inputMode="tel"
              placeholder="+1 512 555 0150"
              type="tel"
              value={prueba}
              onChange={(e) => setPrueba(e.target.value)}
            />
          </FormField>
          <Button
            disabled={!!ocupado}
            size="sm"
            type="button"
            variant="outline"
            onClick={() => probar("sms")}
          >
            {ocupado === "prueba-sms" ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <Send className="mr-1.5 size-4" />
            )}
            {t("ui.RemitentesDeMarca.probarSms", "Probar SMS")}
          </Button>
          <Button
            disabled={!!ocupado}
            size="sm"
            type="button"
            variant="outline"
            onClick={() => probar("whatsapp")}
          >
            {ocupado === "prueba-whatsapp" ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <Send className="mr-1.5 size-4" />
            )}
            {t("ui.RemitentesDeMarca.probarWa", "Probar WhatsApp")}
          </Button>
        </div>
      )}

      {compra && (
        <ComprarNumero
          marca={marca}
          marcaId={marcaId}
          onCerrar={() => setCompra(false)}
          onComprado={async (nuevo) => {
            setCompra(false);
            await refrescar(nuevo);
          }}
        />
      )}
    </div>
  );
}

/** Buy a number for the brand: same search and fee as the company's number. */
function ComprarNumero({
  marca,
  marcaId,
  onCerrar,
  onComprado,
}: {
  marca: string;
  marcaId: string;
  onCerrar: () => void;
  onComprado: (r: Remitentes) => void;
}) {
  const { t } = useTranslation();
  const [pais, setPais] = useState("US");
  const [area, setArea] = useState("");
  const [lista, setLista] = useState<NumeroDisponible[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [comprando, setComprando] = useState<string | null>(null);

  const buscar = async () => {
    setBuscando(true);
    try {
      setLista(
        (
          await remitentesDeMarcaService.disponibles(marcaId, {
            country: pais,
            areaCode: area,
          })
        ).numbers,
      );
    } catch (e) {
      toast.error(mensajeDeRemitente(t, codigoDeError(e)));
    } finally {
      setBuscando(false);
    }
  };

  const comprar = async (n: string) => {
    const ok = await confirmDialog({
      title: t(
        "ui.RemitentesDeMarca.comprarTitulo",
        "¿Comprar {{numero}} para {{marca}}?",
        { numero: n, marca },
      ),
      message: t(
        "ui.RemitentesDeMarca.comprarMensaje",
        "Se compra en la cuenta de SMS de la empresa, con el mismo costo que el número de la empresa, y queda asignado a la marca.",
      ),
      confirmText: t("ui.RemitentesDeMarca.comprar", "Comprar un número"),
      cancelText: t("common.cancel", { defaultValue: "Cancelar" }),
    });

    if (!ok) return;
    setComprando(n);
    try {
      const r = await remitentesDeMarcaService.comprarSms(marcaId, n);

      toast.success(
        t("ui.RemitentesDeMarca.comprado", "Número comprado para {{marca}}", {
          marca,
        }),
      );
      onComprado(r);
    } catch (e) {
      toast.error(mensajeDeRemitente(t, codigoDeError(e)));
    } finally {
      setComprando(null);
    }
  };

  return (
    <Modal
      open
      description={t("ui.RemitentesDeMarca.paraLaMarca", "Para {{marca}}", {
        marca,
      })}
      icon={<ShoppingCart />}
      size="md"
      title={t("ui.RemitentesDeMarca.comprar", "Comprar un número")}
      onOpenChange={(o) => !o && onCerrar()}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <FormField
            className="w-24"
            htmlFor="compra-pais"
            label={t("ui.RemitentesDeMarca.pais", "País")}
          >
            <input
              className={FIELD_CLS}
              id="compra-pais"
              maxLength={2}
              value={pais}
              onChange={(e) => setPais(e.target.value.toUpperCase())}
            />
          </FormField>
          <FormField
            className="w-32"
            htmlFor="compra-area"
            label={t("ui.RemitentesDeMarca.codigoDeArea", "Código de área")}
          >
            <input
              className={FIELD_CLS}
              id="compra-area"
              inputMode="numeric"
              maxLength={4}
              value={area}
              onChange={(e) => setArea(e.target.value.replace(/\D/g, ""))}
            />
          </FormField>
          <Button
            disabled={buscando}
            size="sm"
            type="button"
            variant="outline"
            onClick={buscar}
          >
            {buscando ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <Search className="mr-1.5 size-4" />
            )}
            {t("ui.RemitentesDeMarca.buscar", "Buscar")}
          </Button>
        </div>
        {lista && !lista.length && (
          <p className="text-sm" style={{ color: "var(--ink-faint)" }}>
            {t(
              "ui.RemitentesDeMarca.sinResultados",
              "No hay números disponibles con esos datos.",
            )}
          </p>
        )}
        {lista && lista.length > 0 && (
          <ul
            className="divide-y rounded-lg border"
            style={{ borderColor: "var(--hairline)" }}
          >
            {lista.map((n) => (
              <li
                key={n.phoneNumber}
                className="flex items-center justify-between gap-2 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="font-mono text-sm">{n.phoneNumber}</div>
                  <div
                    className="text-xs"
                    style={{ color: "var(--ink-faint)" }}
                  >
                    {[n.locality, n.region].filter(Boolean).join(", ")}
                  </div>
                </div>
                <Button
                  className="shrink-0"
                  disabled={!!comprando}
                  size="sm"
                  type="button"
                  variant="brand"
                  onClick={() => comprar(n.phoneNumber)}
                >
                  {comprando === n.phoneNumber ? (
                    <Loader2 className="mr-1.5 size-4 animate-spin" />
                  ) : null}
                  {t("ui.RemitentesDeMarca.comprarEste", "Comprar")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
