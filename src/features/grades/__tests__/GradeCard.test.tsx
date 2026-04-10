/**
 * Tests for GradeCard Component
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GradeCard } from "@/features/grades/components/GradeCard";
import type { Grade } from "@/features/grades/types/grades";

describe("GradeCard Component", () => {
  const mockGrade: Grade = {
    id: "grade-1",
    tenant_id: "tenant-1",
    student_id: "student-1",
    subject_id: "math",
    grade: 85,
    grading_scale: "100",
    academic_year_id: "year-1",
    term_id: "term-1",
    comment: "Good progress",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  it("should render grade card with title", () => {
    render(
      <GradeCard grade={mockGrade} />
    );

    expect(screen.getByText("math")).toBeInTheDocument();
  });

  it("should display grade score as badge", () => {
    render(
      <GradeCard grade={mockGrade} />
    );

    expect(screen.getByText("85%")).toBeInTheDocument();
  });

  it("should show student info when showStudent is true", () => {
    render(
      <GradeCard grade={mockGrade} showStudent={true} />
    );

    expect(screen.getByText(/Élève:/)).toBeInTheDocument();
    expect(screen.getByText(/student-1/)).toBeInTheDocument();
  });

  it("should display comment when present", () => {
    render(
      <GradeCard grade={mockGrade} />
    );

    expect(screen.getByText("Good progress")).toBeInTheDocument();
  });

  it("should show grading scale", () => {
    render(
      <GradeCard grade={mockGrade} />
    );

    expect(screen.getByText("100")).toBeInTheDocument();
  });

  it("should call onEdit when edit button clicked", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();

    render(
      <GradeCard grade={mockGrade} onEdit={onEdit} />
    );

    const editButton = screen.getByRole("button", { name: /Modifier/ });
    await user.click(editButton);

    expect(onEdit).toHaveBeenCalledWith(mockGrade);
  });

  it("should call onDelete when delete button clicked", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();

    render(
      <GradeCard grade={mockGrade} onDelete={onDelete} />
    );

    const deleteButton = screen.getByRole("button", { name: /Trash/ });
    await user.click(deleteButton);

    expect(onDelete).toHaveBeenCalledWith(mockGrade.id);
  });

  it("should apply correct color for high grade (90+)", () => {
    const highGrade = { ...mockGrade, grade: 95 };
    const { container } = render(
      <GradeCard grade={highGrade} />
    );

    const badge = container.querySelector(".bg-green-100");
    expect(badge).toBeInTheDocument();
  });

  it("should apply correct color for medium grade (70-80)", () => {
    const mediumGrade = { ...mockGrade, grade: 75 };
    const { container } = render(
      <GradeCard grade={mediumGrade} />
    );

    const badge = container.querySelector(".bg-yellow-100");
    expect(badge).toBeInTheDocument();
  });

  it("should apply correct color for low grade (below 60)", () => {
    const lowGrade = { ...mockGrade, grade: 45 };
    const { container } = render(
      <GradeCard grade={lowGrade} />
    );

    const badge = container.querySelector(".bg-red-100");
    expect(badge).toBeInTheDocument();
  });

  it("should not show edit button if onEdit is not provided", () => {
    render(
      <GradeCard grade={mockGrade} onEdit={undefined} />
    );

    const editButton = screen.queryByRole("button", { name: /Modifier/ });
    expect(editButton).not.toBeInTheDocument();
  });

  it("should not show delete button if onDelete is not provided", () => {
    render(
      <GradeCard grade={mockGrade} onDelete={undefined} />
    );

    const deleteButton = screen.queryByRole("button", { name: /Trash/ });
    expect(deleteButton).not.toBeInTheDocument();
  });
});
