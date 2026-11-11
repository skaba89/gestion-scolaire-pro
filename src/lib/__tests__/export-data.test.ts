import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Exports avancés (2026-11-11) : routes et formats réels de l'API. Avant :
 * `/hr/staff/` inexistant, pages `{ items }` lues comme des tableaux,
 * paramètres ignorés par le serveur, colonnes Tuteur vides, emploi du temps
 * non implémenté.
 */

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/api/client", () => ({ apiClient: { get } }));
import {
  exportAttendance, exportFinances, exportGrades, exportSchedule, exportStudents, exportTeachers, fetchAllPages,
} from "../export-data";

const page = <T,>(items: T[], pageNo = 1, pages = 1) => ({ data: { items, total: items.length, page: pageNo, page_size: 100, pages } });
const gender = (g: string | null | undefined) => (g === "FEMALE" ? "Féminin" : "Masculin");

beforeEach(() => vi.clearAllMocks());

describe("fetchAllPages", () => {
  it("lit toutes les pages de 100", async () => {
    const full = Array.from({ length: 100 }, (_, i) => ({ id: `a${i}` }));
    get.mockResolvedValueOnce(page(full, 1, 2)).mockResolvedValueOnce(page([{ id: "b0" }], 2, 2));
    const rows = await fetchAllPages<{ id: string }>("/students/", { status: "ACTIVE" });
    expect(rows).toHaveLength(101);
    expect(get.mock.calls.map(([, c]) => c.params)).toEqual([
      { status: "ACTIVE", page: 1, page_size: 100 }, { status: "ACTIVE", page: 2, page_size: 100 },
    ]);
  });
});

describe("exports", () => {
  it("élèves : filtre par les inscriptions actives de la classe et remplit les colonnes Tuteur", async () => {
    get.mockImplementation((url: string) => {
      if (url === "/students/") return Promise.resolve(page([
        { id: "s1", registration_number: "M-1", first_name: "Awa", last_name: "Bah", gender: "FEMALE", class_name: "6e A",
          parent_name: "Fanta Bah", parent_phone: "620000000", parent_email: "fanta@example.org" },
        { id: "s2", registration_number: "M-2", first_name: "Ali", last_name: "Sow" },
      ]));
      if (url === "/enrollments/") return Promise.resolve({ data: [{ student_id: "s1" }] });
      return Promise.reject(new Error(url));
    });
    const rows = await exportStudents("class-1", gender);
    expect(rows).toEqual([expect.objectContaining({
      "N° Étudiant": "M-1", Genre: "Féminin", Classe: "6e A",
      Tuteur: "Fanta Bah", "Tél. Tuteur": "620000000", "Email Tuteur": "fanta@example.org",
    })]);
    expect(get).toHaveBeenCalledWith("/enrollments/", { params: { class_id: "class-1", status: "ACTIVE" } });
  });

  it("enseignants : tous les comptes TEACHER, avec matières et classes de leurs affectations", async () => {
    get.mockImplementation((url: string, config: { params: Record<string, unknown> }) => {
      if (url === "/users/") {
        expect(config.params.role).toBe("TEACHER");
        return Promise.resolve(page([{ id: "t1", first_name: "Lamine", last_name: "Cisse", email: "l@example.org" },
          { id: "t2", first_name: "Sans", last_name: "Affectation", email: "s@example.org" }]));
      }
      if (url === "/teachers/") return Promise.resolve(page([
        { teacher_id: "t1", subject_name: "Maths", class_name: "6e A" },
        { teacher_id: "t1", subject_name: "Physique", class_name: "6e A" },
      ]));
      return Promise.reject(new Error(url));
    });
    expect(await exportTeachers()).toEqual([
      { Prénom: "Lamine", Nom: "Cisse", Email: "l@example.org", Matières: "Maths, Physique", Classes: "6e A" },
      { Prénom: "Sans", Nom: "Affectation", Email: "s@example.org", Matières: "", Classes: "" },
    ]);
    expect(get.mock.calls.some(([url]) => url === "/hr/staff/")).toBe(false);
  });

  it("notes : seulement les évaluations de la période, jointes à l'élève et à la classe", async () => {
    get.mockImplementation((url: string, config: { params: Record<string, unknown> }) => {
      if (url === "/assessments/") {
        expect(config.params).toEqual({ classId: "class-1", termId: "term-1" });
        return Promise.resolve({ data: { items: [
          { id: "ev1", name: "Contrôle 1", class_id: "class-1", subject_name: "Maths", term_name: "T1", max_score: 20 },
        ] } });
      }
      if (url === "/grades/") return Promise.resolve(page([
        { student_id: "s1", assessment_id: "ev1", score: 15, max_score: 20, comments: "Bien" },
        { student_id: "s1", assessment_id: "ev-autre-periode", score: 3 },
      ]));
      if (url === "/students/") return Promise.resolve(page([{ id: "s1", registration_number: "M-1", first_name: "Awa", last_name: "Bah" }]));
      return Promise.reject(new Error(url));
    });
    expect(await exportGrades("class-1", "term-1", new Map([["class-1", "6e A"]]))).toEqual([{
      "N° Étudiant": "M-1", Étudiant: "Awa Bah", Classe: "6e A", Matière: "Maths", Évaluation: "Contrôle 1",
      Trimestre: "T1", Note: 15, "Note max": 20, Commentaire: "Bien",
    }]);
  });

  it("présences : `classroom_id` et pagination par offset", async () => {
    get.mockResolvedValueOnce({ data: { items: [
      { date: "2026-11-10", status: "LATE", reason: "Bus", student_name: "Awa Bah", student_number: "M-1", classroom_name: "6e A" },
    ] } });
    expect(await exportAttendance("class-1")).toEqual([
      { Date: "2026-11-10", "N° Étudiant": "M-1", Étudiant: "Awa Bah", Classe: "6e A", Statut: "Retard", Remarques: "Bus" },
    ]);
    expect(get).toHaveBeenCalledWith("/attendance/", { params: { classroom_id: "class-1", limit: 500, offset: 0 } });
  });

  it("finances : factures paginées avec l'élève imbriqué", async () => {
    get.mockResolvedValueOnce(page([{ invoice_number: "FAC-1", total_amount: 1500, paid_amount: 500, status: "PARTIAL",
      due_date: "2026-12-01", created_at: "2026-11-01T10:00:00", students: { first_name: "Awa", last_name: "Bah", registration_number: "M-1" } }]));
    const [row] = await exportFinances(() => "01/11/2026");
    expect(row).toMatchObject({ "N° Facture": "FAC-1", Étudiant: "Awa Bah", Solde: 1000, Statut: "Partielle", "Date création": "01/11/2026" });
    expect(get).toHaveBeenCalledWith("/payments/invoices/", { params: { page: 1, page_size: 100 } });
  });

  it("emploi du temps : désormais exporté (1 = lundi)", async () => {
    get.mockResolvedValueOnce({ data: [{ class_id: "class-1", day_of_week: 1, start_time: "08:00", end_time: "09:00",
      subject: { name: "Maths" }, room: { name: "S12" }, teacher: { first_name: "Lamine", last_name: "Cisse" } }] });
    expect(await exportSchedule(null, new Map([["class-1", "6e A"]]))).toEqual([
      { Classe: "6e A", Jour: "Lundi", "Heure début": "08:00", "Heure fin": "09:00", Matière: "Maths", Enseignant: "Lamine Cisse", Salle: "S12" },
    ]);
  });
});
