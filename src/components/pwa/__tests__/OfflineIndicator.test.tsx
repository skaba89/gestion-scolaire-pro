/** O6-B : l'indicateur global comptait une file que rien n'alimentait
 * (toujours « 0 en attente ») et « synchronisait » en supprimant sans envoyer.
 * Il doit afficher les vraies saisies non envoyées et les envoyer. */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@/api/client", () => ({ apiClient: { post, patch: vi.fn(), put: vi.fn(), get: vi.fn() } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "teacher-1" } }) }));
vi.mock("@/contexts/TenantContext", () => ({ useTenant: () => ({ tenant: { id: "tenant-1" } }) }));

import OfflineIndicator from "@/components/pwa/OfflineIndicator";
import { offlineDb as draftsDb } from "@/lib/offlineDb";
import { offlineDb as outboxDb } from "@/offline/db";
import { whenDraftSyncIdle } from "@/offline/draftSync";
import { enqueueAction } from "@/offline/outbox";

beforeEach(async () => {
  await whenDraftSyncIdle();
  post.mockReset();
  await outboxDb.offline_actions.clear();
  await Promise.all(draftsDb.tables.map((t) => t.clear()));
  Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
});

it("affiche le nombre réel de saisies non envoyées et les envoie au clic", async () => {
  await enqueueAction({
    kind: "attendance", method: "POST", url: "/attendance/", body: { student_id: "s1", status: "ABSENT" },
    dedupeKey: "attendance:c1:2026-11-09:s1", tenantId: "tenant-1", userId: "teacher-1",
  });
  await draftsDb.pendingAttendance.add({
    localId: "local-1", tenantId: "tenant-1", studentId: "s2", classroomId: "c1", date: "2026-11-09",
    status: "LATE", synced: 0, syncStatus: "PENDING", retries: 0, createdAt: Date.now(),
  } as never);
  post.mockResolvedValue({ data: {} });

  render(<OfflineIndicator />);

  expect(await screen.findByText("2 élément(s) en attente")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Synchroniser maintenant" }));

  await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
  expect(post.mock.calls.map(([url]) => url)).toEqual(["/attendance/", "/attendance/"]);
  await waitFor(() => expect(screen.queryByText(/en attente/)).not.toBeInTheDocument());
});

it("hors ligne, annonce les saisies qui partiront à la reconnexion", async () => {
  Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
  await enqueueAction({
    kind: "attendance", method: "POST", url: "/attendance/", body: { student_id: "s1", status: "ABSENT" },
    dedupeKey: "attendance:c1:2026-11-09:s1", tenantId: "tenant-1", userId: "teacher-1",
  });

  render(<OfflineIndicator />);

  expect(await screen.findByText("1 saisie(s) en attente, envoyée(s) à la reconnexion")).toBeInTheDocument();
  expect(post).not.toHaveBeenCalled();
});
