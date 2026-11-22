import { beforeEach, describe, expect, it, vi } from "vitest";

import { offlineDb } from "@/offline/db";
import { getQueuedActions, type HttpClient } from "@/offline/outbox";
import { recordKioskScan, syncKioskScans } from "./kioskQueue";

function networkError() {
  return { request: {}, response: undefined, message: "Network Error" };
}

function client(post: ReturnType<typeof vi.fn>): HttpClient {
  return {
    post: post as HttpClient["post"],
    patch: vi.fn() as HttpClient["patch"],
    put: vi.fn() as HttpClient["put"],
  };
}

beforeEach(async () => {
  await offlineDb.offline_actions.clear();
});

describe("file hors ligne du kiosque", () => {
  it("conserve un scan sans réseau puis renvoie la même clé au retour en ligne", async () => {
    const post = vi.fn().mockRejectedValueOnce(networkError());
    const offline = await recordKioskScan("ecole", "device-token", "MAT-1", "IN", client(post));

    expect(offline.status).toBe("PENDING");
    expect(offline.pending).toBe(1);
    const firstKey = post.mock.calls[0][2].headers["X-Idempotency-Key"];
    expect(post.mock.calls[0][2].headers["X-Kiosk-Token"]).toBe("device-token");

    post.mockResolvedValueOnce({ data: { student_first_name: "Aïcha", student_last_name: "Camara" } });
    expect(await syncKioskScans("ecole", "device-token", client(post))).toBe(0);
    expect(post.mock.calls[1][2].headers["X-Idempotency-Key"]).toBe(firstKey);
    expect((await getQueuedActions())[0].status).toBe("SYNCED");
  });

  it("restitue l'accusé serveur à l'écran", async () => {
    const receipt = {
      student_first_name: "Aïcha",
      student_last_name: "Camara",
      direction: "IN" as const,
      attendance_marked: true,
      course_name: "Mathématiques",
    };
    const post = vi.fn().mockResolvedValue({ data: receipt });
    const result = await recordKioskScan("ecole-a", "token-a", "MAT-1", "IN", client(post));

    expect(result.status).toBe("SYNCED");
    expect(result.data).toEqual(receipt);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("n'envoie jamais la file d'une autre école", async () => {
    const post = vi.fn().mockRejectedValueOnce(networkError());
    await recordKioskScan("ecole-a", "token-a", "MAT-1", "IN", client(post));
    post.mockClear();
    post.mockResolvedValue({ data: {} });

    expect(await syncKioskScans("ecole-b", "token-b", client(post))).toBe(0);
    expect(post).not.toHaveBeenCalled();
    const rows = await getQueuedActions();
    expect(rows).toHaveLength(1);
    expect(rows[0].tenantId).toBe("kiosk:ecole-a");
    expect(rows[0].status).toBe("PENDING");
  });
});
