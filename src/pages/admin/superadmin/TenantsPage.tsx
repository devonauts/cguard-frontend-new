import { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import AppLayout from "@/layouts/app-layout";
import Breadcrumb from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Search, Eye, Trash, ChevronLeft, ChevronRight } from "lucide-react";
import { DataTable, type Column } from "@/components/table/DataTable";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import MobileCardList from '@/components/responsive/MobileCardList';
import { SmartImage } from "@/components/kit";
import tenantService from "@/services/tenant.service";
import { usePermissions } from "@/hooks/usePermissions";

type Tenant = any;

function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const handler = window.setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debounced;
}

export default function TenantsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, 500);
  

  const loadTenants = async () => {
    setLoading(true);
    try {
      const offset = (page - 1) * limit;
      const qs = [] as string[];
      qs.push(`limit=${limit}`);
      qs.push(`offset=${offset}`);
      // Backend superadmin tenants endpoint expects `search` param
      if (debouncedSearch) qs.push(`search=${encodeURIComponent(debouncedSearch)}`);
      const query = qs.length ? `?${qs.join('&')}` : '';
      // Use the superadmin listing endpoint (backend protected)
      const resp: any = await tenantService.listSuperadmin(query);
      const data = resp?.data ?? resp;
      setTenants(data.rows || []);
      setTotalCount(data.count || (data.rows ? data.rows.length : 0));
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || 'Error cargando tenants');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTenants();
  }, [page, limit, debouncedSearch]);

  // Reset to first page whenever the (debounced) search changes
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  // Modal state for tenant details
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const openTenantModal = async (id: string) => {
    setModalOpen(true);
    setDetailLoading(true);
    try {
      // In superadmin UI we must fetch via the superadmin endpoint so we get the requested tenant,
      // not the tenant associated to the current user token.
      const fn = tenantService.findByIdSuperadmin ?? tenantService.findById;
      const resp: any = await fn.call(tenantService, id);
      const tenant = resp?.data ?? resp;
      setSelectedTenant(tenant);
    } catch (e) {
      console.error('Failed loading tenant details', e);
      toast.error('No se pudo cargar los detalles del tenant');
      setSelectedTenant(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeTenantModal = () => {
    setModalOpen(false);
    setSelectedTenant(null);
  };

  

  const columns: Column<Tenant>[] = useMemo(() => [
    { key: 'name', header: t('tenants.columns.name') || 'Name', render: (v, r) => r.name },
    { key: 'url', header: t('tenants.columns.url') || 'URL', render: (v, r) => r.url },
    { key: 'email', header: t('tenants.columns.email') || 'Email', render: (v, r) => r.email || '-' },
    { key: 'plan', header: t('tenants.columns.plan') || 'Plan', render: (v, r) => r.plan || '-' },
    { key: 'status', header: t('tenants.columns.status') || 'Status', render: (_v, r) => r.planStatus || '-' },
    {
      key: 'actions', header: t('tenants.actions.more', { defaultValue: 'Acciones' }), className: 'text-right w-28', render: (_v, r) => (
        <div className="flex gap-2 justify-end items-center">
            <Button variant="ghost" size="sm" onClick={() => openTenantModal(r.id)}>
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              <span className="text-sm">{t('tenants.actions.view', { defaultValue: 'Ver' })}</span>
            </div>
          </Button>
        </div>
      )
    }
  ], [t, navigate]);

  return (
    <AppLayout>
      <Breadcrumb items={[{ label: 'Superadmin' }, { label: 'Tenants' }]} />

      <section className="p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex-1 flex justify-center">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder={t('tenants.searchPlaceholder') || 'Buscar tenants'} className="pl-9 w-full" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
          </div>

          {/* "Add tenant" removed: /superadmin/tenants/new has no route (tenants
              are created via signup/onboarding, not from this legacy CRM page). */}
        </div>

        <div className="mt-4">
          <DataTable columns={columns} data={tenants} loading={loading} sortKey={undefined} sortDir={undefined} />
        </div>

        <div className="mt-4 flex items-center justify-end gap-3 text-sm text-muted-foreground">
          <div>
            {totalCount > 0
              ? t('tenants.pagination.range', '{{start}} - {{end}} de {{total}}', {
                  start: (page - 1) * limit + 1,
                  end: Math.min(page * limit, totalCount),
                  total: totalCount,
                })
              : t('tenants.pagination.emptyRange', '0 - 0 de 0')}
          </div>
          <div className="flex items-center">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              disabled={page === 1 || loading}
              className="h-8 w-8 rounded-r-none"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              disabled={page >= totalPages || loading}
              className="h-8 w-8 rounded-l-none border-l-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Dialog open={modalOpen} onOpenChange={(v) => { if (!v) closeTenantModal(); setModalOpen(v); }}>
          <DialogContent>
            <DialogHeader>
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0">
                  <SmartImage
                    src={selectedTenant?.settings?.logos?.[0]?.publicUrl || selectedTenant?.logoUrl || selectedTenant?.logo?.publicUrl || (selectedTenant?.logoId ? `/uploads/${selectedTenant.logoId}` : undefined)}
                    alt={selectedTenant?.name || 'logo'}
                    fit="contain"
                    rounded="rounded"
                    className="h-12 w-12"
                    fallback={<span className="h-full w-full bg-muted" />}
                  />
                </div>

                <div className="flex-1 text-center">
                  <DialogTitle className="text-base font-semibold">{selectedTenant?.name || (detailLoading ? 'Cargando...' : 'Detalles del tenant')}</DialogTitle>
                  <DialogDescription className="text-sm">{selectedTenant?.url ? `URL: ${selectedTenant.url}` : ''}</DialogDescription>
                </div>

                <div className="flex-shrink-0">
                  <DialogClose className="text-muted-foreground" />
                </div>
              </div>
            </DialogHeader>

            <div className="mt-2">
              {detailLoading ? (
                <div>Cargando...</div>
              ) : selectedTenant ? (
                <div className="text-sm text-foreground">
                  {/* Helper rows */}
                  {(() => {
                    const v = selectedTenant;
                    const F = (label: string, value: any) => (
                      <div className="flex gap-2">
                        <div className="w-40 text-muted-foreground">{label}</div>
                        <div className="flex-1">{value == null || value === '' ? '-' : value}</div>
                      </div>
                    );

                    const fmtDate = (d: any) => {
                      if (!d) return '-';
                      try { const dt = new Date(d); return isNaN(dt.getTime()) ? String(d) : dt.toLocaleString(); } catch { return String(d); }
                    };

                    const getLogoSrc = (v: any) => {
                      return (
                        v?.settings?.logos?.[0]?.publicUrl ||
                        v?.logoUrl ||
                        v?.logo?.publicUrl ||
                        (v?.logoId ? `/uploads/${v.logoId}` : undefined)
                      );
                    };

                    const items = [
                      ['Nombre', v.name],
                      ['Correo', v.email],
                      ['Teléfono', v.phone],
                      ['Teléfono fijo', v.landline],
                      ['Dirección', v.address],
                      ['Dirección 2', v.addressLine2],
                      ['Ciudad', v.city],
                      ['Código postal', v.postalCode],
                      ['País', v.country],
                      ['Plan', v.plan],
                      ['Estado del plan', v.planStatus],
                      ['Stripe customer id', v.planStripeCustomerId],
                      ['Número de identificación', v.taxNumber],
                      ['Razón social', v.businessTitle],
                      ['Número de licencia', v.licenseNumber],
                      ['Website', v.website],
                      ['Extra lines', Array.isArray(v.extraLines) ? v.extraLines.join(', ') : v.extraLines],
                      // logo moved to header; remove from details list
                      ['Latitud', v.latitude],
                      ['Longitud', v.longitude],
                      ['Creado', fmtDate(v.createdAt)],
                      ['Actualizado', fmtDate(v.updatedAt)],
                    ];

                    // Define which labels are considered 'primary' and should appear horizontally
                    const primaryLabels = new Set([
                      'Nombre', 'Correo', 'Teléfono', 'Dirección', 'Ciudad', 'País', 'Plan', 'Estado del plan'
                    ]);

                    const primary = items.filter(([label]) => primaryLabels.has(label as string));
                    const rest = items.filter(([label]) => !primaryLabels.has(label as string));

                    return (
                      <div>
                        {/* Primary info: responsive grid that wraps inside modal to prevent overflow */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
                          {primary.map(([label, value]) => (
                            <div key={String(label)} className="p-3 rounded border border-border bg-card">
                              <div className="text-xs text-muted-foreground truncate">{label}</div>
                              <div className="text-sm font-medium break-words">{value == null || value === '' ? '-' : value}</div>
                            </div>
                          ))}
                        </div>

                        {/* Rest of fields below (two columns on wider screens) */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {rest.map(([label, value]) => (
                            <div key={String(label)} className="flex gap-3 items-start">
                              <div className="w-40 text-xs text-muted-foreground">{label}</div>
                              <div className="flex-1 text-sm break-words">{value == null || value === '' ? '-' : value}</div>
                            </div>
                          ))}

                          {v.settings && Object.keys(v.settings || {}).length > 0 && (
                            <div className="sm:col-span-2">
                              <div className="w-40 text-xs text-muted-foreground">Configuración</div>
                              <pre className="mt-2 p-2 bg-muted/30 rounded text-xs overflow-auto">{JSON.stringify(v.settings, null, 2)}</pre>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div>No hay datos</div>
              )}
            </div>

            <DialogFooter>
              <div className="flex gap-2">
                <Button onClick={() => closeTenantModal()}>Cerrar</Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </section>
    </AppLayout>
  );
}
