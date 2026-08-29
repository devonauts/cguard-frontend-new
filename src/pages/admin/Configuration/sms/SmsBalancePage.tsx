import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Loader2, MessageSquare, Wallet, Plus, RefreshCw, AlertTriangle, CheckCircle2, Phone, Search, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

import AppLayout from "@/layouts/app-layout";
import SettingsLayout from "@/layouts/SettingsLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageContainer, PageHeader, Section, StatusBadge, EmptyState, Modal, SkeletonCards, IconTile } from "@/components/kit";
import { smsAccountService, SmsAccount, SmsTransaction, AvailableNumber } from "@/lib/api/smsAccountService";

import { localeActual } from '@/lib/localeActual'
const COUNTRIES = [
  { code: "US", label: "Estados Unidos (+1)" },
  { code: "CA", label: "Canadá (+1)" },
  { code: "GB", label: "Reino Unido (+44)" },
  { code: "ES", label: "España (+34)" },
];

/** Aviso en línea: el tono manda el color, nunca el acento. */
function Aviso({ tone, icon, children }: {
  tone: "warn" | "info" | "bad"; icon: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div
      className="flex items-start gap-2 rounded-xl border p-3 text-xs"
      style={{
        background: `color-mix(in oklab, var(--${tone}) 10%, transparent)`,
        borderColor: `color-mix(in oklab, var(--${tone}) 28%, transparent)`,
        color: `var(--${tone}-text)`,
      }}
    >
      <span className="mt-0.5 shrink-0 [&_svg]:size-3.5">{icon}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

function money(cents: number, currency = "USD") {
  return new Intl.NumberFormat(localeActual(), { style: "currency", currency }).format((cents || 0) / 100);
}

function fmtDate(value?: string) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(localeActual(), { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function SmsBalancePage() {
  const { t } = useTranslation();
  const [account, setAccount] = useState<SmsAccount | null>(null);
  const [transactions, setTransactions] = useState<SmsTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [provisioning, setProvisioning] = useState(false);

  // Buy-number modal state
  const [buyOpen, setBuyOpen] = useState(false);
  const [country, setCountry] = useState("US");
  const [areaCode, setAreaCode] = useState("");
  const [searching, setSearching] = useState(false);
  const [numbers, setNumbers] = useState<AvailableNumber[]>([]);
  const [buying, setBuying] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await smsAccountService.get();
      setAccount(res.account);
      setTransactions(res.transactions || []);
    } catch {
      toast.error(t("sms.loadError", { defaultValue: "No se pudo cargar la cuenta SMS" }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, []);

  const onProvision = async () => {
    setProvisioning(true);
    try {
      const res = await smsAccountService.provision();
      setAccount(res.account);
      toast.success(t("sms.provisioned", { defaultValue: "Subcuenta SMS creada" }));
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.message || t("sms.provisionError", { defaultValue: "No se pudo crear la subcuenta" }));
    } finally {
      setProvisioning(false);
    }
  };

  const openBuy = () => {
    setNumbers([]);
    setAreaCode("");
    setBuyOpen(true);
  };

  const searchNumbers = async () => {
    setSearching(true);
    try {
      const res = await smsAccountService.availableNumbers({ country, areaCode: areaCode || undefined });
      setNumbers(res.numbers || []);
      if (!res.numbers?.length) {
        toast.info(t("sms.noNumbers", { defaultValue: "No se encontraron números con esos criterios" }));
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.message || t("sms.searchError", { defaultValue: "No se pudo buscar números" }));
    } finally {
      setSearching(false);
    }
  };

  const buyNumber = async (phoneNumber: string) => {
    setBuying(phoneNumber);
    try {
      const res = await smsAccountService.buyNumber(phoneNumber);
      setAccount(res.account);
      setBuyOpen(false);
      toast.success(t("sms.numberBought", { defaultValue: "Número adquirido y asignado" }));
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.message || t("sms.buyError", { defaultValue: "No se pudo adquirir el número" }));
    } finally {
      setBuying(null);
    }
  };

  const currency = account?.currency || "USD";

  return (
    <AppLayout>
      <SettingsLayout navKey="configuracion" title={t("settings.configuracion.sms", { defaultValue: "Saldo SMS" })}>
        <PageContainer width="narrow">
          <PageHeader
            icon={<MessageSquare />}
            title={t("settings.configuracion.sms", { defaultValue: "Saldo SMS" })}
            subtitle={t("sms.balanceTitle", { defaultValue: "Saldo de mensajería SMS" })}
            badges={
              !loading ? (
                <StatusBadge tone={account?.hasSender ? "ok" : account?.provisioned ? "warn" : "neutral"}>
                  {account?.hasSender
                    ? t("sms.badgeReady", { defaultValue: "Listo para enviar" })
                    : account?.provisioned
                    ? t("sms.badgeNoSender", { defaultValue: "Falta el número remitente" })
                    : t("sms.badgeOff", { defaultValue: "Sin activar" })}
                </StatusBadge>
              ) : undefined
            }
            actions={
              !loading ? (
                <Button variant="outline" size="sm" onClick={load}>
                  <RefreshCw size={14} className="mr-1.5" /> {t("sms.refresh", { defaultValue: "Actualizar" })}
                </Button>
              ) : undefined
            }
          />
          {loading ? (
            <SkeletonCards count={2} />
          ) : (
            <div className="space-y-6">
              {/* Balance moved to the unified communications wallet */}
              <Section title={t("sms.balanceMovedTitle", { defaultValue: "El saldo de SMS ahora se gestiona en Comunicaciones" })} icon={<Wallet />}>
                <div className="glass-flat flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <IconTile tone="brand" size="sm"><Wallet /></IconTile>
                    <p className="min-w-0 text-sm" style={{ color: "var(--ink-soft)" }}>
                      {t("sms.balanceMovedHint", { defaultValue: "Recarga tu saldo y revisa el consumo de SMS en la pestaña SMS de Comunicaciones." })}
                    </p>
                  </div>
                  <Button variant="brand" size="sm" asChild className="shrink-0">
                    <Link to="/setting/comunicaciones">
                      {t("sms.goToComms", { defaultValue: "Ir a Comunicaciones" })}
                      <ArrowRight className="ml-1.5" size={14} />
                    </Link>
                  </Button>
                </div>
              </Section>

              {/* Subaccount status */}
              <Section title={t("sms.accountTitle", { defaultValue: "Cuenta de envío (Twilio)" })} icon={<MessageSquare />}>
                <div className="space-y-3">
                  {!account?.platformConfigured && (
                    <Aviso tone="warn" icon={<AlertTriangle />}>
                      {t("sms.notConfigured", { defaultValue: "La mensajería SMS aún no está habilitada en la plataforma. El envío se activará en cuanto la plataforma habilite Twilio." })}
                    </Aviso>
                  )}

                  <div
                    className="flex items-center justify-between gap-3 border-b pb-3 text-sm"
                    style={{ borderColor: "var(--hairline)" }}
                  >
                    <span style={{ color: "var(--ink-soft)" }}>{t("sms.subaccount", { defaultValue: "Subcuenta dedicada" })}</span>
                    {account?.provisioned ? (
                      <StatusBadge tone="ok" dot={false}>
                        <CheckCircle2 size={12} /> {account.subaccountSid?.slice(0, 10)}…
                      </StatusBadge>
                    ) : (
                      <StatusBadge tone="neutral">{t("sms.notProvisioned", { defaultValue: "No creada" })}</StatusBadge>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span style={{ color: "var(--ink-soft)" }}>{t("sms.sender", { defaultValue: "Número remitente" })}</span>
                    {account?.phoneNumber ? (
                      <span className="font-medium tabular-nums">{account.phoneNumber}</span>
                    ) : (
                      <StatusBadge tone="warn">{t("sms.noSender", { defaultValue: "Pendiente" })}</StatusBadge>
                    )}
                  </div>

                  {!account?.provisioned && (
                    <Button
                      variant="brand"
                      onClick={onProvision}
                      disabled={provisioning || !account?.platformConfigured}
                    >
                      {provisioning ? <Loader2 className="mr-2 animate-spin" size={16} /> : <Plus className="mr-2" size={16} />}
                      {t("sms.createSubaccount", { defaultValue: "Crear subcuenta SMS" })}
                    </Button>
                  )}

                  {account?.provisioned && !account?.hasSender && (
                    <Button
                      variant="brand"
                      onClick={openBuy}
                      disabled={!account?.platformConfigured}
                    >
                      <Phone className="mr-2" size={16} />
                      {t("sms.buyNumber", { defaultValue: "Comprar número" })}
                    </Button>
                  )}
                </div>
              </Section>

              {/* Transactions */}
              <Section title={t("sms.txHistory", { defaultValue: "Historial de transacciones" })} icon={<Wallet />}>
                {transactions.length === 0 ? (
                  <EmptyState
                    icon={<Wallet />}
                    title={t("sms.noHistory", { defaultValue: "Sin movimientos todavía" })}
                    description={t("sms.noHistoryDesc", { defaultValue: "Aquí aparecerán las recargas y el consumo de tus mensajes." })}
                  />
                ) : (
                  <div className="space-y-2">
                    {transactions.map((tx) => (
                      <div key={tx.id} className="glass-flat flex items-center justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{tx.description || tx.type}</p>
                          <p className="text-xs" style={{ color: "var(--ink-faint)" }}>{fmtDate(tx.createdAt)}</p>
                        </div>
                        <div
                          className="shrink-0 text-sm font-semibold tabular-nums"
                          style={{ color: tx.amountCents >= 0 ? "var(--ok-text)" : "var(--ink)" }}
                        >
                          {tx.amountCents >= 0 ? "+" : "−"}{money(Math.abs(tx.amountCents), tx.currency || currency)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            </div>
          )}

          {/* Buy-number modal */}
          <Modal
            open={buyOpen}
            onOpenChange={(o) => { if (!buying) setBuyOpen(o); }}
            icon={<Phone />}
            title={t("sms.buyNumberTitle", { defaultValue: "Comprar número de envío" })}
          >
                <div className="space-y-4">
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="min-w-[9rem] flex-1">
                      <Label className="text-xs">{t("sms.country", { defaultValue: "País" })}</Label>
                      <select
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        className="cg-input cg-focus mt-1 h-9 w-full px-3 text-sm"
                      >
                        {COUNTRIES.map((c) => (
                          <option key={c.code} value={c.code}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="w-28">
                      <Label className="text-xs">{t("sms.areaCode", { defaultValue: "Código de área" })}</Label>
                      <Input value={areaCode} onChange={(e) => setAreaCode(e.target.value)} placeholder="415" />
                    </div>
                    <Button onClick={searchNumbers} disabled={searching} variant="outline">
                      {searching ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
                    </Button>
                  </div>

                  <div className={cn("max-h-72 overflow-y-auto", numbers.length ? "space-y-2" : "")}>
                    {numbers.length === 0 ? (
                      <EmptyState
                        icon={<Search />}
                        title={t("sms.searchPrompt", { defaultValue: "Busca números disponibles para comprar." })}
                      />
                    ) : (
                      <div className="space-y-2">
                        {numbers.map((n) => (
                          <div key={n.phoneNumber} className="glass-flat flex items-center justify-between gap-3 p-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold tabular-nums">{n.phoneNumber}</p>
                              <p className="truncate text-xs" style={{ color: "var(--ink-soft)" }}>
                                {[n.locality, n.region, n.isoCountry].filter(Boolean).join(", ")}
                              </p>
                            </div>
                            <Button
                              variant="brand"
                              size="sm"
                              onClick={() => buyNumber(n.phoneNumber)}
                              disabled={!!buying}
                            >
                              {buying === n.phoneNumber ? <Loader2 className="animate-spin" size={14} /> : t("sms.buy", { defaultValue: "Comprar" })}
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
                    {t("sms.buyNumberHint", { defaultValue: "El número se adquiere dentro de tu subcuenta y queda como remitente para tus SMS. Algunos países requieren documentación regulatoria de Twilio." })}
                  </p>
                </div>
          </Modal>
        </PageContainer>
      </SettingsLayout>
    </AppLayout>
  );
}
