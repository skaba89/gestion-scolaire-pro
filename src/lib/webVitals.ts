/**
 * Web Vitals tracking for SchoolFlow Pro.
 *
 * Measures: CLS, FID/INP, FCP, LCP, TTFB
 * Reports to: console (dev) + Sentry (prod)
 *
 * Call `initWebVitals()` once at app startup.
 */

interface Metric {
  name: string;
  value: number;
  rating: "good" | "needs-improvement" | "poor";
}

function reportMetric(metric: Metric): void {
  // Dev-only console logging removed

  // Forward to Sentry in production
  if (!import.meta.env.DEV) {
    import("@sentry/react")
      .then(({ captureMessage }) => {
        captureMessage(`WebVital: ${metric.name}`, {
          level: metric.rating === "poor" ? "warning" : "info",
          extra: {
            name: metric.name,
            value: Math.round(metric.value),
            rating: metric.rating,
          },
        });
      })
      .catch(() => {
        // Sentry not configured
      });
  }
}

export function initWebVitals(): void {
  import("web-vitals")
    .then(({ onCLS, onFID, onFCP, onLCP, onTTFB }) => {
      onCLS(reportMetric as Parameters<typeof onCLS>[0]);
      onFID(reportMetric as Parameters<typeof onFID>[0]);
      onFCP(reportMetric as Parameters<typeof onFCP>[0]);
      onLCP(reportMetric as Parameters<typeof onLCP>[0]);
      onTTFB(reportMetric as Parameters<typeof onTTFB>[0]);
    })
    .catch((err) => {
      // web-vitals not installed — fail silently
      if (import.meta.env.DEV) {
        console.warn("[WebVitals] web-vitals package not available:", err);
      }
    });
}
