/** O6-A : la liste hors ligne d'une classe doit être celle de ses INSCRITS.
 * L'ancien appel /students/?class_id=… (paramètre ignoré par l'API) mettait
 * en cache la page 1 des élèves de tout l'établissement, étiquetés comme
 * élèves de la classe. */
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/api/client", () => ({ apiClient: { get } }));

import { useOfflineCache } from "@/hooks/useOfflineCache";
import { offlineDb } from "@/lib/offlineDb";

const brief = (id: string, last: string) => ({ id, first_name: "Élève", last_name: last, registration_number: `MAT-${id}` });

beforeEach(async () => {
  get.mockReset();
  await offlineDb.cachedStudents.clear();
  Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
  get.mockImplementation((url: string) => {
    if (url === "/infrastructure/enrollments/") {
      return Promise.resolve({ data: [
        { class_id: "c1", student_id: "s1", student: brief("s1", "Camara") },
        { class_id: "c1", student_id: "s2", student: brief("s2", "Diallo") },
        { class_id: "c1", student_id: "s2", student: brief("s2", "Diallo") }, // doublon historique
        { class_id: "c2", student_id: "s9", student: brief("s9", "Autre classe") },
      ] });
    }
    // Ancienne source : élèves de tout l'établissement (page 1).
    if (url.startsWith("/students/")) {
      return Promise.resolve({ data: { items: [brief("s1", "Camara"), brief("s9", "Autre classe"), brief("s7", "Hors classe")] } });
    }
    return Promise.resolve({ data: [] });
  });
});

it("met en cache exactement les élèves inscrits dans la classe, en remplaçant l'ancien cache", async () => {
  // Entrée périmée d'un ancien cache erroné pour cette classe.
  await offlineDb.cachedStudents.put({ id: "s-perime", tenantId: "t1", classroomId: "c1", firstName: "X", lastName: "Périmé", cachedAt: 0 });

  renderHook(() => useOfflineCache({ tenantId: "t1", classroomId: "c1" }));

  await waitFor(async () => {
    const ids = (await offlineDb.cachedStudents.where("classroomId").equals("c1").toArray()).map((s) => s.id).sort();
    expect(ids).toEqual(["s1", "s2"]);
  });
  expect(get).toHaveBeenCalledWith("/infrastructure/enrollments/", { params: { class_id: "c1", status: "active" } });
  expect(get.mock.calls.some(([url]) => String(url).startsWith("/students/"))).toBe(false);
});
