import api from './api';
import type {
  FlagHistoryEntry,
  LocationIntegrityFlagLevel,
  LocationIntegrityReason,
  LocationIntegrityState,
} from '../hooks/useLocationIntegrityMonitor';

export type PersistedAppState = {
  flagCount: number;
  history: FlagHistoryEntry[];
  currentFlagLevel: LocationIntegrityFlagLevel;
  currentReasons: LocationIntegrityReason[];
  currentStatusText: string;
  lastCheckedAt: number | null;
  redFlagDetectedAt: number | null;
  normalizedAfterRedAt: number | null;
  outOfStationActive: boolean;
  outOfStationSince: number | null;
  outOfStationUntil: number | null;
  outOfStationReturnLabel: string | null;
  appBackToNormalAt: number | null;
};

export type SyncAppStatePayload = {
  flagCount: number;
  history: FlagHistoryEntry[];
  currentFlagLevel: LocationIntegrityFlagLevel;
  currentReasons: LocationIntegrityReason[];
  currentStatusText: string;
  lastCheckedAt: number | null;
  redFlagDetectedAt: number | null;
  normalizedAfterRedAt: number | null;
  outOfStationActive: boolean;
  outOfStationSince: number | null;
  outOfStationUntil: number | null;
  outOfStationReturnLabel: string | null;
  appBackToNormalAt: number | null;
};

const normalizeFlagLevel = (value: unknown): LocationIntegrityFlagLevel => {
  switch (value) {
    case 'yellow':
    case 'red':
    case 'green':
      return value;
    default:
      return 'none';
  }
};

const normalizeReasonList = (value: unknown): LocationIntegrityReason[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is LocationIntegrityReason => typeof entry === 'string');
};

const normalizeHistory = (value: unknown): FlagHistoryEntry[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const candidate = entry as Record<string, unknown>;
      return {
        reason: typeof candidate.reason === 'string'
          ? candidate.reason as LocationIntegrityReason
          : null,
        detectedAt: typeof candidate.detectedAt === 'number' ? candidate.detectedAt : null,
      };
    })
    .filter((entry): entry is FlagHistoryEntry =>
      entry !== null && entry.reason !== null && entry.detectedAt !== null)
    .sort((left, right) => left.detectedAt - right.detectedAt);
};

const normalizeTimestamp = (value: unknown) => (typeof value === 'number' ? value : null);

const normalizeAppState = (value: unknown): PersistedAppState => {
  const candidate = value && typeof value === 'object' ? value as Record<string, unknown> : {};

  return {
    flagCount: typeof candidate.flagCount === 'number' ? Math.max(0, Math.floor(candidate.flagCount)) : 0,
    history: normalizeHistory(candidate.history),
    currentFlagLevel: normalizeFlagLevel(candidate.currentFlagLevel),
    currentReasons: normalizeReasonList(candidate.currentReasons),
    currentStatusText: typeof candidate.currentStatusText === 'string'
      ? candidate.currentStatusText
      : 'GPS check inactive',
    lastCheckedAt: normalizeTimestamp(candidate.lastCheckedAt),
    redFlagDetectedAt: normalizeTimestamp(candidate.redFlagDetectedAt),
    normalizedAfterRedAt: normalizeTimestamp(candidate.normalizedAfterRedAt),
    outOfStationActive: Boolean(candidate.outOfStationActive),
    outOfStationSince: normalizeTimestamp(candidate.outOfStationSince),
    outOfStationUntil: normalizeTimestamp(candidate.outOfStationUntil),
    outOfStationReturnLabel: typeof candidate.outOfStationReturnLabel === 'string'
      ? candidate.outOfStationReturnLabel
      : null,
    appBackToNormalAt: normalizeTimestamp(candidate.appBackToNormalAt),
  };
};

export const mapPersistedAppStateToLocationIntegrity = (
  appState: PersistedAppState,
): Partial<LocationIntegrityState> => ({
  isFlagged: appState.currentFlagLevel !== 'none',
  flagLevel: appState.currentFlagLevel,
  reasons: appState.currentReasons,
  statusText: appState.currentStatusText,
  lastCheckedAt: appState.lastCheckedAt,
  redFlagCount: appState.flagCount,
  history: appState.history,
  redFlagDetectedAt: appState.redFlagDetectedAt,
  normalizedAfterRedAt: appState.normalizedAfterRedAt,
});

export const fetchPersistedAppState = async (): Promise<PersistedAppState> => {
  const response = await api.get('/auth/app-state');
  return normalizeAppState(response.data);
};

export const syncPersistedAppState = async (
  payload: SyncAppStatePayload,
): Promise<PersistedAppState> => {
  const response = await api.put('/auth/app-state', payload);
  return normalizeAppState(response.data);
};

export const raiseSuspiciousQuery = async (): Promise<PersistedAppState> => {
  try {
    const response = await api.post('/auth/app-state/suspicious-query');
    return normalizeAppState(response.data);
  } catch (error: any) {
    const status = error?.response?.status;
    const responseData = error?.response?.data;
    const message = typeof responseData === 'string'
      ? responseData
      : typeof responseData?.message === 'string'
        ? responseData.message
        : '';
    const looksLikeMissingPostRoute = status === 404 || status === 405 || /Cannot POST/i.test(message);

    if (!looksLikeMissingPostRoute) {
      throw error;
    }

    const currentState = await fetchPersistedAppState();
    const latestSuspiciousEvent = [...currentState.history]
      .reverse()
      .find((entry) => entry.reason === 'suspicious_outside_working_area');

    if (!latestSuspiciousEvent || !currentState.currentReasons.includes('suspicious_outside_working_area')) {
      throw error;
    }

    const now = Date.now();
    const hasExistingQueryEvent = currentState.history.some((entry) =>
      entry.reason === 'suspicious_query_raised'
      && entry.detectedAt >= latestSuspiciousEvent.detectedAt,
    );

    if (hasExistingQueryEvent) {
      return currentState;
    }

    return syncPersistedAppState({
      ...currentState,
      history: [
        ...currentState.history,
        {
          reason: 'suspicious_query_raised',
          detectedAt: now,
        },
      ],
    });
  }
};
