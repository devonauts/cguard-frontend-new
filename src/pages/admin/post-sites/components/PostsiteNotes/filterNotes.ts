/** Notes whose title, description or author contain the query (case-insensitive). */
export function filterNotes<
  T extends { title?: string; description?: string; addedBy?: string },
>(notes: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return notes;
  return notes.filter((n) =>
    [n.title, n.description, n.addedBy].some((v) =>
      String(v || "")
        .toLowerCase()
        .includes(q),
    ),
  );
}
