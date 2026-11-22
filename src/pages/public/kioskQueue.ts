import axios, { type AxiosInstance } from "axios";

import { apiClient } from "@/api/client";
import { type OfflineAction } from "@/offline/db";
import {
  enqueueAction,
  flushOfflineQueue,
  getQueuedActions,
  recoverInterruptedActions,
  type HttpClient,
} from "@/offline/outbox";

export type KioskDirection = "IN" | "OUT";

export interface KioskScanData {
  student_first_name: string;
  student_last_name: string;
  direction: KioskDirection;
  attendance_marked: boolean;
  course_name?: string | null;
  library_overdue?: boolean;
  library_overdue_titles?: string[];
  replayed?: boolean;
}

export interface KioskQueueResult {
  status: OfflineAction["status"];
  data?: KioskScanData;
  httpStatus?: number;
  pending: number;
}

// Deliberately independent from apiClient's response interceptors: a 401
// means a revoked device token, not an expired staff session.
export const kioskTransport = axios.create({
  baseURL: apiClient.defaults.baseURL,
  timeout: 15_000,
});

function scope(tenantSlug: string): string {
  return `kiosk:${tenantSlug}`;
}

function deviceClient(token: string, transport: AxiosInstance | HttpClient): HttpClient {
  const call = (method: "post" | "patch" | "put") =>
    (url: string, body?: unknown, config?: unknown) => {
      const requestConfig = (config ?? {}) as { headers?: Record<string, string> };
      return transport[method](url, body, {
        ...requestConfig,
        headers: {
          ...requestConfig.headers,
          "X-Kiosk-Token": token,
        },
      });
    };
  return { post: call("post"), patch: call("patch"), put: call("put") };
}

function responseData(response: unknown): KioskScanData | undefined {
  if (!response || typeof response !== "object" || !("data" in response)) return undefined;
  return (response as { data?: KioskScanData }).data;
}

export async function kioskPendingCount(tenantSlug: string): Promise<number> {
  const tenantScope = scope(tenantSlug);
  return (await getQueuedActions()).filter(
    (action) => action.kind === "kiosk-scan"
      && action.tenantId === tenantScope
      && (action.status === "PENDING" || action.status === "SYNCING"),
  ).length;
}

export async function recordKioskScan(
  tenantSlug: string,
  token: string,
  qrPayload: string,
  direction: KioskDirection,
  transport: AxiosInstance | HttpClient = kioskTransport,
): Promise<KioskQueueResult> {
  const tenantScope = scope(tenantSlug);
  const entry = await enqueueAction({
    kind: "kiosk-scan",
    method: "POST",
    url: "/kiosk/scan/",
    body: { qr_payload: qrPayload, direction },
    tenantId: tenantScope,
    userId: null,
  });
  let receipt: KioskScanData | undefined;
  await flushOfflineQueue(
    tenantScope,
    deviceClient(token, transport),
    null,
    (action, response) => {
      if (action.id === entry.id) receipt = responseData(response);
    },
  );
  const stored = (await getQueuedActions()).find((action) => action.id === entry.id);
  return {
    status: stored?.status ?? "REJECTED",
    data: receipt,
    httpStatus: stored?.httpStatus,
    pending: await kioskPendingCount(tenantSlug),
  };
}

export async function syncKioskScans(
  tenantSlug: string,
  token: string,
  transport: AxiosInstance | HttpClient = kioskTransport,
  onSynced?: (data: KioskScanData) => void,
): Promise<number> {
  await recoverInterruptedActions();
  await flushOfflineQueue(
    scope(tenantSlug),
    deviceClient(token, transport),
    null,
    (_action, response) => {
      const data = responseData(response);
      if (data && onSynced) onSynced(data);
    },
  );
  return kioskPendingCount(tenantSlug);
}
