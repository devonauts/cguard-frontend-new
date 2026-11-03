import { describe, expect, it } from "vitest";

import {
  createNameMask,
  exportValue,
  HIDE_PLACE_NAMES_IN_TEXT,
  hiddenFromSettings,
  learnCompanyNames,
  learnNames,
  NOTHING_HIDDEN,
  showName,
  visibleColumns,
  type NameMask,
  type PrivacyMark,
} from "./reportPrivacy";

const LABELS = { clientName: "Cliente", siteName: "Sede", stationName: "Puesto" };
/** The place-names-in-text path, off by default but kept (HIDE_PLACE_NAMES_IN_TEXT). */
const PLACES_ON = { placeNamesInText: true };

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
    const mask = createNameMask(hiddenFromSettings({ hideClientName: true, hideStationName: true }), LABELS, PLACES_ON);
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
    const mask = createNameMask(hiddenFromSettings({ hideStationName: true }), LABELS, PLACES_ON);

    mask("stationName", "Alfa");
    expect(mask.inText("Alfabeto en Alfa, ALFA.")).toBe("Alfabeto en Puesto 1, Puesto 1.");
    const open = createNameMask(NOTHING_HIDDEN, LABELS, PLACES_ON);

    open("stationName", "Alfa");
    expect(open.inText("en Alfa")).toBe("en Alfa");
  });

  describe("round 3 (QA re-test 2026-11-02)", () => {
    const todo = () =>
      createNameMask(hiddenFromSettings({ hideClientName: true, hideStationName: true }), LABELS, PLACES_ON);
    const empresa = {
      clients: [{ name: "Condominio Los Álamos", lastName: null, commercialName: "Los Álamos S.A." }],
      sites: [{ name: "QA operacion Sede Norte" }],
      stations: [
        { name: "Garita Principal", nickname: "Alfa 1" },
        { name: "Puerta Norte", nickname: "Charlie 3" },
      ],
    };

    it("(a) hides the station call-sign with the station's own alias", () => {
      const mask = todo();

      learnCompanyNames(mask, empresa);
      const alias = mask("stationName", "Garita Principal");

      expect(mask.inText("GARITA PRINCIPAL (Alfa 1), Av. Chapultepec 480")).toBe(
        `${alias} (${alias}), Av. Chapultepec 480`,
      );
      expect(mask("stationName", "Alfa 1")).toBe(alias);
    });

    it("(b) matches names typed without accents or with extra spaces, keeping the rest of the text", () => {
      const mask = todo();

      learnCompanyNames(mask, empresa);
      const cliente = mask("clientName", "Condominio Los Álamos");
      const puesto = mask("stationName", "Garita Principal");

      expect(mask.inText("Visita · Condominio Los Alamos (sin tilde) · alfa 1")).toBe(
        `Visita · ${cliente} (sin tilde) · ${puesto}`,
      );
      expect(mask.inText("Doble espacio: Garita  Principal.")).toBe(`Doble espacio: ${puesto}.`);
      expect(mask.inText("los álamos s.a. pagó")).toBe(`${cliente} pagó`);
      // Whole words only: a name inside a longer word stays.
      expect(mask.inText("Garita Principales")).toBe("Garita Principales");
    });

    it("(c) masks BEFORE cutting, so a name split by the cut is never half shown", () => {
      const mask = todo();

      learnCompanyNames(mask, empresa);
      const texto = `${"x".repeat(70)} Garita Principal y más texto`;
      const col = { freeText: true, maxChars: 80, value: () => texto };
      const out = exportValue(col, {}, mask);

      expect(out).not.toMatch(/Garita|Pr…/);
      expect(out.endsWith("…")).toBe(true);
    });

    it("(d) hides names of posts that have no row in the file", () => {
      const mask = todo();

      learnCompanyNames(mask, empresa);
      learnNames(mask, [{ station: "Garita Principal" }], (r) => [["stationName", r.station]]);
      const otro = mask("stationName", "Puerta Norte");

      expect(mask.inText("Otro puesto: Puerta Norte (Charlie 3)")).toBe(`Otro puesto: ${otro} (${otro})`);
      expect(mask.inText("Sede QA operacion Sede Norte")).toBe(`Sede ${mask("siteName", "QA operacion Sede Norte")}`);
    });

    it("learns nothing when the switches are off", () => {
      const mask = createNameMask(NOTHING_HIDDEN, LABELS, PLACES_ON);

      learnCompanyNames(mask, empresa);
      expect(mask.inText("Garita Principal (Alfa 1)")).toBe("Garita Principal (Alfa 1)");
    });
  });

  describe("place names in free text are off by default (owner, 2026-11-02)", () => {
    const empresa = {
      clients: [{ name: "Roberto", lastName: "Villacís Chiriboga", commercialName: null }],
      sites: [{ name: "Prueba" }, { name: "Sede Norte" }],
      stations: [{ name: "Norte", nickname: "Charlie 3" }, { name: "Garita Principal", nickname: null }],
    };
    const todo = () =>
      createNameMask(hiddenFromSettings({ hideClientName: true, hideStationName: true }), LABELS);

    it("the switch is off", () => {
      expect(HIDE_PLACE_NAMES_IN_TEXT).toBe(false);
    });

    it("keeps ordinary words that equal a site or station name", () => {
      const mask = todo();

      learnCompanyNames(mask, empresa);
      const text = "Segunda prueba en la puerta norte de Garita Principal (Charlie 3), Sede Norte";

      expect(mask.inText(text)).toBe(text);
    });

    it("still pseudonymizes the site and station columns", () => {
      const mask = todo();

      learnCompanyNames(mask, empresa);
      expect(mask("siteName", "Prueba")).toBe("Sede 1");
      expect(mask("stationName", "Norte")).toBe("Puesto 1");
      expect(exportValue({ privacy: "siteName", value: () => "Prueba" }, {}, mask)).toBe("Sede 1");
    });

    it("still hides a person's full name in free text, as before", () => {
      const mask = todo();

      learnCompanyNames(mask, empresa);
      const alias = mask("clientName", "Roberto Villacís Chiriboga");
      const col = { freeText: true, value: () => "Visita de Roberto Villacis Chiriboga en la sede Prueba" };

      expect(exportValue(col, {}, mask)).toBe(`Visita de ${alias} en la sede Prueba`);
    });
  });
});
