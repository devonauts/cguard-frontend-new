import { KeyRound } from "lucide-react";
import { StatusBadge } from "@/components/kit";
import SettingsPageShell from "../components/SettingsPageShell";
import DeveloperTokensView, { TokenRow } from "./DeveloperTokensView";

export default function DeveloperTokensPage() {
  const tokens: TokenRow[] = [];

  return (
    <SettingsPageShell
      icon={<KeyRound />}
      title="Acceso de desarrollador"
      subtitle="Crea claves para que tus propios sistemas puedan leer y escribir información de C-Guard Pro."
      badges={
        <StatusBadge tone={tokens.length ? "ok" : "neutral"}>
          {tokens.length} clave{tokens.length === 1 ? "" : "s"} activa{tokens.length === 1 ? "" : "s"}
        </StatusBadge>
      }
    >
      <DeveloperTokensView
        tokens={tokens}
        onCreate={() => {
          // Solo consola, como pediste:
        }}
      />
    </SettingsPageShell>
  );
}
