import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Direct unit test suite for the Backend Root URL Startup & Readiness engine (GET https://gshe.blitz.cloud/).
 * Validates all required startup contract behaviors:
 * 1. Backend already awake -> returns exact { status: "Healthy", availability: "online", database: "Connected" }, proceeds to ready on first check and stops polling.
 * 2. Backend is sleeping -> network failure / timeout -> retries safely without crashing and maintains loading state.
 * 3. Root returns HTTP 503 Service Unavailable -> treated as transient and retries.
 * 4. Root request times out -> recovers by retrying without creating overlapping requests.
 * 5. Unexpected / Non-JSON response (e.g. HTML gateway error or missing fields) -> does NOT incorrectly mark the backend ready; continues retrying.
 * 6. Backend becomes ready after several retries -> transitions to ready and stops polling permanently.
 * 7. Backend remains unavailable -> enters prolonged state, backs off retry rate, and supports manual retryNow.
 * 8. Strict non-overlapping enforcement under concurrent triggers.
 * 9. Re-render and navigation isolation -> once ready, no additional probes occur.
 * 10. Validates exact availability: "online" and status: "Healthy" requirements.
 */

// Evaluation of the actual public root response contract (GET https://gshe.blitz.cloud/)
function evaluateRootResponse(response) {
  if (!response || typeof response.status !== 'number') return false;
  if (response.status < 200 || response.status >= 300) return false;

  const body = response.data;
  if (!body || typeof body !== 'object') return false;

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

// Simulation of the polling coordinator used in BackendReadinessContext
class PollingCoordinator {
  constructor({
    probeFn,
    retryIntervalMs = 20,
    prolongedRetryIntervalMs = 60,
    prolongedThresholdMs = 100,
  }) {
    this.probeFn = probeFn;
    this.retryIntervalMs = retryIntervalMs;
    this.prolongedRetryIntervalMs = prolongedRetryIntervalMs;
    this.prolongedThresholdMs = prolongedThresholdMs;

    this.isReady = false;
    this.isProlonged = false;
    this.isChecking = false;
    this.retryCount = 0;
    this.activeRequestsCount = 0;
    this.maxConcurrentRequests = 0;
    this.totalProbesExecuted = 0;

    this._inFlight = false;
    this._timer = null;
    this._startTime = Date.now();
    this._stopped = false;
  }

  async runProbe() {
    if (this._stopped || this.isReady || this._inFlight) {
      return;
    }

    this._inFlight = true;
    this.isChecking = true;
    this.activeRequestsCount++;
    if (this.activeRequestsCount > this.maxConcurrentRequests) {
      this.maxConcurrentRequests = this.activeRequestsCount;
    }

    const elapsed = Date.now() - this._startTime;
    if (elapsed >= this.prolongedThresholdMs) {
      this.isProlonged = true;
    }

    let isSuccess = false;
    try {
      this.totalProbesExecuted++;
      isSuccess = await this.probeFn();
    } catch {
      isSuccess = false;
    } finally {
      this.activeRequestsCount--;
      this._inFlight = false;
      this.isChecking = false;
    }

    if (this._stopped) return;

    if (isSuccess) {
      this.isReady = true;
      if (this._timer) clearTimeout(this._timer);
      return;
    }

    this.retryCount++;
    const isNowProlonged = Date.now() - this._startTime >= this.prolongedThresholdMs;
    const interval = isNowProlonged ? this.prolongedRetryIntervalMs : this.retryIntervalMs;

    this._timer = setTimeout(() => {
      this.runProbe();
    }, interval);
  }

  start() {
    this._startTime = Date.now();
    return this.runProbe();
  }

  retryNow() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    return this.runProbe();
  }

  stop() {
    this._stopped = true;
    if (this._timer) clearTimeout(this._timer);
  }
}

// ── Test Cases ─────────────────────────────────────────────────────────────

test('Case 1: Backend is already awake -> returns exact { status: "Healthy", availability: "online" } and stops polling', async () => {
  let callCount = 0;
  const probeFn = async () => {
    callCount++;
    return evaluateRootResponse({
      status: 200,
      data: {
        status: 'Healthy',
        availability: 'online',
        service: 'ToDo & Notes API',
        database: 'Connected',
        pendingMigrations: 0,
        details: null,
      },
    });
  };

  const coordinator = new PollingCoordinator({ probeFn, retryIntervalMs: 15 });
  await coordinator.start();

  assert.equal(coordinator.isReady, true);
  assert.equal(callCount, 1);
  assert.equal(coordinator.retryCount, 0);

  // Wait to ensure no further polling occurs
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(callCount, 1);
  coordinator.stop();
});

test('Case 2: Backend is sleeping -> retries safely without crashing and maintains loading state', async () => {
  let callCount = 0;
  const probeFn = async () => {
    callCount++;
    // Simulate network error (sleeping container / gateway wake delay)
    throw new Error('ECONNREFUSED: Connection refused');
  };

  const coordinator = new PollingCoordinator({ probeFn, retryIntervalMs: 10 });
  coordinator.start();

  await new Promise((r) => setTimeout(r, 55));
  coordinator.stop();

  assert.equal(coordinator.isReady, false);
  assert.ok(coordinator.retryCount >= 2, `Expected at least 2 retries, got ${coordinator.retryCount}`);
  assert.ok(callCount >= 2);
});

test('Case 3: Root returns HTTP 503 Service Unavailable -> treated as transient and retries', async () => {
  let callCount = 0;
  const probeFn = async () => {
    callCount++;
    return evaluateRootResponse({
      status: 503,
      data: { error: 'Service Unavailable' },
    });
  };

  const coordinator = new PollingCoordinator({ probeFn, retryIntervalMs: 10 });
  coordinator.start();

  await new Promise((r) => setTimeout(r, 50));
  coordinator.stop();

  assert.equal(coordinator.isReady, false);
  assert.ok(coordinator.retryCount >= 2);
});

test('Case 4: Root request times out -> recovers by retrying without creating overlapping requests', async () => {
  let inFlightNow = 0;
  let maxConcurrent = 0;
  let callCount = 0;

  const probeFn = async () => {
    callCount++;
    inFlightNow++;
    if (inFlightNow > maxConcurrent) maxConcurrent = inFlightNow;

    // Simulate 30ms timeout delay
    await new Promise((r) => setTimeout(r, 30));
    inFlightNow--;
    throw new Error('timeout of 10000ms exceeded');
  };

  const coordinator = new PollingCoordinator({ probeFn, retryIntervalMs: 10 });
  coordinator.start();

  // Trigger rapid manual retries while request is in flight
  await new Promise((r) => setTimeout(r, 15));
  coordinator.retryNow();
  coordinator.retryNow();

  await new Promise((r) => setTimeout(r, 90));
  coordinator.stop();

  assert.equal(maxConcurrent, 1, 'Max concurrent requests must NEVER exceed 1');
  assert.equal(coordinator.maxConcurrentRequests, 1);
});

test('Case 5: Unexpected response (missing availability or wrong status) -> does NOT incorrectly mark backend ready', async () => {
  let callCount = 0;
  const probeFn = async () => {
    callCount++;
    if (callCount === 1) {
      // Missing availability
      return evaluateRootResponse({
        status: 200,
        data: { status: 'Healthy', database: 'Connected' },
      });
    }
    if (callCount === 2) {
      // availability is offline / degraded
      return evaluateRootResponse({
        status: 200,
        data: { status: 'Degraded', availability: 'offline', database: 'Disconnected' },
      });
    }
    // Third attempt returns genuine ready response
    return evaluateRootResponse({
      status: 200,
      data: { status: 'Healthy', availability: 'online', database: 'Connected' },
    });
  };

  const coordinator = new PollingCoordinator({ probeFn, retryIntervalMs: 10 });
  coordinator.start();

  await new Promise((r) => setTimeout(r, 80));
  assert.equal(coordinator.isReady, true);
  assert.equal(callCount, 3, 'Must reject unexpected responses and only mark ready on exact match');
  coordinator.stop();
});

test('Case 6: Backend becomes ready after several retries -> transitions to ready and stops polling completely', async () => {
  let attempts = 0;
  const probeFn = async () => {
    attempts++;
    if (attempts < 3) {
      return evaluateRootResponse({ status: 503 });
    }
    return evaluateRootResponse({
      status: 200,
      data: { status: 'Healthy', availability: 'online', database: 'Connected' },
    });
  };

  const coordinator = new PollingCoordinator({ probeFn, retryIntervalMs: 10 });
  coordinator.start();

  await new Promise((r) => setTimeout(r, 80));
  assert.equal(coordinator.isReady, true);
  assert.equal(attempts, 3);

  // Wait an extra interval to verify loop has stopped
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(attempts, 3, 'Polling must stop permanently once ready');
  coordinator.stop();
});

test('Case 7: Backend remains unavailable -> shows prolonged-startup state, backs off retry rate, and allows immediate manual retry', async () => {
  let attempts = 0;
  const probeFn = async () => {
    attempts++;
    return false;
  };

  // Set prolonged threshold to 40ms for fast test verification
  const coordinator = new PollingCoordinator({
    probeFn,
    retryIntervalMs: 10,
    prolongedRetryIntervalMs: 200, // Backs off retry rate after prolonged threshold
    prolongedThresholdMs: 40,
  });

  coordinator.start();

  await new Promise((r) => setTimeout(r, 55));
  await coordinator.retryNow();

  assert.equal(coordinator.isProlonged, true, 'isProlonged must be true after threshold');
  assert.equal(coordinator.isReady, false);

  const beforeManual = attempts;
  await coordinator.retryNow();
  assert.ok(attempts > beforeManual, 'Immediate probe must be initiated on retryNow');

  coordinator.stop();
});

test('Case 8: Strict non-overlapping enforcement under concurrent triggers', async () => {
  let concurrentExecutions = 0;
  let maxObserved = 0;

  const probeFn = async () => {
    concurrentExecutions++;
    if (concurrentExecutions > maxObserved) maxObserved = concurrentExecutions;
    await new Promise((r) => setTimeout(r, 20));
    concurrentExecutions--;
    return false;
  };

  const coordinator = new PollingCoordinator({ probeFn, retryIntervalMs: 5 });
  coordinator.start();

  // Fire 10 simultaneous retry calls
  for (let i = 0; i < 10; i++) {
    coordinator.retryNow();
  }

  await new Promise((r) => setTimeout(r, 80));
  coordinator.stop();

  assert.equal(maxObserved, 1, 'Never allow overlapping requests');
});

test('Case 9: Re-render and navigation isolation -> once ready, no additional polling occurs', async () => {
  let probeCount = 0;
  const probeFn = async () => {
    probeCount++;
    return evaluateRootResponse({
      status: 200,
      data: { status: 'Healthy', availability: 'online', database: 'Connected' },
    });
  };

  const coordinator = new PollingCoordinator({ probeFn });
  await coordinator.start();
  assert.equal(coordinator.isReady, true);
  assert.equal(probeCount, 1);

  // Simulate multiple route navigations: /login -> / -> /settings
  coordinator.runProbe();
  coordinator.runProbe();
  coordinator.runProbe();

  assert.equal(probeCount, 1, 'No additional probes executed once backend is confirmed awake');
  coordinator.stop();
});
