import { describe, expect, it } from "vitest";

import { collectDispatchFiles, safeFileUrl } from "./dispatchFiles";

describe("collectDispatchFiles", () => {
  it("shows the photos the create form stored as attachments", () => {
    const files = collectDispatchFiles({
      attachments: [
        {
          id: "a1",
          name: "foto.png",
          mimeType: "image/png",
          downloadUrl: "https://api.example.com/api/file/download?fileToken=x",
        },
      ],
      imageUrl: [],
    });

    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ key: "a1", name: "foto.png", isImage: true });
    expect(files[0].url).toBe("https://api.example.com/api/file/download?fileToken=x");
  });

  it("keeps the field-app photos and the legacy request PDFs", () => {
    const files = collectDispatchFiles({
      imageUrl: [{ id: "f1", name: "evidencia.jpg", downloadUrl: "https://x/a.jpg" }],
      requestDocumentPDF: [{ name: "acta.pdf" }, "otro.pdf"],
    });

    expect(files.map((f) => f.name)).toEqual(["evidencia.jpg", "acta.pdf", "otro.pdf"]);
    expect(files[0].isImage).toBe(true);
    expect(files[1]).toMatchObject({ url: null, isImage: false });
  });

  it("does not list the same link twice", () => {
    const one = { name: "a.png", downloadUrl: "https://x/a.png" };

    expect(collectDispatchFiles({ attachments: [one], imageUrl: [one] })).toHaveLength(1);
  });

  it("never renders a script link", () => {
    expect(safeFileUrl("javascript:alert(1)")).toBeNull();
    const files = collectDispatchFiles({
      attachments: [{ name: "x.png", downloadUrl: "javascript:alert(1)" }],
    });

    expect(files[0].url).toBeNull();
  });

  it("tolerates a payload without files", () => {
    expect(collectDispatchFiles(null)).toEqual([]);
    expect(collectDispatchFiles({})).toEqual([]);
  });
});

describe("collectDispatchFiles · public share", () => {
  it("reads the signed files the share sends", () => {
    const files = collectDispatchFiles({
      files: [{ name: "foto.jpg", mimeType: "image/jpeg", url: "https://api.x/api/file/download?fileToken=v2.a" }],
      requestDocumentPDF: [{ name: "acta.pdf" }],
    });

    expect(files.map((f) => f.name)).toEqual(["acta.pdf", "foto.jpg"]);
    expect(files[1]).toMatchObject({ isImage: true, url: "https://api.x/api/file/download?fileToken=v2.a" });
  });
});
