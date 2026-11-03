import { describe, expect, it } from "vitest";
import JavaScriptObfuscator from "javascript-obfuscator";
import { OPCIONES_DE_OFUSCACION, llamadasOpcionales } from "./ofuscarCodigo";

/* QA round 7 (2026-11-03): creating a client showed «_0x… is not a function».
   The minifier writes the save path as one sequence expression and
   control-flow flattening turned `onSaved?.(…)` into `onSaved(…)` for some
   seeds; the page passes no onSaved, so the call threw after the save. */
const SECUENCIA =
  "async function f(t,o,fm,k){let d=await g();" +
  't("x"),o?.({id:d.id}),fm.reset();if(!k){return 1}return 2}';

describe("obfuscation keeps optional calls", () => {
  it("never drops «?.(» from the minified save path, whatever the seed", () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const salida = JavaScriptObfuscator.obfuscate(SECUENCIA, {
        ...OPCIONES_DE_OFUSCACION,
        controlFlowFlatteningThreshold: 1,
        seed,
      }).getObfuscatedCode();
      expect(llamadasOpcionales(salida), `seed ${seed}`).toBe(llamadasOpcionales(SECUENCIA));
    }
  }, 60_000);

  it("counts optional calls", () => {
    expect(llamadasOpcionales("a?.(1);b?.c?.();d?.[0]")).toBe(2);
  });
});
