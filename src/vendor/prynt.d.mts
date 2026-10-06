/** Lo que el CRM usa del agente de Prynt (ver prynt.mjs). */
export interface ResultadoPrynt {
  requestId: string;
  visitorId: string;
}
declare const Prynt: {
  load(config: { apiKey: string; endpoint?: string; timeout?: number }): Promise<{
    identify(opts?: { tag?: Record<string, unknown> }): Promise<ResultadoPrynt>;
  }>;
  version: string;
};
export default Prynt;
