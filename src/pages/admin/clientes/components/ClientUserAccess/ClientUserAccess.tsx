import type { Client } from "@/types/client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  UserPlus,
  Users,
  Trash2,
  Mail,
  Smartphone,
  Loader2,
} from "lucide-react";

import {
  FIELD_CLS,
  LabeledField,
  RowAction,
  TabLoading,
  Avatar,
} from "../_shared/tab-kit";

import useScrollToTopOnMount from "@/hooks/useScrollToTopOnMount";
import { clientService } from "@/lib/api/clientService";
import { useAppInviteEnabled } from "@/hooks/useAppInviteEnabled";
import { useAppDelCliente } from "@/lib/appDelCliente";
import {
  Section,
  EmptyState,
  StatusBadge,
  Modal,
  SearchInput,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
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
  const app = useAppDelCliente();
  const containerRef = useRef<HTMLDivElement | null>(null);

  useScrollToTopOnMount(containerRef);

  const [users, setUsers] = useState<AccessUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
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
    load();
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
    // It sent «no-es-correo» and the server provisioned an account for it (QA M12).
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error(t("clients.contacts.errors.invalidEmail", "Correo inválido"));

      return;
    }
    const name = form.name.trim() || undefined;
    setSending(true);
    try {
      if (form.channel === "portal")
        await clientService.sendClientPortalInvitation(client.id, email, name);
      else await clientService.sendClientAppInvitation(client.id, email, name);
      toast.success(
        t("ui.ClientsPage.invitacionEnviadaA", {
          defaultValue: "Invitación enviada a {{to}}",
          to: email,
        }),
      );
      setInviteOpen(false);
      setForm({
        name: "",
        email: "",
        channel: appInviteEnabled ? "app" : "portal",
      });
      await load();
    } catch (e: any) {
      toast.error(
        e?.response?.data?.message ||
          t(
            "ui.ClientsPage.errorEnviarInvitacion",
            "No se pudo enviar la invitación",
          ),
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
        message: t("ui.ClientUserAccess.revocarAccesoConfirm", {
          defaultValue: "¿Revocar el acceso de {{name}}?",
          name: u.name,
        }),
        tone: "danger",
      }))
    )
      return;
    try {
      await clientService.revokeClientAccess(client.id, u.pivotId);
      toast.success(t("ui.ClientUserAccess.accesoRevocado", "Acceso revocado"));
      await load();
    } catch {
      toast.error(t("ui.ClientUserAccess.noSePudoRevocar"));
    }
  };

  if (loading) return <TabLoading count={2} />;

  return (
    <div ref={containerRef} className="space-y-4">
      <Section
        action={
          <Button size="sm" variant="brand" onClick={() => setInviteOpen(true)}>
            <UserPlus className="mr-1.5 h-4 w-4" />{" "}
            {t("ui.ClientUserAccess.invitarAcceso", "Invitar acceso")}
          </Button>
        }
        icon={<Users className="h-4 w-4" />}
        title={t("comun.usuariosConAcceso")}
      >
        <SearchInput
          className="mb-3 max-w-sm"
          placeholder={t("ui.ClientUserAccess.buscarPorNombreOCorreo")}
          value={query}
          onChange={(v) => setQuery(v)}
        />

        {filtered.length === 0 ? (
          <EmptyState
            action={
              <Button size="sm" onClick={() => setInviteOpen(true)}>
                <UserPlus className="mr-1.5 h-4 w-4" />{" "}
                {t("ui.ClientUserAccess.invitarAcceso", "Invitar acceso")}
              </Button>
            }
            description={t("ui.ClientUserAccess.invitaAlTitularOAgrega", { app })}
            icon={<Users className="h-5 w-5" />}
            title={t("comun.sinUsuariosConAcceso")}
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
                    dot={false}
                    tone={u.isTitular ? "green" : "blue"}
                  >
                    {u.role || t("ui.ClientPortal.acceso", "Acceso")}
                  </StatusBadge>
                  {!u.isTitular && u.pivotId && (
                    <RowAction
                      title={t(
                        "ui.ClientUserAccess.revocarAcceso",
                        "Revocar acceso",
                      )}
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
        footer={
          <>
            <Button
              disabled={sending}
              variant="outline"
              onClick={() => setInviteOpen(false)}
            >
              {t("actions.cancel")}
            </Button>
            <Button
              disabled={sending || !form.email.trim()}
              variant="brand"
              onClick={invite}
            >
              {sending ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />{" "}
                  {t("ui.ClientPortal.enviando", "Enviando…")}
                </>
              ) : (
                t("ui.ClientPortal.enviarInvitacion", "Enviar invitación")
              )}
            </Button>
          </>
        }
        icon={<UserPlus className="h-5 w-5" />}
        open={inviteOpen}
        title={t("ui.ClientUserAccess.invitarAcceso", "Invitar acceso")}
        onOpenChange={(o) => {
          if (!sending) setInviteOpen(o);
        }}
      >
        <div className="space-y-3">
          {/* The invited person's own name: without it the e-mail greeted
              them with the titular's name (QA M14). Optional. */}
          <LabeledField
            label={t("ui.ClientUserAccess.nombreDeLaPersona", "Nombre de la persona (opcional)")}
          >
            <input
              className={FIELD_CLS}
              maxLength={150}
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </LabeledField>
          <LabeledField label={t("ui.ClientUserAccess.correoDeLaPersona")}>
            <input
              className={FIELD_CLS}
              placeholder={t("ui.ClientUserAccess.personaEmpresaCom")}
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </LabeledField>
          {/* Both choices create the SAME customer account (app and portal)
              with the same activation link; what changes is only the e-mail
              template. «Portal web» read like a different, web-only access
              and the list then said «Acceso a la app» (QA re-test N1). */}
          <LabeledField
            label={t("ui.ClientUserAccess.correoDeInvitacion", "Correo que recibe")}
          >
            <div
              className={`grid gap-2 ${appInviteEnabled ? "grid-cols-2" : "grid-cols-1"}`}
            >
              {(
                [
                  [
                    "app",
                    t("ui.ClientUserAccess.opcionDescargaApp", {
                      defaultValue: "Descargar la app {{app}}",
                      app,
                    }),
                  ],
                  [
                    "portal",
                    t("ui.ClientUserAccess.opcionBienvenida", "Bienvenida y activación"),
                  ],
                ] as const
              )
                .filter(([canal]) => canal !== "app" || appInviteEnabled)
                .map(([canal, etiqueta]) => {
                  const activo = form.channel === canal;

                  return (
                    <button
                      key={canal}
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
                      onClick={() => setForm({ ...form, channel: canal })}
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
            )}{" "}
            {t(
              "ui.ClientUserAccess.mismaCuenta",
              "Es la misma cuenta en los dos casos (app y portal): solo cambia el correo.",
            )}
          </p>
        </div>
      </Modal>
    </div>
  );
}
