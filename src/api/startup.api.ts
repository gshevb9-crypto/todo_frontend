import axiosInstance from './axiosInstance';

export interface WakeUpResponse {
  status: string;
  value: string;
}

export interface ReadinessProbeResult {
  isReady: boolean;
  durationMs: number;
  status?: number;
  errorMessage?: string;
  data?: WakeUpResponse | null;
}

/**
 * Sends a GET request to the dedicated static wake-up endpoint (/api/system/wake-up).
 * Uses a bounded timeout of 10 seconds per probe.
 * Does not throw on HTTP/network errors; returns a structured ReadinessProbeResult
 * indicating whether the backend has awakened and returned { status: "ready", value: "Gaber" }.
 */
export async function checkBackendStartup(signal?: AbortSignal): Promise<ReadinessProbeResult> {
  const startTime = performance.now();

  try {
    const response = await axiosInstance.get<WakeUpResponse>('/api/system/wake-up', {
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
      const isStatusReady =
        typeof body?.status === 'string' &&
        body.status.trim().toLowerCase() === 'ready';
      const isValueGaber =
        typeof body?.value === 'string' &&
        body.value.trim() === 'Gaber';

      const isReady = isStatusReady && isValueGaber;

      return {
        isReady,
        durationMs,
        status: response.status,
        data: body ?? null,
        errorMessage: isReady ? undefined : 'Response did not match expected { status: "ready", value: "Gaber" }',
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
