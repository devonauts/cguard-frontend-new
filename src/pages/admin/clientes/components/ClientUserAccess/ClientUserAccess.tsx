import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import useScrollToTopOnMount from "@/hooks/useScrollToTopOnMount";
import { clientService } from "@/lib/api/clientService";
import { useAppInviteEnabled } from "@/hooks/useAppInviteEnabled";
import {
  Search,
  UserPlus,
  Users,
  Trash2,
  Mail,
  Smartphone,
  Loader2,
} from "lucide-react";
import { Section, EmptyState, StatusBadge, Modal } from "@/components/kit";
import {
  FIELD_CLS,
  LabeledField,
  RowAction,
  TabLoading,
  Avatar,
} from "../_shared/tab-kit";
import { Button } from "@/components/ui/button";
import type { Client } from "@/types/client";
import { confirmDialog } from "@/components/ui/confirmDialog";

type Props = { client: Client };
// Row from GET /client-account/:id/access-users (clientAccountAccessUsers.ts).
interface AccessUser {
  id: string;
  pivotId: string | null;
  userId: string | null;
  isTitular: boolean;
  name: string;
  email: string | null;
  role: string;
  status?: string;
}

export default function ClientUserAccess({ client }: Props) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  useScrollToTopOnMount(containerRef);

  const [users, setUsers] = useState<AccessUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [form, setForm] = useState({
    email: "",
    channel: "app" as "app" | "portal",
  });
  const [sending, setSending] = useState(false);

  // Con el correo de la app apagado sólo queda el portal, y el canal por
  // defecto tiene que dejar de ser uno que el servidor va a rechazar.
  const appInviteEnabled = useAppInviteEnabled();
  useEffect(() => {
    if (!appInviteEnabled)
      setForm((f) => (f.channel === "app" ? { ...f, channel: "portal" } : f));
  }, [appInviteEnabled]);

  const load = async () => {
    try {
      const u = await clientService.getClientAccessUsers(client.id);
      setUsers(Array.isArray(u) ? u : []);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    setLoading(true);
    load(); /* eslint-disable-next-line */
  }, [client.id]);

  const filtered = users.filter(
    (u) =>
      (u.name || "").toLowerCase().includes(query.toLowerCase()) ||
      (u.email || "").toLowerCase().includes(query.toLowerCase()),
  );

  const invite = async () => {
    const email = form.email.trim();
    if (!email) {
      toast.error(t("ui.ClientUserAccess.ingresaUnCorreo"));
      return;
    }
    setSending(true);
    try {
      if (form.channel === "portal")
        await clientService.sendClientPortalInvitation(client.id, email);
      else await clientService.sendClientAppInvitation(client.id, email);
      toast.success(`Invitación enviada a ${email}`);
      setInviteOpen(false);
      setForm({ email: "", channel: appInviteEnabled ? "app" : "portal" });
      await load();
    } catch (e: any) {
      toast.error(
        e?.response?.data?.message || "No se pudo enviar la invitación",
      );
    } finally {
      setSending(false);
    }
  };

  const revoke = async (u: AccessUser) => {
    if (u.isTitular || !u.pivotId) {
      toast.error(t("ui.ClientUserAccess.elAccesoDelTitularSe"));
      return;
    }
    if (
      !(await confirmDialog({
        message: `¿Revocar el acceso de ${u.name}?`,
        tone: "danger",
      }))
    )
      return;
    try {
      await clientService.revokeClientAccess(client.id, u.pivotId);
      toast.success("Acceso revocado");
      await load();
    } catch {
      toast.error(t("ui.ClientUserAccess.noSePudoRevocar"));
    }
  };

  if (loading) return <TabLoading count={2} />;

  return (
    <div ref={containerRef} className="space-y-4">
      <Section
        title={t("comun.usuariosConAcceso")}
        icon={<Users className="h-4 w-4" />}
        action={
          <Button size="sm" variant="brand" onClick={() => setInviteOpen(true)}>
            <UserPlus className="mr-1.5 h-4 w-4" /> Invitar acceso
          </Button>
        }
      >
        <div className="mb-3 relative max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className={`${FIELD_CLS} pl-8`}
            placeholder={t("ui.ClientUserAccess.buscarPorNombreOCorreo")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={<Users className="h-5 w-5" />}
            title={t("comun.sinUsuariosConAcceso")}
            description={t("ui.ClientUserAccess.invitaAlTitularOAgrega")}
            action={
              <Button size="sm" onClick={() => setInviteOpen(true)}>
                <UserPlus className="mr-1.5 h-4 w-4" /> Invitar acceso
              </Button>
            }
          />
        ) : (
          <div className="divide-y">
            {filtered.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={u.name} solid={u.isTitular} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{u.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {u.email ||
                        t("ui.ClientUserAccess.sinCorreo", "Sin correo")}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge
                    tone={u.isTitular ? "green" : "blue"}
                    dot={false}
                  >
                    {u.role || "Acceso"}
                  </StatusBadge>
                  {!u.isTitular && u.pivotId && (
                    <RowAction
                      title="Revocar acceso"
                      tone="bad"
                      onClick={() => revoke(u)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </RowAction>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          {t(
            "ui.ClientUserAccess.losAccesosOtorganAlCliente",
            "Los accesos otorgan al cliente visibilidad únicamente de su propia operación.",
          )}
        </p>
      </Section>

      <Modal
        open={inviteOpen}
        onOpenChange={(o) => {
          if (!sending) setInviteOpen(o);
        }}
        title="Invitar acceso"
        icon={<UserPlus className="h-5 w-5" />}
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setInviteOpen(false)}
              disabled={sending}
            >
              {t("actions.cancel")}
            </Button>
            <Button
              variant="brand"
              onClick={invite}
              disabled={sending || !form.email.trim()}
            >
              {sending ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Enviando…
                </>
              ) : (
                t("ui.ClientPortal.enviarInvitacion", "Enviar invitación")
              )}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <LabeledField label={t("ui.ClientUserAccess.correoDeLaPersona")}>
            <input
              type="email"
              className={FIELD_CLS}
              placeholder={t("ui.ClientUserAccess.personaEmpresaCom")}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </LabeledField>
          <LabeledField label={t("ui.ClientUserAccess.tipoDeAcceso")}>
            <div
              className={`grid gap-2 ${appInviteEnabled ? "grid-cols-2" : "grid-cols-1"}`}
            >
              {(
                [
                  ["app", "App Mi Seguridad"],
                  ["portal", "Portal web"],
                ] as const
              )
                .filter(([canal]) => canal !== "app" || appInviteEnabled)
                .map(([canal, etiqueta]) => {
                  const activo = form.channel === canal;
                  return (
                    <button
                      key={canal}
                      onClick={() => setForm({ ...form, channel: canal })}
                      className="cg-focus flex items-center gap-2 rounded-lg border p-2.5 text-sm transition-all"
                      style={
                        activo
                          ? {
                              borderColor: "var(--brand-line)",
                              background: "var(--brand-wash)",
                              color: "var(--brand-text)",
                            }
                          : {
                              borderColor: "var(--hairline)",
                              color: "var(--ink-soft)",
                            }
                      }
                    >
                      {canal === "app" ? (
                        <Smartphone className="h-4 w-4" />
                      ) : (
                        <Mail className="h-4 w-4" />
                      )}{" "}
                      {etiqueta}
                    </button>
                  );
                })}
            </div>
          </LabeledField>
          <p className="text-xs text-muted-foreground">
            {t(
              "ui.ClientUserAccess.seCrearaElAccesoY",
              "Se creará el acceso y se enviará un enlace para que la persona configure su contraseña.",
            )}
          </p>
        </div>
      </Modal>
    </div>
  );
}
