import axiosInstance from './axiosInstance';

export interface StartupStatusData {
  status: string;
  service?: string;
  database: string;
  timestamp?: string;
}

export interface StartupApiResponse {
  success: boolean;
  message?: string;
  data?: StartupStatusData | null;
  errors?: Record<string, string[]>;
}

export interface ReadinessProbeResult {
  isReady: boolean;
  durationMs: number;
  status?: number;
  errorMessage?: string;
  data?: StartupStatusData | null;
}

/**
 * Sends a GET request to the real backend startup readiness endpoint (/api/system/startup).
 * Uses a bounded timeout of 10 seconds per probe.
 * Does not throw on HTTP/network errors; returns a structured ReadinessProbeResult
 * indicating whether the backend and its database dependency are confirmed ready.
 */
export async function checkBackendStartup(signal?: AbortSignal): Promise<ReadinessProbeResult> {
  const startTime = performance.now();

  try {
    const response = await axiosInstance.get<StartupApiResponse>('/api/system/startup', {
      timeout: 10_000,
      signal,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    });

    const durationMs = Math.round(performance.now() - startTime);

    if (response.status >= 200 && response.status < 300) {
      const body = response.data;
      const isSuccess = body?.success === true;
      const isStatusReady =
        typeof body?.data?.status === 'string' &&
        body.data.status.trim().toLowerCase() === 'ready';
      const isDatabaseReady =
        typeof body?.data?.database === 'string' &&
        body.data.database.trim().toLowerCase() === 'ready';

      const isReady = isSuccess && isStatusReady && isDatabaseReady;

      return {
        isReady,
        durationMs,
        status: response.status,
        data: body?.data ?? null,
      };
    }

    return {
      isReady: false,
      durationMs,
      status: response.status,
      errorMessage: `Unexpected HTTP status ${response.status}`,
    };
  } catch (error: any) {
    const durationMs = Math.round(performance.now() - startTime);

    // If canceled by abort controller (unmount or manual retry reset), rethrow for caller cleanup
    if (error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED' || signal?.aborted) {
      throw error;
    }

    const httpStatus = error?.response?.status;
    const errorMsg = error?.message || 'Unknown network or server error';

    return {
      isReady: false,
      durationMs,
      status: httpStatus,
      errorMessage: errorMsg,
    };
  }
}
