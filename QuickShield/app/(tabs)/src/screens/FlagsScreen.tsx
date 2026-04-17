import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';

import type { LocationIntegrityState, LocationIntegrityReason } from '../hooks/useLocationIntegrityMonitor';

type FlagsScreenProps = {
  isActive?: boolean;
  bottomInset?: number;
  locationIntegrity: LocationIntegrityState;
};

const formatReason = (reason: LocationIntegrityReason) => {
  switch (reason) {
    case 'mock_location_detected':
      return { text: 'Mock location provider detected', icon: 'alert-circle' as const };
    case 'teleportation':
      return { text: '2 km+ jump in under 90 seconds', icon: 'location' as const };
    case 'unnatural_velocity_curve':
      return { text: 'Unnatural velocity pattern', icon: 'trending-up' as const };
    case 'outside_working_area':
      return { text: 'Outside 10 km working area', icon: 'warning' as const };
    case 'suspicious_outside_working_area':
      return {
        text: 'Suspicious outside-area case during heavy rain and working hours (claims held 60 mins)',
        icon: 'shield' as const,
      };
    case 'invigilating_location_fluctuation':
      return { text: 'Invigilating: repeated location fluctuations in checks', icon: 'eye' as const };
    case 'account_suspended_location_pattern':
      return { text: 'Account suspended 60 mins (location-change pattern)', icon: 'ban' as const };
    case 'permission_denied':
      return { text: 'Location access denied', icon: 'lock-closed' as const };
    case 'gps_unavailable':
      return { text: 'GPS services disabled', icon: 'alert-circle' as const };
    case 'location_error':
      return { text: 'Location read failed', icon: 'alert-circle' as const };
    default:
      return { text: reason, icon: 'alert-circle' as const };
  }
};

const formatDetectionTime = (timestamp: number) => {
  const date = new Date(timestamp);
  return date.toLocaleString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: '2-digit',
    month: 'short',
  });
};

const formatTimeAgo = (timestamp: number) => {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);

  if (diffSeconds < 60) {
    return `${diffSeconds}s ago`;
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  return formatDetectionTime(timestamp);
};

export default function FlagsScreen({ bottomInset = 40, locationIntegrity }: FlagsScreenProps) {
  const isFlagged = locationIntegrity.isFlagged;
  const flagLevel = locationIntegrity.flagLevel;
  const isYellowFlag = flagLevel === 'yellow';
  const isRedFlag = flagLevel === 'red';
  const isGreenFlag = flagLevel === 'green';
  const checksLeft = Math.max(0, 5 - locationIntegrity.consecutiveInnerRadiusPoints);
  // Sort history by most recent first
  const sortedHistory = [...locationIntegrity.history].reverse();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0F" />

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomInset }]} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View>
              <Text style={styles.eyebrow}>Flags</Text>
              <Text style={styles.title}>Working Area Monitor</Text>
            </View>
            <View
              style={[
                styles.badge,
                isRedFlag
                  ? styles.badgeDanger
                  : isYellowFlag
                    ? styles.badgeWarning
                    : isGreenFlag
                      ? styles.badgeRecovery
                      : styles.badgeSafe,
              ]}
            >
              <Ionicons
                name={isFlagged ? 'warning' : 'checkmark-circle'}
                size={16}
                color={
                  isRedFlag
                    ? '#FCA5A5'
                    : isYellowFlag
                      ? '#FDE68A'
                      : isGreenFlag
                        ? '#86EFAC'
                        : '#86EFAC'
                }
              />
              <Text style={styles.badgeText}>
                {isRedFlag ? 'Red Flag' : isYellowFlag ? 'Yellow Flag' : isGreenFlag ? 'Recovered' : 'Normal'}
              </Text>
            </View>
          </View>

          <View style={styles.countRow}>
            <Text style={styles.countValue}>{locationIntegrity.redFlagCount}</Text>
            <Text style={styles.countLabel}>working-area breaches detected in this session</Text>
          </View>

          {(isRedFlag || isGreenFlag) && (
            <View style={styles.recoveryRow}>
              <Text style={styles.recoveryLabel}>Recovery Progress</Text>
              <Text style={styles.recoveryText}>
                {locationIntegrity.consecutiveInnerRadiusPoints} / 5 checks completed
              </Text>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${(locationIntegrity.consecutiveInnerRadiusPoints / 5) * 100}%`,
                      backgroundColor: isGreenFlag ? '#86EFAC' : '#FCA5A5',
                    },
                  ]}
                />
              </View>
              <Text style={styles.checksLeft}>
                {checksLeft === 0 ? '✓ Fully recovered' : `${checksLeft} check${checksLeft !== 1 ? 's' : ''} remaining`}
              </Text>
            </View>
          )}

          <Text style={styles.summary}>{locationIntegrity.statusText}</Text>
          <Text style={styles.meta}>Last checked: {formatDetectionTime(locationIntegrity.lastCheckedAt ?? Date.now())}</Text>
        </View>

        <View style={styles.historySection}>
          <Text style={styles.historyTitle}>Detection History</Text>
          {sortedHistory.length > 0 ? (
            <View style={styles.timelineContainer}>
              {sortedHistory.map((entry, index) => {
                const reason = formatReason(entry.reason);
                const isLast = index === sortedHistory.length - 1;
                return (
                  <View key={`${entry.detectedAt}-${index}`} style={[styles.timelineItem, isLast && styles.timelineItemLast]}>
                    <View style={styles.timelineDot} />
                    {!isLast && <View style={styles.timelineLine} />}
                    
                    <View style={styles.timelineContent}>
                      <View style={styles.flagEntryHeader}>
                        <View style={styles.flagEntryIcon}>
                          <Ionicons name={reason.icon} size={16} color="#FDE68A" />
                        </View>
                        <View style={styles.flagEntryInfo}>
                          <Text style={styles.flagEntryReason}>{reason.text}</Text>
                          <Text style={styles.flagEntryTime}>{formatTimeAgo(entry.detectedAt)}</Text>
                        </View>
                      </View>
                      <Text style={styles.flagEntryTimestamp}>{formatDetectionTime(entry.detectedAt)}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="shield-checkmark-outline" size={32} color="#86EFAC" />
              <Text style={styles.emptyText}>No working-area breaches detected yet.</Text>
              <Text style={styles.emptySubtext}>Rider is inside the 10 km working area.</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
    paddingHorizontal: 20,
  },
  content: {
    paddingTop: 60,
  },
  heroCard: {
    backgroundColor: '#13131A',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#2A3649',
    padding: 20,
    marginBottom: 24,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 18,
  },
  eyebrow: {
    color: '#FDE68A',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
  },
  badgeSafe: {
    backgroundColor: '#0C2B1F',
    borderColor: '#14532D',
  },
  badgeRecovery: {
    backgroundColor: '#0F3B2E',
    borderColor: '#1DAA6E',
  },
  badgeWarning: {
    backgroundColor: '#3D2F0C',
    borderColor: '#92400E',
  },
  badgeDanger: {
    backgroundColor: '#321118',
    borderColor: '#7F1D1D',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  countRow: {
    marginBottom: 12,
  },
  countValue: {
    color: '#FFFFFF',
    fontSize: 44,
    fontWeight: '900',
    letterSpacing: -1.2,
  },
  countLabel: {
    color: '#8FAECC',
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  recoveryRow: {
    marginVertical: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: '#2A3649',
    borderBottomColor: '#2A3649',
  },
  recoveryLabel: {
    color: '#8FAECC',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  recoveryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 10,
  },
  progressBar: {
    height: 6,
    backgroundColor: '#1C2432',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  checksLeft: {
    color: '#D1D5DB',
    fontSize: 12,
    fontWeight: '500',
  },
  summary: {
    color: '#D1D5DB',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 6,
  },
  meta: {
    color: '#7A8597',
    fontSize: 12,
  },
  historySection: {
    marginBottom: 20,
  },
  historyTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 16,
  },
  timelineContainer: {
    backgroundColor: '#11141B',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1C2432',
    overflow: 'hidden',
  },
  timelineItem: {
    flexDirection: 'row',
    paddingLeft: 20,
    paddingRight: 16,
    paddingVertical: 16,
    position: 'relative',
  },
  timelineItemLast: {
    borderBottomWidth: 0,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 999,
    backgroundColor: '#FDE68A',
    marginRight: 16,
    marginTop: 2,
    zIndex: 2,
  },
  timelineLine: {
    position: 'absolute',
    left: 25,
    top: 28,
    bottom: -16,
    width: 2,
    backgroundColor: '#2A3F54',
  },
  timelineContent: {
    flex: 1,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1C2432',
  },
  flagEntryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
  },
  flagEntryIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#1F2937',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flagEntryInfo: {
    flex: 1,
  },
  flagEntryReason: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  flagEntryTime: {
    color: '#8FAECC',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  flagEntryTimestamp: {
    color: '#7A8597',
    fontSize: 11,
    marginLeft: 38,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  emptyText: {
    color: '#D1D5DB',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptySubtext: {
    color: '#8FAECC',
    fontSize: 13,
    textAlign: 'center',
  },
});
