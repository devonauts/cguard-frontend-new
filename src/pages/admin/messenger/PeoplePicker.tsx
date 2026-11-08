import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Briefcase, Loader2, ShieldCheck, UserRound } from "lucide-react";

import { SearchInput } from "@/components/kit";
import { messageService, type MessagePerson } from "@/lib/api/messageService";

/** Etiqueta corta del tipo de persona: «Vigilante», el rol del equipo, «Cliente». */
export function useEtiquetaDePersona() {
  const { t } = useTranslation();

  return (p: Pick<MessagePerson, "kind" | "roles">) => {
    if (p.kind === "guard") return t("dashboard.table.headers.guard", "Vigilante");
    if (p.kind === "client") return t("clients.client", "Cliente");
    const rol = (p.roles || [])
      .map((r) => t(`adminOfficeUsers.roleNames.${r}`, { defaultValue: "" }))
      .find(Boolean);

    return rol || t("ui.MessengerPage.equipo", "Equipo");
  };
}

const ICONO = {
  guard: ShieldCheck,
  staff: UserRound,
  client: Briefcase,
} as const;

/**
 * El buscador ÚNICO de Messaging: vigilantes, equipo de oficina y clientes en
 * una sola lista. `soloConCuenta` (grupos) desactiva a quien no tiene usuario —
 * un miembro sin cuenta no recibiría nada.
 */
export default function PeoplePicker({
  onPick,
  excluir = [],
  soloConCuenta = false,
  placeholder,
  autoFocus,
}: {
  onPick: (p: MessagePerson) => void;
  excluir?: string[];
  soloConCuenta?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation();
  const etiqueta = useEtiquetaDePersona();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<MessagePerson[]>([]);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    let activo = true;
    const texto = q.trim();

    if (!texto) {
      setRows([]);
      setBuscando(false);

      return;
    }
    setBuscando(true);
    const h = setTimeout(async () => {
      try {
        const res = await messageService.searchPeople(texto);

        if (activo) setRows(res);
      } catch {
        if (activo) setRows([]);
      } finally {
        if (activo) setBuscando(false);
      }
    }, 250);

    return () => {
      activo = false;
      clearTimeout(h);
    };
  }, [q]);

  const visibles = rows.filter((r) => !(r.userId && excluir.includes(r.userId)));

  return (
    <div>
      <SearchInput
        autoFocus={autoFocus}
        placeholder={
          placeholder ||
          t(
            "ui.MessengerPage.buscarPersona",
            "Buscar vigilante, equipo o cliente…",
          )
        }
        value={q}
        onChange={(v) => setQ(v)}
      />
      {q.trim() && (
        <div
          className="mt-2 max-h-56 overflow-auto rounded-xl border"
          style={{ borderColor: "var(--hairline)" }}
        >
          {buscando && visibles.length === 0 ? (
            <div
              className="flex items-center gap-2 px-3 py-2.5 text-sm"
              style={{ color: "var(--ink-soft)" }}
            >
              <Loader2 className="animate-spin" size={14} />
              {t("ui.MessengerPage.buscando", "Buscando…")}
            </div>
          ) : visibles.length === 0 ? (
            <p className="px-3 py-2.5 text-sm" style={{ color: "var(--ink-soft)" }}>
              {t("ui.MessengerPage.sinResultados", "Nadie con ese nombre.")}
            </p>
          ) : (
            visibles.map((p) => {
              const Icono = ICONO[p.kind] || UserRound;
              const bloqueado = !p.hasAccount || (soloConCuenta && !p.userId);

              return (
                <button
                  key={`${p.kind}:${p.recipientId}`}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors enabled:hover:bg-muted/50 disabled:cursor-not-allowed"
                  disabled={bloqueado}
                  title={
                    bloqueado
                      ? t(
                          "ui.MessengerPage.sinCuentaEnLaApp",
                          "Sin cuenta en la app: no puede recibir mensajes",
                        )
                      : undefined
                  }
                  type="button"
                  onClick={() => {
                    onPick(p);
                    setQ("");
                    setRows([]);
                  }}
                >
                  <span
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full border"
                    style={{
                      background: "var(--brand-wash)",
                      borderColor: "var(--brand-line)",
                      color: "var(--brand-text)",
                      opacity: bloqueado ? 0.5 : 1,
                    }}
                  >
                    <Icono size={14} />
                  </span>
                  <span className="min-w-0 flex-1" style={{ opacity: bloqueado ? 0.55 : 1 }}>
                    <span className="block truncate font-medium">{p.name}</span>
                    <span
                      className="block truncate text-[11px]"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {etiqueta(p)}
                      {p.detail ? ` · ${p.detail}` : ""}
                      {bloqueado
                        ? ` · ${t("ui.MessengerPage.sinCuenta", "sin cuenta en la app")}`
                        : ""}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
