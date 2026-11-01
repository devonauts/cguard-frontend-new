import type { Station } from "@/types";

import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Package } from "lucide-react";

import inventoryAssignmentService from "@/lib/api/inventoryAssignmentService";
import { Section, EmptyState, SkeletonCards } from "@/components/kit";

type Props = { station: Station; stationId: string; postSiteId: string };

// An inventory-assignment row. Item + guard are read via several backend aliases
// (camel/snake case), so this stays permissive.
interface InvGuardRef {
  firstName?: string;
  first_name?: string;
  lastName?: string;
  last_name?: string;
  name?: string;
  fullName?: string;
}
interface InvItemRef {
  name?: string;
  serialNumber?: string;
  code?: string;
  condition?: string;
}
interface InventoryRow {
  id?: string;
  returnedAt?: string | null;
  inventoryItem?: InvItemRef | null;
  item?: InvItemRef | null;
  itemName?: string;
  name?: string;
  serialNumber?: string;
  condition?: string;
  assignedTo?: InvGuardRef | null;
  guard?: InvGuardRef | null;
  securityGuard?: InvGuardRef | null;
}

export default function StationInventory({ stationId }: Props) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!stationId) return;
    let mounted = true;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res: any = await inventoryAssignmentService.list({
          filter: { stationId },
          limit: 200,
          offset: 0,
        } as any);
        const list = (res?.rows ?? []).filter(
          (a: InventoryRow) => !a.returnedAt,
        );

        if (mounted) setRows(list);
      } catch (e: any) {
        if (mounted)
          setError(
            e?.message ||
              t("station.inventory.loadError", "Error al cargar inventario"),
          );
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [stationId]);

  return (
    <Section
      contentClassName="-mx-5 -mb-5"
      icon={<Package />}
      title={
        <>
          {t("station.inventory.title", "Inventario / Dotación")}
          {rows.length > 0 && (
            <span className="ml-2 font-normal text-muted-foreground">
              ({rows.length})
            </span>
          )}
        </>
      }
    >
      {loading ? (
        <div className="px-5 pb-5">
          <SkeletonCards count={3} />
        </div>
      ) : error ? (
        <div className="px-5 pb-5 text-sm" style={{ color: "var(--bad-text)" }}>
          {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="px-5 pb-5">
          <EmptyState
            icon={<Package />}
            title={t(
              "station.inventory.empty",
              "No hay inventario para esta estación.",
            )}
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead
              className="border-y"
              style={{ borderColor: "var(--hairline)" }}
            >
              <tr>
                <th className="cg-eyebrow px-2 py-2">
                  {t("station.inventory.col.item", "Artículo")}
                </th>
                <th className="cg-eyebrow px-2 py-2">
                  {t("station.inventory.col.serial", "Serie / Código")}
                </th>
                <th className="cg-eyebrow px-2 py-2">
                  {t("station.inventory.col.condition", "Estado")}
                </th>
                <th className="cg-eyebrow px-2 py-2">
                  {t("station.inventory.col.assignedTo", "Asignado a")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r: InventoryRow, i: number) => {
                const item = r.inventoryItem || r.item || {};
                const name = item.name || r.itemName || r.name || "-";
                const serial =
                  item.serialNumber || item.code || r.serialNumber || "-";
                const condition = item.condition || r.condition || "-";
                const guard = r.assignedTo || r.guard || r.securityGuard;
                const guardName = guard
                  ? [
                      guard.firstName || guard.first_name,
                      guard.lastName || guard.last_name,
                    ]
                      .filter(Boolean)
                      .join(" ") ||
                    guard.name ||
                    guard.fullName ||
                    String(guard)
                  : "-";

                return (
                  <tr key={r.id || i} className="hover:bg-muted/40">
                    <td className="px-2 py-2.5 text-foreground font-medium">
                      {name}
                    </td>
                    <td className="px-2 py-2.5 text-foreground">{serial}</td>
                    <td className="px-2 py-2.5 text-muted-foreground capitalize">
                      {condition}
                    </td>
                    <td className="px-2 py-2.5 text-foreground">{guardName}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
