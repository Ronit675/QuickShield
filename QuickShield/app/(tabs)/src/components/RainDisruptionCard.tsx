import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import type { AuthUser } from '../services/auth.service';
import api from '../services/api';
import { fetchCurrentWeatherSnapshot } from '../services/weather';
import type { PolicySummary } from '../types/policy';

type RainDisruptionCardProps = {
  isActive?: boolean;
  onPolicyRefresh?: (nextPolicy?: PolicySummary | null) => Promise<void> | void;
  policy: PolicySummary | null;
  user: AuthUser | null;
};

type WorkingWindow = {
  label: string;
  key: string;
  start: Date;
  end: Date;
};

type StoredRainDisruptionTimer = {
  claimSessionKey?: string;
  creditedHours?: number;
  startedAtMs: number;
  windowKey: string;
};

const RAIN_DISRUPTION_STORAGE_KEY_PREFIX = 'rain-disruption:';
const WEATHER_REFRESH_INTERVAL_MS = 60_000;
const TIMER_TICK_INTERVAL_MS = 1_000;
const RAIN_TRIGGER_THRESHOLD_MM_PER_HR = 8;
const HOURS_PER_DAY = 24;
const MS_PER_HOUR = 60 * 60 * 1000;

const getStorageKey = (userId: string | null | undefined) =>
  `${RAIN_DISRUPTION_STORAGE_KEY_PREFIX}${userId ?? 'anonymous'}`;

const formatCurrency = (value: number) =>
  `₹${value.toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : value < 1 ? 4 : 2,
    maximumFractionDigits: value < 1 ? 4 : 2,
  })}`;

const buildClaimSessionKey = (windowKey: string, startedAtMs: number) => `${windowKey}:${startedAtMs}`;

const parseTimeToken = (value: string, baseDate: Date) => {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) {
    return null;
  }

  const [, hoursToken, minutesToken, periodToken] = match;
  const hours = Number(hoursToken) % 12;
  const minutes = Number(minutesToken);
  const period = periodToken.toUpperCase();

  const parsedDate = new Date(baseDate);
  parsedDate.setHours(period === 'PM' ? hours + 12 : hours, minutes, 0, 0);
  return parsedDate;
};

const parseWorkingWindow = (label: string, now: Date): WorkingWindow | null => {
  const [startLabel, endLabel] = label.split(' - ');
  if (!startLabel || !endLabel) {
    return null;
  }

  const start = parseTimeToken(startLabel, now);
  const end = parseTimeToken(endLabel, now);
  if (!start || !end) {
    return null;
  }

  if (end <= start) {
    end.setDate(end.getDate() + 1);
  }

  return {
    label,
    key: `${label}:${start.toISOString()}`,
    start,
    end,
  };
};

const getActiveWorkingWindow = (user: AuthUser | null, now: Date): WorkingWindow | null => {
  const assignedShift = user?.workingShiftLabel?.trim();
  if (assignedShift) {
    const parsedShift = parseWorkingWindow(assignedShift, now);
    if (parsedShift && now >= parsedShift.start && now < parsedShift.end) {
      return parsedShift;
    }
  }

  for (const timeSlot of user?.workingTimeSlots ?? []) {
    const parsedSlot = parseWorkingWindow(timeSlot, now);
    if (parsedSlot && now >= parsedSlot.start && now < parsedSlot.end) {
      return parsedSlot;
    }
  }

  return null;
};

const readStoredTimer = async (storageKey: string): Promise<StoredRainDisruptionTimer | null> => {
  const rawValue = await AsyncStorage.getItem(storageKey);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as StoredRainDisruptionTimer;
  } catch {
    await AsyncStorage.removeItem(storageKey);
    return null;
  }
};

const persistStoredTimer = async (storageKey: string, timer: StoredRainDisruptionTimer) => {
  await AsyncStorage.setItem(storageKey, JSON.stringify(timer));
};

const clearStoredTimer = async (storageKey: string) => {
  await AsyncStorage.removeItem(storageKey);
};

const formatDuration = (durationMs: number) => {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
};

export default function RainDisruptionCard({
  isActive = true,
  onPolicyRefresh,
  policy,
  user,
}: RainDisruptionCardProps) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCreditingClaim, setIsCreditingClaim] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [isWithinWorkingWindow, setIsWithinWorkingWindow] = useState(false);
  const [weatherSummary, setWeatherSummary] = useState('Waiting for mock rain rate');
  const [rainfallRateMmPerHr, setRainfallRateMmPerHr] = useState<number | null>(null);
  const [trackedStartMs, setTrackedStartMs] = useState<number | null>(null);
  const [trackedClaimSessionKey, setTrackedClaimSessionKey] = useState<string | null>(null);
  const [trackedWindowKey, setTrackedWindowKey] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [clockMs, setClockMs] = useState(Date.now());
  const isCreditingClaimRef = useRef(false);

  const assignedShiftLabel = user?.workingShiftLabel ?? null;
  const hasAssignedShift = Boolean(assignedShiftLabel || user?.workingTimeSlots?.length);

  const refreshRainStatus = useCallback(async () => {
    const now = new Date();
    const storageKey = getStorageKey(user?.id);
    const activeWorkingWindow = getActiveWorkingWindow(user, now);

    setIsWithinWorkingWindow(Boolean(activeWorkingWindow));
    setLastUpdatedAt(now);
    setErrorMessage(null);

    if (!activeWorkingWindow) {
      await clearStoredTimer(storageKey);
      setIsCreditingClaim(false);
      setIsTracking(false);
      setTrackedStartMs(null);
      setTrackedClaimSessionKey(null);
      setTrackedWindowKey(null);
      setRainfallRateMmPerHr(null);
      setWeatherSummary('Outside the rider working slot');
      return;
    }

    const weatherSnapshot = await fetchCurrentWeatherSnapshot();
    const currentRainfallRate = weatherSnapshot.rainfallRateMmPerHr;
    setRainfallRateMmPerHr(currentRainfallRate);
    setWeatherSummary(`Current rain rate ${currentRainfallRate.toFixed(1)} mm/hr`);

    if (currentRainfallRate <= RAIN_TRIGGER_THRESHOLD_MM_PER_HR) {
      await clearStoredTimer(storageKey);
      setIsCreditingClaim(false);
      setIsTracking(false);
      setTrackedStartMs(null);
      setTrackedClaimSessionKey(null);
      setTrackedWindowKey(null);
      return;
    }

    const storedTimer = await readStoredTimer(storageKey);
    const fallbackStartMs = Math.max(
      activeWorkingWindow.start.getTime(),
      now.getTime(),
    );

    const startedAtMs = storedTimer?.windowKey === activeWorkingWindow.key
      ? storedTimer.startedAtMs
      : fallbackStartMs;
    const claimSessionKey = storedTimer?.windowKey === activeWorkingWindow.key
      ? storedTimer.claimSessionKey ?? buildClaimSessionKey(activeWorkingWindow.key, startedAtMs)
      : buildClaimSessionKey(activeWorkingWindow.key, startedAtMs);
    const creditedHours = storedTimer?.windowKey === activeWorkingWindow.key
      ? storedTimer.creditedHours ?? 0
      : 0;

    if (
      storedTimer?.windowKey !== activeWorkingWindow.key
      || storedTimer.startedAtMs !== startedAtMs
      || storedTimer.claimSessionKey !== claimSessionKey
      || storedTimer.creditedHours !== creditedHours
    ) {
      await persistStoredTimer(storageKey, {
        claimSessionKey,
        creditedHours,
        startedAtMs,
        windowKey: activeWorkingWindow.key,
      });
    }

    setTrackedStartMs(startedAtMs);
    setTrackedClaimSessionKey(claimSessionKey);
    setTrackedWindowKey(activeWorkingWindow.key);
    setIsTracking(true);
  }, [user]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    let isMounted = true;

    const load = async () => {
      try {
        if (isMounted) {
          setLoading(true);
        }

        await refreshRainStatus();
      } catch (err: any) {
        if (isMounted) {
          setErrorMessage(err?.message || 'Could not load rain disruption status.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void load();

    const refreshInterval = setInterval(() => {
      void refreshRainStatus().catch((err: any) => {
        if (isMounted) {
          setErrorMessage(err?.message || 'Could not refresh rain disruption status.');
        }
      });
    }, WEATHER_REFRESH_INTERVAL_MS);

    const timerInterval = setInterval(() => {
      if (isMounted) {
        setClockMs(Date.now());
      }
    }, TIMER_TICK_INTERVAL_MS);

    return () => {
      isMounted = false;
      clearInterval(refreshInterval);
      clearInterval(timerInterval);
    };
  }, [isActive, refreshRainStatus]);

  const elapsedMs = isTracking && trackedStartMs ? Math.max(0, clockMs - trackedStartMs) : 0;
  const elapsedTrackedHours = isTracking && trackedStartMs
    ? Math.floor(elapsedMs / MS_PER_HOUR)
    : 0;
  const perHourCreditAmount = policy?.status === 'active'
    ? (policy.coveragePerDay ?? 0) / HOURS_PER_DAY
    : 0;
  const currentAccruedClaimAmount = policy?.status === 'active'
    ? perHourCreditAmount * elapsedTrackedHours
    : 0;

  const syncTrackedClaim = useCallback(async () => {
    if (
      isCreditingClaimRef.current
      || !isTracking
      || !trackedStartMs
      || !trackedClaimSessionKey
      || !trackedWindowKey
      || policy?.status !== 'active'
      || elapsedTrackedHours <= 0
    ) {
      return;
    }

    const storageKey = getStorageKey(user?.id);
    const storedTimer = await readStoredTimer(storageKey);
    if (
      !storedTimer
      || storedTimer.windowKey !== trackedWindowKey
      || storedTimer.claimSessionKey !== trackedClaimSessionKey
    ) {
      return;
    }

    const creditedHours = storedTimer.creditedHours ?? 0;
    if (elapsedTrackedHours <= creditedHours) {
      return;
    }

    isCreditingClaimRef.current = true;
    setIsCreditingClaim(true);
    setErrorMessage(null);

    try {
      const response = await api.post('/policy/mock-rain-claim', {
        claimSessionKey: trackedClaimSessionKey,
        disruptedHours: elapsedTrackedHours,
      });

      await persistStoredTimer(storageKey, {
        claimSessionKey: storedTimer.claimSessionKey,
        creditedHours: elapsedTrackedHours,
        startedAtMs: storedTimer.startedAtMs,
        windowKey: storedTimer.windowKey,
      });

      await onPolicyRefresh?.(response.data as PolicySummary);
    } catch (err: any) {
      setErrorMessage(
        err?.response?.data?.message || err?.message || 'Could not sync the mock rain payout.',
      );
    } finally {
      setIsCreditingClaim(false);
      isCreditingClaimRef.current = false;
    }
  }, [
    elapsedTrackedHours,
    isTracking,
    onPolicyRefresh,
    policy?.status,
    trackedStartMs,
    trackedClaimSessionKey,
    trackedWindowKey,
    user?.id,
  ]);

  useEffect(() => {
    void syncTrackedClaim();
  }, [syncTrackedClaim]);

  let helperText = 'Rain disruption is not affecting the rider right now.';

  if (!hasAssignedShift) {
    helperText = 'Assign rider working hours first so the app can compare rain against the active shift.';
  } else if (!isWithinWorkingWindow) {
    helperText = 'The rider is currently outside the configured working slot, so no rain disruption is tracked.';
  } else if (!isTracking) {
    helperText = `Rain rate is below ${RAIN_TRIGGER_THRESHOLD_MM_PER_HR} mm/hr, so the timer has not started.`;
  } else if (isTracking && policy?.status !== 'active') {
    helperText = `Rain rate crossed ${RAIN_TRIGGER_THRESHOLD_MM_PER_HR} mm/hr, but there is no active premium plan selected for a payout.`;
  } else if (isCreditingClaim) {
    helperText = `Syncing ${formatCurrency(currentAccruedClaimAmount)} for ${elapsedTrackedHours} completed disrupted hour${elapsedTrackedHours === 1 ? '' : 's'} at ${formatCurrency(perHourCreditAmount)} per hour.`;
  } else if (isTracking && policy?.status === 'active') {
    helperText = `${formatCurrency(currentAccruedClaimAmount)} credited across ${elapsedTrackedHours} completed disrupted hour${elapsedTrackedHours === 1 ? '' : 's'} at ${formatCurrency(perHourCreditAmount)} per hour.`;
  }

  const statusLabel = isCreditingClaim
    ? 'Crediting'
    : isTracking
      ? 'Tracking'
      : isWithinWorkingWindow
        ? 'Standby'
        : 'Idle';
  const claimLabel = policy?.status === 'active'
    ? formatCurrency(currentAccruedClaimAmount)
    : 'No plan';

  if (loading) {
    return (
      <View style={[styles.card, styles.loadingCard]}>
        <ActivityIndicator color="#38BDF8" />
        <Text style={styles.loadingText}>Checking rain disruption status...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.card, isTracking ? styles.cardActive : styles.cardIdle]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Rain disruption</Text>
          <Text style={styles.title}>Timer card</Text>
        </View>
        <View style={[styles.statusBadge, isTracking ? styles.statusBadgeActive : styles.statusBadgeIdle]}>
          <Text style={[styles.statusBadgeText, isTracking ? styles.statusBadgeTextActive : styles.statusBadgeTextIdle]}>
            {statusLabel}
          </Text>
        </View>
      </View>

      <Text style={styles.timerValue}>{isTracking ? formatDuration(elapsedMs) : 'no disruption'}</Text>
      <Text style={styles.summaryText}>
        {isTracking
          ? `${weatherSummary} during ${assignedShiftLabel ?? 'the active rider slot'}`
          : weatherSummary}
      </Text>

      <View style={styles.metricsRow}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Working slot</Text>
          <Text style={styles.metricValue}>{assignedShiftLabel ?? 'Not assigned'}</Text>
        </View>

        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Claim</Text>
          <Text style={[styles.metricValue, currentAccruedClaimAmount > 0 && styles.claimValueActive]}>{claimLabel}</Text>
        </View>

        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Rain rate</Text>
          <Text style={styles.metricValue}>
            {rainfallRateMmPerHr !== null ? `${rainfallRateMmPerHr.toFixed(1)} mm/hr` : 'Unavailable'}
          </Text>
        </View>
      </View>

      <Text style={styles.helperText}>{helperText}</Text>

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      {lastUpdatedAt ? (
        <Text style={styles.timestampText}>
          Updated {lastUpdatedAt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
  },
  loadingCard: {
    backgroundColor: '#101722',
    borderColor: '#263244',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 180,
  },
  cardActive: {
    backgroundColor: '#11202A',
    borderColor: '#38BDF855',
  },
  cardIdle: {
    backgroundColor: '#11141B',
    borderColor: '#1E293B',
  },
  loadingText: {
    marginTop: 12,
    color: '#9DB2C8',
    fontSize: 13,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 18,
  },
  eyebrow: {
    color: '#7DD3FC',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusBadgeActive: {
    backgroundColor: '#38BDF822',
  },
  statusBadgeIdle: {
    backgroundColor: '#1E293B',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusBadgeTextActive: {
    color: '#7DD3FC',
  },
  statusBadgeTextIdle: {
    color: '#94A3B8',
  },
  timerValue: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -1,
    marginBottom: 10,
  },
  summaryText: {
    color: '#AFC3D8',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 18,
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 14,
  },
  metricCard: {
    flex: 1,
    minWidth: 110,
    backgroundColor: '#0E1722',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: '#203041',
  },
  metricLabel: {
    color: '#7E97AF',
    fontSize: 11,
    marginBottom: 6,
  },
  metricValue: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  claimValueActive: {
    color: '#00E5A0',
  },
  helperText: {
    color: '#C8D5E3',
    fontSize: 13,
    lineHeight: 20,
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 12,
    marginTop: 12,
  },
  timestampText: {
    color: '#6B7280',
    fontSize: 11,
    marginTop: 12,
  },
});
