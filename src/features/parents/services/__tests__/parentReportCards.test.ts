import { beforeEach, describe, expect, it, vi } from "vitest";
const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/api/client", () => ({ apiClient: { get, post } }));
import { parentsService } from "../parentsService";

beforeEach(() => vi.clearAllMocks());

describe("Notes et bulletins du parent", () => {
  it("n'envoie jamais une liste d'UUID séparés par des virgules", async () => {
    get.mockResolvedValue({ data: { items: [], pages: 1, page: 1, total: 0 } });
    await parentsService.getGrades(["s1", "s2"], "all", "term-1");
    expect(get).toHaveBeenCalledWith("/parents/grades/", { params: { page_size: 100, page: 1, term_id: "term-1" } });
  });
  it("charge les pages suivantes sans tronquer les notes", async () => {
    get.mockResolvedValueOnce({ data: { items: [{ id: "a" }], pages: 2, page: 1 } });
    get.mockResolvedValueOnce({ data: { items: [{ id: "b" }], pages: 2, page: 2 } });
    expect(await parentsService.getGrades(["s1"], "s1")).toEqual([{ id: "a" }, { id: "b" }]);
    expect(get).toHaveBeenLastCalledWith("/parents/grades/", { params: { page_size: 100, page: 2, student_id: "s1" } });
  });
  it("propage l'échec d'une page au lieu de livrer un résultat incomplet", async () => {
    get.mockResolvedValueOnce({ data: { items: [{ id: "a" }], pages: 2, page: 1 } });
    get.mockRejectedValueOnce(new Error("HTTP 503"));
    await expect(parentsService.getGrades(["s1"])).rejects.toThrow("503");
  });
  it("ne transforme pas une réponse mal formée en liste vide", async () => {
    get.mockResolvedValue({ data: { message: "invalid" } });
    await expect(parentsService.getGrades(["s1"])).rejects.toThrow();
  });
  it("ne demande aucune donnée sans enfant connu", async () => {
    expect(await parentsService.getGrades([])).toEqual([]);
    expect(get).not.toHaveBeenCalled();
  });
  it("refuse un enfant absent de la sélection autorisée", async () => {
    await expect(parentsService.getGrades(["s1"], "other")).rejects.toThrow();
    expect(get).not.toHaveBeenCalled();
  });
  it("refuse un volume excessif avant de charger des centaines de pages", async () => {
    get.mockResolvedValue({ data: { items: [], pages: 201, page: 1 } });
    await expect(parentsService.getGrades(["s1"])).rejects.toThrow();
    expect(get).toHaveBeenCalledTimes(1);
  });
  it("demande le PDF avec les identifiants seulement", async () => {
    const pdf = new Blob(["%PDF-test"], { type: "application/pdf" });
    post.mockResolvedValue({ data: pdf });
    expect(await parentsService.generateReportCard("s1", "term-1")).toBe(pdf);
    expect(post).toHaveBeenCalledExactlyOnceWith("/parents/report-cards/generate/", {
      student_id: "s1", term_id: "term-1",
    }, { responseType: "blob" });
  });
  it("rejette une réponse JSON présentée comme un document", async () => {
    post.mockResolvedValue({ data: new Blob(['{"error":true}'], { type: "application/json" }) });
    await expect(parentsService.generateReportCard("s1", "term-1")).rejects.toThrow();
  });
});
