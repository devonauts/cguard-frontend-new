/**
 * Meta Embedded Signup (WhatsApp Business) in the browser — shared by the
 * company connection (`WhatsAppBusinessCard`) and a Multimarca brand's own
 * connection (`RemitentesDeMarca`). The browser only sees the public app id
 * and config id; the one-time code is exchanged by the server.
 */
import i18n from "@/i18n";

declare global {
  interface Window {
    FB?: any;
    fbAsyncInit?: () => void;
  }
}

const FB_SDK_ID = "facebook-jssdk";
const FB_SDK_SRC = "https://connect.facebook.net/en_US/sdk.js";
const FB_ORIGINS = ["https://www.facebook.com", "https://web.facebook.com"];

let fbSdkPromise: Promise<void> | null = null;

/** Inject the Facebook JS SDK once, then (re)init with the platform app. */
export async function loadFacebookSdk(appId: string, graphVersion: string) {
  if (!window.FB) {
    if (!fbSdkPromise) {
      fbSdkPromise = new Promise<void>((resolve, reject) => {
        window.fbAsyncInit = () => resolve();
        if (document.getElementById(FB_SDK_ID)) {
          // Script tag already present (e.g. previous failed init) — wait for it.
          if (window.FB) resolve();

          return;
        }
        const script = document.createElement("script");

        script.id = FB_SDK_ID;
        script.src = FB_SDK_SRC;
        script.async = true;
        script.defer = true;
        script.crossOrigin = "anonymous";
        script.onerror = () => {
          fbSdkPromise = null;
          script.remove();
          reject(
            new Error(
              i18n.t("ui.WhatsAppBusinessCard.noSePudoCargarElSdkDeMeta", {
                defaultValue:
                  "No se pudo cargar el SDK de Meta. Revisa tu conexión o bloqueadores de anuncios.",
              }),
            ),
          );
        };
        document.head.appendChild(script);
      });
    }
    await fbSdkPromise;
  }
  // Safe to call repeatedly; keeps appId/version fresh on reconnect.
  window.FB.init({
    appId,
    autoLogAppEvents: true,
    xfbml: false,
    version: graphVersion || "v21.0",
  });

  return window.FB;
}

export interface RegistroIncrustado {
  code: string;
  wabaId: string | null;
  phoneNumberId: string | null;
}

/**
 * Open the Embedded Signup popup and wait for it. `null` when the person
 * closed it (or the browser blocked the popup).
 */
export async function abrirRegistroDeWhatsApp(p: {
  appId: string;
  configId: string;
  graphVersion: string;
}): Promise<RegistroIncrustado | null> {
  const session: { wabaId?: string; phoneNumberId?: string } = {};
  const onMessage = (event: MessageEvent) => {
    if (!FB_ORIGINS.includes(event.origin)) return;
    try {
      const data =
        typeof event.data === "string" ? JSON.parse(event.data) : event.data;

      if (!data || data.type !== "WA_EMBEDDED_SIGNUP") return;
      if (data.event === "FINISH" || data.event === "FINISH_ONLY_WABA") {
        session.wabaId = data.data?.waba_id || undefined;
        session.phoneNumberId = data.data?.phone_number_id || undefined;
      }
    } catch {
      // Non-JSON messages from facebook.com are irrelevant.
    }
  };

  window.addEventListener("message", onMessage);
  try {
    const FB = await loadFacebookSdk(p.appId, p.graphVersion);
    const response: any = await new Promise((resolve) => {
      FB.login((res: any) => resolve(res), {
        config_id: p.configId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, featureType: "", sessionInfoVersion: "3" },
      });
    });
    const code = response?.authResponse?.code;

    if (!code) return null;

    return {
      code,
      wabaId: session.wabaId ?? null,
      phoneNumberId: session.phoneNumberId ?? null,
    };
  } finally {
    window.removeEventListener("message", onMessage);
  }
}
