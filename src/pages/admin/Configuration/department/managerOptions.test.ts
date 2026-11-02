import { describe, expect, it } from "vitest";

import { managerOptions } from "./managerOptions";

describe("managerOptions", () => {
  it("leaves out client-portal accounts and repeated rows", () => {
    const out = managerOptions([
      { id: "1", fullName: "Ana Ruiz", roles: ["admin"] },
      { id: "1", fullName: "Ana Ruiz", roles: ["admin"] },
      { id: "2", fullName: "Cliente de Guayaquil S.a.", roles: ["customer"] },
      { id: "3", fullName: "Luis Paz", roles: ["customer", "dispatcher"] },
      { id: "4", fullName: "Condominio Los Álamos", tenants: [{ roles: '["customer"]' }] },
    ]);

    expect(out).toEqual([
      { id: "1", name: "Ana Ruiz" },
      { id: "3", name: "Luis Paz" },
    ]);
  });

  it("tells apart two people with the same name by their email", () => {
    const out = managerOptions([
      { id: "a", fullName: "Qa Ayudante 1", email: "a@x.test" },
      { id: "b", fullName: "Qa Ayudante 1", email: "b@x.test" },
    ]);

    expect(out.map((o) => o.name)).toEqual([
      "Qa Ayudante 1 (a@x.test)",
      "Qa Ayudante 1 (b@x.test)",
    ]);
  });
});
