// Type declarations for the jest-dom matchers (toBeInTheDocument, …).
// They are registered at runtime in src/test/setup.ts (expect.extend) but
// their types were never declared, so `tsc` reported every use as an error.
/// <reference types="@testing-library/jest-dom/vitest" />
