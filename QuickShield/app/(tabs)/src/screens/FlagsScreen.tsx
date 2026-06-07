import React, { useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useLanguage } from '../directory/Languagecontext';
import type { LocationIntegrityState, LocationIntegrityReason } from '../hooks/useLocationIntegrityMonitor';
import { raiseSuspiciousQuery } from '../services/app-state.service';

type FlagsScreenProps = {
  isActive?: boolean;
  bottomInset?: number;
  locationIntegrity: LocationIntegrityState;
};

const INITIAL_VISIBLE_HISTORY_COUNT = 5;
const HISTORY_PAGE_SIZE = 5;

const formatReason = (reason: LocationIntegrityReason, t: (path: string) => string) => {
  switch (reason) {
    case 'mock_location_detected':
      return { text: t('flags.mockLocationDetected'), icon: 'alert-circle' as const };
    case 'teleportation':
      return { text: t('flags.teleportation'), icon: 'location' as const };
    case 'unnatural_velocity_curve':
      return { text: t('flags.unnaturalVelocityCurve'), icon: 'trending-up' as const };
    case 'outside_working_area':
      return { text: t('flags.outsideWorkingArea'), icon: 'warning' as const };
    case 'suspicious_outside_working_area':
      return {
        text: t('flags.suspiciousOutsideWorkingArea'),
        icon: 'shield' as const,
      };
    case 'suspicious_query_raised':
      return {
        text: t('flags.suspiciousQueryRaised'),
        icon: 'chatbubble-ellipses' as const,
      };
    case 'invigilating_location_fluctuation':
      return { text: t('flags.invigilatingLocationFluctuation'), icon: 'eye' as const };
    case 'account_suspended_location_pattern':
      return { text: t('flags.accountSuspendedLocationPattern'), icon: 'ban' as const };
    case 'permission_denied':
      return { text: t('flags.permissionDenied'), icon: 'lock-closed' as const };
    case 'gps_unavailable':
      return { text: t('flags.gpsUnavailable'), icon: 'alert-circle' as const };
    case 'location_error':
      return { text: t('flags.locationError'), icon: 'alert-circle' as const };
    default:
      return { text: reason, icon: 'alert-circle' as const };
  }
};

const formatDetectionTime = (timestamp: number, locale: string) => {
  const date = new Date(timestamp);
  return date.toLocaleString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: '2-digit',
    month: 'short',
  });
};

const formatTimeAgo = (
  timestamp: number,
  locale: string,
  t: (path: string, vars?: Record<string, string>) => string,
) => {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);

  if (diffSeconds < 60) {
    return t('flags.secondsAgo', { count: String(diffSeconds) });
  }
  if (diffMinutes < 60) {
    return t('flags.minutesAgo', { count: String(diffMinutes) });
  }
  if (diffHours < 24) {
    return t('flags.hoursAgo', { count: String(diffHours) });
  }
  return formatDetectionTime(timestamp, locale);
};

export default function FlagsScreen({ bottomInset = 40, locationIntegrity }: FlagsScreenProps) {
  const { language, t } = useLanguage();
  
  const isFlagged = locationIntegrity.isFlagged;
  const flagLevel = locationIntegrity.flagLevel;
  const isYellowFlag = flagLevel === 'yellow';
  const isRedFlag = flagLevel === 'red';
  const isGreenFlag = flagLevel === 'green';
  const checksLeft = Math.max(0, 5 - locationIntegrity.consecutiveInnerRadiusPoints);
  
  const [isSubmittingSuspiciousQuery, setIsSubmittingSuspiciousQuery] = useState(false);
  const [hasRaisedSuspiciousQueryLocally, setHasRaisedSuspiciousQueryLocally] = useState(false);
  const [visibleHistoryCount, setVisibleHistoryCount] = useState(INITIAL_VISIBLE_HISTORY_COUNT);

  // Sort history by most recent first
  const sortedHistory = useMemo(() => {
    return [...locationIntegrity.history].reverse();
  }, [locationIntegrity.history]);

  const visibleHistory = useMemo(() => {
    return sortedHistory.slice(0, visibleHistoryCount);
  }, [sortedHistory, visibleHistoryCount]);

  const hiddenHistoryCount = Math.max(0, sortedHistory.length - visibleHistory.length);
  const hasMoreHistory = hiddenHistoryCount > 0;

  const hasActiveSuspiciousCase = Boolean(
    locationIntegrity.lastSuspiciousDetectedAt &&
    locationIntegrity.suspiciousHoldUntilMs &&
    Date.now() < locationIntegrity.suspiciousHoldUntilMs
  );

  const hasRaisedSuspiciousQueryForCurrentCase = useMemo(() => {
    if (!locationIntegrity.lastSuspiciousDetectedAt) {
      return false;
    }

    return locationIntegrity.history.some(
      (entry) =>
        entry.reason === 'suspicious_query_raised' &&
        entry.detectedAt >= locationIntegrity.lastSuspiciousDetectedAt!
    );
  }, [locationIntegrity.history, locationIntegrity.lastSuspiciousDetectedAt]);

  const canRaiseSuspiciousQuery =
    hasActiveSuspiciousCase &&
    !hasRaisedSuspiciousQueryForCurrentCase &&
    !hasRaisedSuspiciousQueryLocally;

  useEffect(() => {
    setHasRaisedSuspiciousQueryLocally(false);
  }, [locationIntegrity.lastSuspiciousDetectedAt]);

  useEffect(() => {
    setVisibleHistoryCount((currentCount) =>
      Math.min(
        Math.max(currentCount, INITIAL_VISIBLE_HISTORY_COUNT),
        sortedHistory.length || INITIAL_VISIBLE_HISTORY_COUNT
      )
    );
  }, [sortedHistory.length]);

  const handleShowMoreHistory = () => {
    setVisibleHistoryCount((currentCount) =>
      Math.min(currentCount + HISTORY_PAGE_SIZE, sortedHistory.length)
    );
  };

  const handleRaiseSuspiciousQuery = async () => {
    if (!canRaiseSuspiciousQuery || isSubmittingSuspiciousQuery) {
      return;
    }

    setIsSubmittingSuspiciousQuery(true);

    try {
      await raiseSuspiciousQuery();
      setHasRaisedSuspiciousQueryLocally(true);
      Alert.alert(t('flags.queryRaised'), t('flags.suspiciousCaseDescription'));
    } catch (error: any) {
      Alert.alert(
        t('flags.raiseQueryFailed'),
        error?.response?.data?.message || error?.message || t('login.retry'),
      );
    } finally {
      setIsSubmittingSuspiciousQuery(false);
    }
  };

  const locale = language === 'hi' ? 'hi-IN' : language === 'kn' ? 'kn-IN' : 'en-IN';

  const getStatusColor = () => {
    if (isRedFlag) return '#EF4444';
    if (isYellowFlag) return '#F59E0B';
    if (isGreenFlag) return '#10B981';
    return '#10B981'; // Normal
  };

  const getStatusBadgeStyles = () => {
    if (isRedFlag) {
      return { bg: '#FEE2E2', border: '#FCA5A5', text: '#991B1B' };
    }
    if (isYellowFlag) {
      return { bg: '#FEF3C7', border: '#FDE68A', text: '#92400E' };
    }
    return { bg: '#D1FAE5', border: '#A7F3D0', text: '#065F46' };
  };

  const badgeStyles = getStatusBadgeStyles();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFDF5" />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomInset }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Monitor Header Card */}
        <View style={styles.monitorCard}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.eyebrow}>{t('flags.eyebrow')}</Text>
              <Text style={styles.title}>{t('flags.title')}</Text>
            </View>
            <View
              style={[
                styles.badge,
                {
                  backgroundColor: badgeStyles.bg,
                  borderColor: badgeStyles.border,
                },
              ]}
            >
              <Ionicons
                name={isFlagged ? 'warning' : 'checkmark-circle'}
                size={14}
                color={badgeStyles.text}
              />
              <Text style={[styles.badgeText, { color: badgeStyles.text }]}>
                {isRedFlag
                  ? t('flags.redFlag')
                  : isYellowFlag
                  ? t('flags.yellowFlag')
                  : isGreenFlag
                  ? t('flags.recovered')
                  : t('flags.normal')}
              </Text>
            </View>
          </View>

          <View style={styles.countContainer}>
            <Text style={[styles.countValue, { color: getStatusColor() }]}>
              {locationIntegrity.redFlagCount}
            </Text>
            <Text style={styles.countLabel}>
              {t('flags.breachesDetected', { count: String(locationIntegrity.redFlagCount) })}
            </Text>
          </View>

          {/* Recovery Progress (if Red or Green Flag) */}
          {(isRedFlag || isGreenFlag) && (
            <View style={styles.recoverySection}>
              <Text style={styles.recoveryTitle}>{t('flags.recoveryProgress')}</Text>
              <Text style={styles.recoveryText}>
                {t('flags.recoveryChecks', {
                  completed: String(locationIntegrity.consecutiveInnerRadiusPoints),
                })}
              </Text>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${(locationIntegrity.consecutiveInnerRadiusPoints / 5) * 100}%`,
                      backgroundColor: getStatusColor(),
                    },
                  ]}
                />
              </View>
              <Text style={styles.checksRemaining}>
                {checksLeft === 0
                  ? `✓ ${t('flags.fullyRecovered')}`
                  : t('flags.checksRemaining', { count: String(checksLeft) })}
              </Text>
            </View>
          )}

          {/* GPS Status Footer */}
          <View style={styles.cardFooter}>
            <View style={styles.gpsRow}>
              <Ionicons name="location" size={16} color="#736400" />
              <Text style={styles.gpsText}>{locationIntegrity.statusText}</Text>
            </View>
            <Text style={styles.lastCheckedText}>
              {t('flags.lastChecked', {
                time: formatDetectionTime(locationIntegrity.lastCheckedAt ?? Date.now(), locale),
              })}
            </Text>
          </View>

          {/* Suspicious Case Action query button */}
          {hasActiveSuspiciousCase && (
            <View style={styles.queryCard}>
              <Text style={styles.queryTitle}>{t('flags.suspiciousCaseTitle')}</Text>
              <Text style={styles.querySubtitle}>{t('flags.suspiciousCaseDescription')}</Text>
              <TouchableOpacity
                style={[
                  styles.queryButton,
                  (!canRaiseSuspiciousQuery || isSubmittingSuspiciousQuery) && styles.queryButtonDisabled,
                ]}
                activeOpacity={0.85}
                onPress={handleRaiseSuspiciousQuery}
                disabled={!canRaiseSuspiciousQuery || isSubmittingSuspiciousQuery}
              >
                {isSubmittingSuspiciousQuery ? (
                  <ActivityIndicator color="#08110F" size="small" />
                ) : (
                  <Text style={styles.queryButtonText}>
                    {hasRaisedSuspiciousQueryForCurrentCase || hasRaisedSuspiciousQueryLocally
                      ? t('flags.queryRaised')
                      : t('flags.raiseQuery')}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Detection History */}
        <View style={styles.historyContainer}>
          <Text style={styles.historySectionTitle}>{t('flags.detectionHistory')}</Text>

          {sortedHistory.length > 0 ? (
            <View style={styles.timelineBox}>
              <View style={styles.timelineList}>
                {visibleHistory.map((entry, index) => {
                  const reason = formatReason(entry.reason, t);
                  const isLast = index === visibleHistory.length - 1;

                  return (
                    <View key={`${entry.detectedAt}-${index}`} style={styles.timelineItem}>
                      <View style={styles.timelineLeftColumn}>
                        <View style={styles.timelineDot} />
                        {!isLast && <View style={styles.timelineLine} />}
                      </View>
                      
                      <View style={[styles.timelineContent, isLast && styles.timelineContentLast]}>
                        <View style={styles.itemHeader}>
                          <View style={styles.iconWrapper}>
                            <Ionicons name={reason.icon} size={15} color="#FFDF00" />
                          </View>
                          <View style={styles.itemTextContainer}>
                            <Text style={styles.itemTitle}>{reason.text}</Text>
                            <Text style={styles.itemTimeAgo}>
                              {formatTimeAgo(entry.detectedAt, locale, t)}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.itemDateText}>
                          {formatDetectionTime(entry.detectedAt, locale)}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>

              {hasMoreHistory && (
                <TouchableOpacity
                  style={styles.showMoreBtn}
                  activeOpacity={0.8}
                  onPress={handleShowMoreHistory}
                >
                  <Ionicons name="chevron-down" size={14} color="#5C5000" />
                  <Text style={styles.showMoreBtnText}>
                    {t('flags.showMoreHistory', {
                      count: String(Math.min(HISTORY_PAGE_SIZE, hiddenHistoryCount)),
                    })}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={styles.emptyStateCard}>
              <Ionicons name="shield-checkmark" size={32} color="#10B981" />
              <Text style={styles.emptyTitle}>{t('flags.emptyHistoryTitle')}</Text>
              <Text style={styles.emptySubtitle}>{t('flags.emptyHistorySubtitle')}</Text>
            </View>
          )}
        </View>

        {/* State Sync Indicator */}
        <View style={styles.syncContainer}>
          <ActivityIndicator color="#A8A29E" size="small" style={styles.syncSpinner} />
          <Text style={styles.syncText}>STATE SYNCED WITH BACKEND: AUTH/APP-STATE</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFDF5',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 64,
    gap: 20,
  },
  monitorCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    padding: 20,
    shadowColor: '#000000',
    shadowOpacity: 0.02,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    color: '#A8A29E',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  countContainer: {
    marginBottom: 16,
  },
  countValue: {
    fontSize: 56,
    fontWeight: '900',
    letterSpacing: -1,
  },
  countLabel: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  recoverySection: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
    paddingVertical: 12,
    marginBottom: 16,
    gap: 6,
  },
  recoveryTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  recoveryText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  progressBar: {
    height: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  checksRemaining: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  cardFooter: {
    borderTopWidth: 1,
    borderColor: '#F1F5F9',
    paddingTop: 12,
    gap: 4,
  },
  gpsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  gpsText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  lastCheckedText: {
    fontSize: 11,
    color: '#94A3B8',
    marginLeft: 22,
  },
  queryCard: {
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
    backgroundColor: '#F0FDF4',
    gap: 8,
  },
  queryTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#166534',
  },
  querySubtitle: {
    fontSize: 12,
    color: '#166534',
    lineHeight: 18,
    opacity: 0.8,
  },
  queryButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#10B981',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 4,
  },
  queryButtonDisabled: {
    opacity: 0.6,
  },
  queryButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  historyContainer: {
    gap: 12,
  },
  historySectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    paddingHorizontal: 4,
  },
  timelineBox: {
    backgroundColor: '#FEFCE8',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(200, 175, 5, 0.2)',
    padding: 16,
    gap: 16,
  },
  timelineList: {
    gap: 0,
  },
  timelineItem: {
    flexDirection: 'row',
    position: 'relative',
  },
  timelineLeftColumn: {
    alignItems: 'center',
    width: 24,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#C8AF05',
    zIndex: 10,
    marginTop: 12,
  },
  timelineLine: {
    position: 'absolute',
    left: 4,
    top: 22,
    bottom: -12,
    width: 2,
    backgroundColor: '#E2E8F0',
  },
  timelineContent: {
    flex: 1,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(200, 175, 5, 0.1)',
    marginLeft: 8,
  },
  timelineContentLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 6,
  },
  iconWrapper: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  itemTextContainer: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  itemTimeAgo: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 2,
  },
  itemDateText: {
    fontSize: 10,
    color: '#94A3B8',
    marginLeft: 38,
  },
  showMoreBtn: {
    flexDirection: 'row',
    alignSelf: 'center',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(200, 175, 5, 0.3)',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 4,
  },
  showMoreBtnText: {
    color: '#5C5000',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyStateCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
  },
  syncContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  syncSpinner: {
    transform: [{ scale: 0.8 }],
  },
  syncText: {
    fontSize: 10,
    color: '#A8A29E',
    fontWeight: '800',
    letterSpacing: 0.8,
  },
});
