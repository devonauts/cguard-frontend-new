import { describe, expect, it } from "vitest";

import {
  createNameMask,
  exportValue,
  hiddenFromSettings,
  learnNames,
  NOTHING_HIDDEN,
  showName,
  visibleColumns,
  type NameMask,
  type PrivacyMark,
} from "./reportPrivacy";

const LABELS = { clientName: "Cliente", siteName: "Sede", stationName: "Puesto" };

interface Row {
  guard: string;
  station: string;
  site: string;
  client: string;
}

const rows: Row[] = [
  { guard: "Ana", station: "Garita Principal", site: "Condominio Los Álamos", client: "Farmacias S.A." },
  { guard: "Luis", station: "Garita Norte", site: "Condominio Los Álamos", client: "Farmacias S.A." },
  { guard: "Ana", station: "Garita Principal", site: "Sede Norte", client: "Otro Cliente" },
];

const columns: Array<{ key: string; privacy?: PrivacyMark; value: (r: Row, m?: NameMask) => string }> = [
  { key: "guard", privacy: "guardName", value: (r) => r.guard },
  { key: "station", privacy: "stationName", value: (r) => r.station },
  {
    key: "site",
    value: (r, mask = showName) => [mask("siteName", r.site), mask("clientName", r.client)].join(" · "),
  },
];

describe("report privacy", () => {
  it("maps the three settings switches; the site follows the client switch", () => {
    expect(hiddenFromSettings({ hideClientName: true })).toEqual({
      guardName: false,
      clientName: true,
      siteName: true,
      stationName: false,
    });
    expect(hiddenFromSettings(null)).toEqual(NOTHING_HIDDEN);
  });

  it("drops the guard column only when the guard switch is on", () => {
    expect(visibleColumns(columns, NOTHING_HIDDEN).map((c) => c.key)).toEqual(["guard", "station", "site"]);
    expect(visibleColumns(columns, { ...NOTHING_HIDDEN, guardName: true }).map((c) => c.key)).toEqual([
      "station",
      "site",
    ]);
  });

  it("pseudonymizes client, site and station names in a file, one alias per distinct name", () => {
    const hidden = hiddenFromSettings({ hideClientName: true, hideStationName: true });
    const mask = createNameMask(hidden, LABELS);
    const out = rows.map((r) => columns.slice(1).map((c) => exportValue(c, r, mask)));

    expect(out).toEqual([
      ["Puesto 1", "Sede 1 · Cliente 1"],
      ["Puesto 2", "Sede 1 · Cliente 1"],
      ["Puesto 1", "Sede 2 · Cliente 2"],
    ]);
    // No real name survives.
    const flat = out.flat().join(" ");

    for (const r of rows) {
      expect(flat).not.toContain(r.station);
      expect(flat).not.toContain(r.site);
      expect(flat).not.toContain(r.client);
    }
  });

  it("hides only the switched-on parts of a combined cell", () => {
    const mask = createNameMask(hiddenFromSettings({ hideStationName: true }), LABELS);

    expect(exportValue(columns[2], rows[0], mask)).toBe("Condominio Los Álamos · Farmacias S.A.");
    expect(exportValue(columns[1], rows[0], mask)).toBe("Puesto 1");
  });

  it("keeps placeholders and leaves everything as is with nothing hidden", () => {
    const mask = createNameMask(hiddenFromSettings({ hideStationName: true }), LABELS);

    expect(mask("stationName", "—")).toBe("—");
    expect(mask("stationName", "")).toBe("");
    const open = createNameMask(NOTHING_HIDDEN, LABELS);

    expect(exportValue(columns[1], rows[0], open)).toBe("Garita Principal");
  });

  it("numbers each file from 1", () => {
    const hidden = hiddenFromSettings({ hideStationName: true });

    createNameMask(hidden, LABELS)("stationName", "A");
    expect(createNameMask(hidden, LABELS)("stationName", "B")).toBe("Puesto 1");
  });

  it("hides the row names inside free text with the same alias (incident location / title)", () => {
    const mask = createNameMask(hiddenFromSettings({ hideClientName: true, hideStationName: true }), LABELS);
    const incidents = [
      { station: "Garita Principal", site: "QA operacion Sede Norte", location: "garita principal", title: "Garita Principal - Persona sospechosa" },
      { station: "Puerta principal", site: "QA operacion Sede Norte", location: "Puerta principal", title: "Puerta principal - Segunda prueba en la Puerta principal" },
    ];

    learnNames(mask, incidents, (r) => [
      ["siteName", r.site],
      ["stationName", r.station],
    ]);
    const col = { freeText: true, value: (r: (typeof incidents)[number]) => r.title };
    const loc = { freeText: true, value: (r: (typeof incidents)[number]) => r.location };

    expect(mask("stationName", "Garita Principal")).toBe("Puesto 1");
    expect(exportValue(loc, incidents[0], mask)).toBe("Puesto 1");
    expect(exportValue(col, incidents[0], mask)).toBe("Puesto 1 - Persona sospechosa");
    expect(exportValue(col, incidents[1], mask)).toBe("Puesto 2 - Segunda prueba en la Puesto 2");
  });

  it("only replaces whole names and leaves text alone when nothing is hidden", () => {
    const mask = createNameMask(hiddenFromSettings({ hideStationName: true }), LABELS);

    mask("stationName", "Alfa");
    expect(mask.inText("Alfabeto en Alfa, ALFA.")).toBe("Alfabeto en Puesto 1, Puesto 1.");
    const open = createNameMask(NOTHING_HIDDEN, LABELS);

    open("stationName", "Alfa");
    expect(open.inText("en Alfa")).toBe("en Alfa");
  });
});
