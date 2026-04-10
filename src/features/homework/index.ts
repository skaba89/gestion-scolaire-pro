/**
 * Homework Feature - Barrel Export
 * Export all public APIs from this feature
 */

// Hooks
export { useHomework } from "./hooks/useHomework";

// Components
export { HomeworkList } from "./components/HomeworkList";
export { HomeworkCard } from "./components/HomeworkCard";
export { HomeworkForm } from "./components/HomeworkForm";

// Services
export { homeworkService } from "./services/homeworkService";

// Types
export type {
  Homework,
  HomeworkFormData,
  HomeworkSubmission,
  HomeworkFilters,
  HomeworkWithSubmissions,
} from "./types/homework";
