import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StudentPhotoUpload } from "../StudentPhotoUpload";

const { mockPost, mockPut, mockPatch, mockCompress, mockSuccess, mockError } = vi.hoisted(() => ({
  mockPost: vi.fn(),
  mockPut: vi.fn(),
  mockPatch: vi.fn(),
  mockCompress: vi.fn(),
  mockSuccess: vi.fn(),
  mockError: vi.fn(),
}));

vi.mock("@/api/client", () => ({
  apiClient: { post: mockPost, put: mockPut, patch: mockPatch },
}));
vi.mock("@/lib/imageCompression", () => ({
  compressImage: mockCompress,
}));
vi.mock("sonner", () => ({
  toast: { success: mockSuccess, error: mockError },
}));

describe("StudentPhotoUpload API contract", () => {
  const studentId = "a1111111-1111-4111-8111-111111111111";

  beforeEach(() => {
    vi.clearAllMocks();
    mockPost.mockResolvedValue({ data: { url: "https://example.test/photo.jpg" } });
    mockPut.mockResolvedValue({ data: {} });
    mockCompress.mockImplementation(async (file: File) => file);
  });

  it("stores an uploaded photo with PUT /students/{id}/, then reports success", async () => {
    const onPhotoUpdated = vi.fn();
    const { container } = render(
      <StudentPhotoUpload studentId={studentId} studentName="Aminata Diallo" onPhotoUpdated={onPhotoUpdated} />,
    );
    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();
    fireEvent.change(fileInput!, { target: { files: [new File(["img"], "photo.jpg", { type: "image/jpeg" })] } });

    await waitFor(() => expect(mockPut).toHaveBeenCalledWith(
      `/students/${studentId}/`, { photo_url: "https://example.test/photo.jpg" },
    ));
    expect(mockPatch).not.toHaveBeenCalled();
    expect(onPhotoUpdated).toHaveBeenCalledWith("https://example.test/photo.jpg");
    expect(mockSuccess).toHaveBeenCalled();
  });

  it("removes a photo with PUT and only reports success after backend confirmation", async () => {
    const onPhotoUpdated = vi.fn();
    render(
      <StudentPhotoUpload studentId={studentId} studentName="Aminata Diallo"
        currentPhotoUrl="https://example.test/old.jpg" onPhotoUpdated={onPhotoUpdated} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "" }));
    await waitFor(() => expect(mockPut).toHaveBeenCalledWith(`/students/${studentId}/`, { photo_url: null }));
    expect(mockPatch).not.toHaveBeenCalled();
    expect(onPhotoUpdated).toHaveBeenCalledWith(null);
  });

  it("does not announce success when updating the student fails", async () => {
    mockPut.mockRejectedValue(new Error("backend rejected"));
    const onPhotoUpdated = vi.fn();
    render(
      <StudentPhotoUpload studentId={studentId} studentName="Aminata Diallo"
        currentPhotoUrl="https://example.test/old.jpg" onPhotoUpdated={onPhotoUpdated} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "" }));
    await waitFor(() => expect(mockError).toHaveBeenCalled());
    expect(onPhotoUpdated).not.toHaveBeenCalled();
    expect(mockSuccess).not.toHaveBeenCalled();
  });
});
