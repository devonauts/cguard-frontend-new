import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useWatch, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronUp,
  Route as RouteIcon,
  MapPin,
  Trash2,
  GripVertical,
  Wand2,
  Loader2,
  Waypoints,
  Milestone,
  SlidersHorizontal,
  ClipboardList,
  Plus,
} from "lucide-react";
import { Link } from "react-router-dom";

import RouteMap, { type RouteMapStop } from "./RouteMap";
import ExtremoRutaField from "./ExtremoRutaField";
import { InsigniaOptimizada, PanelAhorro } from "./OptimizacionPanel";
import {
  aCoord,
  km as fmtKm,
  minutos as fmtMin,
  leerAhorro,
  leerExtremo,
  mismoExtremo,
  motivoTrazado,
  parseCoord,
  valorExtremo,
  type AhorroRuta,
  type ExtremoRuta,
} from "./routeOptimizacion";

import {
  routeCreateSchema,
  type RouteCreateSchema,
} from "@/lib/validators/route-create.schema";
import { Button } from "@/components/ui/button";
import telemetryService from "@/lib/api/telemetryService";
import routeInspectionTemplateService from "@/lib/api/routeInspectionTemplateService";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/* `FormField` del kit se importa con alias: en este archivo `FormField` ya es
   el de react-hook-form (ui/form). El del kit es el envoltorio
   etiqueta/pista de un campo SIN formulario detrás. */
import {
  Section,
  InfoNote,
  EmptyState,
  FormField as CampoKit,
} from "@/components/kit";
import { confirmDialog } from "@/components/ui/confirmDialog";
import userService from "@/lib/api/userService";
import { postSiteService } from "@/lib/api/postSiteService";
import vehicleService from "@/lib/api/vehicleService";
import routeService from "@/lib/api/routeService";
import { desdeInputFechaHora } from "@/lib/horaDeLaEmpresa";

const notifyTimes = ["00:05", "00:10", "00:15", "00:30", "01:00"];

/** Respaldo en español. Es una constante de módulo: `t()` aquí congelaría el
 *  idioma de arranque, así que se traduce al pintar con `DAY_LABEL_KEY`. */
const DAY_LABEL: Record<string, string> = {
  sun: "Domingo",
  mon: "Lunes",
  tue: "Martes",
  wed: "Miércoles",
  thu: "Jueves",
  fri: "Viernes",
  sat: "Sábado",
};
/** Clave i18n de cada día. Uso: `t(DAY_LABEL_KEY[d], DAY_LABEL[d])`. */
const DAY_LABEL_KEY: Record<string, string> = {
  sun: "siteTour.options.sunday",
  mon: "siteTour.options.monday",
  tue: "siteTour.options.tuesday",
  wed: "siteTour.options.wednesday",
  thu: "siteTour.options.thursday",
  fri: "siteTour.options.friday",
  sat: "siteTour.options.saturday",
};
const ALL_DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

type RouteFormProps = {
  mode: "create" | "edit";
  routeId?: string;
  initialData?: Partial<RouteCreateSchema> & {
    supervisorId?: string;
    supervisorName?: string;
    siteIds?: string[];
    vehicleId?: string;
    vehicleName?: string;
    vehicleLicensePlate?: string;
    points?: Array<{
      siteId: string;
      siteName?: string;
      address?: string;
      duration?: number;
      scheduledHits?: number;
      lat?: number | null;
      lng?: number | null;
      /* Ejecución guiada (2026-09): lo que la app exige en esa parada. */
      inspectionTemplateId?: string | null;
      priority?: string | null;
      required?: boolean;
      minPhotos?: number;
      instructions?: string | null;
      geofenceRadius?: number | null;
      visitWindowStart?: string | null;
      visitWindowEnd?: string | null;
      clientVisible?: boolean;
    }>;
    /** Hora prevista de salida (HH:mm), base del cálculo de retrasos. */
    scheduledStartTime?: string | null;
    /** Plantilla de inspección para las paradas que no definen la suya. */
    defaultInspectionTemplateId?: string | null;
    /* ── Los extremos del recorrido, opcionales por contrato ──────────────── */
    originLat?: number | string | null;
    originLng?: number | string | null;
    originLabel?: string | null;
    destinationLat?: number | string | null;
    destinationLng?: number | string | null;
    destinationLabel?: string | null;
    /* ── Estado de la optimización ───────────────────────────────────────── */
    optimized?: boolean | null;
    optimizedAt?: string | null;
    optimizedMeta?: unknown;
    /** Trazado real por calles, si alguien lo pidió (se paga). */
    roadPolyline?: string | null;
  };
  onSuccess?: () => void;
};

/**
 * Lo que la ejecución guiada exige en cada parada. Ausente = valores por
 * defecto (obligatoria, prioridad normal, visible al cliente, sin mínimos),
 * que es exactamente cómo se comportan las rutas creadas antes de 2026-09.
 */
type DetalleDeParada = {
  inspectionTemplateId: string;
  priority: string;
  required: boolean;
  minPhotos: number;
  instructions: string;
  geofenceRadius: number | "";
  visitWindowStart: string;
  visitWindowEnd: string;
  clientVisible: boolean;
};
type PuntoDelFormulario = {
  siteId: string;
  siteName?: string;
  address?: string;
  duration: number;
  scheduledHits: number;
  lat?: number | null;
  lng?: number | null;
} & DetalleDeParada;
const detalleDeParada = (p: any): DetalleDeParada => ({
  inspectionTemplateId: p?.inspectionTemplateId
    ? String(p.inspectionTemplateId)
    : "",
  priority: p?.priority || "normal",
  required: p?.required !== false,
  minPhotos: Number(p?.minPhotos) || 0,
  instructions: p?.instructions || "",
  geofenceRadius:
    p?.geofenceRadius != null && p.geofenceRadius !== ""
      ? Number(p.geofenceRadius)
      : "",
  visitWindowStart: p?.visitWindowStart
    ? String(p.visitWindowStart).slice(0, 5)
    : "",
  visitWindowEnd: p?.visitWindowEnd ? String(p.visitWindowEnd).slice(0, 5) : "",
  clientVisible: p?.clientVisible !== false,
});

/** Identidad del ORDEN de las paradas: si cambia, la marca de optimizada muere. */
const firmaDe = (puntos: Array<{ siteId: string }>) =>
  puntos.map((p) => p.siteId).join("|");

export default function RouteForm({
  mode,
  routeId,
  initialData,
  onSuccess,
}: RouteFormProps) {
  const { t } = useTranslation();
  const initialSupervisorId =
    initialData?.supervisorId ?? (initialData as any)?.assignedGuard ?? "";
  const initialSupervisorName =
    initialData?.supervisorName ??
    (initialData as any)?.assignedGuardName ??
    "";
  const form = useForm<RouteCreateSchema>({
    resolver: zodResolver(routeCreateSchema) as any,
    defaultValues: {
      name: initialData?.name || "",
      description: initialData?.description || "",
      continuous: initialData?.continuous ?? true,
      dateFrom: initialData?.dateFrom || "",
      dateTo: initialData?.dateTo || "",
      startTime: initialData?.startTime || "00:00",
      endTime: initialData?.endTime || "23:59",
      days: initialData?.days || [],
      supervisorId: initialSupervisorId ? String(initialSupervisorId) : "",
      siteIds: initialData?.siteIds || [],
      vehicleId: initialData?.vehicleId ? String(initialData?.vehicleId) : "",
      syncHitsBetweenGuards: initialData?.syncHitsBetweenGuards || false,
      forceVehicleRouteOrder: initialData?.forceVehicleRouteOrder || false,
      notifyBefore: initialData?.notifyBefore || "00:15",
      autoCheckInByGeofence: initialData?.autoCheckInByGeofence || false,
      forceCheckInBeforeStart: initialData?.forceCheckInBeforeStart || false,
    },
    mode: "onBlur",
  });

  const watchedDays = useWatch({
    control: form.control,
    name: "days" as any,
  }) as string[] | undefined;
  const [supervisors, setSupervisors] = useState<
    { id: string; name: string }[]
  >([]);
  const [fallbackSupervisor, setFallbackSupervisor] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [sites, setSites] = useState<
    {
      id: string;
      name: string;
      address?: string;
      lat?: number | string;
      lng?: number | string;
    }[]
  >([]);
  const [vehicles, setVehicles] = useState<
    { id: string; name: string; licensePlate?: string }[]
  >([]);
  const [vehiclesLoaded, setVehiclesLoaded] = useState(false);
  const [fallbackVehicle, setFallbackVehicle] = useState<{
    id: string;
    name: string;
    licensePlate?: string;
  } | null>(null);
  const [points, setPoints] = useState<Array<PuntoDelFormulario>>(
    initialData?.points?.map((p) => ({
      siteId: p.siteId,
      siteName: p.siteName,
      address: p.address || "",
      duration: p.duration ?? 5,
      scheduledHits: p.scheduledHits ?? 1,
      lat: p.lat ?? null,
      lng: p.lng ?? null,
      ...detalleDeParada(p),
    })) || [],
  );
  /* ── Ejecución guiada: campos de ruta fuera del esquema zod (opcionales) ── */
  const [scheduledStartTime, setScheduledStartTime] = useState<string>(
    initialData?.scheduledStartTime || "",
  );
  const [defaultInspectionTemplateId, setDefaultInspectionTemplateId] =
    useState<string>(initialData?.defaultInspectionTemplateId || "");
  const [plantillas, setPlantillas] = useState<
    Array<{ id: string; name: string; isDefault: boolean }>
  >([]);
  const [detalleAbierto, setDetalleAbierto] = useState<string | null>(null);

  useEffect(() => {
    routeInspectionTemplateService
      .list()
      .then((rows) =>
        setPlantillas(
          rows.map((r) => ({
            id: String(r.id),
            name: r.name,
            isDefault: !!r.isDefault,
          })),
        ),
      )
      .catch(() => setPlantillas([]));
  }, []);
  const [pointOrder, setPointOrder] = useState<string | "">("");
  const [submitting, setSubmitting] = useState(false);

  /* ── Origen, destino y optimización ────────────────────────────────────── */
  const [origen, setOrigen] = useState<ExtremoRuta | null>(() =>
    leerExtremo(
      initialData?.originLat,
      initialData?.originLng,
      initialData?.originLabel,
    ),
  );
  const [destino, setDestino] = useState<ExtremoRuta | null>(() =>
    leerExtremo(
      initialData?.destinationLat,
      initialData?.destinationLng,
      initialData?.destinationLabel,
    ),
  );
  const [optimizada, setOptimizada] = useState<boolean>(
    Boolean(initialData?.optimized),
  );
  const [optimizadaEn, setOptimizadaEn] = useState<string | null>(
    initialData?.optimizedAt ?? null,
  );
  const [ahorro, setAhorro] = useState<AhorroRuta | null>(() =>
    leerAhorro(initialData?.optimizedMeta),
  );
  const [trazado, setTrazado] = useState<string | null>(
    initialData?.roadPolyline ?? null,
  );
  const [optimizando, setOptimizando] = useState(false);
  const [trazando, setTrazando] = useState(false);

  /**
   * El orden que HAY GUARDADO en el servidor. Optimizar trabaja sobre lo
   * guardado, no sobre lo que se ve: sin esta referencia no se puede avisar de
   * que hay cambios sin guardar y el operador perdería su reordenación a mano.
   */
  const firmaGuardada = useRef<string>("");
  /** Los extremos tal y como están GUARDADOS, para saber si se movieron. */
  const extremosGuardados = useRef<{
    origen: ExtremoRuta | null;
    destino: ExtremoRuta | null;
  }>({
    origen: leerExtremo(
      initialData?.originLat,
      initialData?.originLng,
      initialData?.originLabel,
    ),
    destino: leerExtremo(
      initialData?.destinationLat,
      initialData?.destinationLng,
      initialData?.destinationLabel,
    ),
  });
  /** Índice que se está arrastrando (vive en una ref: no repinta por fotograma). */
  const arrastreRef = useRef<number | null>(null);
  const [sobre, setSobre] = useState<number | null>(null);
  /** Espejo de `points` para leerlo desde suscripciones que no se resuscriben. */
  const pointsRef = useRef(points);

  pointsRef.current = points;

  useEffect(() => {
    if (initialData) {
      form.reset({
        name: initialData.name || "",
        description: initialData.description || "",
        continuous: initialData.continuous ?? true,
        dateFrom: initialData.dateFrom || "",
        startTime: initialData.startTime || "00:00",
        dateTo: initialData.dateTo || "",
        endTime: initialData.endTime || "23:59",
        days: initialData.days || [],
        supervisorId: initialSupervisorId ? String(initialSupervisorId) : "",
        siteIds: initialData.siteIds || [],
        vehicleId: initialData.vehicleId ? String(initialData.vehicleId) : "",
        syncHitsBetweenGuards: initialData.syncHitsBetweenGuards || false,
        forceVehicleRouteOrder: initialData.forceVehicleRouteOrder || false,
        notifyBefore: initialData.notifyBefore || "00:15",
        autoCheckInByGeofence: initialData.autoCheckInByGeofence || false,
        forceCheckInBeforeStart: initialData.forceCheckInBeforeStart || false,
      });
      const puntos =
        initialData.points?.map((p) => ({
          siteId: p.siteId,
          siteName: p.siteName,
          address: p.address || "",
          duration: p.duration ?? 5,
          scheduledHits: p.scheduledHits ?? 1,
          lat: p.lat ?? null,
          lng: p.lng ?? null,
          ...detalleDeParada(p),
        })) || [];

      setPoints(puntos);
      // El orden con el que llega es, por definición, el que está guardado.
      firmaGuardada.current = firmaDe(puntos);

      const org = leerExtremo(
        initialData.originLat,
        initialData.originLng,
        initialData.originLabel,
      );
      const dst = leerExtremo(
        initialData.destinationLat,
        initialData.destinationLng,
        initialData.destinationLabel,
      );

      setOrigen(org);
      setDestino(dst);
      extremosGuardados.current = { origen: org, destino: dst };
      setOptimizada(Boolean(initialData.optimized));
      setOptimizadaEn(initialData.optimizedAt ?? null);
      setAhorro(leerAhorro(initialData.optimizedMeta));
      setTrazado(initialData.roadPolyline ?? null);

      if (initialSupervisorId) {
        const name = initialSupervisorName || String(initialSupervisorId);

        setFallbackSupervisor({ id: String(initialSupervisorId), name });
        setSupervisors((prev) =>
          prev.some((p) => String(p.id) === String(initialSupervisorId))
            ? prev
            : [...prev, { id: String(initialSupervisorId), name }],
        );
      }

      if (
        initialData.vehicleId &&
        (initialData.vehicleName || initialData.vehicleLicensePlate)
      ) {
        setFallbackVehicle({
          id: String(initialData.vehicleId),
          name: String(
            initialData.vehicleName ||
              initialData.vehicleLicensePlate ||
              initialData.vehicleId,
          ),
          licensePlate: initialData.vehicleLicensePlate,
        });
        setVehicles((prev) =>
          prev.some((v) => String(v.id) === String(initialData.vehicleId))
            ? prev
            : [
                ...prev,
                {
                  id: String(initialData.vehicleId),
                  name: String(
                    initialData.vehicleName ||
                      initialData.vehicleLicensePlate ||
                      String(initialData.vehicleId),
                  ),
                  licensePlate: initialData.vehicleLicensePlate || undefined,
                },
              ],
        );
      }
    }
  }, [initialData]);

  // If we have initialData with only IDs (no names), fetch fallbacks so the select shows the text.
  // Keyed ONLY on the IDs — collections/fallbacks are read/updated via functional setState so a
  // successful set does not re-trigger this effect (avoids refetch/render churn loops).
  const initialVehicleId = initialData?.vehicleId
    ? String(initialData.vehicleId)
    : "";

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const supId = initialSupervisorId ? String(initialSupervisorId) : "";

        if (supId) {
          try {
            const u = await userService.fetchUser(supId);

            if (!mounted) return;
            if (u) {
              const name =
                u.displayName ||
                u.fullName ||
                `${u.firstName || ""} ${u.lastName || ""}`.trim() ||
                u.email ||
                supId;
              const fb = { id: supId, name };

              if (import.meta.env.DEV)
                console.debug("[RouteForm] fetched fallback supervisor", fb);
              setFallbackSupervisor((prev) =>
                prev && String(prev.id) === supId ? prev : fb,
              );
              setSupervisors((prev) =>
                prev.some((p) => String(p.id) === supId) ? prev : [...prev, fb],
              );
            }
          } catch (err) {
            // ignore fetch failures — fallback may be set elsewhere
          }
        }

        const vehId = initialVehicleId;

        if (vehId) {
          try {
            const v = await vehicleService.find(vehId);

            if (!mounted) return;
            if (v) {
              const name = v.name || v.model || v.licensePlate || vehId;
              const fbv = {
                id: vehId,
                name,
                licensePlate: v.licensePlate || undefined,
              };

              if (import.meta.env.DEV)
                console.debug("[RouteForm] fetched fallback vehicle", fbv);
              setFallbackVehicle((prev) =>
                prev && String(prev.id) === vehId ? prev : fbv,
              );
              setVehicles((prev) =>
                prev.some((p) => String(p.id) === vehId)
                  ? prev
                  : [...prev, fbv],
              );
            }
          } catch (err) {
            // ignore
          }
        }
      } catch (e) {
        // ignore
      }
    })();

    return () => {
      mounted = false;
    };
  }, [initialSupervisorId, initialVehicleId]);

  useEffect(() => {
    if (!fallbackSupervisor) return;
    setSupervisors((prev) =>
      prev.some((s) => s.id === fallbackSupervisor.id)
        ? prev
        : [...prev, fallbackSupervisor],
    );
  }, [fallbackSupervisor]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const res: any[] = await userService.listUsers({
          active: true,
          limit: 200,
          offset: 0,
        });

        if (!mounted) return;

        const normalizeRoles = (rolesValue: any): string[] => {
          if (!rolesValue) return [];
          if (Array.isArray(rolesValue)) {
            return rolesValue
              .map((item) =>
                typeof item === "string"
                  ? item
                  : item && (item.name || item.role)
                    ? item.name || item.role
                    : "",
              )
              .filter(Boolean)
              .map((item) => String(item).toLowerCase().trim());
          }
          if (typeof rolesValue === "string") {
            return [rolesValue.toLowerCase().trim()];
          }
          if (typeof rolesValue === "object") {
            const candidate =
              rolesValue.name || rolesValue.role || rolesValue.type || "";

            return candidate ? [String(candidate).toLowerCase().trim()] : [];
          }

          return [];
        };

        const normalizedTargets = ["supervisor", "securitysupervisor", "admin"];

        const isUserActive = (u: any) => {
          if (!u) return false;
          const truthyFlag = (v: any) =>
            v === true || v === "true" || v === 1 || v === "1";
          const hasTruthy =
            truthyFlag(u.active) ||
            truthyFlag(u.isActive) ||
            truthyFlag(u.enabled);
          const st = (u.status || u.state || u.accountStatus || "")
            .toString()
            .toLowerCase()
            .trim();
          const pendingPatterns = [
            "pend",
            "pendiente",
            "pending",
            "inactive",
            "inactivo",
            "disabled",
          ];
          const isPending = pendingPatterns.some((p) => st.includes(p));

          if (hasTruthy && !isPending) return true;
          if (["active", "activo", "enabled", "habilitado"].includes(st))
            return true;

          return false;
        };

        const filtered = (res || []).filter((u: any) => {
          const userRoles = normalizeRoles(
            u.roles || u.role || u.rolesList || u._rolesDisplay,
          );
          const isSupervisor = userRoles.some((r) =>
            normalizedTargets.some((target) => r.includes(target)),
          );

          if (!isSupervisor) return false;

          return isUserActive(u);
        });

        setSupervisors((prev) => {
          const mapped = filtered.map((u: any) => ({
            id: String(u.id),
            name:
              u.displayName ||
              (u.firstName || u.lastName
                ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim()
                : undefined) ||
              u.name ||
              u.email ||
              String(u.id),
          }));

          // only append fallback supervisor if it appears active in the fetched results
          if (fallbackSupervisor) {
            const found = (res || []).find(
              (u: any) => String(u.id) === String(fallbackSupervisor.id),
            );

            if (
              found &&
              isUserActive(found) &&
              !mapped.some((s) => s.id === fallbackSupervisor.id)
            ) {
              return [...mapped, fallbackSupervisor];
            }
          }

          return mapped;
        });
      } catch (e) {
        console.error("Error loading supervisors", e);
        try {
          toast.error(
            String(
              (e as any)?.message ||
                (e as any)?.toString() ||
                t("ui.RouteForm.errorCargandoSupervisores", "Error cargando supervisores"),
            ),
          );
        } catch {}
        try {
          telemetryService.log({
            level: "error",
            message: "Error cargando supervisores",
            details: e,
          });
        } catch {}
      }
    })();

    (async () => {
      try {
        const res: any = await postSiteService.list(
          {},
          { limit: 100, offset: 0 },
        );
        const rows = res && res.rows ? res.rows : Array.isArray(res) ? res : [];

        if (!mounted) return;
        const mappedSites = rows.map((s: any) => {
          const rawLat =
            s.latitud ?? s.latitude ?? s.lat ?? s.locationLat ?? undefined;
          const rawLng =
            s.longitud ?? s.longitude ?? s.lng ?? s.locationLng ?? undefined;
          let lat = parseCoord(rawLat);
          let lng = parseCoord(rawLng);
          const latValid = lat != null && lat >= -90 && lat <= 90;
          const lngValid = lng != null && lng >= -180 && lng <= 180;

          if (
            !latValid &&
            lng != null &&
            lng >= -90 &&
            lng <= 90 &&
            lat != null &&
            lat >= -180 &&
            lat <= 180
          ) {
            const tmp = lat;

            lat = lng;
            lng = tmp;
          }
          const siteName =
            s.companyName ||
            s.name ||
            (s.company && (s.company.name || s.company.companyName)) ||
            String(s.id);

          return {
            id: String(s.id),
            name: siteName,
            address: s.address || s.location || s.postalAddress || "",
            lat,
            lng,
          };
        });

        setSites(mappedSites);

        // Patch existing points that may have been initialized from initialData without siteName
        setPoints((prev) => {
          if (!prev || !prev.length) return prev;
          const byId = new Map<string, any>(
            mappedSites.map((m: any) => [String(m.id), m]),
          );

          return prev.map((p) => {
            const id = String(p.siteId);
            const s: any = byId.get(id);

            if (!s) return p;

            return {
              ...p,
              siteName: p.siteName || s.name,
              address: p.address || s.address || "",
              lat: p.lat ?? (s.lat != null ? Number(s.lat) : null),
              lng: p.lng ?? (s.lng != null ? Number(s.lng) : null),
            };
          });
        });
      } catch (e) {
        console.error("Error loading sites", e);
        try {
          toast.error(
            String(
              (e as any)?.message ||
                (e as any)?.toString() ||
                t(
                  "ui.RouteForm.errorCargandoPuestosDeVigilancia",
                  "Error cargando Puestos de Vigilancia",
                ),
            ),
          );
        } catch {}
        try {
          telemetryService.log({
            level: "error",
            message: "Error cargando Puestos de Vigilancia",
            details: e,
          });
        } catch {}
      }
    })();

    (async () => {
      try {
        const res: any = await vehicleService.list({ limit: 100 });
        const rows = res && res.rows ? res.rows : Array.isArray(res) ? res : [];

        if (!mounted) return;
        const mapped: Array<{
          id: string;
          name: string;
          licensePlate?: string;
        }> = rows.length
          ? rows.map((v: any) => ({
              id: String(v.id),
              name: v.name || "",
              licensePlate: v.licensePlate || "",
            }))
          : [];

        setVehicles((prev) => {
          const merged: Array<{
            id: string;
            name: string;
            licensePlate?: string;
          }> = mapped.slice();

          if (
            fallbackVehicle &&
            !merged.some((v) => v.id === fallbackVehicle.id)
          ) {
            merged.push(fallbackVehicle);
          }

          return merged;
        });
        setVehiclesLoaded(true);
      } catch (e) {
        console.warn("vehicleService.list failed", e);
        setVehicles([]);
        if (mounted) setVehiclesLoaded(true);
        try {
          toast.error(
            String(
              (e as any)?.message ||
                (e as any)?.toString() ||
                t("ui.RouteForm.errorCargandoVehiculos", "Error cargando vehículos"),
            ),
          );
        } catch {}
        try {
          telemetryService.log({
            level: "error",
            message: "Error cargando vehículos",
            details: e,
          });
        } catch {}
      }
    })();

    return () => {
      mounted = false;
    };
  }, [fallbackSupervisor]);

  const noVehicles = vehiclesLoaded && vehicles.length === 0;

  // The "add vehicle" link opens in a new tab so the half-filled route is not
  // lost; when the user comes back, pick up the vehicle they just created.
  useEffect(() => {
    if (!noVehicles) return;
    const refresh = async () => {
      try {
        const res: any = await vehicleService.list({ limit: 100 });
        const rows = res && res.rows ? res.rows : Array.isArray(res) ? res : [];

        if (rows.length)
          setVehicles(
            rows.map((v: any) => ({
              id: String(v.id),
              name: v.name || "",
              licensePlate: v.licensePlate || "",
            })),
          );
      } catch {
        /* the empty-state link stays visible */
      }
    };

    window.addEventListener("focus", refresh);

    return () => window.removeEventListener("focus", refresh);
  }, [noVehicles]);

  const daysText = useMemo(() => {
    const d = watchedDays ?? [];

    if (!d.length) return ", , , , , ,";

    return d.map((k: any) => t(DAY_LABEL_KEY[k], DAY_LABEL[k])).join(", ");
  }, [watchedDays, t]);

  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name === "siteIds") {
        const selected = ((value.siteIds || []) as string[])
          .filter(Boolean)
          .map(String);
        // La lista actual se lee de la ref y NO del actualizador de `setPoints`:
        // ahí dentro no se puede llamar a `desoptimizar()` (un actualizador debe
        // ser puro, y en modo estricto React lo ejecuta dos veces).
        const prev = pointsRef.current;
        const elegidos = new Set(selected);
        const yaEstaban = new Set(prev.map((p) => String(p.siteId)));

        // Sin cambio real (p. ej. un `reset` que reescribe lo mismo) no se toca
        // nada: repintar aquí apagaría la marca de optimizada sola.
        const igual =
          elegidos.size === yaEstaban.size &&
          prev.every((p) => elegidos.has(String(p.siteId)));

        if (igual) return;

        const conSitio = (id: string, existing?: (typeof prev)[number]) => {
          const site = sites.find((s) => s.id === id);
          const latRaw = existing?.lat ?? site?.lat ?? null;
          const lngRaw = existing?.lng ?? site?.lng ?? null;

          return {
            siteId: id,
            siteName: existing?.siteName || site?.name,
            address: existing?.address || site?.address || "",
            duration: existing?.duration ?? 5,
            scheduledHits: existing?.scheduledHits ?? 1,
            lat: latRaw == null ? null : Number(latRaw),
            lng: lngRaw == null ? null : Number(lngRaw),
            ...detalleDeParada(existing),
          };
        };

        // El ORDEN que ya había se respeta y lo nuevo entra al final. Antes se
        // reconstruía la lista con el orden del desplegable, así que añadir un
        // puesto más barría la secuencia que alguien acababa de colocar a mano.
        const conservados = prev
          .filter((p) => elegidos.has(String(p.siteId)))
          .map((p) => conSitio(String(p.siteId), p));
        const nuevos = selected
          .filter((id) => !yaEstaban.has(id))
          .map((id) => conSitio(id));

        setPoints([...conservados, ...nuevos]);
        // Cambió el recorrido: la marca de optimizada deja de significar nada
        // (el servidor la apaga igual al guardar).
        desoptimizar();
      }
    });

    return () => subscription.unsubscribe && subscription.unsubscribe();
  }, [form, sites]);

  /**
   * Tocar el orden a mano MATA la marca de optimizada.
   *
   * El servidor hace exactamente lo mismo al guardar; adelantarlo aquí es lo que
   * evita que la pantalla siga presumiendo de un ahorro que ya no corresponde al
   * orden que se está viendo. La cifra de ahorro se va con ella: pertenece al
   * orden calculado, no a la ruta.
   */
  const desoptimizar = () => {
    setOptimizada(false);
    setAhorro(null);
    setOptimizadaEn(null);
    // El trazado por calles seguía el orden viejo: dibujarlo sobre el nuevo
    // enseñaría una línea que no pasa por donde dicen las paradas.
    setTrazado(null);
  };

  /**
   * Cambiar un extremo apaga la marca de optimizada — pero SÓLO si el punto se
   * movió de verdad. El servidor compara por número, así que volver a elegir la
   * misma dirección (o corregirle el nombre) no invalida nada, y apagar la marca
   * ahí sería castigar al operador por tocar un campo sin cambiar el recorrido.
   */
  const cambiarOrigen = (v: ExtremoRuta | null) => {
    const movido = !mismoExtremo(v, origen);

    setOrigen(v);
    if (movido) desoptimizar();
  };

  const cambiarDestino = (v: ExtremoRuta | null) => {
    const movido = !mismoExtremo(v, destino);

    setDestino(v);
    if (movido) desoptimizar();
  };

  const movePoint = (index: number, dir: number) => {
    const to = index + dir;

    if (to < 0 || to >= points.length) return;
    setPoints((prev) => {
      const arr = prev.slice();

      if (to < 0 || to >= arr.length) return arr;
      const tmp = arr[to];

      arr[to] = arr[index];
      arr[index] = tmp;

      return arr;
    });
    desoptimizar();
  };

  /** Arrastrar y soltar: saca la parada de donde estaba y la mete donde cayó. */
  const soltarEn = (destinoIdx: number) => {
    const desde = arrastreRef.current;

    arrastreRef.current = null;
    setSobre(null);
    if (desde == null || desde === destinoIdx) return;
    setPoints((prev) => {
      const arr = prev.slice();
      const [movida] = arr.splice(desde, 1);

      if (!movida) return prev;
      arr.splice(destinoIdx, 0, movida);

      return arr;
    });
    desoptimizar();
  };

  const removePoint = (siteId: string) => {
    const cur = form.getValues("siteIds") || [];

    form.setValue(
      "siteIds",
      (cur as string[]).filter((x) => x !== siteId),
    );
    setPoints((prev) => prev.filter((p) => p.siteId !== siteId));
    desoptimizar();
  };

  const updatePointField = (
    siteId: string,
    field: keyof PuntoDelFormulario,
    value: any,
  ) => {
    setPoints((prev) =>
      prev.map((p) => (p.siteId === siteId ? { ...p, [field]: value } : p)),
    );
  };

  /**
   * Lo que se ve ya no es lo que está guardado.
   *
   * Cuenta el ORDEN de las paradas y también los extremos: mover el origen
   * cambia el recorrido igual que mover una parada, y optimizar trabaja sobre lo
   * que hay en el servidor, no sobre lo que hay en pantalla.
   */
  const recorridoSucio =
    firmaDe(points) !== firmaGuardada.current ||
    !mismoExtremo(origen, extremosGuardados.current.origen) ||
    !mismoExtremo(destino, extremosGuardados.current.destino);

  /** Paradas que se pueden dibujar: sin coordenadas no hay ni línea ni ahorro. */
  const paradas = useMemo<RouteMapStop[]>(
    () =>
      points
        .map((p) => {
          const c = aCoord(p.lat, p.lng);

          if (!c) return null;

          return {
            id: p.siteId,
            nombre: p.siteName || p.siteId,
            direccion: p.address || undefined,
            lat: c.lat,
            lng: c.lng,
            duracion: p.duration,
            pasadas: p.scheduledHits,
          } as RouteMapStop;
        })
        .filter((x): x is RouteMapStop => x != null),
    [points],
  );

  /** Cuántas paradas no se pueden colocar. Se dice en voz alta: son las que la
   *  optimización NO puede tener en cuenta. */
  const sinUbicacion = points.length - paradas.length;

  /**
   * Relee la ruta del servidor y adopta lo que diga.
   *
   * Es el paso OBLIGATORIO tras optimizar: el servidor puede haber apagado la
   * marca, borrado el trazado o reordenado las paradas por su cuenta, y la única
   * forma de no quedarse con una pantalla que miente es volver a preguntar. El
   * orden lo manda `routePoint.order`.
   */
  const releerRuta = async () => {
    if (!routeId) return;
    const ruta: any = await routeService.find(routeId);

    if (!ruta) return;

    const devueltos: any[] = Array.isArray(ruta.points)
      ? ruta.points
          .slice()
          .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
      : [];

    if (devueltos.length) {
      // Los datos que el operador escribió y el servidor no toca (duración,
      // pasadas, dirección) se conservan; lo único que se adopta es el ORDEN.
      const porId = new Map(
        pointsRef.current.map((p) => [String(p.siteId), p]),
      );
      const siguiente = devueltos.map((d: any) => {
        const id = String(d.siteId ?? d.postSiteId ?? "");
        const previo = porId.get(id);

        return {
          siteId: id,
          siteName: d.siteName ?? previo?.siteName,
          address: previo?.address || d.address || "",
          duration: d.duration ?? previo?.duration ?? 5,
          scheduledHits: d.scheduledHits ?? previo?.scheduledHits ?? 1,
          // Las coordenadas llegan como CADENA (son decimales en la base de
          // datos): se normalizan aquí para que el estado guarde números.
          lat: parseCoord(d.lat) ?? previo?.lat ?? null,
          lng: parseCoord(d.lng) ?? previo?.lng ?? null,
          ...detalleDeParada(
            d.inspectionTemplateId !== undefined || d.priority !== undefined
              ? d
              : previo,
          ),
        };
      });

      setPoints(siguiente);
      firmaGuardada.current = firmaDe(siguiente);
      // El desplegable tiene que enseñar los mismos puestos; el vigía de
      // `siteIds` compara CONJUNTOS, así que reordenar aquí no lo despierta.
      form.setValue(
        "siteIds",
        siguiente.map((p) => p.siteId),
        { shouldDirty: false },
      );
    }

    const org = leerExtremo(ruta.originLat, ruta.originLng, ruta.originLabel);
    const dst = leerExtremo(
      ruta.destinationLat,
      ruta.destinationLng,
      ruta.destinationLabel,
    );

    setOrigen(org);
    setDestino(dst);
    extremosGuardados.current = { origen: org, destino: dst };

    setOptimizada(Boolean(ruta.optimized));
    setOptimizadaEn(ruta.optimizedAt ?? null);
    setAhorro(leerAhorro(ruta.optimizedMeta));
    setTrazado(ruta.roadPolyline ?? null);
  };

  /* ── Optimizar ─────────────────────────────────────────────────────────── */

  const optimizar = async () => {
    if (!routeId) return;
    if (recorridoSucio) {
      toast.info(t("ui.RouteForm.guardaPrimeroLosCambiosLa"));

      return;
    }
    if (
      !(await confirmDialog({
        title: t(
          "ui.RouteForm.optimizarElOrdenDeLasParadas",
          "Optimizar el orden de las paradas",
        ),
        message: t(
          "ui.RouteForm.optimizarConfirmMensaje",
          "Se reordenarán las paradas para recortar kilómetros y minutos, contando el tiempo de permanencia en cada una y una marcha efectiva de tráfico urbano. El orden manual actual se reemplaza; puedes volver a cambiarlo a mano cuando quieras.",
        ),
        confirmText: t("ui.RouteForm.optimizar", "Optimizar"),
      }))
    ) {
      return;
    }

    try {
      setOptimizando(true);
      const resp: any = await routeService.optimize(routeId);
      const r = resp?.data ?? resp ?? {};
      const nuevoAhorro = leerAhorro(r.meta ?? r.optimizedMeta ?? r);

      // La verdad está en el servidor: se relee en vez de reconstruir el orden a
      // partir de la respuesta (sus `points` van por id de parada, no de puesto).
      await releerRuta();

      // `changed: false` NO es un fallo: es que el orden manual ya era el bueno.
      // Decir «has ahorrado 0 km» ahí suena a que el botón no hizo nada.
      if (r.changed === false) {
        toast.success(t("comun.laRutaYaEstabaEn"));
      } else if (nuevoAhorro?.hayAhorro) {
        const trozos: string[] = [];

        if (nuevoAhorro.km != null && nuevoAhorro.km >= 0.05)
          trozos.push(`-${fmtKm(nuevoAhorro.km)}`);
        if (nuevoAhorro.min != null && nuevoAhorro.min >= 0.5)
          trozos.push(`-${fmtMin(nuevoAhorro.min)}`);
        toast.success(
          t("ui.RouteForm.rutaOptimizadaAhorro", {
            defaultValue: "Ruta optimizada: {{ahorro}} frente al orden manual.",
            ahorro: trozos.join(" · "),
          }),
        );
      } else {
        toast.success(t("ui.RouteForm.rutaOptimizada", "Ruta optimizada."));
      }

      const sinCoords = nuevoAhorro?.sinCoordenadas ?? 0;

      if (sinCoords > 0) {
        toast.info(
          sinCoords === 1
            ? t("ui.RouteForm.unaParadaSinUbicacionOptimizar", "Una parada no tiene ubicación: se ha quedado en su sitio y las demás se repartieron alrededor.")
            : t("ui.RouteForm.nParadasSinUbicacionOptimizar", {
                defaultValue:
                  "{{count}} paradas no tienen ubicación: se han quedado en su sitio y las demás se repartieron alrededor.",
                count: sinCoords,
              }),
        );
      }
    } catch (err: any) {
      // El mensaje ya viene traducido del servidor y el interceptor de `api` lo
      // enseña tal cual (`runInProgress`, `notEnoughStops`, `noCoordinates`).
      // Reescribirlo aquí sería taparlo con un texto peor.
      console.error("Error optimizando ruta", err);
      try {
        telemetryService.log({
          level: "error",
          message: "Error optimizando ruta",
          details: err,
        });
      } catch {}
    } finally {
      setOptimizando(false);
    }
  };

  /* ── Trazar por calles ─────────────────────────────────────────────────── */

  /** Ya hay trazado guardado: volver a pedirlo es lo que cuesta dinero. */
  const rehacerTrazado = Boolean(trazado);

  const trazarPorCalles = async () => {
    if (!routeId) return;
    if (recorridoSucio) {
      toast.info(t("ui.RouteForm.guardaPrimeroLosCambiosPara"));

      return;
    }
    if (
      !(await confirmDialog({
        title: rehacerTrazado
          ? t("ui.RouteForm.volverATrazarPorCalles", "Volver a trazar por calles")
          : t("ui.RouteForm.trazarElRecorridoPorCalles", "Trazar el recorrido por calles"),
        message: rehacerTrazado
          ? t("ui.RouteForm.rehacerTrazadoMensaje", "Esta ruta ya tiene su recorrido trazado. Volver a calcularlo consulta otra vez el servicio de mapas y eso se factura. Hazlo sólo si el recorrido cambió.")
          : t("ui.RouteForm.trazarMensaje", "Se dibujará el camino real que sigue el vehículo en vez de la línea recta entre paradas. La primera vez consulta el servicio de mapas, que tiene coste; después queda guardado."),
        confirmText: rehacerTrazado
          ? t("ui.RouteForm.volverATrazar", "Volver a trazar")
          : t("ui.RouteForm.trazar", "Trazar"),
      }))
    ) {
      return;
    }

    try {
      setTrazando(true);
      // `force` SÓLO cuando el operador acaba de aceptar rehacerlo a sabiendas.
      const resp: any = await routeService.roadShape(routeId, rehacerTrazado);
      const r = resp?.data ?? resp ?? {};
      const linea = r.polyline ?? r.roadPolyline ?? null;

      if (!linea) {
        // Esto NO es un error: el servidor lo dice y la pantalla sigue con la
        // línea recta, que es una respuesta honesta y gratis.
        toast.info(motivoTrazado(r.reason));

        return;
      }

      setTrazado(String(linea));
      toast.success(
        r.source === "cache"
          ? t("ui.RouteForm.recorridoRecuperado", "Recorrido por calles recuperado del último trazado. No hizo falta consultar el servicio de mapas.")
          : t("ui.RouteForm.recorridoTrazado", "Recorrido trazado por calles."),
      );
    } catch (err: any) {
      console.error("Error trazando ruta", err);
      try {
        telemetryService.log({
          level: "error",
          message: "Error trazando ruta por calles",
          details: err,
        });
      } catch {}
    } finally {
      setTrazando(false);
    }
  };

  const onSubmit = async (data: RouteCreateSchema) => {
    try {
      setSubmitting(true);
      const payload = {
        ...data,
        assignedGuard: data.supervisorId,
        windowStart:
          data.dateFrom && data.startTime
            ? // La ventana de la ruta es hora del puesto, no del portátil.
              desdeInputFechaHora(`${data.dateFrom}T${data.startTime}`)
            : null,
        windowEnd:
          data.dateTo && data.endTime
            ? desdeInputFechaHora(`${data.dateTo}T${data.endTime}`)
            : null,
        points: points.map((p, idx) => ({
          siteId: p.siteId,
          order: idx + 1,
          duration: p.duration,
          scheduledHits: p.scheduledHits,
          address: p.address,
          inspectionTemplateId: p.inspectionTemplateId || null,
          priority: p.priority || "normal",
          required: p.required !== false,
          minPhotos: Number(p.minPhotos) || 0,
          instructions: p.instructions || null,
          geofenceRadius:
            p.geofenceRadius === "" ? null : Number(p.geofenceRadius),
          visitWindowStart: p.visitWindowStart || null,
          visitWindowEnd: p.visitWindowEnd || null,
          clientVisible: p.clientVisible !== false,
        })),
        scheduledStartTime: scheduledStartTime || null,
        defaultInspectionTemplateId: defaultInspectionTemplateId || null,
        // Los seis van SIEMPRE. Y vacíos van como CADENA VACÍA, que es lo que el
        // servidor entiende por «bórralo»: un campo ausente no se toca, así que
        // con `undefined` el origen quitado reaparecería al recargar.
        originLat: valorExtremo(origen).lat,
        originLng: valorExtremo(origen).lng,
        originLabel: valorExtremo(origen).label,
        destinationLat: valorExtremo(destino).lat,
        destinationLng: valorExtremo(destino).lng,
        destinationLabel: valorExtremo(destino).label,
      } as any;

      const resp: any =
        mode === "edit" && routeId
          ? await routeService.update(routeId, payload)
          : await routeService.create(payload);

      // Lo que se acaba de mandar pasa a ser la referencia de «lo guardado».
      const habiaCambiado = recorridoSucio;

      firmaGuardada.current = firmaDe(points);
      extremosGuardados.current = { origen, destino };

      const guardada = resp?.data ?? resp;

      if (guardada && typeof guardada === "object" && "optimized" in guardada) {
        setOptimizada(Boolean(guardada.optimized));
        setOptimizadaEn(guardada.optimizedAt ?? null);
        setAhorro(leerAhorro(guardada.optimizedMeta));
        setTrazado(guardada.roadPolyline ?? null);
      } else if (habiaCambiado) {
        // El servidor apaga la marca y borra el trazado en cuanto cambian las
        // paradas o los extremos. Si la respuesta no lo dice, se refleja igual:
        // dejar la insignia verde sería presumir de un orden que ya no existe.
        desoptimizar();
      }

      toast.success(
        mode === "edit"
          ? t("ui.RouteForm.rutaActualizada", "Ruta actualizada")
          : t("ui.RouteForm.rutaCreada", "Ruta creada"),
      );
      onSuccess?.();
    } catch (err: any) {
      console.error("Error guardando ruta", err);
      try {
        const msg =
          err?.message ||
          err?.toString() ||
          (err?.details && JSON.stringify(err.details)) ||
          t("ui.RouteForm.errorGuardandoRuta", "Error guardando ruta");

        toast.error(String(msg));
      } catch {}
      try {
        telemetryService.log({
          level: "error",
          message: "Error guardando ruta",
          details: err,
        });
      } catch {}
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
        <Section
          contentClassName="space-y-6"
          icon={<RouteIcon />}
          title={t("ui.RouteForm.datosGenerales", "Datos generales")}
        >
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("comun.nombreReq")}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t("ui.RouteForm.nombreDeLaRuta")}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {t("ui.RouteForm.descripcion", "Descripción")}
                </FormLabel>
                <FormControl>
                  <Textarea
                    placeholder={t(
                      "ui.RouteForm.descripcionDeLaRuta",
                      "Descripción de la ruta",
                    )}
                    rows={3}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </Section>

        <Section contentClassName="space-y-4" title={t("ui.RouteForm.programarRuta", "Programar Ruta")}>
          <div className="flex items-center gap-3">
            <Switch
              checked={form.watch("continuous")}
              id="continuous"
              onCheckedChange={(v) => form.setValue("continuous", v)}
            />
            <Label className="text-base" htmlFor="continuous">
              {t("ui.RouteForm.rutaContinua", "Ruta Continua")}
            </Label>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <FormField
              control={form.control}
              name="dateFrom"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>{t("comun.desde")}</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="startTime"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("comun.horaDeInicio")}</FormLabel>
                  <FormControl>
                    <Input type="time" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="endTime"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("comun.horaDeFin")}</FormLabel>
                  <FormControl>
                    <Input type="time" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="dateTo"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>{t("comun.hasta")}</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="days"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>
                    {t("ui.RouteForm.seleccionarDias", "Seleccionar Días*")}
                  </FormLabel>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm"
                        type="button"
                      >
                        <span className="truncate">{daysText}</span>
                        <ChevronDown className="h-4 w-4 opacity-60" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-[320px]">
                      {ALL_DAYS.map((d) => {
                        const checked = (field.value || []).includes(d);

                        return (
                          <DropdownMenuCheckboxItem
                            key={d}
                            checked={checked}
                            onCheckedChange={(v) => {
                              const cur = new Set(field.value || []);

                              if (v) cur.add(d);
                              else cur.delete(d);
                              field.onChange(Array.from(cur));
                            }}
                          >
                            {t(DAY_LABEL_KEY[d], DAY_LABEL[d])}
                          </DropdownMenuCheckboxItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </Section>

        <Section
          contentClassName="space-y-6"
          title={t("ui.RouteForm.asignacion", "Asignación")}
        >
          <FormField
            control={form.control}
            name="supervisorId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("ui.RouteForm.asignarSupervisor")}</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t("ui.RouteForm.seleccionarSupervisor")}
                    >
                      {(() => {
                        const id = String(field.value || "");
                        const found = supervisors.find(
                          (x) => String(x.id) === id,
                        );

                        if (
                          !found &&
                          fallbackSupervisor &&
                          String(fallbackSupervisor.id) === id
                        ) {
                          console.debug(
                            "[RouteForm] SelectValue supervisor - using fallback",
                            {
                              id,
                              fallbackSupervisor,
                              fieldValue: field.value,
                              initialDataSupervisorId:
                                initialData?.supervisorId,
                              initialDataSupervisorName:
                                initialData?.supervisorName,
                              supervisorsCount: supervisors.length,
                            },
                          );

                          return fallbackSupervisor.name;
                        }
                        if (found) {
                          console.debug(
                            "[RouteForm] SelectValue supervisor - found in supervisors list",
                            { id, found, supervisorsCount: supervisors.length },
                          );

                          return found.name;
                        }
                        if (
                          initialSupervisorId &&
                          String(initialSupervisorId) === id
                        ) {
                          console.debug(
                            "[RouteForm] SelectValue supervisor - using initialData name",
                            { id, initialName: initialSupervisorName },
                          );

                          return initialSupervisorName || undefined;
                        }
                        console.debug(
                          "[RouteForm] SelectValue supervisor - nothing matched",
                          {
                            id,
                            fieldValue: field.value,
                            supervisorsCount: supervisors.length,
                            fallbackSupervisor,
                            initialSupervisorName: initialData?.supervisorName,
                          },
                        );

                        return undefined;
                      })()}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {supervisors.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {typeof window !== "undefined" &&
                  new URLSearchParams(window.location.search).get(
                    "debugSupervisor",
                  ) === "1" && (
                    <pre className="mt-2 p-2 rounded bg-muted/30 text-xs text-foreground">
                      {JSON.stringify(
                        {
                          fieldValue: field.value,
                          supervisors,
                          fallbackSupervisor,
                          initialSupervisorId: initialData?.supervisorId,
                          initialSupervisorName: initialData?.supervisorName,
                        },
                        null,
                        2,
                      )}
                    </pre>
                  )}
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="siteIds"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {t("ui.RouteForm.seleccionarPuestosDeVigilancia")}
                </FormLabel>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm"
                      type="button"
                    >
                      <span className="truncate">
                        {(field.value || []).length
                          ? (field.value || [])
                              .map(
                                (id: string) =>
                                  sites.find((s) => s.id === id)?.name,
                              )
                              .filter((n): n is string => Boolean(n))
                              .join(", ")
                          : t("ui.RouteForm.seleccionar", "Seleccionar")}
                      </span>
                      <ChevronDown className="h-4 w-4 opacity-60" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-[320px]">
                    {sites.length === 0 ? (
                      <div className="p-3 text-sm text-muted-foreground">
                        {t("ui.RouteForm.noHayPuestosDisponibles")}
                      </div>
                    ) : (
                      sites.map((s) => {
                        const checked = (field.value || []).includes(s.id);

                        return (
                          <DropdownMenuCheckboxItem
                            key={s.id}
                            checked={checked}
                            onCheckedChange={(v) => {
                              const cur = new Set(field.value || []);

                              if (v) cur.add(s.id);
                              else cur.delete(s.id);
                              field.onChange(Array.from(cur));
                            }}
                          >
                            {s.name}
                          </DropdownMenuCheckboxItem>
                        );
                      })
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                <FormMessage />
              </FormItem>
            )}
          />
        </Section>

        <Section
          contentClassName="space-y-4"
          icon={<Milestone />}
          title={t("ui.RouteForm.inicioYFinDelRecorrido")}
        >
          <ExtremoRutaField
            clase="origen"
            valor={origen}
            onChange={cambiarOrigen}
          />
          <ExtremoRutaField
            clase="destino"
            valor={destino}
            onChange={cambiarDestino}
          />
        </Section>

        <Section
          action={
            <InsigniaOptimizada
              optimizada={optimizada}
              optimizadaEn={optimizadaEn}
            />
          }
          contentClassName="space-y-4"
          icon={<MapPin />}
          title={t("ui.RouteForm.definirRuta", "Definir ruta")}
        >
          {/* LA CIFRA. Va lo primero y a tamaño grande: es lo que justifica el
              botón de optimizar y lo que el operador enseña a su jefe. */}
          <PanelAhorro ahorro={ahorro} optimizadaEn={optimizadaEn} />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={
                mode !== "edit" || !routeId || optimizando || paradas.length < 3
              }
              size="lg"
              type="button"
              variant="brand"
              onClick={optimizar}
            >
              {optimizando ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Wand2 className="size-4" />
              )}
              {optimizando
                ? t("ui.RouteForm.optimizando", "Optimizando…")
                : t("ui.RouteForm.optimizar", "Optimizar")}
            </Button>
            <Button
              disabled={
                mode !== "edit" || !routeId || trazando || paradas.length < 2
              }
              size="lg"
              type="button"
              variant="outline"
              onClick={trazarPorCalles}
            >
              {trazando ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Waypoints className="size-4" />
              )}
              {trazando
                ? t("ui.RouteForm.trazando", "Trazando…")
                : rehacerTrazado
                  ? t("ui.RouteForm.volverATrazarPorCalles", "Volver a trazar por calles")
                  : t("ui.RouteForm.trazarPorCalles", "Trazar por calles")}
            </Button>
            <span className="text-xs" style={{ color: "var(--ink-faint)" }}>
              {rehacerTrazado
                ? t("ui.RouteForm.yaHayRecorridoTrazado", "Ya hay recorrido trazado. Volver a calcularlo consulta el servicio de mapas otra vez y se factura.")
                : t("ui.RouteForm.trazadoTieneCoste", "El trazado por calles usa el servicio de mapas y tiene coste. Por omisión la línea va recta.")}
            </span>
          </div>

          {mode !== "edit" && (
            <InfoNote tone="neutral">
              {t(
                "ui.RouteForm.guardaLaRutaParaOptimizar",
                "Guarda la ruta para poder optimizar el orden de las paradas y trazar el recorrido real.",
              )}
            </InfoNote>
          )}
          {mode === "edit" && recorridoSucio && (
            <InfoNote tone="warn">
              {t(
                "ui.RouteForm.hasCambiadoElRecorrido",
                "Has cambiado el recorrido. Guarda los cambios para optimizar o trazar sobre el orden nuevo.",
              )}
            </InfoNote>
          )}
          {sinUbicacion > 0 && (
            <InfoNote tone="info">
              {sinUbicacion === 1
                ? t("ui.RouteForm.unaParadaSinUbicacionMapa", "Una parada no tiene ubicación: no se dibuja en el mapa y la optimización la deja en su sitio, repartiendo las demás alrededor.")
                : t("ui.RouteForm.nParadasSinUbicacionMapa", {
                    defaultValue:
                      "{{count}} paradas no tienen ubicación: no se dibujan en el mapa y la optimización las deja en su sitio, repartiendo las demás alrededor.",
                    count: sinUbicacion,
                  })}
            </InfoNote>
          )}

          {paradas.length > 0 ? (
            <RouteMap
              destino={destino}
              height={360}
              optimizada={optimizada}
              origen={origen}
              roadPolyline={trazado}
              stops={paradas}
            />
          ) : (
            <EmptyState
              description={t("ui.RouteForm.eligePuestosDeVigilanciaCon")}
              icon={<MapPin />}
              title={t(
                "ui.RouteForm.todaviaNoHayRecorridoQue",
                "Todavía no hay recorrido que dibujar",
              )}
            />
          )}

          <div
            className="overflow-hidden rounded-xl border"
            style={{ borderColor: "var(--hairline)" }}
          >
            <div
              className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3"
              style={{
                borderColor: "var(--hairline)",
                background: "var(--glass-sunken)",
              }}
            >
              <div className="text-sm font-medium">
                {t("ui.RouteForm.puntosYTiempos", "Puntos y tiempos")}
              </div>
              <div className="text-xs" style={{ color: "var(--ink-faint)" }}>
                {t(
                  "ui.RouteForm.arrastraUnaFila",
                  "Arrastra una fila para cambiar el orden. Cambiarlo a mano apaga la marca de optimizada.",
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-left text-sm">
                <thead style={{ background: "var(--glass-sunken)" }}>
                  <tr
                    className="border-b"
                    style={{ borderColor: "var(--hairline)" }}
                  >
                    <th className="px-4 py-3 font-semibold">#</th>
                    <th className="px-4 py-3 font-semibold">
                      {t("comun.puestoDeSeguridad")}
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      {t("ui.RouteForm.direccion", "Dirección")}
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      {t("ui.RouteForm.pasadas", "Pasadas")}
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      {t("ui.RouteForm.duracionMin", "Duración (min)")}
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      {t("ui.RouteForm.acciones", "Acciones")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {points.length === 0 ? (
                    <tr>
                      <td
                        className="px-4 py-10 text-center text-sm"
                        colSpan={6}
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {t(
                          "ui.RouteForm.noHayPuntosDefinidos",
                          "No hay puntos definidos",
                        )}
                      </td>
                    </tr>
                  ) : (
                    points.map((p, idx) => {
                      const ubicada = aCoord(p.lat, p.lng) != null;

                      return (
                        <Fragment key={p.siteId}>
                          <tr
                            draggable
                            className="border-b"
                            style={{
                              borderColor: "var(--hairline)",
                              background:
                                sobre === idx ? "var(--brand-wash)" : undefined,
                            }}
                            onDragEnd={() => {
                              arrastreRef.current = null;
                              setSobre(null);
                            }}
                            onDragLeave={() =>
                              setSobre((s) => (s === idx ? null : s))
                            }
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.dataTransfer.dropEffect = "move";
                              if (sobre !== idx) setSobre(idx);
                            }}
                            onDragStart={(e) => {
                              // Arrastrar DENTRO de un campo es seleccionar texto o
                              // cambiar un número, no mover la parada.
                              if (
                                (e.target as HTMLElement)?.closest?.(
                                  "input, button, a, select, textarea",
                                )
                              ) {
                                e.preventDefault();

                                return;
                              }
                              arrastreRef.current = idx;
                              e.dataTransfer.effectAllowed = "move";
                              // Firefox no arranca el arrastre sin carga útil.
                              try {
                                e.dataTransfer.setData(
                                  "text/plain",
                                  String(idx),
                                );
                              } catch {
                                /* navegador estricto */
                              }
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              soltarEn(idx);
                            }}
                          >
                            <td className="px-4 py-3">
                              <div
                                className="flex items-center gap-2"
                                style={{ cursor: "grab" }}
                              >
                                <GripVertical
                                  aria-hidden
                                  className="size-4 shrink-0"
                                  style={{ color: "var(--ink-faint)" }}
                                />
                                <span className="tabular-nums font-semibold">
                                  {idx + 1}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span>{p.siteName || p.siteId}</span>
                                {!ubicada && (
                                  <span
                                    className="rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                                    style={{
                                      color: "var(--warn-text)",
                                      borderColor:
                                        "color-mix(in oklab, var(--warn) 30%, transparent)",
                                      background:
                                        "color-mix(in oklab, var(--warn) 12%, transparent)",
                                    }}
                                  >
                                    {t(
                                      "ui.RouteForm.sinUbicacion",
                                      "Sin ubicación",
                                    )}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              {p.address || (
                                <span style={{ color: "var(--ink-faint)" }}>
                                  —
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <input
                                aria-label={t("ui.RouteForm.pasadasEn", { defaultValue: "Pasadas en {{name}}", name: p.siteName || p.siteId })}
                                className="cg-input cg-focus h-11 w-20 px-2 text-sm"
                                min={0}
                                type="number"
                                value={p.scheduledHits}
                                onChange={(e) =>
                                  updatePointField(
                                    p.siteId,
                                    "scheduledHits",
                                    Number(e.target.value || 0),
                                  )
                                }
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                aria-label={t("ui.RouteForm.duracionEn", { defaultValue: "Duración en {{name}}", name: p.siteName || p.siteId })}
                                className="cg-input cg-focus h-11 w-24 px-2 text-sm"
                                min={0}
                                type="number"
                                value={p.duration}
                                onChange={(e) =>
                                  updatePointField(
                                    p.siteId,
                                    "duration",
                                    Number(e.target.value || 0),
                                  )
                                }
                              />
                            </td>
                            <td className="px-4 py-3">
                              {/* Los mismos movimientos SIN arrastrar: en un móvil
                                no hay `dragstart`, y sin estos botones el orden
                                sería inalcanzable ahí. 44 px de alto. */}
                              <div className="flex gap-2">
                                <Button
                                  aria-label={t("ui.RouteForm.subir", { defaultValue: "Subir {{name}}", name: p.siteName || p.siteId })}
                                  className="size-11"
                                  disabled={idx === 0}
                                  size="icon-lg"
                                  type="button"
                                  variant="outline"
                                  onClick={() => movePoint(idx, -1)}
                                >
                                  <ChevronUp className="size-4" />
                                </Button>
                                <Button
                                  aria-label={t("ui.RouteForm.bajar", { defaultValue: "Bajar {{name}}", name: p.siteName || p.siteId })}
                                  className="size-11"
                                  disabled={idx === points.length - 1}
                                  size="icon-lg"
                                  type="button"
                                  variant="outline"
                                  onClick={() => movePoint(idx, 1)}
                                >
                                  <ChevronDown className="size-4" />
                                </Button>
                                <Button
                                  aria-label={t("ui.RouteForm.quitar", { defaultValue: "Quitar {{name}}", name: p.siteName || p.siteId })}
                                  className="size-11"
                                  size="icon-lg"
                                  type="button"
                                  variant="danger-ghost"
                                  onClick={() => removePoint(p.siteId)}
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                                <Button
                                  aria-label={t("ui.RouteForm.detalleDe", { defaultValue: "Detalle de {{name}}", name: p.siteName || p.siteId })}
                                  className="size-11"
                                  size="icon-lg"
                                  type="button"
                                  variant={
                                    detalleAbierto === p.siteId
                                      ? "brand"
                                      : "outline"
                                  }
                                  onClick={() =>
                                    setDetalleAbierto((d) =>
                                      d === p.siteId ? null : p.siteId,
                                    )
                                  }
                                >
                                  <SlidersHorizontal className="size-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                          {detalleAbierto === p.siteId && (
                            <tr
                              className="border-b"
                              style={{
                                borderColor: "var(--hairline)",
                                background: "var(--glass-sunken)",
                              }}
                            >
                              <td className="px-4 py-3" colSpan={6}>
                                <DetalleParadaEditor
                                  p={p}
                                  plantillas={plantillas}
                                  onChange={(field, value) =>
                                    updatePointField(p.siteId, field, value)
                                  }
                                />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Section>

        {/* ── Ejecución guiada: salida prevista y plantilla de inspección ──── */}
        <Section
          icon={<ClipboardList />}
          title={t(
            "ui.RouteForm.inspeccionYEjecucion",
            "Inspección y ejecución",
          )}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <CampoKit
              hint={t(
                "ui.RouteForm.salidaPrevistaHint",
                "Base para calcular «retrasada» y «en riesgo». Vacío: se usa la hora real de inicio.",
              )}
              htmlFor="scheduledStartTime"
              label={t("ui.RouteForm.salidaPrevista", "Salida prevista")}
            >
              <Input
                id="scheduledStartTime"
                type="time"
                value={scheduledStartTime}
                onChange={(e) => setScheduledStartTime(e.target.value)}
              />
            </CampoKit>
            <CampoKit
              hint={t(
                "ui.RouteForm.plantillaHint",
                "Cada parada puede definir la suya en su detalle.",
              )}
              htmlFor="defaultInspectionTemplateId"
              label={t(
                "ui.RouteForm.plantillaPorDefecto",
                "Plantilla de inspección",
              )}
            >
              <Select
                value={defaultInspectionTemplateId || PLANTILLA_HEREDADA}
                onValueChange={(v) =>
                  setDefaultInspectionTemplateId(
                    v === PLANTILLA_HEREDADA ? "" : v,
                  )
                }
              >
                {/* El texto se pasa a mano, como en el selector de vehículo:
                    las plantillas llegan después de montar y Radix no
                    refresca el valor mostrado hasta que se abre la lista. */}
                <SelectTrigger id="defaultInspectionTemplateId">
                  <SelectValue>
                    {nombrePlantilla(
                      plantillas,
                      defaultInspectionTemplateId,
                      t(
                        "ui.RouteForm.plantillaEmpresa",
                        "La de la empresa (por defecto)",
                      ),
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={PLANTILLA_HEREDADA}>
                    {t(
                      "ui.RouteForm.plantillaEmpresa",
                      "La de la empresa (por defecto)",
                    )}
                  </SelectItem>
                  {plantillas.map((tp) => (
                    <SelectItem key={tp.id} value={tp.id}>
                      {tp.name}
                      {tp.isDefault ? " ★" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CampoKit>
          </div>
        </Section>

        <Section
          contentClassName="space-y-6"
          title={t("ui.RouteForm.vehiculoYOpciones", "Vehículo y opciones")}
        >
          <FormField
            control={form.control}
            name="vehicleId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {t(
                    "ui.RouteForm.seleccionarVehiculo",
                    "Seleccionar vehículo*",
                  )}
                </FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t(
                        "ui.RouteForm.seleccionarVehiculo2",
                        "Seleccionar vehículo",
                      )}
                    >
                      {(() => {
                        const sv = vehicles.find((x) => x.id === field.value);

                        return sv
                          ? [sv.name, sv.licensePlate]
                              .filter(Boolean)
                              .join(" • ")
                          : undefined;
                      })()}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {vehicles.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        <span className="truncate">
                          {[v.name, v.licensePlate].filter(Boolean).join(" • ")}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {noVehicles && (
                  <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                    {t(
                      "ui.RouteForm.aunNoHayVehiculos",
                      "Aún no hay vehículos registrados.",
                    )}{" "}
                    <Link
                      className="cg-focus inline-flex items-center gap-1 font-semibold hover:underline"
                      rel="noopener"
                      style={{ color: "var(--brand-text)" }}
                      target="_blank"
                      to="/vehicle-patrol/vehicles/add-vehicle"
                    >
                      <Plus className="h-3 w-3" />
                      {t("ui.RouteForm.agregarVehiculo", "Agregar vehículo")}
                    </Link>
                  </p>
                )}
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="syncHitsBetweenGuards"
            render={({ field }) => (
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={field.value}
                  id="syncHits"
                  onCheckedChange={field.onChange}
                />
                <Label className="cursor-pointer" htmlFor="syncHits">
                  {t("ui.RouteForm.sincronizarPasadas", "Sincronizar pasadas entre supervisores")}
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                    style={{
                      background: "var(--glass-sunken)",
                      color: "var(--ink-faint)",
                    }}
                    title={t(
                      "ui.RouteForm.seGuardaConLaRuta",
                      "Se guarda con la ruta, pero todavía no cambia el comportamiento del recorrido.",
                    )}
                  >
                    {t("ui.RouteForm.aunNoActivo", "aún no activo")}
                  </span>
                </Label>
              </div>
            )}
          />

          <FormField
            control={form.control}
            name="forceVehicleRouteOrder"
            render={({ field }) => (
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={field.value}
                  id="forceOrder"
                  onCheckedChange={field.onChange}
                />
                <Label className="cursor-pointer" htmlFor="forceOrder">
                  {t(
                    "ui.RouteForm.forzarOrden",
                    "Forzar al supervisor a seguir la ruta de patrulla vehicular en orden",
                  )}
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                    style={{
                      background: "var(--glass-sunken)",
                      color: "var(--ink-faint)",
                    }}
                    title={t(
                      "ui.RouteForm.seGuardaConLaRuta2",
                      "Se guarda con la ruta, pero todavía no cambia el comportamiento del recorrido.",
                    )}
                  >
                    {t("ui.RouteForm.aunNoActivo", "aún no activo")}
                  </span>
                </Label>
              </div>
            )}
          />

          <FormField
            control={form.control}
            name="notifyBefore"
            render={({ field }) => (
              <div className="flex flex-wrap items-center gap-3">
                <Checkbox
                  checked={Boolean(field.value)}
                  id="notify"
                  onCheckedChange={(v) =>
                    form.setValue(
                      "notifyBefore",
                      v ? field.value || "00:15" : "00:15",
                    )
                  }
                />
                <Label className="cursor-pointer" htmlFor="notify">
                  {t(
                    "ui.RouteForm.enviarNotificacionAntesDeLasPasadasProgramadas",
                    "Enviar notificación antes de las pasadas programadas",
                  )}
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                    style={{
                      background: "var(--glass-sunken)",
                      color: "var(--ink-faint)",
                    }}
                    title={t(
                      "ui.RouteForm.seGuardaConLaRuta3",
                      "Se guarda con la ruta, pero todavía no cambia el comportamiento del recorrido.",
                    )}
                  >
                    {t("ui.RouteForm.aunNoActivo", "aún no activo")}
                  </span>
                </Label>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-28">
                    <SelectValue placeholder="00:15" />
                  </SelectTrigger>
                  <SelectContent>
                    {notifyTimes.map((hora) => (
                      <SelectItem key={hora} value={hora}>
                        {hora}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          />

          <FormField
            control={form.control}
            name="autoCheckInByGeofence"
            render={({ field }) => (
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={field.value}
                  id="autocheck"
                  onCheckedChange={field.onChange}
                />
                <Label className="cursor-pointer" htmlFor="autocheck">
                  {t(
                    "ui.RouteForm.registroAutomaticoGeocerca",
                    "Registro automático de entrada y salida en Puestos de Vigilancia según geocerca",
                  )}
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                    style={{
                      background: "var(--glass-sunken)",
                      color: "var(--ink-faint)",
                    }}
                    title={t(
                      "ui.RouteForm.seGuardaConLaRuta4",
                      "Se guarda con la ruta, pero todavía no cambia el comportamiento del recorrido.",
                    )}
                  >
                    {t("ui.RouteForm.aunNoActivo", "aún no activo")}
                  </span>
                </Label>
              </div>
            )}
          />

          <FormField
            control={form.control}
            name="forceCheckInBeforeStart"
            render={({ field }) => (
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={field.value}
                  id="forcecheck"
                  onCheckedChange={field.onChange}
                />
                <Label className="cursor-pointer" htmlFor="forcecheck">
                  {t(
                    "ui.RouteForm.forzarRegistroDeEntradaAntesDeComenzarLaRuta",
                    "Forzar registro de entrada antes de comenzar la ruta",
                  )}
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                    style={{
                      background: "var(--glass-sunken)",
                      color: "var(--ink-faint)",
                    }}
                    title={t(
                      "ui.RouteForm.seGuardaConLaRuta5",
                      "Se guarda con la ruta, pero todavía no cambia el comportamiento del recorrido.",
                    )}
                  >
                    {t("ui.RouteForm.aunNoActivo", "aún no activo")}
                  </span>
                </Label>
              </div>
            )}
          />
        </Section>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => window.history.back()}
          >
            {t("actions.cancel", "Cancelar")}
          </Button>
          <Button
            disabled={submitting || form.formState.isSubmitting}
            type="submit"
            variant="brand"
          >
            {submitting
              ? t("ui.RouteForm.enviando", "Enviando...")
              : mode === "edit"
                ? t("ui.RouteForm.actualizar", "Actualizar")
                : t("ui.RouteForm.enviar", "Enviar")}
          </Button>
        </div>
      </form>
    </Form>
  );
}

/**
 * El detalle de UNA parada para la ejecución guiada: qué plantilla contesta el
 * supervisor ahí, si es obligatoria, su prioridad, cuántas fotos exige, el
 * radio de llegada, la ventana horaria, instrucciones y si el cliente la ve.
 */
/* El `Select` de Radix no admite un elemento con valor vacío, así que
   «heredar» (la plantilla de la ruta, o la de la empresa) lleva un centinela
   que se convierte en '' para la API. */
const PLANTILLA_HEREDADA = "__heredada__";
const PRIORIDADES = ["low", "normal", "high", "critical"] as const;

/** Qué se lee en el disparador del selector de plantilla. Las plantillas
 *  llegan después de montar y Radix no refresca el valor mostrado hasta que
 *  se abre la lista, así que el texto se calcula aquí (mismo remedio que el
 *  selector de vehículo de este formulario). */
function nombrePlantilla(
  plantillas: Array<{ id: string; name: string; isDefault: boolean }>,
  id: string,
  heredada: string,
) {
  if (!id) return heredada;
  const tp = plantillas.find((x) => x.id === id);

  return tp ? `${tp.name}${tp.isDefault ? " ★" : ""}` : heredada;
}

function DetalleParadaEditor({
  p,
  plantillas,
  onChange,
}: {
  p: PuntoDelFormulario;
  plantillas: Array<{ id: string; name: string; isDefault: boolean }>;
  onChange: (field: keyof PuntoDelFormulario, value: any) => void;
}) {
  const { t } = useTranslation();
  const id = `det-${p.siteId}`;
  const prioridadLabel: Record<(typeof PRIORIDADES)[number], string> = {
    low: t("ui.RouteForm.det.baja", "Baja"),
    normal: t("ui.RouteForm.det.normal", "Normal"),
    high: t("ui.RouteForm.det.alta", "Alta"),
    critical: t("ui.RouteForm.det.critica", "Crítica"),
  };

  /* Mismas piezas que el resto del formulario: `CampoKit` (etiqueta atada +
     pista), `Input`, `Select`, `Textarea` y `Switch` con `Label`. Los campos
     sueltos con `cg-input cg-focus` medían 40 px —uno más que el resto— y
     pintaban dos aros de foco. */
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <CampoKit
        htmlFor={`${id}-plantilla`}
        label={t("ui.RouteForm.det.plantilla", "Plantilla de inspección")}
      >
        <Select
          value={p.inspectionTemplateId || PLANTILLA_HEREDADA}
          onValueChange={(v) =>
            onChange("inspectionTemplateId", v === PLANTILLA_HEREDADA ? "" : v)
          }
        >
          <SelectTrigger id={`${id}-plantilla`}>
            <SelectValue>
              {nombrePlantilla(
                plantillas,
                p.inspectionTemplateId,
                t("ui.RouteForm.det.plantillaRuta", "La de la ruta"),
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={PLANTILLA_HEREDADA}>
              {t("ui.RouteForm.det.plantillaRuta", "La de la ruta")}
            </SelectItem>
            {plantillas.map((tp) => (
              <SelectItem key={tp.id} value={tp.id}>
                {tp.name}
                {tp.isDefault ? " ★" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CampoKit>
      <CampoKit
        htmlFor={`${id}-prioridad`}
        label={t("ui.RouteForm.det.prioridad", "Prioridad")}
      >
        <Select
          value={p.priority}
          onValueChange={(v) => onChange("priority", v)}
        >
          <SelectTrigger id={`${id}-prioridad`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRIORIDADES.map((v) => (
              <SelectItem key={v} value={v}>
                {prioridadLabel[v]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CampoKit>
      <CampoKit
        htmlFor={`${id}-fotos`}
        label={t("ui.RouteForm.det.fotosMin", "Fotos mínimas")}
      >
        <Input
          id={`${id}-fotos`}
          max={20}
          min={0}
          type="number"
          value={p.minPhotos}
          onChange={(e) => onChange("minPhotos", Number(e.target.value) || 0)}
        />
      </CampoKit>
      <CampoKit
        hint={t(
          "ui.RouteForm.det.geocercaHint",
          "En metros. Vacío: el de la empresa.",
        )}
        htmlFor={`${id}-radio`}
        label={t("ui.RouteForm.det.geocerca", "Radio de llegada")}
      >
        <Input
          id={`${id}-radio`}
          max={5000}
          min={20}
          placeholder={t("ui.RouteForm.det.geocercaPh", "El de la empresa")}
          type="number"
          value={p.geofenceRadius}
          onChange={(e) =>
            onChange(
              "geofenceRadius",
              e.target.value === "" ? "" : Number(e.target.value),
            )
          }
        />
      </CampoKit>
      <CampoKit
        htmlFor={`${id}-desde`}
        label={t("ui.RouteForm.det.ventanaDesde", "Ventana desde")}
      >
        <Input
          id={`${id}-desde`}
          type="time"
          value={p.visitWindowStart}
          onChange={(e) => onChange("visitWindowStart", e.target.value)}
        />
      </CampoKit>
      <CampoKit
        htmlFor={`${id}-hasta`}
        label={t("ui.RouteForm.det.ventanaHasta", "Ventana hasta")}
      >
        <Input
          id={`${id}-hasta`}
          type="time"
          value={p.visitWindowEnd}
          onChange={(e) => onChange("visitWindowEnd", e.target.value)}
        />
      </CampoKit>
      <CampoKit
        className="sm:col-span-2 xl:col-span-3"
        htmlFor={`${id}-instr`}
        label={t(
          "ui.RouteForm.det.instrucciones",
          "Instrucciones para el supervisor",
        )}
      >
        <Textarea
          id={`${id}-instr`}
          maxLength={2000}
          placeholder={t(
            "ui.RouteForm.det.instruccionesPh",
            "P. ej. verificar el portón trasero y la bitácora del turno nocturno",
          )}
          rows={2}
          value={p.instructions}
          onChange={(e) => onChange("instructions", e.target.value)}
        />
      </CampoKit>
      <div className="flex flex-wrap gap-x-6 gap-y-3 sm:col-span-2 xl:col-span-3">
        <div className="flex items-center gap-2.5">
          <Switch
            checked={p.required}
            id={`${id}-req`}
            onCheckedChange={(v) => onChange("required", v)}
          />
          <Label
            className="cursor-pointer text-sm font-normal"
            htmlFor={`${id}-req`}
          >
            {t("ui.RouteForm.det.obligatoria", "Parada obligatoria")}
          </Label>
        </div>
        <div className="flex items-center gap-2.5">
          <Switch
            checked={p.clientVisible}
            id={`${id}-cli`}
            onCheckedChange={(v) => onChange("clientVisible", v)}
          />
          <Label
            className="cursor-pointer text-sm font-normal"
            htmlFor={`${id}-cli`}
          >
            {t("ui.RouteForm.det.visibleCliente", "Visible al cliente")}
          </Label>
        </div>
      </div>
    </div>
  );
}
