import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "@/api/client";
import { replaceClassSchedule } from "../scheduleReplacement";

vi.mock("@/api/client", () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

describe("replaceClassSchedule", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses one atomic replacement request and never deletes first", async () => {
    const slots = [{
      subject_id: "subject-1", day_of_week: 1,
      start_time: "08:00:00", end_time: "09:00:00", room_id: null,
    }];
    vi.mocked(apiClient.put).mockResolvedValue({ data: { count: 1 } });

    await expect(replaceClassSchedule("class-1", slots)).resolves.toEqual({ count: 1 });

    expect(apiClient.put).toHaveBeenCalledWith(
      "/schedule/classes/class-1/replace/", { slots },
    );
    expect(apiClient.delete).not.toHaveBeenCalled();
    expect(apiClient.post).not.toHaveBeenCalled();
  });
});
