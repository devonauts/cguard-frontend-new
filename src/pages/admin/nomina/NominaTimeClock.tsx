import { useEffect, useState } from "react";
import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Clock, MapPin, LogIn, LogOut, Loader2, UserX } from "lucide-react";
import attendanceService from "@/lib/api/attendanceService";
import { PageContainer, FadeIn, StatusBadge, EmptyState, IconTile } from "@/components/kit";

interface Station { id: string; stationName?: string; name?: string }

type Mode = "guard" | "staff" | "none";

/**
 * Web Time Clock — kiosk-style punch for the logged-in user.
 *  - Field guards → station-scoped guard punch (/guard/me, server geofence).
 *  - Administrative/office staff → self-punch (/staff/me), con geocerca de
 *    oficina opcional.
 *
 * LOS DOS SOMBREROS. Hay gente que es las dos cosas: el operador de la central
 * que algunas noches sale a cubrir un puesto. Antes esta pantalla elegía sola
 * —«¿tiene ficha de vigilante? entonces modo puesto»— y en cuanto se le daba
 * la ficha para poder cubrir, sus horas de consola se quedaban sin dónde
 * marcarse. Ahora, si puede fichar de las dos formas, ELIGE ÉL. El servidor
 * sigue validando cada camino por separado; esto solo deja de decidir por el
 * usuario algo que el usuario sabe mejor.
 *
 * Ambos caminos acaban en Nómina › Registros de Asistencia.
 */
export default function NominaTimeClock() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [stations, setStations] = useState<Station[]>([]);
  const [stationId, setStationId] = useState("");
  const [mode, setMode] = useState<Mode>("none");
  /** Los modos que ESTA persona tiene disponibles hoy. Dos = puede elegir. */
  const [modosDisponibles, setModosDisponibles] = useState<Mode[]>([]);
  const [office, setOffice] = useState<{ radiusM: number; address: string | null } | null>(null);

  /** El estado del fichaje de oficina. Devuelve si ese camino está disponible. */
  const cargarStaff = async (aplicar: boolean) => {
    try {
      const s: { isClockedIn?: boolean; office?: { radiusM: number; address: string | null } | null } = await attendanceService.staffStatus();
      setOffice(s?.office ? { radiusM: s.office.radiusM, address: s.office.address } : null);
      if (aplicar) {
        setIsClockedIn(!!s?.isClockedIn);
        setMode("staff");
      } else if (s?.isClockedIn) {
        // Ya está fichado por oficina: ése es su modo actual, aunque además
        // tenga ficha de vigilante. Marcar salida por el camino equivocado
        // dejaría el turno abierto para siempre.
        setIsClockedIn(true);
        setMode("staff");
      }
      return true;
    } catch {
      return false;
    }
  };

  const refresh = () => {
    setLoading(true);
    let comoVigilante = false;
    attendanceService
      .myStatus()
      .then(async (d: { guard?: unknown; stations?: Station[]; isClockedIn?: boolean }) => {
        if (d?.guard) {
          comoVigilante = true;
          const sts: Station[] = d?.stations || [];
          setStations(sts);
          setIsClockedIn(!!d?.isClockedIn);
          if (sts[0]) setStationId((prev) => prev || sts[0].id);
          setMode("guard");
        }
        // Se pregunta SIEMPRE por el camino de oficina: es lo que descubre a
        // quien tiene los dos sombreros. Solo se aplica como modo si no es
        // vigilante (o si ya está fichado por oficina).
        const hayStaff = await cargarStaff(!comoVigilante);
        const modos: Mode[] = [];
        if (comoVigilante) modos.push("guard");
        if (hayStaff) modos.push("staff");
        setModosDisponibles(modos);
        if (!modos.length) setMode("none");
      })
      .catch(async () => {
        const hayStaff = await cargarStaff(true);
        setModosDisponibles(hayStaff ? ["staff"] : []);
        if (!hayStaff) setMode("none");
      })
      .finally(() => setLoading(false));
  };
  useEffect(refresh, []);

  // ¿Esta empresa exige selfie al marcar? Se pregunta una vez al abrir; si falla
  // se asume que NO, para no bloquear el fichaje por un problema nuestro — el
  // servidor sigue siendo quien decide.
  const [exigeSelfie, setExigeSelfie] = useState(false);
  useEffect(() => {
    attendanceService
      .getSettings()
      .then((s: any) => setExigeSelfie(!!s?.general?.requireSelfie))
      .catch(() => setExigeSelfie(false));
  }, []);

  const getPosition = (): Promise<{ latitude: number; longitude: number }> =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("Geolocalización no disponible"));
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
        (e) => reject(new Error(e.message || "No se pudo obtener la ubicación")),
        { enableHighAccuracy: true, timeout: 10000 },
      );
    });

  /**
   * Captura una foto con la cámara del navegador y la devuelve como fichero.
   *
   * Sin esto, activar «Requerir selfie» rompía ESTA pantalla: el servidor la
   * exigía y el reloj web no la mandaba nunca, así que devolvía 400 sin salida.
   * La app del vigilante sí la manda, por eso el fallo sólo aparecía por el
   * camino web — el más difícil de reproducir.
   */
  const capturarSelfie = (): Promise<File> =>
    new Promise((resolve, reject) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        return reject(new Error("Este navegador no puede usar la cámara. Marca desde la app."));
      }
      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: "user" } })
        .then((stream) => {
          const video = document.createElement("video");
          video.srcObject = stream;
          video.playsInline = true;
          video.play();
          // Un fotograma en cuanto haya imagen: la cámara tarda en exponer y
          // disparar de inmediato da una foto negra.
          video.onloadedmetadata = () => {
            setTimeout(() => {
              const canvas = document.createElement("canvas");
              canvas.width = video.videoWidth || 640;
              canvas.height = video.videoHeight || 480;
              canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
              stream.getTracks().forEach((t) => t.stop());
              canvas.toBlob(
                (blob) => {
                  if (!blob) return reject(new Error("No se pudo tomar la foto"));
                  resolve(new File([blob], "selfie.jpg", { type: "image/jpeg" }));
                },
                "image/jpeg",
                0.85,
              );
            }, 600);
          };
        })
        .catch(() => reject(new Error("No se pudo abrir la cámara. Revisa los permisos del navegador.")));
    });

  const doClockIn = async () => {
    if (mode === "guard" && !stationId) return toast.error("Selecciona un puesto");
    setBusy(true);
    try {
      // Guards require coords (server geofence). Staff: coords optional; still
      // sent when available so an office geofence can validate them.
      let coords: { latitude?: number; longitude?: number } = {};
      try { coords = await getPosition(); } catch (e) { if (mode === "guard") throw e; }

      // La selfie SÓLO si la empresa la exige y sólo para vigilantes: el reloj
      // de personal de oficina va por otro endpoint que no la pide.
      let selfiePhoto: string | undefined;
      if (mode === "guard" && exigeSelfie) {
        toast.info("Mira a la cámara…");
        const foto = await capturarSelfie();
        selfiePhoto = await attendanceService.uploadClockInSelfie(foto);
      }

      const res: { success?: boolean; message?: string } = mode === "guard"
        ? await attendanceService.clockIn({ stationId, ...coords, ...(selfiePhoto ? { selfiePhoto } : {}) })
        : await attendanceService.staffClockIn(coords);
      if (res && res.success === false) {
        toast.error(res.message || "No se pudo marcar entrada");
      } else {
        toast.success("Entrada registrada");
        refresh();
      }
    } catch (e) {
      toast.error((e as { message?: string })?.message || "Error");
    } finally {
      setBusy(false);
    }
  };

  const doClockOut = async () => {
    setBusy(true);
    try {
      let coords: { latitude?: number; longitude?: number } = {};
      try { coords = await getPosition(); } catch { /* GPS optional on out */ }
      const res: { success?: boolean; message?: string } = mode === "guard"
        ? await attendanceService.clockOut(coords)
        : await attendanceService.staffClockOut(coords);
      if (res && res.success === false) toast.error(res.message || "No se pudo marcar salida");
      else { toast.success("Salida registrada"); refresh(); }
    } catch (e) {
      toast.error((e as { message?: string })?.message || "Error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppLayout>
      <PageContainer width="narrow" className="max-w-md p-4 sm:p-6">
        <FadeIn className="glass glass-hover overflow-hidden p-8 text-center">
          <div className="mb-4 flex justify-center">
            <IconTile size="lg" className="brand-glow-sm"><Clock /></IconTile>
          </div>
          <h1 className="font-display text-xl font-bold tracking-tight">Reloj de Asistencia</h1>

          {loading ? (
            <div className="space-y-3 py-10">
              <div className="cg-skeleton mx-auto h-4 w-2/3" />
              <div className="cg-skeleton mx-auto h-4 w-1/2" />
              <div className="cg-skeleton mx-auto mt-6 h-12 w-full rounded-xl" />
            </div>
          ) : mode === "none" ? (
            <div className="mt-4">
              <EmptyState
                icon={<UserX />}
                title="Reloj de asistencia"
                description="Tu cuenta no puede registrar asistencia desde aquí. Si eres personal administrativo y necesitas marcar tu horario, pide a un administrador que te habilite el reloj."
                className="border-none py-6"
              />
            </div>
          ) : (
            <>
              <div className="mt-2 flex justify-center">
                <StatusBadge tone={isClockedIn ? "ok" : "neutral"}>
                  {isClockedIn ? "En servicio" : "Fuera de servicio"}
                </StatusBadge>
              </div>

              {/* LOS DOS SOMBREROS: quien puede fichar de las dos formas elige.
                  Con el turno ya abierto no se ofrece — cambiar de camino a
                  media jornada dejaría el turno anterior sin cerrar. */}
              {modosDisponibles.length > 1 && !isClockedIn && (
                <div className="mt-5 text-left">
                  <label className="cg-eyebrow">¿Dónde vas a trabajar?</label>
                  <div className="mt-1.5 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setMode("guard")}
                      className="cg-focus rounded-xl border px-3 py-2 text-sm transition"
                      style={{
                        borderColor: mode === "guard" ? "var(--brand)" : "var(--hairline)",
                        background: mode === "guard" ? "color-mix(in oklab, var(--brand) 10%, transparent)" : "transparent",
                        fontWeight: mode === "guard" ? 700 : 500,
                      }}
                    >
                      En un puesto
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("staff")}
                      className="cg-focus rounded-xl border px-3 py-2 text-sm transition"
                      style={{
                        borderColor: mode === "staff" ? "var(--brand)" : "var(--hairline)",
                        background: mode === "staff" ? "color-mix(in oklab, var(--brand) 10%, transparent)" : "transparent",
                        fontWeight: mode === "staff" ? 700 : 500,
                      }}
                    >
                      En la oficina
                    </button>
                  </div>
                </div>
              )}

              {mode === "guard" && !isClockedIn && (
                <div className="mt-5 text-left">
                  <label className="cg-eyebrow flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /> Puesto
                  </label>
                  <select
                    value={stationId}
                    onChange={(e) => setStationId(e.target.value)}
                    className="cg-input cg-focus mt-1.5 w-full px-3 py-2.5 text-sm"
                  >
                    {stations.length === 0 && <option value="">Sin puestos asignados</option>}
                    {stations.map((s) => (
                      <option key={s.id} value={s.id}>{s.stationName || s.name || s.id}</option>
                    ))}
                  </select>
                </div>
              )}

              {mode === "staff" && (
                <p className="mt-4 text-xs" style={{ color: "var(--ink-soft)" }}>
                  Registro de asistencia administrativa.
                  {office
                    ? ` Se valida tu ubicación contra tu oficina${office.address ? ` (${office.address})` : ""} (máx. ${office.radiusM} m).`
                    : " Tu cuenta no tiene una oficina configurada, así que se registra sin geocerca."}
                </p>
              )}

              <div className="mt-6">
                {isClockedIn ? (
                  <Button variant="destructive" onClick={doClockOut} disabled={busy} className="w-full py-6 text-base">
                    {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <LogOut className="mr-2 h-5 w-5" />}
                    Marcar salida
                  </Button>
                ) : (
                  <Button variant="brand" onClick={doClockIn} disabled={busy || (mode === "guard" && !stationId)} className="w-full py-6 text-base">
                    {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <LogIn className="mr-2 h-5 w-5" />}
                    Marcar entrada
                  </Button>
                )}
              </div>
              {mode === "guard" && (
                <p className="mt-3 text-[11px]" style={{ color: "var(--ink-faint)" }}>
                  Se solicitará tu ubicación para confirmar que estás dentro del área del puesto.
                </p>
              )}
            </>
          )}
        </FadeIn>
      </PageContainer>
    </AppLayout>
  );
}
