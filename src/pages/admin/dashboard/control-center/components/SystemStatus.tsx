/**
 * La banda de estado del puesto: el enlace en vivo, cuántos equipos reportan y
 * el tamaño de la operación. Va abajo y a lo ancho — es el pie del tablero, no
 * un dato que se consulte cada minuto.
 *
 * Las etiquetas que aparecen en `HEALTH_ROUTES` se escriben EXACTAMENTE igual:
 * ese mapa está indexado por el texto visible.
 */
import type { KeyboardEvent } from "react";
import { Activity, Cpu, Radio, Users, type LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { IconTile } from "@/components/kit";
import { HEALTH_ROUTES } from "../navigation";
import { toneFill, type Tone } from "../tone";

interface Celda { icon: LucideIcon; label: string; value: string; hint: string; tone: Tone }

export function SystemStatus({ sseConnected, onlineDevices, stations, clients, team }: {
  sseConnected: boolean; onlineDevices: number; stations: number; clients: number; team: number;
}) {
  const celdas: Celda[] = [
    {
      icon: Radio, label: "Enlace en tiempo real",
      value: sseConnected ? "Conectado" : "Sondeo",
      hint: sseConnected ? "Los eventos llegan al instante" : "Actualizando cada pocos segundos",
      tone: sseConnected ? "ok" : "warn",
    },
    {
      icon: Cpu, label: "Dispositivos en línea",
      value: String(onlineDevices), hint: "Equipos reportando posición",
      tone: onlineDevices > 0 ? "ok" : "neutral",
    },
    {
      icon: Activity, label: "Puestos / Clientes",
      value: `${stations} / ${clients}`, hint: "Puestos activos y cuentas atendidas",
      tone: "brand",
    },
    {
      icon: Users, label: "Equipo administrativo",
      value: String(team), hint: "Usuarios con acceso al sistema",
      tone: "neutral",
    },
  ];

  return (
    <div className="glass cmd-cells grid grid-cols-1 overflow-hidden sm:grid-cols-2 xl:grid-cols-4">
      {celdas.map((c) => <CeldaEstado key={c.label} celda={c} />)}
    </div>
  );
}

function CeldaEstado({ celda }: { celda: Celda }) {
  const navigate = useNavigate();
  const to = HEALTH_ROUTES[celda.label];
  const ir = to ? () => navigate(to) : undefined;
  const Icon = celda.icon;
  return (
    <div
      className={`cg-focus relative flex items-center gap-3 p-4 transition-colors ${ir ? "cursor-pointer hover:bg-[var(--glass-sunken)]" : ""}`}
      {...(ir
        ? {
            role: "button" as const,
            tabIndex: 0,
            "aria-label": celda.label,
            onClick: ir,
            onKeyDown: (e: KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ir(); }
            },
          }
        : {})}
    >
      <IconTile tone={celda.tone} size="sm"><Icon /></IconTile>
      <div className="min-w-0">
        <div className="cg-eyebrow truncate">{celda.label}</div>
        <div className="mt-1 flex items-center gap-1.5">
          <span className="inline-block size-1.5 shrink-0 rounded-full" style={{ background: toneFill(celda.tone) }} />
          <span className="truncate text-sm font-semibold tabular-nums">{celda.value}</span>
        </div>
        <div className="truncate text-[11px]" style={{ color: "var(--ink-faint)" }}>{celda.hint}</div>
      </div>
    </div>
  );
}
