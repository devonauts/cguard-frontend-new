import { useState, useEffect, useCallback } from "react";
import { useTranslation } from 'react-i18next';
import { useNavigate } from "react-router-dom";
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
import { Search, Star, Loader2, RotateCcw, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import Breadcrumb from "@/components/ui/breadcrumb";
import guardRatingService, { GuardRatingRecord } from "@/lib/api/guardRatingService";
import { securityGuardService } from "@/lib/api/securityGuardService";
import {
  PageContainer,
  PageHeader,
  Section,
  StatCard,
  EmptyState,
  Stagger,
} from "@/components/kit";

// ── helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-EC", {
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
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} de 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className="h-4 w-4"
          style={
            i <= value
              ? { fill: 'var(--warn)', color: 'var(--warn)' }
              : { color: 'var(--ink-faint)', opacity: 0.5 }
          }
        />
      ))}
    </span>
  );
}

interface GuardOption { id: string; fullName: string; }
// Loose shape of a securityGuard row from securityGuardService.list().
interface RawGuardListRow { id?: string | number; fullName?: string; guard?: { fullName?: string } }

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

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  // Load guards for the filter dropdown (guardRating.guardId = securityGuard.id PK).
  useEffect(() => {
    (async () => {
      try {
        const resp: unknown = await securityGuardService.list({ limit: 500, offset: 0 });
        const items: RawGuardListRow[] = Array.isArray(resp) ? resp : ((resp as { rows?: RawGuardListRow[] })?.rows ?? []);
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
      <Breadcrumb
        items={[
          { label: "Panel de control", path: "/dashboard" },
          { label: "Control de Calidad" },
        ]}
      />
      <PageContainer width="wide" className="p-6">
        <PageHeader
          icon={<Star />}
          title="Control de Calidad"
          subtitle="Calificaciones de los clientes hacia cada vigilante. Úsalas para generar memos u observaciones y mejorar el servicio."
        />

        {/* Stats */}
        <Stagger className="grid grid-cols-2 gap-4">
          <StatCard
            icon={<Star />}
            accent="orange"
            label={guardFilter === "all" ? "Promedio general" : "Promedio del vigilante"}
            value={average != null ? average.toFixed(2) : "—"}
            hint={
              average != null ? (
                <span className="inline-flex"><Stars value={Math.round(average)} /></span>
              ) : undefined
            }
          />
          <StatCard
            icon={<Star />}
            accent="primary"
            label="Calificaciones"
            value={count}
          />
        </Stagger>

        {/* Toolbar */}
        <div className="flex flex-col md:flex-row justify-between gap-4">
          <div className="w-full md:w-64">
            <Select value={guardFilter} onValueChange={(v) => { setGuardFilter(v); setPage(1); }}>
              <SelectTrigger>
                <SelectValue placeholder="Todos los vigilantes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los vigilantes</SelectItem>
                {guards.map((g) => (
                  <SelectItem key={g.id} value={g.id}>{g.fullName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Buscar por vigilante, cliente o comentario..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            />
          </div>
        </div>

        {/* Table — Calificaciones a personal (las reseñas son hacia cada
            vigilante, no hacia la empresa). Cada fila abre el perfil del
            vigilante › Reseñas. */}
        <Section title="Calificaciones a personal" icon={<Star />} contentClassName="overflow-hidden rounded-2xl" >
          <Table>
            <TableHeader style={{ background: 'var(--glass-sunken)' }}>
              <TableRow>
                <TableHead className="cg-eyebrow">Fecha</TableHead>
                <TableHead className="cg-eyebrow">Vigilante</TableHead>
                <TableHead className="cg-eyebrow">Cliente</TableHead>
                <TableHead className="cg-eyebrow">{t("ui.GuardRatings.estacion", "Estación")}</TableHead>
                <TableHead className="cg-eyebrow">{t("ui.GuardRatings.calificacion", "Calificación")}</TableHead>
                <TableHead className="cg-eyebrow">Comentario</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-[200px] text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={6} className="p-0">
                    <EmptyState
                      icon={<AlertCircle />}
                      title={t("ui.GuardRatings.noSePudoCargarLa", "No se pudo cargar la información")}
                      description="Ocurrió un error al obtener las calificaciones."
                      className="border-0"
                      action={
                        <Button variant="outline" onClick={fetchRecords}>
                          <RotateCcw className="h-4 w-4 mr-2" /> Reintentar
                        </Button>
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : paginated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="p-0">
                    <EmptyState
                      icon={<Star />}
                      title="No hay calificaciones"
                      description="Las calificaciones enviadas por los clientes aparecerán aquí."
                      className="border-0"
                    />
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((rec) => (
                  <TableRow
                    key={rec.id}
                    className={rec.guardId ? "cursor-pointer" : undefined}
                    onClick={() => rec.guardId && navigate(`/guards/${rec.guardId}/reviews`)}
                    title={rec.guardId ? "Ver reseñas del vigilante" : undefined}
                  >
                    <TableCell className="whitespace-nowrap">{formatDate(rec.createdAt)}</TableCell>
                    <TableCell className="font-medium hover:underline" style={{ color: 'var(--brand-text)' }}>{rec.guardName ?? "—"}</TableCell>
                    <TableCell>{rec.clientName ?? "—"}</TableCell>
                    <TableCell>{rec.stationName ?? "—"}</TableCell>
                    <TableCell><Stars value={rec.rating} /></TableCell>
                    <TableCell className="max-w-[320px] truncate text-muted-foreground" title={rec.comment ?? undefined}>
                      {rec.comment ?? "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Section>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-end gap-2 py-2">
          <div className="text-sm text-muted-foreground">{t("ui.GuardRatings.elementosPorPagina", "Elementos por página")}</div>
          <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
            <SelectTrigger className="w-[70px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
          <div className="text-sm text-muted-foreground sm:mx-4">
            {filtered.length === 0
              ? "0 de 0"
              : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filtered.length)} de ${filtered.length}`}
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="icon" className="rounded-xl" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <span className="sr-only">{t("ui.GuardRatings.paginaAnterior", "Página anterior")}</span>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="rounded-xl" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              <span className="sr-only">{t("ui.GuardRatings.paginaSiguiente", "Página siguiente")}</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </PageContainer>
    </AppLayout>
  );
}
