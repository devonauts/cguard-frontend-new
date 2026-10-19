import { useState, useEffect, useCallback } from "react";
import { DataTable } from "@/components/table/DataTable";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  Star,
  Loader2,
  RotateCcw,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import guardRatingService, {
  GuardRatingRecord,
} from "@/lib/api/guardRatingService";
import { securityGuardService } from "@/lib/api/securityGuardService";
import { localeActual } from "@/lib/localeActual";
import { zonaDeLaEmpresa } from "@/lib/horaDeLaEmpresa";
import {
  PageContainer,
  PageHeader,
  Section,
  StatCard,
  StatsStrip,
  EmptyState,
  Stagger,
  SearchInput,
} from "@/components/kit";

// ── helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return "—";

  return new Date(iso).toLocaleDateString(localeActual(), { timeZone: zonaDeLaEmpresa(),
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Las estrellas van en `--warn` y no en el acento a propósito: una estrella de
 * calificación se lee dorada en cualquier producto, y si siguiera al acento
 * quedarían estrellas azules o violetas según la preferencia del usuario.
 */
function Stars({ value }: { value: number }) {
  const { t } = useTranslation();

  return (
    <span
      aria-label={t("ui.GuardRatings.nDe5", {
        defaultValue: "{{value}} de 5",
        value,
      })}
      className="inline-flex items-center gap-0.5"
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className="h-4 w-4"
          style={
            i <= value
              ? { fill: "var(--warn)", color: "var(--warn)" }
              : { color: "var(--ink-faint)", opacity: 0.5 }
          }
        />
      ))}
    </span>
  );
}

interface GuardOption {
  id: string;
  fullName: string;
}
// Loose shape of a securityGuard row from securityGuardService.list().
interface RawGuardListRow {
  id?: string | number;
  fullName?: string;
  guard?: { fullName?: string };
}

// ── component ────────────────────────────────────────────────────────────────

export default function GuardRatings() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [records, setRecords] = useState<GuardRatingRecord[]>([]);
  const [average, setAverage] = useState<number | null>(null);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [guardFilter, setGuardFilter] = useState<string>("all");
  const [guards, setGuards] = useState<GuardOption[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // ── fetch ratings ───────────────────────────────────────────────────────
  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const result = await guardRatingService.list({
        guardId: guardFilter !== "all" ? guardFilter : undefined,
        limit: 500,
      });

      setRecords(result.rows || []);
      setAverage(result.average);
      setCount(result.count);
    } catch (err) {
      console.error("Failed to fetch guard ratings", err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [guardFilter]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // Load guards for the filter dropdown (guardRating.guardId = securityGuard.id PK).
  useEffect(() => {
    (async () => {
      try {
        const resp: unknown = await securityGuardService.list({
          limit: 500,
          offset: 0,
        });
        const items: RawGuardListRow[] = Array.isArray(resp)
          ? resp
          : ((resp as { rows?: RawGuardListRow[] })?.rows ?? []);
        const opts: GuardOption[] = items
          .map((item) => {
            const id = item.id ?? null;
            const fullName = item.fullName ?? item.guard?.fullName ?? "";

            return id ? { id: String(id), fullName } : null;
          })
          .filter(Boolean) as GuardOption[];

        setGuards(opts);
      } catch (e) {
        console.error("Failed to load guards", e);
      }
    })();
  }, []);

  // ── filter + paginate ─────────────────────────────────────────────────────
  const q = searchQuery.toLowerCase().trim();
  const filtered = records.filter((r) => {
    if (!q) return true;

    return (
      (r.guardName ?? "").toLowerCase().includes(q) ||
      (r.clientName ?? "").toLowerCase().includes(q) ||
      (r.comment ?? "").toLowerCase().includes(q) ||
      (r.stationName ?? "").toLowerCase().includes(q)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <AppLayout>
      <PageContainer width="wide">
        <PageHeader
          icon={<Star />}
          subtitle={t("ui.GuardRatings.calificacionesDeLosClientesHacia")}
          title={t("sidebar.control-de-calidad", "Control de Calidad")}
        />

        {/* Stats */}
        <StatsStrip className="grid grid-cols-2 gap-4">
          <StatCard
            accent="orange"
            hint={
              average != null ? (
                <span className="inline-flex">
                  <Stars value={Math.round(average)} />
                </span>
              ) : undefined
            }
            icon={<Star />}
            label={
              guardFilter === "all"
                ? t("ui.GuardRatings.promedioGeneral", "Promedio general")
                : t(
                    "ui.GuardReviewsPage.promedioDelVigilante",
                    "Promedio del vigilante",
                  )
            }
            value={average != null ? average.toFixed(2) : "—"}
          />
          <StatCard
            accent="primary"
            icon={<Star />}
            label={t("ui.GuardRatings.calificaciones", "Calificaciones")}
            value={count}
          />
        </StatsStrip>

        {/* Toolbar */}
        <div className="flex flex-col md:flex-row justify-between gap-4">
          <div className="w-full md:w-64">
            <Select
              value={guardFilter}
              onValueChange={(v) => {
                setGuardFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("comun.todosLosVigilantes")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("comun.todosLosVigilantes")}
                </SelectItem>
                {guards.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <SearchInput
            className="w-full md:w-80"
            placeholder={t("ui.GuardRatings.buscarPorVigilanteClienteO")}
            value={searchQuery}
            onChange={(v) => {
              setSearchQuery(v);
              setPage(1);
            }}
          />
        </div>

        {/* Table — Calificaciones a personal (las reseñas son hacia cada
            vigilante, no hacia la empresa). Cada fila abre el perfil del
            vigilante › Reseñas. */}
        <Section
          contentClassName="overflow-hidden rounded-2xl"
          icon={<Star />}
          title={t(
            "ui.GuardRatings.calificacionesAPersonal",
            "Calificaciones a personal",
          )}
        >
          {/* `DataTable` y no el primitivo `<Table>`: se pliega sola en fichas
              en el teléfono, donde estas seis columnas se leían de lado. El
              clic de la fila —ir a las reseñas del vigilante— viaja en
              `onRowClick`, y la ficha lo hereda. */}
          <DataTable
            columns={[
              {
                key: "createdAt",
                header: t("comun.fecha"),
                render: (_v: any, row: any) => formatDate(row.createdAt),
              },
              {
                key: "guardName",
                header: t("comun.vigilante"),
                titulo: true,
                render: (_v: any, row: any) => (
                  <span style={{ color: "var(--brand-text)" }}>
                    {row.guardName ?? "—"}
                  </span>
                ),
              },
              {
                key: "clientName",
                header: t("comun.cliente"),
                render: (_v: any, row: any) => row.clientName ?? "—",
              },
              {
                key: "stationName",
                header: t("ui.GuardRatings.estacion", "Estación"),
                render: (_v: any, row: any) => row.stationName ?? "—",
              },
              {
                key: "rating",
                header: t("ui.GuardRatings.calificacion", "Calificación"),
                render: (_v: any, row: any) => <Stars value={row.rating} />,
              },
              {
                key: "comment",
                header: t("ui.DocumentPacketPublic.commentAria", "Comentario"),
                render: (_v: any, row: any) => row.comment ?? "—",
              },
            ]}
            containerless
            data={paginated as any}
            emptyState={
              // A failed load is not "no ratings yet" (QA-130).
              error ? (
                <EmptyState
                  action={
                    <Button size="sm" variant="outline" onClick={fetchRecords}>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      {t("ui.shared.reintentar", "Reintentar")}
                    </Button>
                  }
                  className="border-0"
                  description={t(
                    "ui.shared.revisaTuConexionYVuelve",
                    "Revisa tu conexión y vuelve a intentarlo.",
                  )}
                  icon={<AlertCircle style={{ color: "var(--bad-text)" }} />}
                  title={t(
                    "ui.GuardRatings.noSePudieronCargar",
                    "No se pudieron cargar las calificaciones",
                  )}
                />
              ) : (
                <EmptyState
                  className="border-0"
                  description={t(
                    "ui.GuardRatings.lasCalificacionesEnviadasPorLos",
                  )}
                  icon={<Star />}
                  title={t("ui.GuardRatings.noHayCalificaciones")}
                />
              )
            }
            loading={loading}
            onRowClick={(row: any) =>
              row.guardId && navigate(`/guards/${row.guardId}/reviews`)
            }
          />
        </Section>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-end gap-2 py-2">
          <div className="text-sm text-muted-foreground">
            {t("ui.GuardRatings.elementosPorPagina", "Elementos por página")}
          </div>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              setPageSize(Number(v));
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[70px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
          <div className="text-sm text-muted-foreground sm:mx-4">
            {filtered.length === 0
              ? t("guards.list.pagination.emptyRange", "0 – 0 de 0")
              : t("guards.list.pagination.range", {
                  defaultValue: "{{start}} - {{end}} de {{total}}",
                  start: (page - 1) * pageSize + 1,
                  end: Math.min(page * pageSize, filtered.length),
                  total: filtered.length,
                })}
          </div>
          <div className="flex items-center space-x-2">
            <Button
              className="rounded-xl"
              disabled={page <= 1}
              size="icon"
              variant="outline"
              onClick={() => setPage((p) => p - 1)}
            >
              <span className="sr-only">
                {t("ui.GuardRatings.paginaAnterior", "Página anterior")}
              </span>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              className="rounded-xl"
              disabled={page >= totalPages}
              size="icon"
              variant="outline"
              onClick={() => setPage((p) => p + 1)}
            >
              <span className="sr-only">
                {t("ui.GuardRatings.paginaSiguiente", "Página siguiente")}
              </span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </PageContainer>
    </AppLayout>
  );
}
