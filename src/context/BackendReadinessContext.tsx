import React, { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { checkBackendStartup, ReadinessProbeResult } from '../api/startup.api';

export interface BackendReadinessContextValue {
  isReady: boolean;
  isProlonged: boolean;
  isChecking: boolean;
  retryCount: number;
  retryNow: () => void;
}

const BackendReadinessContext = createContext<BackendReadinessContextValue | null>(null);

// Default prolonged startup threshold: 90 seconds (within 90-120 seconds range)
const DEFAULT_PROLONGED_THRESHOLD_MS = 90_000;
// Normal retry interval: 2 seconds after the previous request completes
const NORMAL_RETRY_INTERVAL_MS = 2_000;
// Safe prolonged retry interval: backs off to 6 seconds to avoid aggressive polling indefinitely
const PROLONGED_RETRY_INTERVAL_MS = 6_000;

interface BackendReadinessProviderProps {
  children: React.ReactNode;
  prolongedThresholdMs?: number;
}

export function BackendReadinessProvider({
  children,
  prolongedThresholdMs = DEFAULT_PROLONGED_THRESHOLD_MS,
}: BackendReadinessProviderProps) {
  const [isReady, setIsReady] = useState(false);
  const [isProlonged, setIsProlonged] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // References to guarantee no overlapping requests and clean lifecycle
  const inFlightRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);
  const overallStartTimeRef = useRef<number>(Date.now());
  const isReadyRef = useRef(false);
  const attemptCountRef = useRef(0);
  const hasLoggedProlongedRef = useRef(false);

  // Keep isReadyRef in sync
  useEffect(() => {
    isReadyRef.current = isReady;
  }, [isReady]);

  const runProbe = useCallback(async () => {
    // If already ready, unmounted, or a probe is currently in flight, do nothing
    if (isReadyRef.current || !isMountedRef.current || inFlightRef.current) {
      return;
    }

    inFlightRef.current = true;
    setIsChecking(true);
    attemptCountRef.current += 1;
    const attempt = attemptCountRef.current;

    // 1. Log: Startup readiness check initiated
    console.log(`[StartupReadiness] Check #${attempt} initiated to /api/system/startup`);

    // Check if the prolonged threshold has passed
    const elapsed = Date.now() - overallStartTimeRef.current;
    if (elapsed >= prolongedThresholdMs) {
      setIsProlonged(true);
      // Log: Transition to the prolonged-startup error state
      if (!hasLoggedProlongedRef.current) {
        hasLoggedProlongedRef.current = true;
        console.warn(
          `[StartupReadiness] Transition to prolonged-startup error state: backend startup has taken ${Math.round(
            elapsed / 1000
          )}s (threshold: ${prolongedThresholdMs / 1000}s). Displaying user-friendly Arabic alert and manual Retry button.`
        );
      }
    }

    // Set up new AbortController for this probe
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    let probeResult: ReadinessProbeResult | null = null;

    try {
      probeResult = await checkBackendStartup(abortController.signal);
    } catch (err: any) {
      // Aborted probe due to unmount or manual retry
      if (err?.name === 'CanceledError' || abortController.signal.aborted) {
        inFlightRef.current = false;
        setIsChecking(false);
        return;
      }
      probeResult = {
        isReady: false,
        durationMs: 0,
        errorMessage: err?.message || 'Aborted or unknown error',
      };
    } finally {
      inFlightRef.current = false;
      setIsChecking(false);
      abortControllerRef.current = null;
    }

    if (!isMountedRef.current) return;

    const isConfirmedReady = probeResult?.isReady === true;

    if (isConfirmedReady) {
      // 2. Log: Successful readiness confirmation and total time until ready
      const totalTimeMs = Date.now() - overallStartTimeRef.current;
      console.log(
        `[StartupReadiness] Check #${attempt} succeeded in ${probeResult?.durationMs}ms (HTTP ${
          probeResult?.status ?? 200
        }). Database dependency confirmed ready.`
      );
      console.log(
        `[StartupReadiness] Successful readiness confirmation! Total time until backend ready: ${totalTimeMs}ms (${attempt} attempt(s)). Stopping polling permanently.`
      );

      isReadyRef.current = true;
      setIsReady(true);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    // 3. Log: HTTP status or network/timeout failure with attempt number and request duration
    console.warn(
      `[StartupReadiness] Check #${attempt} failed after ${probeResult?.durationMs ?? 0}ms. Status: HTTP ${
        probeResult?.status ?? 'N/A'
      }, Error: ${probeResult?.errorMessage || 'Not ready'}. Scheduling retry.`
    );

    // Backend is not yet ready. Increment retry count and schedule next attempt.
    setRetryCount((prev) => prev + 1);

    // Safe retry policy:
    // 2 seconds during normal startup; backs off to 6 seconds if prolonged, avoiding aggressive indefinite polling.
    const isNowProlonged = Date.now() - overallStartTimeRef.current >= prolongedThresholdMs;
    const intervalMs = isNowProlonged ? PROLONGED_RETRY_INTERVAL_MS : NORMAL_RETRY_INTERVAL_MS;

    timerRef.current = setTimeout(() => {
      runProbe();
    }, intervalMs);
  }, [prolongedThresholdMs]);

  const retryNow = useCallback(() => {
    // If already ready, do nothing
    if (isReadyRef.current) return;

    console.log('[StartupReadiness] Manual retry triggered by user.');

    // Clear any pending timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // If a request is currently hanging, abort it and start fresh
    if (inFlightRef.current && abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Run probe immediately
    runProbe();
  }, [runProbe]);

  // Main startup readiness effect
  useEffect(() => {
    isMountedRef.current = true;
    overallStartTimeRef.current = Date.now();
    attemptCountRef.current = 0;
    hasLoggedProlongedRef.current = false;

    // Start initial probe
    runProbe();

    return () => {
      isMountedRef.current = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [runProbe]);

  const value = useMemo<BackendReadinessContextValue>(
    () => ({
      isReady,
      isProlonged,
      isChecking,
      retryCount,
      retryNow,
    }),
    [isReady, isProlonged, isChecking, retryCount, retryNow]
  );

  return (
    <BackendReadinessContext.Provider value={value}>
      {children}
    </BackendReadinessContext.Provider>
  );
}

export function useBackendReadiness(): BackendReadinessContextValue {
  const context = useContext(BackendReadinessContext);
  if (!context) {
    throw new Error('useBackendReadiness must be used within a BackendReadinessProvider');
  }
  return context;
}
