import { KeyRound, Plus, Link2, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Section, EmptyState, IconTile } from "@/components/kit";

export type TokenRow = {
  id: string;
  accessToken: string;
  createdAt: string;   // formateado para mostrar
  expiresAt: string;   // formateado para mostrar
};

/** Fila de enlace de referencia — superficie plana porque se repite. */
function LinkRow({ icon, label, href }: { icon: React.ReactNode; label: string; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="glass-flat glass-hover cg-focus flex items-center gap-3 p-3.5"
    >
      <IconTile tone="neutral" size="sm">{icon}</IconTile>
      <div className="min-w-0">
        <div className="cg-eyebrow mb-0.5">{label}</div>
        <div className="truncate text-sm font-medium" style={{ color: "var(--brand-text)" }}>{href}</div>
      </div>
    </a>
  );
}

export default function DeveloperTokensView({
  tokens = [],
  onCreate,
}: {
  tokens?: TokenRow[];
  onCreate?: () => void;
}) {
  return (
    <div className="space-y-6">
      <Section title="Dónde conectar" icon={<Link2 />}>
        <div className="grid gap-3 sm:grid-cols-2">
          <LinkRow icon={<Link2 />} label="Dirección de conexión" href="https://developer.guardspro.com/" />
          <LinkRow icon={<BookOpen />} label="Documentación" href="https://developerdocument.guardspro.com" />
        </div>
      </Section>

      <Section
        title="Claves de acceso"
        icon={<KeyRound />}
        action={
          <Button
            variant="brand"
            size="sm"
            className="gap-2"
            onClick={() => {
              onCreate?.();
            }}
          >
            <Plus className="h-4 w-4" />
            Nueva clave
          </Button>
        }
      >
        {tokens.length === 0 ? (
          <EmptyState
            icon={<KeyRound />}
            title="Todavía no hay claves"
            description="Crea una clave para que tus propios sistemas puedan conectarse con C-Guard Pro."
          />
        ) : (
          <div className="space-y-2">
            {tokens.map((t) => (
              <div
                key={t.id}
                className="glass-flat flex flex-col gap-2 p-3.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="cg-eyebrow mb-1">Clave</div>
                  <code className="block truncate font-mono text-xs" style={{ color: "var(--ink)" }}>
                    {t.accessToken}
                  </code>
                </div>
                <div className="flex shrink-0 gap-6 text-xs" style={{ color: "var(--ink-soft)" }}>
                  <div>
                    <div className="cg-eyebrow mb-0.5">Creada</div>
                    {t.createdAt}
                  </div>
                  <div>
                    <div className="cg-eyebrow mb-0.5">Caduca</div>
                    {t.expiresAt}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
