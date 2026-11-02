import { describe, expect, it } from "vitest";

import { uploadErrorText } from "./uploadError";

describe("uploadErrorText", () => {
  it("drops the browser's English network text", () => {
    expect(uploadErrorText(new TypeError("Failed to fetch"))).toBe("");
  });

  it("keeps a real reason and never prints [object Object]", () => {
    expect(uploadErrorText(new Error("Archivo demasiado grande"))).toBe("Archivo demasiado grande");
    expect(uploadErrorText({ message: "[object Object] | Prohibido" })).toBe("");
    expect(uploadErrorText({ data: { message: "Prohibido" } })).toBe("Prohibido");
  });
});
