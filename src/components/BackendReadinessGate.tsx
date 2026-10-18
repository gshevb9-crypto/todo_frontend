import React from 'react';
import { useBackendReadiness } from '../context/BackendReadinessContext';
import BackendStartupScreen from './BackendStartupScreen';

interface BackendReadinessGateProps {
  children: React.ReactNode;
}

/**
 * Prevents children (application routes, auth forms, notes workspace)
 * from rendering and initiating network calls until the backend is confirmed ready.
 */
export default function BackendReadinessGate({ children }: BackendReadinessGateProps) {
  const { isReady } = useBackendReadiness();

  if (!isReady) {
    return <BackendStartupScreen />;
  }

  return <>{children}</>;
}
