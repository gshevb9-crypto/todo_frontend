/**
 * Root Backend Health/Readiness probe service.
 * Hits the backend's public root URL (https://gshe.blitz.cloud/) to wake the sleeping container.
 * Validates that the response is successful HTTP, valid JSON, and contains:
 * - status: "Healthy"
 * - availability: "online"
 */

export interface BackendRootResponse {
  status: string;
  availability: string;
  service?: string;
  timestamp?: string;
  database?: string;
  pendingMigrations?: number | null;
  details?: string | null;
}

export interface ReadinessProbeResult {
  isReady: boolean;
  durationMs: number;
  status?: number;
  errorMessage?: string;
  data?: BackendRootResponse | null;
}

// Public backend root URL configuration
const rawApiBase = (
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.PROD ? 'https://gshe.blitz.cloud' : 'https://gshe.blitz.cloud')
).trim();

const normalizedBase = rawApiBase.endsWith('/api')
  ? rawApiBase.slice(0, -4)
  : rawApiBase.endsWith('/')
  ? rawApiBase.slice(0, -1)
  : rawApiBase;

export const BACKEND_ROOT_URL = `${normalizedBase || 'https://gshe.blitz.cloud'}/`;

/**
 * Validates the parsed JSON payload against the required backend readiness contract.
 */
export function evaluateRootResponse(data: unknown): boolean {
  if (!data || typeof data !== 'object') {
    return false;
  }
  const body = data as Record<string, unknown>;

  const isStatusHealthy =
    typeof body.status === 'string' &&
    body.status.trim().toLowerCase() === 'healthy';

  const isAvailabilityOnline =
    typeof body.availability === 'string' &&
    body.availability.trim().toLowerCase() === 'online';

  const isDatabaseReady =
    body.database === undefined ||
    (typeof body.database === 'string' && body.database.trim().toLowerCase() === 'connected');

  return Boolean(isStatusHealthy && isAvailabilityOnline && isDatabaseReady);
}

/**
 * Sends a GET request to the public root URL to wake the backend container.
 * Uses a bounded timeout of 10 seconds.
 * Validates that the response is HTTP 2xx, valid JSON, and satisfies readiness criteria.
 */
export async function checkBackendStartup(signal?: AbortSignal): Promise<ReadinessProbeResult> {
  const startTime = performance.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  const onExternalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timeoutId);
      throw new DOMException('Aborted', 'AbortError');
    }
    signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  try {
    const response = await fetch(BACKEND_ROOT_URL, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    });

    clearTimeout(timeoutId);
    if (signal) {
      signal.removeEventListener('abort', onExternalAbort);
    }

    const durationMs = Math.round(performance.now() - startTime);

    if (!response.ok) {
      return {
        isReady: false,
        durationMs,
        status: response.status,
        errorMessage: `Backend returned HTTP ${response.status}`,
      };
    }

    let parsedBody: any = null;
    try {
      const text = await response.text();
      if (!text || !text.trim().startsWith('{')) {
        return {
          isReady: false,
          durationMs,
          status: response.status,
          errorMessage: 'Response is not a valid JSON object',
        };
      }
      parsedBody = JSON.parse(text);
    } catch {
      return {
        isReady: false,
        durationMs,
        status: response.status,
        errorMessage: 'Failed to parse JSON response',
      };
    }

    const isReady = evaluateRootResponse(parsedBody);

    return {
      isReady,
      durationMs,
      status: response.status,
      data: isReady ? parsedBody : null,
      errorMessage: isReady
        ? undefined
        : `Readiness criteria not satisfied (status: "${parsedBody?.status}", availability: "${parsedBody?.availability}")`,
    };
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (signal) {
      signal.removeEventListener('abort', onExternalAbort);
    }

    const durationMs = Math.round(performance.now() - startTime);

    if (signal?.aborted) {
      throw error;
    }

    return {
      isReady: false,
      durationMs,
      status: undefined,
      errorMessage: error?.message || 'Network or timeout error while contacting backend root',
    };
  }
}
