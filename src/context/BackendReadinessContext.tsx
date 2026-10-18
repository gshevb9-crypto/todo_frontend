import React, { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { checkBackendHealth } from '../api/health.api';

export interface BackendReadinessContextValue {
  isReady: boolean;
  isProlonged: boolean;
  isChecking: boolean;
  retryCount: number;
  retryNow: () => void;
}

const BackendReadinessContext = createContext<BackendReadinessContextValue | null>(null);

// Default prolonged startup threshold: 90 seconds
const DEFAULT_PROLONGED_THRESHOLD_MS = 90_000;
// Poll retry interval: 2 seconds after the previous request finishes
const RETRY_INTERVAL_MS = 2_000;

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
  const startTimeRef = useRef<number>(Date.now());
  const isReadyRef = useRef(false);

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

    // Check if the prolonged threshold has passed
    const elapsed = Date.now() - startTimeRef.current;
    if (elapsed >= prolongedThresholdMs) {
      setIsProlonged(true);
    }

    // Set up new AbortController for this probe
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    let ready = false;

    try {
      ready = await checkBackendHealth(abortController.signal);
    } catch (err: any) {
      // Aborted probe due to unmount or manual retry
      if (err?.name === 'CanceledError' || abortController.signal.aborted) {
        inFlightRef.current = false;
        setIsChecking(false);
        return;
      }
      ready = false;
    } finally {
      inFlightRef.current = false;
      setIsChecking(false);
      abortControllerRef.current = null;
    }

    if (!isMountedRef.current) return;

    if (ready) {
      // Backend is confirmed ready! Stop polling completely.
      isReadyRef.current = true;
      setIsReady(true);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    // Backend is not yet ready. Increment retry count and schedule next attempt.
    setRetryCount((prev) => prev + 1);

    // Schedule next retry 2 seconds after completion (no overlapping requests)
    timerRef.current = setTimeout(() => {
      runProbe();
    }, RETRY_INTERVAL_MS);
  }, [prolongedThresholdMs]);

  const retryNow = useCallback(() => {
    // If already ready, do nothing
    if (isReadyRef.current) return;

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
    startTimeRef.current = Date.now();

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
