import { describe, expect, it } from "vitest";
import { filterNotes } from "./filterNotes";

const notes = [
  { title: "Portón dañado", description: "Revisar bisagra", addedBy: "Ana" },
  { title: "Ronda nocturna", description: "Sin novedad", addedBy: "Luis" },
];

describe("filterNotes", () => {
  it("returns every note for an empty query", () => {
    expect(filterNotes(notes, "  ")).toHaveLength(2);
  });

  it("matches title, description and author, ignoring case", () => {
    expect(filterNotes(notes, "PORTÓN")).toEqual([notes[0]]);
    expect(filterNotes(notes, "novedad")).toEqual([notes[1]]);
    expect(filterNotes(notes, "luis")).toEqual([notes[1]]);
  });

  it("returns nothing when no note matches", () => {
    expect(filterNotes(notes, "zzz")).toEqual([]);
  });
});
