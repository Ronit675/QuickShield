import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import type { AuthUser } from '../services/auth.service';
import api from '../services/api';
import {
  getRainDisruptionStorageKey,
  getRainDisruptionTrackingState,
  RAIN_TRIGGER_THRESHOLD_MM_PER_HR,
  readStoredRainDisruptionTimer,
  persistStoredRainDisruptionTimer,
} from '../services/rain-disruption.service';
import { useLanguage } from '../directory/Languagecontext';
import type { PolicySummary } from '../types/policy';

type RainDisruptionCardProps = {
  isActive?: boolean;
  onPolicyRefresh?: (nextPolicy?: PolicySummary | null) => Promise<void> | void;
  policy: PolicySummary | null;
  user: AuthUser | null;
};

const WEATHER_REFRESH_INTERVAL_MS = 60_000;
const TIMER_TICK_INTERVAL_MS = 1_000;
const HOURS_PER_DAY = 24;
const MS_PER_HOUR = 60 * 60 * 1000;

const formatCurrency = (value: number) =>
  `₹${value.toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : value < 1 ? 4 : 2,
    maximumFractionDigits: value < 1 ? 4 : 2,
  })}`;

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
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCreditingClaim, setIsCreditingClaim] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [isWithinWorkingWindow, setIsWithinWorkingWindow] = useState(false);
  const [weatherSummary, setWeatherSummary] = useState(t('raindisruption.waitingForRain'));
  const [rainfallRateMmPerHr, setRainfallRateMmPerHr] = useState<number | null>(null);
  const [trackedStartMs, setTrackedStartMs] = useState<number | null>(null);
  const [trackedClaimSessionKey, setTrackedClaimSessionKey] = useState<string | null>(null);
  const [trackedWindowKey, setTrackedWindowKey] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [clockMs, setClockMs] = useState(Date.now());
  const isCreditingClaimRef = useRef(false);
  const isTrackingRef = useRef(false);
  const trackedStartMsRef = useRef<number | null>(null);
  const trackedClaimSessionKeyRef = useRef<string | null>(null);

  const assignedShiftLabel = user?.workingShiftLabel ?? null;
  const hasAssignedShift = Boolean(assignedShiftLabel || user?.workingTimeSlots?.length);

  useEffect(() => {
    isTrackingRef.current = isTracking;
  }, [isTracking]);

  useEffect(() => {
    trackedStartMsRef.current = trackedStartMs;
  }, [trackedStartMs]);

  useEffect(() => {
    trackedClaimSessionKeyRef.current = trackedClaimSessionKey;
  }, [trackedClaimSessionKey]);

  const creditClaimUpToHours = useCallback(async (claimSessionKey: string, totalDisruptedHours: number) => {
    if (
      isCreditingClaimRef.current
      || policy?.status !== 'active'
      || totalDisruptedHours <= 0
    ) {
      return;
    }

    isCreditingClaimRef.current = true;
    setIsCreditingClaim(true);
    setErrorMessage(null);

    try {
      const response = await api.post('/policy/mock-rain-claim', {
        claimSessionKey,
        disruptedHours: Number(totalDisruptedHours.toFixed(4)),
      });

      await onPolicyRefresh?.(response.data as PolicySummary);
    } catch (err: any) {
      setErrorMessage(
        err?.response?.data?.message || err?.message || t('raindisruption.syncFailed'),
      );
    } finally {
      setIsCreditingClaim(false);
      isCreditingClaimRef.current = false;
    }
  }, [onPolicyRefresh, policy?.status, t]);

  const refreshRainStatus = useCallback(async () => {
    const wasTracking = isTrackingRef.current;
    const previousTrackedStartMs = trackedStartMsRef.current;
    const previousClaimSessionKey = trackedClaimSessionKeyRef.current;
    const trackingState = await getRainDisruptionTrackingState(user);

    setIsWithinWorkingWindow(trackingState.isWithinWorkingWindow);
    setLastUpdatedAt(new Date());
    setErrorMessage(null);
    setRainfallRateMmPerHr(trackingState.rainfallRateMmPerHr);
    setWeatherSummary(trackingState.weatherSummary);

    if (!trackingState.isTracking) {
      if (wasTracking && previousTrackedStartMs && previousClaimSessionKey && policy?.status === 'active') {
        const finalDisruptedHours = (Date.now() - previousTrackedStartMs) / MS_PER_HOUR;
        await creditClaimUpToHours(previousClaimSessionKey, finalDisruptedHours);
      }

      setIsTracking(false);
      setTrackedStartMs(null);
      setTrackedClaimSessionKey(null);
      setTrackedWindowKey(null);
      return;
    }

    setTrackedStartMs(trackingState.trackedStartMs);
    setTrackedClaimSessionKey(trackingState.trackedClaimSessionKey);
    setTrackedWindowKey(trackingState.trackedWindowKey);
    setIsTracking(true);
  }, [creditClaimUpToHours, policy?.status, user]);

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
  const elapsedTrackedHoursPrecise = isTracking && trackedStartMs
    ? elapsedMs / MS_PER_HOUR
    : 0;
  const perHourCreditAmount = policy?.status === 'active'
    ? (policy.coveragePerDay ?? 0) / HOURS_PER_DAY
    : 0;
  const currentAccruedClaimAmount = policy?.status === 'active'
    ? perHourCreditAmount * elapsedTrackedHoursPrecise
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

    const storageKey = getRainDisruptionStorageKey(user?.id);
    const storedTimer = await readStoredRainDisruptionTimer(storageKey);
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

      await persistStoredRainDisruptionTimer(storageKey, {
        claimSessionKey: storedTimer.claimSessionKey,
        creditedHours: elapsedTrackedHours,
        startedAtMs: storedTimer.startedAtMs,
        windowKey: storedTimer.windowKey,
      });

      await onPolicyRefresh?.(response.data as PolicySummary);
    } catch (err: any) {
      setErrorMessage(
        err?.response?.data?.message || err?.message || t('raindisruption.syncFailed'),
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
    t,
    trackedStartMs,
    trackedClaimSessionKey,
    trackedWindowKey,
    user?.id,
  ]);

  useEffect(() => {
    void syncTrackedClaim();
  }, [syncTrackedClaim]);

  let helperText = t('raindisruption.notAffectingRider');

  if (!hasAssignedShift) {
    helperText = t('raindisruption.assignWorkingHours');
  } else if (!isWithinWorkingWindow) {
    helperText = t('raindisruption.outsideWorkingSlot');
  } else if (!isTracking) {
    helperText = t('raindisruption.rainTooLow', { threshold: String(RAIN_TRIGGER_THRESHOLD_MM_PER_HR) });
  } else if (isTracking && policy?.status !== 'active') {
    helperText = t('raindisruption.rainCrossedNoPlan', { threshold: String(RAIN_TRIGGER_THRESHOLD_MM_PER_HR) });
  } else if (isCreditingClaim) {
    helperText = t('raindisruption.syncingClaim', {
      amount: formatCurrency(currentAccruedClaimAmount),
      hours: String(elapsedTrackedHours),
      plural: elapsedTrackedHours === 1 ? '' : 's',
      perHour: formatCurrency(perHourCreditAmount),
    });
  } else if (isTracking && policy?.status === 'active') {
    helperText = t('raindisruption.creditedClaim', {
      amount: formatCurrency(currentAccruedClaimAmount),
      hours: String(elapsedTrackedHours),
      plural: elapsedTrackedHours === 1 ? '' : 's',
      perHour: formatCurrency(perHourCreditAmount),
    });
  }

  const statusLabel = isCreditingClaim
    ? t('raindisruption.statusCrediting')
    : isTracking
      ? t('raindisruption.statusTracking')
      : isWithinWorkingWindow
        ? t('raindisruption.statusStandby')
        : t('raindisruption.statusIdle');
  const claimLabel = policy?.status === 'active'
    ? formatCurrency(currentAccruedClaimAmount)
    : t('raindisruption.noPlan');

  if (loading) {
    return (
      <View style={[styles.card, styles.loadingCard]}>
        <ActivityIndicator color="#38BDF8" />
        <Text style={styles.loadingText}>{t('raindisruption.checkingStatus')}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.card, isTracking ? styles.cardActive : styles.cardIdle]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>{t('raindisruption.eyebrow')}</Text>
          <Text style={styles.title}>{t('raindisruption.timerCard')}</Text>
        </View>
        <View style={[styles.statusBadge, isTracking ? styles.statusBadgeActive : styles.statusBadgeIdle]}>
          <Text style={[styles.statusBadgeText, isTracking ? styles.statusBadgeTextActive : styles.statusBadgeTextIdle]}>
            {statusLabel}
          </Text>
        </View>
      </View>

      <Text style={styles.timerValue}>{isTracking ? formatDuration(elapsedMs) : t('raindisruption.noDisruption')}</Text>
      <Text style={styles.summaryText}>
        {isTracking
          ? t('raindisruption.duringShift', {
              weather: weatherSummary,
              shift: assignedShiftLabel ?? t('raindisruption.activeRiderSlot'),
            })
          : weatherSummary}
      </Text>

      <View style={styles.metricsRow}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>{t('raindisruption.workingSlot')}</Text>
          <Text style={styles.metricValue}>{assignedShiftLabel ?? t('raindisruption.notAssigned')}</Text>
        </View>

        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>{t('raindisruption.claim')}</Text>
          <Text style={[styles.metricValue, currentAccruedClaimAmount > 0 && styles.claimValueActive]}>{claimLabel}</Text>
        </View>

        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>{t('raindisruption.rainRate')}</Text>
          <Text style={styles.metricValue}>
            {rainfallRateMmPerHr !== null ? `${rainfallRateMmPerHr.toFixed(1)} mm/hr` : t('raindisruption.unavailable')}
          </Text>
        </View>
      </View>

      <Text style={styles.helperText}>{helperText}</Text>

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      {lastUpdatedAt ? (
        <Text style={styles.timestampText}>
          {t('raindisruption.updated', {
            time: lastUpdatedAt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }),
          })}
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
