import { describe, expect, it } from "vitest";

import { maskStreamPasswords } from "./maskStreamPasswords";

describe("maskStreamPasswords", () => {
  it("hides the password of every stream URL, keeps the rest", () => {
    const yaml = "streams:\n  cam1: rtsp://qa:qa-operacion@10.0.0.5:554/ch1\n  cam2: rtsp://admin:p%40ss@dvr.local/2";

    expect(maskStreamPasswords(yaml)).toBe(
      "streams:\n  cam1: rtsp://qa:••••@10.0.0.5:554/ch1\n  cam2: rtsp://admin:••••@dvr.local/2",
    );
  });

  it("leaves URLs without credentials alone", () => {
    expect(maskStreamPasswords("cam: rtsp://10.0.0.5/ch1")).toBe("cam: rtsp://10.0.0.5/ch1");
    expect(maskStreamPasswords("")).toBe("");
  });
});
