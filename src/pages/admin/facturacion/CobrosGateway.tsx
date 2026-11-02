/**
 * COLLECTIONS — the company's OWN payment gateway (Stripe). The money goes
 * straight to the company's account; the platform never touches it. Keys are
 * verified by the server when connecting and the stored secret is never
 * shown again (only the last 4 of the publishable key).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CreditCard, Landmark, Link2, Plug, Unplug } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { Section, SkeletonCards, FormField, FIELD_CLS, StatusBadge, Field, InfoNote } from "@/components/kit";
import { fechaYHora } from "@/lib/horaDeLaEmpresa";
import clientBillingService from "@/lib/api/clientBillingService";
import { QK, avisarError } from "./comun";

export function CobrosGateway({ canEdit }: { canEdit: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const vista = useQuery({ queryKey: [QK, "gateway"], queryFn: () => clientBillingService.gateway() });
  const [secretKey, setSecretKey] = useState("");
  const [publishableKey, setPublishableKey] = useState("");
  const [allowCard, setAllowCard] = useState(true);
  const [allowAch, setAllowAch] = useState(true);
  const [trabajando, setTrabajando] = useState(false);
  const g = vista.data?.gateway;
  const refrescar = () => qc.invalidateQueries({ queryKey: [QK, "gateway"] });

  const conectar = async () => {
    setTrabajando(true);
    try {
      await clientBillingService.connectGateway({ secretKey: secretKey.trim(), publishableKey: publishableKey.trim(), allowCard, allowAch });
      setSecretKey(""); setPublishableKey("");
      toast.success(t("ui.Facturacion.cobros.conectada", "Pasarela conectada"));
      await refrescar();
    } catch (e) {
      avisarError(e, t("ui.Facturacion.cobros.noSePudoConectar", "No se pudo conectar. Revisa las claves."));
    } finally {
      setTrabajando(false);
    }
  };

  const opciones = async (card: boolean, ach: boolean) => {
    setTrabajando(true);
    try {
      await clientBillingService.updateGatewayOptions({ allowCard: card, allowAch: ach });
      toast.success(t("ui.Facturacion.ajustes.guardado", "Ajustes guardados"));
      await refrescar();
    } catch (e) {
      avisarError(e, t("ui.Facturacion.errorAlGuardar", "No se pudo guardar"));
    } finally {
      setTrabajando(false);
    }
  };

  const desconectar = async () => {
    if (!(await confirmDialog({ title: t("ui.Facturacion.cobros.desconectar", "Desconectar"), message: t("ui.Facturacion.cobros.desconectarConfirm", "Las claves se borran y los clientes dejan de poder pagar en línea. Las facturas ya emitidas siguen igual."), tone: "danger", confirmText: t("ui.Facturacion.cobros.desconectar", "Desconectar") }))) return;
    setTrabajando(true);
    try {
      await clientBillingService.disconnectGateway();
      toast.success(t("ui.Facturacion.cobros.desconectada", "Pasarela desconectada"));
      await refrescar();
    } catch (e) {
      avisarError(e, t("ui.Facturacion.errorAlGuardar", "No se pudo guardar"));
    } finally {
      setTrabajando(false);
    }
  };

  if (vista.isLoading || !g) return <SkeletonCards count={2} />;

  const clavesListas = /^sk_(test|live)_/.test(secretKey.trim()) && /^pk_(test|live)_/.test(publishableKey.trim());
  const eventosOk = g.eventsStatus === "ok" || g.eventsStatus === "active";

  return (
    <div className="space-y-4">
      <InfoNote tone="info">{t("ui.Facturacion.cobros.explicacion", "La empresa cobra con SU PROPIA cuenta de Stripe: el dinero entra directamente en ella y la plataforma nunca lo toca ni cobra comisión. Pega aquí las claves de tu cuenta; se verifican al conectar y la clave secreta no vuelve a mostrarse.")}</InfoNote>

      <Section
        title={t("ui.Facturacion.cobros.estado", "Estado de la pasarela")}
        icon={<Plug />}
        action={g.connected && canEdit ? <Button disabled={trabajando} variant="outline" onClick={desconectar}><Unplug size={14} /> {t("ui.Facturacion.cobros.desconectar", "Desconectar")}</Button> : undefined}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label={t("ui.Facturacion.cobros.conexion", "Conexión")} value={<StatusBadge tone={g.connected ? "ok" : "neutral"} dot>{g.connected ? t("ui.Facturacion.cobros.conectadaEstado", "Conectada") : t("ui.Facturacion.cobros.sinConectar", "Sin conectar")}</StatusBadge>} />
          <Field label={t("ui.Facturacion.cobros.modo", "Modo")} value={g.connected ? <StatusBadge tone={g.mode === "live" ? "brand" : "warn"}>{g.mode === "live" ? t("ui.Facturacion.cobros.modoReal", "Real") : t("ui.Facturacion.cobros.modoPrueba", "Prueba")}</StatusBadge> : "—"} />
          <Field label={t("ui.Facturacion.cobros.cuenta", "Cuenta")} value={g.accountLabel || "—"} />
          <Field label={t("ui.Facturacion.cobros.clavePublicable", "Clave publicable")} value={g.publicKeyLast4 ? `pk_…${g.publicKeyLast4}` : "—"} />
          <Field label={t("ui.Facturacion.cobros.verificada", "Verificada")} value={fechaYHora(g.verifiedAt)} />
          <Field label={t("ui.Facturacion.cobros.eventos", "Eventos (webhook)")} value={g.connected ? <StatusBadge tone={eventosOk ? "ok" : g.eventsStatus ? "bad" : "neutral"}>{eventosOk ? t("ui.Facturacion.cobros.eventosOk", "Recibiendo") : g.eventsStatus || t("ui.Facturacion.cobros.eventosSinDatos", "Sin datos")}</StatusBadge> : "—"} />
          <Field label={t("ui.Facturacion.cobros.ultimoEvento", "Último evento")} value={fechaYHora(g.eventsLastAt)} />
        </div>
        {g.lastError && <InfoNote className="mt-3" tone="bad" title={t("ui.Facturacion.cobros.ultimoError", "Último error")}>{g.lastError}</InfoNote>}
        {g.eventsError && <InfoNote className="mt-3" tone="warn" title={t("ui.Facturacion.cobros.errorDeEventos", "Error de eventos")}>{g.eventsError}</InfoNote>}
        {g.connected && vista.data?.eventsUrl && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <Link2 size={14} style={{ color: "var(--ink-faint)" }} />
            <span style={{ color: "var(--ink-soft)" }}>{t("ui.Facturacion.cobros.eventsUrlHint", "Dirección de eventos para tu cuenta de Stripe:")}</span>
            <code className="break-all text-xs">{vista.data.eventsUrl}</code>
          </div>
        )}
      </Section>

      {g.connected ? (
        <Section title={t("ui.Facturacion.cobros.mediosDePago", "Medios de pago que acepta")} icon={<CreditCard />}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="glass-flat flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="flex items-center gap-2"><CreditCard size={16} /> {t("ui.Facturacion.cobros.tarjeta", "Tarjeta")}</span>
              <Switch checked={g.allowCard} disabled={!canEdit || trabajando} onCheckedChange={(v) => opciones(v, g.allowAch)} />
            </label>
            <label className="glass-flat flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="flex items-center gap-2"><Landmark size={16} /> {t("ui.Facturacion.cobros.ach", "Débito bancario (ACH)")}</span>
              <Switch checked={g.allowAch} disabled={!canEdit || trabajando} onCheckedChange={(v) => opciones(g.allowCard, v)} />
            </label>
          </div>
        </Section>
      ) : canEdit ? (
        <Section
          title={t("ui.Facturacion.cobros.conectar", "Conectar la cuenta de Stripe")}
          icon={<Plug />}
          action={<Button disabled={trabajando || !clavesListas} variant="brand" onClick={conectar}>{trabajando ? t("ui.Facturacion.cobros.verificando", "Verificando…") : t("ui.Facturacion.cobros.conectar", "Conectar la cuenta de Stripe")}</Button>}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label={t("ui.Facturacion.cobros.claveSecreta", "Clave secreta (sk_…)")} hint={t("ui.Facturacion.cobros.claveSecretaHint", "Se guarda cifrada y no vuelve a mostrarse.")} required>
              <input autoComplete="off" className={FIELD_CLS} type="password" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} />
            </FormField>
            <FormField label={t("ui.Facturacion.cobros.clavePublicableInput", "Clave publicable (pk_…)")} required>
              <input autoComplete="off" className={FIELD_CLS} type="password" value={publishableKey} onChange={(e) => setPublishableKey(e.target.value)} />
            </FormField>
            <label className="glass-flat flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="flex items-center gap-2"><CreditCard size={16} /> {t("ui.Facturacion.cobros.tarjeta", "Tarjeta")}</span>
              <Switch checked={allowCard} onCheckedChange={setAllowCard} />
            </label>
            <label className="glass-flat flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="flex items-center gap-2"><Landmark size={16} /> {t("ui.Facturacion.cobros.ach", "Débito bancario (ACH)")}</span>
              <Switch checked={allowAch} onCheckedChange={setAllowAch} />
            </label>
          </div>
        </Section>
      ) : null}
    </div>
  );
}
