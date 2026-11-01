/**
 * Create or edit a BRAND (module «Multimarca»).
 *
 * A brand is a separate legal company: besides its commercial name, code,
 * colour and logo it carries its own legal identity — legal name, tax id and
 * country are REQUIRED (the tax id is checked with the rule of the brand's
 * country, the mirror of the server's; when in doubt it is accepted).
 *
 * Archiving is refused by the server for the principal brand and for a brand
 * that still has clients; both reasons are explained in plain words.
 * Unarchiving takes a slot back; with none free it offers to buy one.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Archive, ArchiveRestore, ImageUp, Layers, Loader2 } from "lucide-react";

import { mensajeDeMarca } from "./mensajesDeMarca";
import { revisarMarca } from "./reglasDeMarca";
import { useComprarCupoDeMarca } from "./comprarCupoDeMarca";

import LogoDeMarca from "@/components/multimarca/LogoDeMarca";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { FIELD_CLS, FormField, Modal } from "@/components/kit";
import {
  codigoDeError,
  marcasService,
  subirLogoDeMarca,
  type DatosDeMarca,
  type Marca,
} from "@/lib/api/marcasService";
import { listaDePaises, terminosFiscales } from "@/lib/paisDeLaEmpresa";
import { getTenantCountry } from "@/utils/tenantLocation";

export const COLORES_DE_MARCA = [
  "#2563eb",
  "#16a34a",
  "#d97706",
  "#9333ea",
  "#dc2626",
  "#0891b2",
  "#db2777",
  "#475569",
];

interface Borrador {
  name: string;
  code: string;
  color: string;
  logoUrl: string;
  legalName: string;
  taxId: string;
  country: string;
  address: string;
  email: string;
  phone: string;
  establishmentCode: string;
}

const borradorDe = (m: Marca | null, pais: string): Borrador => ({
  name: m?.name || "",
  code: m?.code || "",
  color: m?.color || COLORES_DE_MARCA[0],
  logoUrl: m?.logoUrl || "",
  legalName: m?.legalName || "",
  taxId: m?.taxId || "",
  country: (m?.country || pais || "").toUpperCase(),
  address: m?.address || "",
  email: m?.email || "",
  phone: m?.phone || "",
  establishmentCode: m?.establishmentCode || "",
});

export function EditorDeMarca({
  abierto,
  marca,
  puedeEditar,
  onCerrar,
}: {
  abierto: boolean;
  /** `null` = create a new one. */
  marca: Marca | null;
  puedeEditar: boolean;
  onCerrar: () => void;
}) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const cupo = useComprarCupoDeMarca();
  const paisDeLaEmpresa = String(getTenantCountry() || "").toUpperCase();
  const [b, setB] = useState<Borrador>(() => borradorDe(marca, paisDeLaEmpresa));
  const [intento, setIntento] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const archivo = useRef<HTMLInputElement>(null);
  const paises = useMemo(() => listaDePaises(i18n.language), [i18n.language]);
  const terminos = terminosFiscales(b.country, i18n.language, {
    razonSocial: t("ui.EditorDeMarca.razonSocial", "Razón social"),
    idFiscal: t("ui.EditorDeMarca.identificador", "Identificador fiscal"),
  });

  useEffect(() => {
    if (!abierto) return;
    setB(borradorDe(marca, paisDeLaEmpresa));
    setIntento(false);
  }, [abierto, marca, paisDeLaEmpresa]);

  const errores = revisarMarca(b);
  const ver = (k: keyof typeof errores) => (intento ? errores[k] : undefined);
  const poner =
    (k: keyof Borrador) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setB((x) => ({ ...x, [k]: e.target.value }));
  const solo = !puedeEditar;

  const refrescar = () => qc.invalidateQueries({ queryKey: ["marcas"] });

  const subirLogo = async (f: File | undefined) => {
    if (!f) return;
    setSubiendo(true);
    try {
      const url = await subirLogoDeMarca(f);

      setB((x) => ({ ...x, logoUrl: url }));
    } catch {
      toast.error(
        t("ui.EditorDeMarca.logoError", "No se pudo subir el logo. Prueba con otra imagen."),
      );
    } finally {
      setSubiendo(false);
      if (archivo.current) archivo.current.value = "";
    }
  };

  const datos = (): DatosDeMarca => ({
    name: b.name.trim(),
    code: b.code.trim() || null,
    color: b.color || null,
    logoUrl: b.logoUrl || null,
    legalName: b.legalName.trim(),
    taxId: b.taxId.trim(),
    country: b.country.toUpperCase(),
    address: b.address.trim() || null,
    email: b.email.trim() || null,
    phone: b.phone.trim() || null,
    establishmentCode: b.establishmentCode.trim() || null,
  });

  const guardar = async () => {
    setIntento(true);
    if (Object.keys(errores).length) {
      toast.error(
        errores.taxId === "malo"
          ? mensajeDeMarca(t, "brand_invalid_tax_id")
          : mensajeDeMarca(t, "brand_missing_field"),
      );

      return;
    }
    setGuardando(true);
    try {
      if (marca) await marcasService.actualizar(marca.id, datos());
      else await marcasService.crear(datos());
      toast.success(t("ui.EditorDeMarca.guardada", "Marca guardada"));
      await refrescar();
      onCerrar();
    } catch (e) {
      const code = codigoDeError(e);

      if (code === "brand_slots_exhausted" && !marca) {
        await ofrecerCupo(() => guardar());
      } else toast.error(mensajeDeMarca(t, code));
    } finally {
      setGuardando(false);
    }
  };

  /** No free slot: offer to buy one, and retry when it is usable at once. */
  const ofrecerCupo = async (reintentar: () => void) => {
    if (!cupo.puede) {
      toast.error(
        [mensajeDeMarca(t, "brand_slots_exhausted"), cupo.motivo]
          .filter(Boolean)
          .join(" "),
      );

      return;
    }
    const ok = await confirmDialog({
      title: t("ui.EditorDeMarca.sinCuposTitulo", "Ya usas todas tus marcas"),
      message: cupo.precio
        ? t(
            "ui.EditorDeMarca.sinCuposMensaje",
            "Tu plan incluye las marcas que ya tienes en uso. Cada marca adicional es un pago único de {{precio}}.",
            { precio: cupo.precio },
          )
        : t(
            "ui.EditorDeMarca.sinCuposMensajeSinPrecio",
            "Tu plan incluye las marcas que ya tienes en uso. Cada marca adicional es un pago único.",
          ),
      confirmText: cupo.precio
        ? t("ui.MarcasPage.agregarOtra", "Agregar otra marca ({{precio}})", {
            precio: cupo.precio,
          })
        : t("ui.MarcasPage.agregarOtraSinPrecio", "Agregar otra marca"),
      cancelText: t("common.cancel", { defaultValue: "Cancelar" }),
    });

    if (!ok) return;
    if (await cupo.comprar({ sinConfirmar: true })) reintentar();
  };

  const archivar = async () => {
    if (!marca) return;
    if (marca.isPrincipal) {
      toast.error(mensajeDeMarca(t, "brand_is_principal"));

      return;
    }
    const ok = await confirmDialog({
      title: t("ui.EditorDeMarca.archivarTitulo", "¿Archivar {{nombre}}?", {
        nombre: marca.name,
      }),
      message: t(
        "ui.EditorDeMarca.archivarMensaje",
        "Deja de aparecer en la barra y en los formularios. No se borra nada y puedes volver a activarla cuando quieras.",
      ),
      confirmText: t("ui.EditorDeMarca.archivar", "Archivar"),
      cancelText: t("common.cancel", { defaultValue: "Cancelar" }),
      tone: "danger",
    });

    if (!ok) return;
    try {
      await marcasService.archivar(marca.id);
      toast.success(t("ui.EditorDeMarca.archivada", "Marca archivada"));
      await refrescar();
      onCerrar();
    } catch (e) {
      toast.error(mensajeDeMarca(t, codigoDeError(e)));
    }
  };

  const desarchivar = async () => {
    if (!marca) return;
    try {
      await marcasService.desarchivar(marca.id);
      toast.success(t("ui.EditorDeMarca.reactivada", "Marca activa otra vez"));
      await refrescar();
      onCerrar();
    } catch (e) {
      const code = codigoDeError(e);

      if (code === "brand_slots_exhausted") await ofrecerCupo(() => desarchivar());
      else toast.error(mensajeDeMarca(t, code));
    }
  };

  return (
    <Modal
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          {marca && puedeEditar && !marca.isPrincipal ? (
            marca.archivedAt ? (
              <Button type="button" variant="ghost" onClick={desarchivar}>
                <ArchiveRestore className="mr-1.5 size-4" />
                {t("ui.EditorDeMarca.desarchivar", "Volver a activar")}
              </Button>
            ) : (
              <Button type="button" variant="ghost" onClick={archivar}>
                <Archive className="mr-1.5 size-4" />
                {t("ui.EditorDeMarca.archivar", "Archivar")}
              </Button>
            )
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onCerrar}>
              {puedeEditar
                ? t("common.cancel", { defaultValue: "Cancelar" })
                : t("common.close", { defaultValue: "Cerrar" })}
            </Button>
            {puedeEditar && (
              <Button
                disabled={guardando || subiendo}
                type="button"
                variant="brand"
                onClick={guardar}
              >
                {guardando
                  ? t("ui.EditorDeMarca.guardando", "Guardando…")
                  : t("ui.EditorDeMarca.guardar", "Guardar marca")}
              </Button>
            )}
          </div>
        </div>
      }
      icon={<Layers />}
      open={abierto}
      size="lg"
      title={
        <span className="inline-flex items-center gap-2">
          {marca
            ? t("ui.EditorDeMarca.editar", "Editar marca")
            : t("ui.EditorDeMarca.nueva", "Nueva marca")}
          {marca?.isPrincipal && (
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{
                background: "color-mix(in oklab, var(--brand) 16%, transparent)",
                color: "var(--brand-text, var(--brand))",
              }}
            >
              {t("ui.Multimarca.principal", "Principal")}
            </span>
          )}
        </span>
      }
      onOpenChange={(o) => !o && onCerrar()}
    >
      <fieldset className="space-y-5" disabled={solo}>
        {/* ── How people know it ─────────────────────────────── */}
        <div className="flex items-start gap-4">
          <div className="flex flex-col items-center gap-2">
            <LogoDeMarca
              color={b.color}
              logoUrl={b.logoUrl}
              nombre={b.name || "?"}
              size={64}
            />
            {puedeEditar && (
              <>
                <input
                  ref={archivo}
                  accept="image/*"
                  className="sr-only"
                  id="marca-logo"
                  type="file"
                  onChange={(e) => subirLogo(e.target.files?.[0])}
                />
                <label
                  className="cg-focus inline-flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium"
                  htmlFor="marca-logo"
                  style={{ borderColor: "var(--hairline)" }}
                >
                  {subiendo ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <ImageUp className="size-3.5" />
                  )}
                  {b.logoUrl
                    ? t("ui.EditorDeMarca.cambiarLogo", "Cambiar logo")
                    : t("ui.EditorDeMarca.subirLogo", "Subir logo")}
                </label>
                {b.logoUrl && (
                  <button
                    className="text-[11px] underline"
                    style={{ color: "var(--ink-faint)" }}
                    type="button"
                    onClick={() => setB((x) => ({ ...x, logoUrl: "" }))}
                  >
                    {t("ui.EditorDeMarca.quitarLogo", "Quitar")}
                  </button>
                )}
              </>
            )}
          </div>
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-[1fr_7rem]">
            <FormField
              required
              error={
                ver("name")
                  ? t("ui.EditorDeMarca.faltaNombre", "Escribe el nombre comercial.")
                  : undefined
              }
              htmlFor="marca-nombre"
              label={t("ui.EditorDeMarca.nombre", "Nombre comercial")}
            >
              <input
                aria-invalid={!!ver("name") || undefined}
                className={FIELD_CLS}
                id="marca-nombre"
                maxLength={120}
                placeholder={t("ui.EditorDeMarca.nombreEjemplo", "Ej.: Andina Seguridad")}
                value={b.name}
                onChange={poner("name")}
              />
            </FormField>
            <FormField htmlFor="marca-codigo" label={t("ui.EditorDeMarca.codigo", "Código")}>
              <input
                className={FIELD_CLS}
                id="marca-codigo"
                maxLength={12}
                placeholder="AND"
                value={b.code}
                onChange={(e) =>
                  setB((x) => ({ ...x, code: e.target.value.toUpperCase() }))
                }
              />
            </FormField>
            <div className="space-y-2 sm:col-span-2">
              <div className="text-sm font-medium">
                {t("ui.EditorDeMarca.color", "Color")}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {COLORES_DE_MARCA.map((c) => (
                  <button
                    key={c}
                    aria-label={c}
                    aria-pressed={b.color === c}
                    className="size-7 rounded-full border-2 transition-transform hover:scale-110"
                    style={{
                      background: c,
                      borderColor: b.color === c ? "var(--ink)" : "transparent",
                    }}
                    type="button"
                    onClick={() => setB((x) => ({ ...x, color: c }))}
                  />
                ))}
                <input
                  aria-label={t("ui.EditorDeMarca.otroColor", "Otro color")}
                  className="h-7 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
                  type="color"
                  value={/^#[0-9a-f]{6}$/i.test(b.color) ? b.color : "#2563eb"}
                  onChange={poner("color")}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Legal identity (required: it is another company) ── */}
        <div
          className="space-y-3 rounded-xl border p-3"
          style={{ borderColor: "var(--hairline)" }}
        >
          <div>
            <div className="text-sm font-medium">
              {t("ui.EditorDeMarca.identidadTitulo", "Identidad legal")}
            </div>
            <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
              {t(
                "ui.EditorDeMarca.identidadAyuda",
                "Cada marca es una empresa aparte: su razón social, su identificador fiscal y su país son obligatorios.",
              )}
            </p>
          </div>
          <FormField
            required
            error={
              ver("legalName")
                ? t("ui.EditorDeMarca.faltaRazon", "Escribe la razón social.")
                : undefined
            }
            htmlFor="marca-razon"
            label={terminos.razonSocial}
          >
            <input
              aria-invalid={!!ver("legalName") || undefined}
              className={FIELD_CLS}
              id="marca-razon"
              maxLength={200}
              value={b.legalName}
              onChange={poner("legalName")}
            />
          </FormField>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[12rem_1fr]">
            <FormField
              required
              error={
                ver("country")
                  ? t("ui.EditorDeMarca.faltaPais", "Elige el país.")
                  : undefined
              }
              htmlFor="marca-pais"
              label={t("ui.EditorDeMarca.pais", "País")}
            >
              <select
                aria-invalid={!!ver("country") || undefined}
                className={FIELD_CLS}
                id="marca-pais"
                value={b.country}
                onChange={poner("country")}
              >
                <option value="">
                  {t("ui.EditorDeMarca.eligePais", "Elige un país")}
                </option>
                {paises.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField
              required
              error={
                ver("taxId") === "falta"
                  ? t("ui.EditorDeMarca.faltaIdentificador", "Escribe el {{documento}}.", {
                      documento: terminos.idFiscal,
                    })
                  : ver("taxId") === "malo"
                    ? t(
                        "ui.EditorDeMarca.identificadorMalo",
                        "Ese {{documento}} no parece válido para el país elegido.",
                        { documento: terminos.idFiscal },
                      )
                    : undefined
              }
              htmlFor="marca-fiscal"
              label={terminos.idFiscal}
            >
              <input
                aria-invalid={!!ver("taxId") || undefined}
                className={FIELD_CLS}
                id="marca-fiscal"
                maxLength={40}
                value={b.taxId}
                onChange={poner("taxId")}
              />
            </FormField>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField
              hint={t(
                "ui.EditorDeMarca.establecimientoAyuda",
                "Si la autoridad fiscal le da uno (p. ej. 001).",
              )}
              htmlFor="marca-estab"
              label={t("ui.EditorDeMarca.establecimiento", "Código de establecimiento")}
            >
              <input
                className={FIELD_CLS}
                id="marca-estab"
                maxLength={20}
                value={b.establishmentCode}
                onChange={poner("establishmentCode")}
              />
            </FormField>
            <FormField htmlFor="marca-telefono" label={t("ui.EditorDeMarca.telefono", "Teléfono")}>
              <input
                className={FIELD_CLS}
                id="marca-telefono"
                maxLength={40}
                type="tel"
                value={b.phone}
                onChange={poner("phone")}
              />
            </FormField>
            <FormField htmlFor="marca-correo" label={t("ui.EditorDeMarca.correo", "Correo")}>
              <input
                className={FIELD_CLS}
                id="marca-correo"
                maxLength={160}
                type="email"
                value={b.email}
                onChange={poner("email")}
              />
            </FormField>
            <FormField htmlFor="marca-dir" label={t("ui.EditorDeMarca.direccion", "Dirección")}>
              <input
                className={FIELD_CLS}
                id="marca-dir"
                maxLength={255}
                value={b.address}
                onChange={poner("address")}
              />
            </FormField>
          </div>
        </div>
      </fieldset>
    </Modal>
  );
}
