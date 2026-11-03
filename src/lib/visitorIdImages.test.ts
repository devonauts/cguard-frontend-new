import { describe, expect, it } from "vitest";
import { visitorIdImages } from "./visitorIdImages";

describe("visitorIdImages", () => {
  it("returns nothing for a missing log or empty lists", () => {
    expect(visitorIdImages(null)).toEqual([]);
    expect(visitorIdImages({ idPhoto: [], attachments: [] })).toEqual([]);
    expect(visitorIdImages({ idPhoto: null, attachments: "x" })).toEqual([]);
  });

  it("shows the idPhoto (station tab, guard app, /visitors form)", () => {
    const out = visitorIdImages({
      idPhoto: [{ id: "f1", name: "id.png", mimeType: "image/png", downloadUrl: "https://s/1" }],
    });
    expect(out).toEqual([{ key: "idPhoto-f1", url: "https://s/1", name: "id.png", isImage: true }]);
  });

  it("also shows the older images stored as attachments, after idPhoto", () => {
    const out = visitorIdImages({
      idPhoto: [{ id: "f1", name: "a.jpg", downloadUrl: "https://s/1" }],
      attachments: [
        { id: "a1", name: "old.JPEG", downloadUrl: "https://s/2" },
        { id: "a2", name: "contract.pdf", mimeType: "application/pdf", publicUrl: "https://s/3" },
      ],
    });
    expect(out.map((i) => [i.key, i.isImage])).toEqual([
      ["idPhoto-f1", true],
      ["attachment-a1", true],
      ["attachment-a2", false],
    ]);
    expect(out[2].url).toBe("https://s/3");
  });

  it("skips files without a usable URL and duplicates", () => {
    const out = visitorIdImages({
      idPhoto: [{ id: "f1", name: "a.png" }, { id: "f2", downloadUrl: "https://s/1" }],
      attachments: [{ id: "a1", downloadUrl: "https://s/1" }],
    });
    expect(out.map((i) => i.key)).toEqual(["idPhoto-f2"]);
  });
});
