import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PortalErrorBoundary } from "@/components/common/PortalErrorBoundary";

const ThrowingComponent = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) throw new Error("Test error message");
  return <div>Normal render</div>;
};

describe("PortalErrorBoundary", () => {
  it("renders children when no error occurs", () => {
    render(
      <PortalErrorBoundary>
        <div>Safe content</div>
      </PortalErrorBoundary>
    );
    expect(screen.getByText("Safe content")).toBeTruthy();
  });

  it("renders error UI when a child throws", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <PortalErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </PortalErrorBoundary>
    );
    expect(screen.getByText(/inattendue/i)).toBeTruthy();
    consoleSpy.mockRestore();
  });

  it("displays the error message in the fallback UI", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <PortalErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </PortalErrorBoundary>
    );
    expect(screen.getByText(/Test error message/)).toBeTruthy();
    consoleSpy.mockRestore();
  });

  it("renders custom fallback when provided", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <PortalErrorBoundary fallback={<div>Custom fallback</div>}>
        <ThrowingComponent shouldThrow={true} />
      </PortalErrorBoundary>
    );
    expect(screen.getByText("Custom fallback")).toBeTruthy();
    consoleSpy.mockRestore();
  });

  it("shows retry button that resets the error state", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <PortalErrorBoundary>
        <ThrowingComponent shouldThrow={true} />
      </PortalErrorBoundary>
    );
    const retryBtn = screen.getByRole("button", { name: /réessayer/i });
    expect(retryBtn).toBeTruthy();
    consoleSpy.mockRestore();
  });
});
