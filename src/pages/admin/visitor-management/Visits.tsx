import { loadXlsx } from '../../../lib/lazyXlsx';
import { useTranslation } from 'react-i18next';
import { useMemo, useState, useEffect, useCallback, FormEvent } from "react";
import { useAsyncList } from "@/hooks/useAsyncList";
import { Search, Filter as FilterIcon, MoreVertical, FileDown, FileSpreadsheet, Printer, ClipboardList, LogIn, LogOut } from "lucide-react";
import {
    PageContainer,
    PageHeader,
    Section,
    EmptyState,
    Toolbar,
    StatCard,
    StatusBadge,
    SkeletonCards,
} from "@/components/kit";
import AppLayout from "@/layouts/app-layout";
import Breadcrumb from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { confirmDialog } from "@/components/ui/confirmDialog";
import visitorLogService, { VisitorLogFilters } from "@/lib/api/visitorLogService";
import { clientService } from "@/lib/api/clientService";
import { postSiteService } from "@/lib/api/postSiteService";
import securityGuardService from "@/lib/api/securityGuardService";
import type { Client, PostSite, SecurityGuard } from "@/types";

// Loose shape covering the various name fields the client association may carry.
type ClientLike = {
    id?: string;
    name?: string;
    firstName?: string;
    lastName?: string;
    displayName?: string;
    commercialName?: string;
    companyName?: string;
};

// A single visitor-log list row (lean list returns association objects + flat fallbacks).
type VisitLogRow = {
    id: string;
    firstName?: string;
    lastName?: string;
    client?: ClientLike | string;
    clientName?: string;
    postSite?: { companyName?: string; name?: string; postSiteName?: string };
    station?: { stationName?: string; name?: string };
    postSiteName?: string;
    stationName?: string;
    vehiclePlate?: string;
    vehicleType?: string;
    vehicleMakeModel?: string;
    visitDate?: string;
    exitTime?: string;
};

// Guard option carries fallback name fields not present on the canonical model.
type GuardOption = SecurityGuard & { displayName?: string; name?: string };

type VisitsFilters = {
    clientId: string;
    siteId: string;
    guardId: string;
    fromDate: string;
    fromTime: string;
    toDate: string;
    toTime: string;
    showArchived: boolean;
    perPage: string;
};

const defaultFilters: VisitsFilters = {
    clientId: "",
    siteId: "",
    guardId: "",
    fromDate: "",
    fromTime: "00:00",
    toDate: "",
    toTime: "23:59",
    showArchived: false,
    perPage: "25",
};

// The lean visitor-log list returns association objects on `client`/`postSite`/`station`
// (never plain strings), plus flat *Name fallbacks. Always extract a string — never
// render the raw Sequelize object as a React child (React #31 crash).
const clientDisplayName = (c: ClientLike | null | undefined) => {
    if (!c) return "";
    if (c.displayName) return c.displayName;
    if (c.commercialName) return c.commercialName;
    if (c.companyName) return c.companyName;
    const first = c.name ?? c.firstName ?? "";
    const last = c.lastName ?? "";
    const joined = `${first} ${last}`.trim();
    return joined || c.name || c.id || "";
};

const getClientLabel = (rec: VisitLogRow | null | undefined) => {
    if (!rec) return "-";
    if (rec.client && typeof rec.client === "object") return clientDisplayName(rec.client) || "-";
    if (typeof rec.client === "string") return rec.client;
    return rec.clientName || "-";
};

const getPostSiteLabel = (rec: VisitLogRow | null | undefined) => {
    if (!rec) return "-";
    if (rec.postSite && typeof rec.postSite === "object") {
        return rec.postSite.companyName || rec.postSite.name || rec.postSite.postSiteName || "-";
    }
    if (rec.station && typeof rec.station === "object") {
        return rec.station.stationName || rec.station.name || "-";
    }
    return rec.postSiteName || rec.stationName || "-";
};

const getVehicleLabel = (rec: VisitLogRow | null | undefined) => {
    const plate = rec?.vehiclePlate || "";
    const type = rec?.vehicleType || rec?.vehicleMakeModel || "";
    if (plate && type) return `${plate} (${type})`;
    return plate || type || "-";
};

const formatDateTime = (val: string | undefined | null) => {
    if (!val) return "-";
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    return d.toLocaleString();
};

// Sin hora de salida el visitante sigue dentro. Pasadas 24 h desde la entrada la
// visita deja de leerse como «en curso» y pasa a ser una salida sin registrar.
const VISITA_VENCIDA_MS = 24 * 60 * 60 * 1000;
const visitaVencida = (rec: VisitLogRow) => {
    if (!rec.visitDate) return false;
    const d = new Date(rec.visitDate);
    if (isNaN(d.getTime())) return false;
    return Date.now() - d.getTime() > VISITA_VENCIDA_MS;
};

// Escape any user/server-supplied value before interpolating into print/PDF HTML.
const escapeHtml = (val: unknown): string =>
    String(val ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

export default function Visits() {
  const { t } = useTranslation();
    const [openFilter, setOpenFilter] = useState(false);
    const [filters, setFilters] = useState<VisitsFilters>(defaultFilters);

    const [offset, setOffset] = useState(0);
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState<Record<string, boolean>>({});
    const [action, setAction] = useState<string | undefined>(undefined);

    // Filter dropdown data
    const [clients, setClients] = useState<Client[]>([]);
    const [sites, setSites] = useState<PostSite[]>([]);
    const [guards, setGuards] = useState<GuardOption[]>([]);

    const limit = useMemo(() => Number(filters.perPage) || 25, [filters.perPage]);

    // Load clients for the filter dropdown on mount.
    useEffect(() => {
        clientService
            .getClients(undefined, { limit: 200, offset: 0 })
            .then((resp) => setClients(resp?.rows || []))
            .catch((e) => console.error("Failed to load clients", e));
    }, []);

    // When a client is selected, load its post sites + guards; clear dependents.
    useEffect(() => {
        if (!filters.clientId) {
            setSites([]);
            setGuards([]);
            return;
        }
        postSiteService
            .list({ clientId: filters.clientId }, { limit: 200, offset: 0 })
            .then((resp) => setSites(resp?.rows || []))
            .catch((e) => console.error("Failed to load post sites", e));
        securityGuardService
            .list({ "filter[clientId]": filters.clientId, limit: 200, offset: 0 })
            .then((resp) => setGuards(Array.isArray(resp) ? resp : resp?.rows || []))
            .catch((e) => console.error("Failed to load guards", e));
        setFilters((s) => ({ ...s, siteId: "", guardId: "" }));
    }, [filters.clientId]);

    const buildDateRange = (): [string | null, string | null] | undefined => {
        const start = filters.fromDate
            ? new Date(`${filters.fromDate}T${filters.fromTime || "00:00"}:00`).toISOString()
            : null;
        const end = filters.toDate
            ? new Date(`${filters.toDate}T${filters.toTime || "23:59"}:59`).toISOString()
            : null;
        if (!start && !end) return undefined;
        return [start, end];
    };

    // Load via the shared async-list hook: debounced (one request per typing
    // burst, not per keystroke), latest-response-wins (no stale overwrite), and
    // Builds the active filter object — shared by the paginated list query and
    // the full-dataset export fetch so both always agree on scope.
    const buildFilter = useCallback((): VisitorLogFilters & { query?: string } => {
        const f: VisitorLogFilters & { query?: string } = {};
        const s = search.trim();
        if (s) {
            if (/^[0-9]+$/.test(s)) f.idNumber = s;
            else f.query = s;
        }
        if (filters.clientId) f.clientId = filters.clientId;
        if (filters.siteId) f.postSiteId = filters.siteId;
        if (filters.guardId) f.guardId = filters.guardId;
        f.archived = filters.showArchived;
        const range = buildDateRange();
        if (range) f.visitDateRange = range;
        return f;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search, filters.clientId, filters.siteId, filters.guardId, filters.fromDate, filters.fromTime, filters.toDate, filters.toTime, filters.showArchived]);

    // unmount-safe. refetch() reloads after a mutation.
    const { data, loading, refetch } = useAsyncList(
        () => {
            return visitorLogService.list(buildFilter(), { limit, offset });
        },
        [
            search, offset, limit,
            filters.clientId, filters.siteId, filters.guardId,
            filters.fromDate, filters.fromTime, filters.toDate, filters.toTime,
            filters.showArchived,
        ],
        {
            debounceMs: 300,
            onError: (e) => { console.error("Error fetching visits", e); toast.error("No se pudieron cargar las visitas"); },
        },
    );
    const rows: VisitLogRow[] = data?.rows || [];
    const count = data?.count || 0;
    // Clear row selection whenever a fresh page loads.
    useEffect(() => { setSelected({}); }, [data]);

    const aplicarFiltros = (e?: FormEvent) => {
        e?.preventDefault();
        setOffset(0);
        setOpenFilter(false);
    };

    const toggleSelect = (id: string) => setSelected((s) => ({ ...s, [id]: !s[id] }));
    const selectAll = (checked: boolean) => {
        if (!checked) return setSelected({});
        const map: Record<string, boolean> = {};
        rows.forEach((r) => (map[r.id] = true));
        setSelected(map);
    };

    const selectedRows = () => {
        const ids = Object.keys(selected).filter((k) => selected[k]);
        return rows.filter((r) => ids.includes(String(r.id)));
    };

    // When rows are explicitly selected, export exactly those. Otherwise export
    // the FULL filtered dataset from the server — not just the current page, which
    // would silently drop every record beyond the first page.
    const exportSubjects = async (): Promise<VisitLogRow[]> => {
        const sel = selectedRows();
        if (sel.length) return sel;
        if (count <= rows.length) return rows;
        try {
            const resp = await visitorLogService.list(buildFilter(), { limit: Math.max(count, 10000), offset: 0 });
            return (resp?.rows as VisitLogRow[]) || rows;
        } catch (e) {
            console.error("Error fetching full export set", e);
            toast.error(t('comun.noSePudoObtenerEl'));
            return rows;
        }
    };

    const handleDeleteSelected = async () => {
        const ids = Object.keys(selected).filter((k) => selected[k]);
        if (!ids.length) {
            toast.error(t('ui.Visits.noHayElementosSeleccionados'));
            return;
        }
        if (
            !(await confirmDialog({
                title: "Eliminar visitas",
                message: `¿Estás seguro de que deseas eliminar ${ids.length} registro(s)? Esta acción no se puede deshacer.`,
                confirmText: "Eliminar",
                tone: "danger",
            }))
        )
            return;
        try {
            await visitorLogService.delete(ids);
            toast.success("Registro(s) eliminado(s)");
            refetch();
        } catch (e) {
            console.error("Error deleting visits", e);
            toast.error("Error eliminando registro(s)");
        }
    };

    const handleActionChange = (v: string | undefined) => {
        setAction(undefined);
        if (v === "eliminar") handleDeleteSelected();
    };

    const exportKeys = [
        "Nombre",
        "Vehículo",
        "Hora de entrada",
        "Hora de salida",
        "Puesto de seguridad",
    ];
    const toExportRow = (r: VisitLogRow) => ({
        Nombre: `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim(),
        Vehículo: getVehicleLabel(r) === "-" ? "" : getVehicleLabel(r),
        "Hora de entrada": formatDateTime(r.visitDate),
        "Hora de salida": r.exitTime ? formatDateTime(r.exitTime) : "",
        "Puesto de seguridad": getPostSiteLabel(r) === "-" ? "" : getPostSiteLabel(r),
    });

    const handleExportExcel = async () => {
        const subjects = await exportSubjects();
        if (!subjects.length) {
            toast.error(t('comun.noHayRegistrosParaExportar'));
            return;
        }
        try {
            const data = subjects.map(toExportRow);
            const XLSX = await loadXlsx();
            const worksheet = XLSX.utils.json_to_sheet(data, { header: exportKeys });
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Visitas");
            const wbout = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
            const blob = new Blob([wbout], {
                type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `visitas_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error("Excel export failed", e);
            toast.error("Error exportando a Excel");
        }
    };

    const buildAndPrint = async (title: string) => {
        const subjects = await exportSubjects();
        if (!subjects.length) {
            toast.error("No hay registros para imprimir");
            return;
        }
        const headerCells = exportKeys.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
        const tableRows = subjects
            .map(
                (r) => `
            <tr>
                <td>${escapeHtml(`${r.firstName ?? ""} ${r.lastName ?? ""}`.trim())}</td>
                <td>${escapeHtml(getVehicleLabel(r) === "-" ? "" : getVehicleLabel(r))}</td>
                <td>${escapeHtml(formatDateTime(r.visitDate))}</td>
                <td>${escapeHtml(r.exitTime ? formatDateTime(r.exitTime) : "")}</td>
                <td>${escapeHtml(getPostSiteLabel(r) === "-" ? "" : getPostSiteLabel(r))}</td>
            </tr>`,
            )
            .join("");
        const html = `
            <html>
            <head>
                <title>${escapeHtml(title)}</title>
                <style>
                    table{border-collapse:collapse;width:100%}
                    th,td{border:1px solid rgba(0,0,0,0.22);padding:6px;text-align:left}
                    th{background:rgba(0,0,0,0.05)}
                </style>
            </head>
            <body>
                <h2>${escapeHtml(title)}</h2>
                <table>
                    <thead><tr>${headerCells}</tr></thead>
                    <tbody>${tableRows}</tbody>
                </table>
            </body>
            </html>`;
        const w = window.open("", "_blank");
        if (w) {
            w.document.write(html);
            w.document.close();
            w.focus();
            setTimeout(() => w.print(), 500);
        } else {
            toast.error("No se pudo abrir ventana para imprimir");
        }
    };

    const perPageText = useMemo(() => filters.perPage, [filters.perPage]);
    const pageStart = count === 0 ? 0 : offset + 1;
    const pageEnd = Math.min(offset + limit, count);
    const allSelected = rows.length > 0 && rows.every((r) => selected[r.id]);
    // Recuento sobre los registros mostrados: quién sigue dentro y quién ya salió.
    const dentro = rows.filter((r) => !r.exitTime).length;
    const conSalida = rows.length - dentro;

    return (
        <AppLayout>
            <Breadcrumb
                items={[
                    { label: "Panel de control", path: "/dashboard" },
                    { label: "Visitas" },
                ]}
            />

            <section className="p-6">
              <PageContainer width="wide">
                <PageHeader
                    icon={<ClipboardList />}
                    title="Visitas"
                    subtitle="Registro de entradas y salidas de visitantes"
                    actions={
                        <Select value={action} onValueChange={handleActionChange}>
                            <SelectTrigger className="w-36">
                                <SelectValue placeholder={t("ui.Visits.accion", "Acción")} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="eliminar">{t('actions.delete')}</SelectItem>
                            </SelectContent>
                        </Select>
                    }
                />

                <div className="grid gap-4 sm:grid-cols-3">
                    <StatCard
                        label="Registros encontrados"
                        value={count}
                        icon={<ClipboardList />}
                        accent="brand"
                        hint={t('comun.conLosFiltrosAplicados')}
                    />
                    <StatCard
                        label={t('comun.dentroDeLasInstalaciones')}
                        value={dentro}
                        icon={<LogIn />}
                        accent="ok"
                        hint={t('comun.deLosRegistrosMostrados')}
                    />
                    <StatCard
                        label={t('comun.conSalidaRegistrada')}
                        value={conSalida}
                        icon={<LogOut />}
                        accent="neutral"
                        hint={t('comun.deLosRegistrosMostrados')}
                    />
                </div>

                <Toolbar>
                        <div className="relative min-w-0 flex-1 sm:max-w-xs">
                            <Search
                                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                                style={{ color: 'var(--ink-faint)' }}
                            />
                            <Input
                                className="w-full pl-9"
                                placeholder="Buscar registro de visitas"
                                value={search}
                                onChange={(e) => {
                                    setSearch(e.target.value);
                                    setOffset(0);
                                }}
                            />
                        </div>

                        <Sheet open={openFilter} onOpenChange={setOpenFilter}>
                            <SheetTrigger asChild>
                                <Button variant="outline" style={{ color: 'var(--brand-text)', borderColor: 'var(--brand-line)' }}>
                                    <FilterIcon className="mr-2 h-4 w-4" />
                                    Filtros
                                </Button>
                            </SheetTrigger>

                            <SheetContent side="right" className="w-full overflow-y-auto sm:w-[460px]">
                                <SheetHeader>
                                    <SheetTitle>Filtros</SheetTitle>
                                </SheetHeader>

                                <form className="mt-6 space-y-5" onSubmit={aplicarFiltros}>
                                    <div className="space-y-2">
                                        <Label className="text-xs">{t('comun.cliente')}</Label>
                                        <Select
                                            value={filters.clientId}
                                            onValueChange={(v) =>
                                                setFilters((s) => ({ ...s, clientId: v }))
                                            }
                                        >
                                            <SelectTrigger className="h-10 text-xs">
                                                <SelectValue placeholder={t('comun.seleccionaUnCliente')} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {clients.map((c) => (
                                                    <SelectItem key={c.id} value={c.id}>
                                                        {clientDisplayName(c)}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-xs">{t('comun.puestoDeSeguridad')}</Label>
                                        <Select
                                            value={filters.siteId}
                                            onValueChange={(v) =>
                                                setFilters((s) => ({ ...s, siteId: v }))
                                            }
                                            disabled={sites.length === 0}
                                        >
                                            <SelectTrigger className="h-10 text-xs">
                                                <SelectValue placeholder={t('comun.seleccionaUnSitio')} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {sites.map((p) => (
                                                    <SelectItem key={p.id} value={p.id}>
                                                        {p.companyName || p.name || String(p.id)}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-xs">{t('comun.vigilante')}</Label>
                                        <Select
                                            value={filters.guardId}
                                            onValueChange={(v) =>
                                                setFilters((s) => ({ ...s, guardId: v }))
                                            }
                                            disabled={guards.length === 0}
                                        >
                                            <SelectTrigger className="h-10 text-xs">
                                                <SelectValue placeholder={t('comun.seleccionaUnVigilante')} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {guards.map((g) => (
                                                    <SelectItem key={g.id} value={g.id}>
                                                        {g.fullName || g.displayName || g.name || g.id}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-2">
                                            <Label className="text-xs">{t('comun.desdeLaFecha')}</Label>
                                            <Input
                                                type="date"
                                                className="h-10 text-xs"
                                                value={filters.fromDate}
                                                onChange={(e) =>
                                                    setFilters((s) => ({ ...s, fromDate: e.target.value }))
                                                }
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-xs">{t('comun.hora')}</Label>
                                            <Input
                                                type="time"
                                                className="h-10 text-xs"
                                                value={filters.fromTime}
                                                onChange={(e) =>
                                                    setFilters((s) => ({ ...s, fromTime: e.target.value }))
                                                }
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-2">
                                            <Label className="text-xs">{t('comun.hastaLaFecha')}</Label>
                                            <Input
                                                type="date"
                                                className="h-10 text-xs"
                                                value={filters.toDate}
                                                onChange={(e) =>
                                                    setFilters((s) => ({ ...s, toDate: e.target.value }))
                                                }
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-xs">{t('comun.hora')}</Label>
                                            <Input
                                                type="time"
                                                className="h-10 text-xs"
                                                value={filters.toTime}
                                                onChange={(e) =>
                                                    setFilters((s) => ({ ...s, toTime: e.target.value }))
                                                }
                                            />
                                        </div>
                                    </div>

                                    <div className="flex items-center space-x-2 pt-2">
                                        <Checkbox
                                            id="showArchived"
                                            checked={filters.showArchived}
                                            onCheckedChange={(v) =>
                                                setFilters((s) => ({
                                                    ...s,
                                                    showArchived: Boolean(v),
                                                }))
                                            }
                                        />
                                        <Label
                                            htmlFor="showArchived"
                                            className="text-xs font-medium text-foreground"
                                        >
                                            Mostrar datos archivados
                                        </Label>
                                    </div>

                                    <Button type="submit" variant="brand" className="w-full">
                                        Filtro
                                    </Button>
                                </form>
                            </SheetContent>
                        </Sheet>

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="icon">
                                    <MoreVertical className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuItem onClick={() => buildAndPrint("Visitas")}>
                                    <FileDown className="mr-2 h-4 w-4" />
                                    <span>Exportar como PDF</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={handleExportExcel}>
                                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                                    <span>Exportar como Excel</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => buildAndPrint("Visitas")}>
                                    <Printer className="mr-2 h-4 w-4" />
                                    <span>Imprimir</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                </Toolbar>

                <Section title="Registro de visitas" icon={<ClipboardList />}>
                <div className="overflow-hidden rounded-xl border">
                    <div className="overflow-x-auto">
                    <table className="w-full min-w-[960px] border-collapse text-left text-sm">
                        <thead>
                            <tr className="border-b">
                                <th className="cg-eyebrow px-2 py-2">
                                    <Checkbox
                                        checked={allSelected}
                                        onCheckedChange={(v) => selectAll(Boolean(v))}
                                    />
                                </th>
                                <th className="cg-eyebrow px-2 py-2">{t('comun.nombre')}</th>
                                <th className="cg-eyebrow px-2 py-2">{t("ui.Visits.vehiculo", "Vehículo")}</th>
                                <th className="cg-eyebrow px-2 py-2">{t('ui.Visits.horaDeEntrada')}</th>
                                <th className="cg-eyebrow px-2 py-2">{t('ui.Visits.horaDeSalida')}</th>
                                <th className="cg-eyebrow px-2 py-2">{t('comun.puestoDeSeguridad')}</th>
                                <th className="cg-eyebrow px-2 py-2">Registrado por</th>
                                <th className="cg-eyebrow px-2 py-2">Salido por</th>
                            </tr>
                        </thead>

                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={8} className="p-4">
                                        <SkeletonCards count={4} />
                                    </td>
                                </tr>
                            ) : rows.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="py-8">
                                        <EmptyState
                                            icon={<ClipboardList />}
                                            title={t('kit.table.emptyTitle')}
                                            description={t('comun.noPudimosEncontrarNingunElemento')}
                                            className="border-0"
                                        />
                                    </td>
                                </tr>
                            ) : (
                                rows.map((r) => (
                                    <tr key={r.id} className="border-b hover:bg-muted/40">
                                        <td className="px-2 py-2.5">
                                            <Checkbox
                                                checked={!!selected[r.id]}
                                                onCheckedChange={() => toggleSelect(r.id)}
                                            />
                                        </td>
                                        <td className="px-2 py-2.5 font-medium">
                                            {`${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || "-"}
                                        </td>
                                        <td className="px-2 py-2.5">{getVehicleLabel(r)}</td>
                                        <td className="px-2 py-2.5">{formatDateTime(r.visitDate)}</td>
                                        <td className="px-2 py-2.5">
                                            {r.exitTime ? (
                                                formatDateTime(r.exitTime)
                                            ) : visitaVencida(r) ? (
                                                <StatusBadge tone="warn">{t('comun.sinSalidaRegistrada')}</StatusBadge>
                                            ) : (
                                                <StatusBadge tone="ok" dot={false}>
                                                    <span
                                                        className="cc-dot"
                                                        style={{ background: 'var(--ok)' }}
                                                    />
                                                    En curso
                                                </StatusBadge>
                                            )}
                                        </td>
                                        <td className="px-2 py-2.5">{getPostSiteLabel(r)}</td>
                                        <td className="px-2 py-2.5">-</td>
                                        <td className="px-2 py-2.5">-</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                            <span>{t("ui.Visits.elementosPorPagina", "Elementos por página")}</span>
                            <Select
                                value={filters.perPage}
                                onValueChange={(v) => {
                                    setFilters((s) => ({ ...s, perPage: v }));
                                    setOffset(0);
                                }}
                            >
                                <SelectTrigger className="h-8 w-20">
                                    <SelectValue placeholder={perPageText} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="25">25</SelectItem>
                                    <SelectItem value="10">10</SelectItem>
                                    <SelectItem value="50">50</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-center gap-4">
                            <span>
                                {pageStart} - {pageEnd} de {count}
                            </span>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={offset === 0}
                                    onClick={() => setOffset(Math.max(0, offset - limit))}
                                >
                                    ◀
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={offset + limit >= count}
                                    onClick={() => setOffset(offset + limit)}
                                >
                                    ▶
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
                </Section>
              </PageContainer>
            </section>
        </AppLayout>
    );
}
