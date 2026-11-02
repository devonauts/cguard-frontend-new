import "axios";

declare module "axios" {
  export interface AxiosRequestConfig {
    toast?: {
      loading?: string;
      success?: string;
      error?: string | ((e: any) => string);
      silentError?: boolean;
      /** Statuses the screen shows on its own (e.g. 403 → a no-access state): no toast for them. */
      silentStatuses?: number[];
    };
  }
}
