import axiosInstance from './axiosInstance';

export interface HealthResponse {
  status: string;
  service?: string;
  database?: string;
  timestamp?: string;
  details?: string | null;
}

/**
 * Sends a GET request to the backend health endpoint.
 * Bounded timeout of 7 seconds per probe.
 * Does not throw on network/HTTP errors; returns true only if the backend satisfies the readiness contract.
 */
export async function checkBackendHealth(signal?: AbortSignal): Promise<boolean> {
  try {
    const response = await axiosInstance.get<HealthResponse>('/health', {
      timeout: 7000,
      signal,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    });

    if (response.status >= 200 && response.status < 300) {
      const data = response.data;
      // Backend is ready when status is 'Healthy' and database is not disconnected
      const isStatusHealthy = typeof data?.status === 'string' && data.status.toLowerCase() === 'healthy';
      const isDbOk = data?.database ? data.database.toLowerCase() === 'connected' : true;

      return isStatusHealthy && isDbOk;
    }

    return false;
  } catch (error: any) {
    // If explicitly aborted by component cleanup or manual cancel, rethrow so caller handles cancellation
    if (error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED' || signal?.aborted) {
      throw error;
    }

    // Network error, 502, 503, 504, 500, or timeout
    return false;
  }
}
