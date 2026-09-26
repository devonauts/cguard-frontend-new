import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import {
  X,
  ClipboardEdit,
  Users,
  FileText,
  Paperclip,
  NotebookPen,
} from "lucide-react";
import { toast } from "sonner";

import { clientDisplayName } from "@/lib/clientName";
import AppLayout from "@/layouts/app-layout";
import {
  dispatchCreateSchema,
  type DispatchCreateSchema,
} from "@/lib/validators/dispatch-create.schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageContainer, PageHeader, Section, FadeIn } from "@/components/kit";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { clientService } from "@/lib/api/clientService";
import IncidentTypesService from "@/services/incident-types.service";
import api from "@/lib/api";
import { postSiteService } from "@/lib/api/postSiteService";
import { diaDeLaEmpresa, horaDeLaEmpresa, desdeInputFechaHora} from "@/lib/horaDeLaEmpresa";

// `id` is the API value; `labelKey` + `name` are only for display.
const prioridades = [
  { id: "alta", name: "Alta", labelKey: "station.orders.prio.alta" },
  { id: "media", name: "Media", labelKey: "station.orders.prio.media" },
  { id: "baja", name: "Baja", labelKey: "station.orders.prio.baja" },
];

const tiposLlamador = [
  { id: "cliente", name: "Cliente", labelKey: "dispatcher.client" },
  { id: "vigilante", name: "Vigilante", labelKey: "dispatcher.guard" },
  {
    id: "supervisor",
    name: "Supervisor",
    labelKey: "adminOfficeUsers.roleNames.supervisor",
  },
];

export default function EditDispatchPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const params = useParams();
  const editId = params?.id;
  const [attachments, setAttachments] = useState<File[]>([]);
  const [clientes, setClientes] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [sitios, setSitios] = useState<Array<{ id: string; name: string }>>([]);
  const [vigilantes, setVigilantes] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [tiposIncidente, setTiposIncidente] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [clienteFilter, setClienteFilter] = useState("");
  const [sitioFilter, setSitioFilter] = useState("");
  const [guardFilter, setGuardFilter] = useState("");
  const [tipoFilter, setTipoFilter] = useState("");
  const clienteInputRef = useRef<HTMLInputElement | null>(null);
  const sitioInputRef = useRef<HTMLInputElement | null>(null);
  const guardInputRef = useRef<HTMLInputElement | null>(null);
  const tipoInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const incidentDateRef = useRef<HTMLInputElement | null>(null);
  const incidentTimeRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const clientsResp = await clientService.getClients(
          { active: true },
          { limit: 100, offset: 0 },
        );

        if (clientsResp && Array.isArray(clientsResp.rows)) {
          setClientes(
            clientsResp.rows.map((c: any) => {
              // El selector dice "Cliente": mostrar la empresa. Este bloque
              // priorizaba fullName/firstName+lastName, o sea el representante legal.
              const display = clientDisplayName(c, c.company ||
                  t("settings.companyPolicies.guardNoNameFallback", "Sin nombre"));

              return { id: String(c.id), name: display };
            }),
          );
        }
      } catch (e) {
        console.error("Error cargando clientes:", e);
      }
    })();

    (async () => {
      try {
        const tenantId = localStorage.getItem("tenantId");

        if (!tenantId) return;

        const tryPaths = [
          `/tenant/${tenantId}/securityGuard?limit=100&offset=0`,
          `/tenant/${tenantId}/security-guard?limit=100&offset=0`,
          `/tenant/${tenantId}/securityGuards?limit=100&offset=0`,
          `/tenant/${tenantId}/security-guards?limit=100&offset=0`,
          `/tenant/${tenantId}/user?limit=100&offset=0&role=guard`,
        ];

        let rows: any[] | undefined;

        for (const path of tryPaths) {
          try {
            const resp = await api.get(path, { toast: { silentError: true } });
            const body = resp.data ?? resp;

            if (Array.isArray(body)) {
              rows = body;
            } else if (body && Array.isArray(body.rows)) {
              rows = body.rows;
            } else if (body && Array.isArray(body.data)) {
              rows = body.data;
            }
            if (rows && rows.length > 0) break;
          } catch (err) {}
        }

        if (rows && Array.isArray(rows)) {
          const filtered = rows.filter((g: any) => {
            const gov =
              g.governmentId ??
              g.government_id ??
              g.user?.governmentId ??
              g.user?.government_id;

            return gov && String(gov).toLowerCase() !== "pending";
          });

          setVigilantes(
            filtered.map((g: any) => {
              const display =
                g.fullName ||
                g.displayName ||
                g.name ||
                g.user?.fullName ||
                g.employeeName ||
                (
                  (g.firstName || g.firstname || g.givenName || "") +
                  " " +
                  (g.lastName || g.lastname || g.surname || "")
                ).trim() ||
                g.username ||
                g.email ||
                t("settings.companyPolicies.guardNoNameFallback", "Sin nombre");

              return {
                id: String(g.id || g.userId || g.guardId || g.uuid),
                name: display,
              };
            }),
          );
        } else {
          setVigilantes([]);
        }
      } catch (e) {
        console.error("Error cargando vigilantes:", e);
        setVigilantes([]);
      }
    })();

    (async () => {
      try {
        const res = await IncidentTypesService.list("", 1, 100);

        if (res && Array.isArray(res.rows)) {
          setTiposIncidente(
            res.rows.map((t: { id: string; name: string }) => ({
              id: t.id,
              name: t.name,
            })),
          );
        }
      } catch (e) {
        console.error("Error cargando tipos de incidente:", e);
      }
    })();
  }, []);

  const form = useForm<DispatchCreateSchema>({
    resolver: zodResolver(dispatchCreateSchema),
    defaultValues: {
      clientId: "",
      siteId: "",
      guardId: "",
      priority: "media",
      callerType: "",
      callerName: "",
      location: "",
      incidentType: "",
      incidentDate: "",
      incidentTime: "",
      incidentDetails: "",
      actionsTaken: "",
      internalNotes: "",
      attachment: undefined,
    },
    mode: "onBlur",
  });

  // Watch selected clientId and load sitios (postSite) solo para ese cliente
  const watchedClientId = useWatch({
    control: form.control,
    name: "clientId",
  }) as string | undefined;

  useEffect(() => {
    (async () => {
      try {
        if (!watchedClientId) {
          setSitios([]);

          return;
        }
        const resp = await postSiteService.list(
          { clientId: watchedClientId },
          { limit: 100, offset: 0 },
        );

        if (resp && Array.isArray(resp.rows)) {
          setSitios(
            resp.rows.map((s: any) => ({
              id: String(s.id),
              name: s.name || s.companyName || s.address || t("dispatcher.header_post_site", "Sitio"),
            })),
          );
        } else {
          setSitios([]);
        }
      } catch (e) {
        console.error("Error cargando sitios por cliente:", e);
        setSitios([]);
      }
    })();
  }, [watchedClientId]);

  // Load the existing request and prefill form
  useEffect(() => {
    (async () => {
      try {
        if (!editId) return;
        const tenantId = localStorage.getItem("tenantId");

        if (!tenantId) return;
        const resp = await api.get(`/tenant/${tenantId}/request/${editId}`);
        const data = (resp && resp.data) || resp;

        if (!data) return;

        let incidentDate = "";
        let incidentTime = "";
        const dateVal = data.incidentAt || data.dateTime || null;

        if (dateVal) {
          const d = new Date(dateVal);

          if (!isNaN(d.getTime())) {
            // La fecha venía de UTC y la hora del reloj del portátil: dos zonas
            // distintas en el mismo formulario. Las dos son del puesto.
            incidentDate = diaDeLaEmpresa(d);
            incidentTime = horaDeLaEmpresa(d);
          }
        }

        // Derive guard id and display name from multiple possible response shapes
        const deriveGuard = (d: any) => {
          const maybeId =
            d.guardId ||
            d.guard_id ||
            d.guard?.id ||
            d.guard?.userId ||
            d.guard?.guardId ||
            d.guard?.uuid ||
            d.userId ||
            d.assignedGuardId ||
            d.guardName?.id ||
            d.guardName?.guardId;
          const id = maybeId ? String(maybeId) : "";
          const name =
            (d.guardName && (d.guardName.fullName || d.guardName.name)) ||
            d.guard?.fullName ||
            d.guard?.displayName ||
            d.guard?.name ||
            d.guard?.user?.fullName ||
            d.guard?.employeeName ||
            (typeof d.guardName === "string" ? d.guardName : "") ||
            d.guard?.username ||
            d.guard?.email ||
            "";

          return { id, name };
        };

        const derivedGuard = deriveGuard(data);

        const prefill: any = {
          clientId: data.clientId ? String(data.clientId) : "",
          siteId: data.siteId ? String(data.siteId) : "",
          guardId: derivedGuard.id || "",
          priority: data.priority || "media",
          callerType: data.callerType || "",
          callerName: data.callerName || "",
          location: data.location || "",
          incidentType: data.incidentTypeId || data.incidentType || "",
          incidentDate,
          incidentTime,
          incidentDetails: data.content || "",
          actionsTaken: data.actionsTaken || data.action || "",
          internalNotes: data.internalNotes || "",
          subject: data.subject || "",
        };

        form.reset(prefill);
        // Explicitly set form values to ensure controlled Selects pick them up
        try {
          form.setValue("siteId", prefill.siteId ? String(prefill.siteId) : "");
        } catch (err) {}
        try {
          form.setValue(
            "guardId",
            prefill.guardId ? String(prefill.guardId) : "",
          );
        } catch (err) {}

        // Try to load the actual sitios for the client so the select contains the
        // saved site option. If that fails, fall back to a single option using the
        // returned display name. Always ensure the saved siteId is present in
        // the `sitios` options so the Select can display it.
        try {
          if (prefill.clientId) {
            const resp = await postSiteService.list(
              { clientId: prefill.clientId },
              { limit: 100, offset: 0 },
            );

            if (resp && Array.isArray(resp.rows) && resp.rows.length > 0) {
              setSitios(
                resp.rows.map((s: any) => ({
                  id: String(s.id),
                  name: s.name || s.companyName || s.address || t("dispatcher.header_post_site", "Sitio"),
                })),
              );
            } else if (prefill.siteId) {
              setSitios([
                { id: String(prefill.siteId), name: data.site || t("dispatcher.header_post_site", "Sitio") },
              ]);
            }
          } else if (prefill.siteId) {
            setSitios([
              { id: String(prefill.siteId), name: data.site || t("dispatcher.header_post_site", "Sitio") },
            ]);
          }
        } catch (err) {
          if (prefill.siteId)
            setSitios([
              { id: String(prefill.siteId), name: data.site || t("dispatcher.header_post_site", "Sitio") },
            ]);
        }

        // Ensure the saved site is present in the sitios list (prepend if missing)
        if (prefill.siteId) {
          setSitios((prev) => {
            const exists =
              Array.isArray(prev) &&
              prev.some((s) => String(s.id) === String(prefill.siteId));

            if (exists) return prev;

            return [
              { id: String(prefill.siteId), name: data.site || t("dispatcher.header_post_site", "Sitio") },
              ...(prev || []),
            ];
          });
          try {
            form.setValue("siteId", String(prefill.siteId));
          } catch (e) {}
        }
        // Ensure guard select contains the current guard so the select can display
        // the saved value even if the initial guard list didn't include it.
        try {
          if (prefill.guardId) {
            const guardNameDisplay =
              derivedGuard.name ||
              (data.guardName &&
                (data.guardName.fullName || data.guardName.name)) ||
              data.guardName ||
              t("dispatcher.guard", "Vigilante");

            setVigilantes((prev) => {
              const exists =
                Array.isArray(prev) &&
                prev.some((g) => String(g.id) === String(prefill.guardId));

              if (exists) return prev;

              return [
                { id: String(prefill.guardId), name: guardNameDisplay },
                ...(prev || []),
              ];
            });
            try {
              form.setValue("guardId", String(prefill.guardId));
            } catch (e) {}
          }
        } catch (err) {
          // ignore
        }
      } catch (err) {
        console.error("Error cargando Incidente para editar:", err);
      }
    })();
  }, [editId]);

  const onSubmit = async (data: DispatchCreateSchema) => {
    const incidentAt =
      data.incidentDate && data.incidentTime
        // «14:30» en el formulario son las 14:30 DEL PUESTO. `new Date("…T14:30:00")`
        // las leía en la zona del dispositivo, así que un incidente registrado
        // desde otra ciudad se guardaba a una hora distinta de la que se escribió.
        ? desdeInputFechaHora(
            `${data.incidentDate}T${data.incidentTime}`,
          )
        : null;

    const payload: Record<string, string | null> = {
      clientId: data.clientId || null,
      siteId: data.siteId || null,
      guardId: data.guardId || null,
      priority: data.priority || null,
      callerType: data.callerType || null,
      callerName: data.callerName || null,
      location: data.location || null,
      incidentTypeId: data.incidentType || null,
      incidentAt,
      content: data.incidentDetails || null,
      action: null,
      actionsTaken: data.actionsTaken || null,
      internalNotes: data.internalNotes || null,
      subject:
        (data as DispatchCreateSchema & { subject?: string }).subject ||
        `${data.location || ""}${data.incidentDetails ? " - " + String(data.incidentDetails).slice(0, 80) : ""}`,
    };

    try {
      const tenantId = localStorage.getItem("tenantId");

      if (!tenantId) return;
      if (!editId) return;

      // Backend controller expects `req.body.data` so wrap payload accordingly
      await api.put(`/tenant/${tenantId}/request/${editId}`, { data: payload });
      toast.success(t("ui.EditDispatchPage.incidenteActualizado"));
      setAttachments([]);
      navigate("/dispatch-tickets");
    } catch (error) {
      console.error("Error actualizando Incidente:", error);
      try {
        const msg =
          (error as { message?: string } | null)?.message ||
          t(
            "ui.EditDispatchPage.errorAlActualizarIncidente",
            "Error al actualizar Incidente",
          );

        toast.error(msg);
      } catch (e) {
        toast.error(t("ui.EditDispatchPage.errorAlActualizarIncidente"));
      }
    }
  };

  return (
    <AppLayout>

      <PageContainer className="pt-4" width="wide">
        <PageHeader
          icon={<ClipboardEdit />}
          subtitle={t("ui.EditDispatchPage.actualizaLosDatosDelIncidente")}
          title={t("ui.EditDispatchPage.editarIncidente")}
        />
        <Form {...form}>
          <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
            <Section
              icon={<Users />}
              title={t(
                "ui.EditDispatch.informacionDelIncidente",
                "Información del incidente",
              )}
            >
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <FormField
                  control={form.control}
                  name="clientId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("comun.clienteReq")}</FormLabel>
                      <Select
                        value={field.value}
                        onOpenChange={(open) => {
                          if (open) {
                            setTimeout(
                              () => clienteInputRef.current?.focus(),
                              50,
                            );
                          } else {
                            setClienteFilter("");
                          }
                        }}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={t("kit.select.placeholder")}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <div className="px-2 py-2">
                            <Input
                              ref={(el) => (clienteInputRef.current = el)}
                              placeholder={t("comun.buscarCliente")}
                              value={clienteFilter}
                              onChange={(e) => setClienteFilter(e.target.value)}
                            />
                          </div>
                          {clientes
                            .filter((c) =>
                              c.name
                                .toLowerCase()
                                .includes(clienteFilter.trim().toLowerCase()),
                            )
                            .map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="siteId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("comun.puestoDeSeguridadReq")}</FormLabel>
                      <Select
                        value={field.value}
                        onOpenChange={(open) => {
                          if (open) {
                            setTimeout(
                              () => sitioInputRef.current?.focus(),
                              50,
                            );
                          } else {
                            setSitioFilter("");
                          }
                        }}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={t("kit.select.placeholder")}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <div className="px-2 py-2">
                            <Input
                              ref={(el) => (sitioInputRef.current = el)}
                              placeholder={t("comun.buscarSitio")}
                              value={sitioFilter}
                              onChange={(e) => setSitioFilter(e.target.value)}
                            />
                          </div>
                          {sitios
                            .filter((s) =>
                              s.name
                                .toLowerCase()
                                .includes(sitioFilter.trim().toLowerCase()),
                            )
                            .map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="guardId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t("ui.EditDispatchPage.asignarVigilante")}
                      </FormLabel>
                      <Select
                        value={field.value}
                        onOpenChange={(open) => {
                          if (open) {
                            setTimeout(
                              () => guardInputRef.current?.focus(),
                              50,
                            );
                          } else {
                            setGuardFilter("");
                          }
                        }}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={t("kit.select.placeholder")}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <div className="px-2 py-2">
                            <Input
                              ref={(el) => (guardInputRef.current = el)}
                              placeholder={t("comun.buscarVigilante")}
                              value={guardFilter}
                              onChange={(e) => setGuardFilter(e.target.value)}
                            />
                          </div>
                          {vigilantes
                            .filter((g) =>
                              g.name
                                .toLowerCase()
                                .includes(guardFilter.trim().toLowerCase()),
                            )
                            .map((g) => (
                              <SelectItem key={g.id} value={g.id}>
                                {g.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t("ui.NewDispatchPage.prioridadReq", "Prioridad*")}
                      </FormLabel>
                      <Select
                        value={field.value}
                        onOpenChange={(open) => {
                          if (open) {
                            setTimeout(() => tipoInputRef.current?.focus(), 50);
                          } else {
                            setTipoFilter("");
                          }
                        }}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={t("kit.select.placeholder")}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {prioridades.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {t(p.labelKey, p.name)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="callerType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("comun.tipoDeLlamador")}</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={t("kit.select.placeholder")}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {tiposLlamador.map((tipo) => (
                            <SelectItem key={tipo.id} value={tipo.id}>
                              {t(tipo.labelKey, tipo.name)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="callerName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("comun.nombreDelLlamador")}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </Section>

            <Section
              icon={<FileText />}
              title={t("comun.detallesDelIncidente")}
            >
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem className="md:col-span-1">
                      <FormLabel>
                        {t(
                          "ui.EditDispatch.ubicacionDelIncidente",
                          "Ubicación del incidente*",
                        )}
                      </FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="incidentType"
                  render={({ field }) => (
                    <FormItem className="md:col-span-1">
                      <FormLabel>{t("comun.tipoDeIncidente")}</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={t("kit.select.placeholder")}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <div className="px-2 py-2">
                            <Input
                              ref={(el) => (tipoInputRef.current = el)}
                              placeholder={t("comun.buscarTipo")}
                              value={tipoFilter}
                              onChange={(e) => setTipoFilter(e.target.value)}
                            />
                          </div>
                          {tiposIncidente
                            .filter((t) =>
                              t.name
                                .toLowerCase()
                                .includes(tipoFilter.trim().toLowerCase()),
                            )
                            .map((t) => (
                              <SelectItem key={t.id} value={t.id}>
                                {t.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 gap-4 md:col-span-2 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="incidentDate"
                    render={({ field }) => (
                      <FormItem
                        className="cursor-pointer"
                        onClick={() => {
                          const el = incidentDateRef.current;

                          if (!el) return;
                          if (
                            typeof (
                              el as HTMLInputElement & {
                                showPicker?: () => void;
                              }
                            ).showPicker === "function"
                          ) {
                            try {
                              (
                                el as HTMLInputElement & {
                                  showPicker?: () => void;
                                }
                              ).showPicker();
                            } catch (err) {
                              el.focus();
                            }
                          } else {
                            el.focus();
                          }
                        }}
                      >
                        <FormLabel>{t("comun.fechaDelIncidente")}</FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            {...field}
                            ref={(el) => {
                              if (typeof field.ref === "function")
                                field.ref(el);
                              else if (field.ref)
                                (field.ref as any).current = el;
                              incidentDateRef.current = el;
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="incidentTime"
                    render={({ field }) => (
                      <FormItem
                        className="cursor-pointer"
                        onClick={() => {
                          const el = incidentTimeRef.current;

                          if (!el) return;
                          if (
                            typeof (
                              el as HTMLInputElement & {
                                showPicker?: () => void;
                              }
                            ).showPicker === "function"
                          ) {
                            try {
                              (
                                el as HTMLInputElement & {
                                  showPicker?: () => void;
                                }
                              ).showPicker();
                            } catch (err) {
                              el.focus();
                            }
                          } else {
                            el.focus();
                          }
                        }}
                      >
                        <FormLabel>{t("comun.horaDelIncidente")}</FormLabel>
                        <FormControl>
                          <Input
                            type="time"
                            {...field}
                            ref={(el) => {
                              if (typeof field.ref === "function")
                                field.ref(el);
                              else if (field.ref)
                                (field.ref as any).current = el;
                              incidentTimeRef.current = el;
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="incidentDetails"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>
                        {t("comun.detallesDelIncidenteReq")}
                      </FormLabel>
                      <FormControl>
                        <Textarea rows={4} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </Section>

            <Section icon={<NotebookPen />} title={t("ui.NewDispatchPage.seguimiento", "Seguimiento")}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="actionsTaken"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t("dispatcher.action_taken", "Acciones tomadas")}
                      </FormLabel>
                      <FormControl>
                        <Textarea rows={3} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="internalNotes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("comun.notasInternas")}</FormLabel>
                      <FormControl>
                        <Textarea rows={3} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </Section>

            <Section icon={<Paperclip />} title={t("guards.notes.form.attachments.label", "Adjuntos")}>
              <FormField
                control={form.control}
                name="attachment"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t("guards.notes.attachment", "Adjunto")}
                    </FormLabel>
                    <div className="flex items-start justify-between gap-3">
                      <input
                        ref={fileInputRef}
                        multiple
                        className="sr-only"
                        id="dispatch-attachments"
                        type="file"
                        onChange={(e) => {
                          const input = e.target as HTMLInputElement;
                          const files = Array.from(input.files || []);

                          if (files.length === 0) return;
                          setAttachments((prev) => {
                            const next = [...prev, ...files];

                            try {
                              form.setValue(
                                "attachment",
                                next.length ? next[0] : undefined,
                              );
                            } catch (err) {
                              /* ignore */
                            }

                            return next;
                          });
                          input.value = "";
                        }}
                      />

                      <div className="flex flex-wrap items-center gap-3">
                        <Button
                          className="min-w-[160px]"
                          type="button"
                          variant="outline"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          {t("ui.NewDispatchPage.elegirArchivos", "Elegir archivos")}
                        </Button>

                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          {attachments.length === 0 ? (
                            <span className="text-sm text-muted-foreground">
                              {t("comun.noHayArchivosAdjuntos")}
                            </span>
                          ) : (
                            attachments.map((f, idx) => (
                              <div
                                key={idx}
                                className="flex min-w-0 items-center gap-2"
                              >
                                <span className="min-w-0 truncate text-sm text-muted-foreground">
                                  {f.name}
                                </span>
                                <button
                                  aria-label={t("ui.NewDispatchPage.eliminarArchivo", {
                                  defaultValue: "Eliminar {{nombre}}",
                                  nombre: f.name,
                                })}
                                  className="text-muted-foreground hover:text-[color:var(--bad-text)]"
                                  type="button"
                                  onClick={() => {
                                    setAttachments((prev) => {
                                      const next = prev.filter(
                                        (_, i) => i !== idx,
                                      );

                                      try {
                                        form.setValue(
                                          "attachment",
                                          next.length ? next[0] : undefined,
                                        );
                                      } catch (err) {
                                        /* ignore */
                                      }

                                      return next;
                                    });
                                  }}
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Section>

            <FadeIn className="flex items-center justify-end gap-2">
              <Button asChild variant="outline">
                <Link to="/dispatch-tickets">{t("actions.cancel")}</Link>
              </Button>
              <Button
                disabled={form.formState.isSubmitting}
                type="submit"
                variant="brand"
              >
                {t("common.send", "Enviar")}
              </Button>
            </FadeIn>
          </form>
        </Form>
      </PageContainer>
    </AppLayout>
  );
}
