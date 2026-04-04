import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import type { AuthUser } from '../services/auth.service';
import api from '../services/api';
import { fetchCurrentWeatherSnapshot } from '../services/weather';
import type { PolicySummary } from '../types/policy';

type RainDisruptionCardProps = {
  isActive?: boolean;
  onPolicyRefresh?: () => Promise<void> | void;
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
  creditedHourKeys?: string[];
  startedAtMs: number;
  windowKey: string;
};

const RAIN_DISRUPTION_STORAGE_KEY_PREFIX = 'rain-disruption:';
const WEATHER_REFRESH_INTERVAL_MS = 60_000;
const TIMER_TICK_INTERVAL_MS = 1_000;
const CLAIM_UNLOCK_THRESHOLD_MS = 60 * 60 * 1000;
const RAIN_TRIGGER_THRESHOLD_MM_PER_HR = 8;

const getStorageKey = (userId: string | null | undefined) =>
  `${RAIN_DISRUPTION_STORAGE_KEY_PREFIX}${userId ?? 'anonymous'}`;

const formatCurrency = (value: number) =>
  `₹${value.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

const padNumber = (value: number) => value.toString().padStart(2, '0');

const formatLocalHourKey = (date: Date) =>
  `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}T${padNumber(date.getHours())}:00`;

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
    const creditedHourKeys = storedTimer?.windowKey === activeWorkingWindow.key
      ? storedTimer.creditedHourKeys ?? []
      : [];

    if (storedTimer?.windowKey !== activeWorkingWindow.key || storedTimer.startedAtMs !== startedAtMs) {
      await persistStoredTimer(storageKey, {
        creditedHourKeys,
        startedAtMs,
        windowKey: activeWorkingWindow.key,
      });
    }

    setTrackedStartMs(startedAtMs);
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
  const completedTrackedHours = isTracking && trackedStartMs
    ? Math.floor(elapsedMs / CLAIM_UNLOCK_THRESHOLD_MS)
    : 0;
  const hasUnlockedClaim = policy?.status === 'active' && completedTrackedHours > 0;
  const eligibleClaimAmount = hasUnlockedClaim ? policy?.coveragePerDay ?? 0 : 0;
  const remainingToUnlockMs = Math.max(0, CLAIM_UNLOCK_THRESHOLD_MS - elapsedMs);

  const creditCompletedHours = useCallback(async () => {
    if (
      isCreditingClaimRef.current
      || !isTracking
      || !trackedStartMs
      || !trackedWindowKey
      || policy?.status !== 'active'
      || completedTrackedHours <= 0
    ) {
      return;
    }

    const storageKey = getStorageKey(user?.id);
    const storedTimer = await readStoredTimer(storageKey);
    if (!storedTimer || storedTimer.windowKey !== trackedWindowKey) {
      return;
    }

    const creditedHourKeys = storedTimer.creditedHourKeys ?? [];
    const completedHourKeys = Array.from({ length: completedTrackedHours }, (_, hourIndex) =>
      formatLocalHourKey(new Date(trackedStartMs + hourIndex * CLAIM_UNLOCK_THRESHOLD_MS)),
    );
    const pendingHourKeys = completedHourKeys.filter((hourKey) => !creditedHourKeys.includes(hourKey));

    if (pendingHourKeys.length === 0) {
      return;
    }

    isCreditingClaimRef.current = true;
    setIsCreditingClaim(true);
    setErrorMessage(null);

    try {
      for (const affectedHourKey of pendingHourKeys) {
        await api.post('/policy/mock-rain-claim', { affectedHourKey });
      }

      await persistStoredTimer(storageKey, {
        creditedHourKeys: [...creditedHourKeys, ...pendingHourKeys],
        startedAtMs: storedTimer.startedAtMs,
        windowKey: storedTimer.windowKey,
      });

      await onPolicyRefresh?.();
    } catch (err: any) {
      setErrorMessage(
        err?.response?.data?.message || err?.message || 'Could not credit the mock rain claim.',
      );
    } finally {
      setIsCreditingClaim(false);
      isCreditingClaimRef.current = false;
    }
  }, [
    completedTrackedHours,
    isTracking,
    onPolicyRefresh,
    policy?.status,
    trackedStartMs,
    trackedWindowKey,
    user?.id,
  ]);

  useEffect(() => {
    void creditCompletedHours();
  }, [creditCompletedHours]);

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
    helperText = 'The heavy-rain threshold was met. Crediting the affected hour into the wallet now.';
  } else if (isTracking && hasUnlockedClaim) {
    helperText = `Rain rate stayed above ${RAIN_TRIGGER_THRESHOLD_MM_PER_HR} mm/hr for ${completedTrackedHours} affected ${completedTrackedHours === 1 ? 'hour' : 'hours'}. Claim credited at ${formatCurrency(eligibleClaimAmount)} per hour.`;
  } else if (isTracking && policy?.status === 'active') {
    helperText = `${formatDuration(remainingToUnlockMs)} more above ${RAIN_TRIGGER_THRESHOLD_MM_PER_HR} mm/hr is needed to unlock the next affected-hour claim.`;
  }

  const statusLabel = isCreditingClaim
    ? 'Crediting'
    : isTracking
      ? 'Tracking'
      : isWithinWorkingWindow
        ? 'Standby'
        : 'Idle';
  const claimLabel = policy?.status === 'active'
    ? hasUnlockedClaim
      ? formatCurrency(eligibleClaimAmount)
      : 'Pending'
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
          <Text style={[styles.metricValue, hasUnlockedClaim && styles.claimValueActive]}>{claimLabel}</Text>
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
