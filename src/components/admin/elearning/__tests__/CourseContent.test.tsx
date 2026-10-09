import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CourseContent } from "../CourseContent";

vi.mock("@/contexts/TenantContext", () => ({ useTenant: () => ({ tenant: { id: "t1" } }) }));

const lesson = { id: "l1", title: "Leçon 1", type: "video", duration: 30 };
const module = { id: "m1", title: "Module 1", lessons: [lesson] };

function renderContent() {
  const handlers = {
    onAddModule: vi.fn(),
    onEditModule: vi.fn(),
    onDeleteModule: vi.fn(),
    onAddLesson: vi.fn(),
    onEditLesson: vi.fn(),
    onDeleteLesson: vi.fn(),
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CourseContent courseId="c1" modules={[module]} {...handlers} />
    </QueryClientProvider>,
  );
  // Expand the module so its lessons are rendered.
  fireEvent.click(screen.getByText("Module 1"));
  return handlers;
}

describe("CourseContent", () => {
  it("passes the module object when deleting a module (was its id: delete was a no-op)", () => {
    const h = renderContent();
    fireEvent.click(screen.getByLabelText("Supprimer le module"));
    expect(h.onDeleteModule).toHaveBeenCalledWith(module);
  });

  it("passes the lesson and its module id when editing or deleting a lesson", () => {
    const h = renderContent();
    fireEvent.click(screen.getByLabelText("Modifier la leçon"));
    expect(h.onEditLesson).toHaveBeenCalledWith(lesson, "m1");
    fireEvent.click(screen.getByLabelText("Supprimer la leçon"));
    expect(h.onDeleteLesson).toHaveBeenCalledWith(lesson, "m1");
  });
});
