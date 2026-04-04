import React, { useMemo, useState } from 'react';
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
import { router } from 'expo-router';

import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import {
  connectSelectedPlatform,
  disconnectSelectedPlatform,
  updateSelectedPlatform,
} from '../services/auth.service';
import type { PolicySummary } from '../types/policy';

const PLATFORMS = [
  { id: 'zepto', label: 'Zepto', tint: '#A855F7' },
  { id: 'blinkit', label: 'Blinkit', tint: '#F59E0B' },
  { id: 'swiggy', label: 'Swiggy', tint: '#FF6B35' },
  { id: 'zomato', label: 'Zomato', tint: '#EF4444' },
];

const formatPlatformName = (platform: string | null) => {
  if (!platform) {
    return 'your q-commerce platform';
  }

  return platform
    .split(/[_-]/g)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const getWalletBalance = (policies: PolicySummary[]) =>
  policies.reduce((policySum, policy) => (
    policySum + (policy.claims ?? [])
      .filter((claim) => claim.status === 'paid' || claim.status === 'auto_approved')
      .reduce((claimSum, claim) => claimSum + claim.payoutAmount, 0)
  ), 0);

const formatCurrency = (value: number) =>
  `₹${value.toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : value < 1 ? 4 : 2,
    maximumFractionDigits: value < 1 ? 4 : 2,
  })}`;

export default function PlatformConnectScreen() {
  const { user, setUser } = useAuth();
  const [selectedPlatform, setSelectedPlatform] = useState(user?.platform ?? null);
  const [updatingPlatform, setUpdatingPlatform] = useState(false);
  const [connectingPlatform, setConnectingPlatform] = useState(false);
  const [disconnectingPlatform, setDisconnectingPlatform] = useState(false);
  const [isShiftExpanded, setIsShiftExpanded] = useState(false);

  const hasPlatformChanged = selectedPlatform !== user?.platform;
  const selectedPlatformLabel = useMemo(
    () => formatPlatformName(selectedPlatform),
    [selectedPlatform],
  );
  const workingZone = user?.serviceZone
    ? user.serviceZone
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
    : 'Not selected';
  const workingTimeSlots = user?.workingTimeSlots ?? [];
  const hasWorkingShift = typeof user?.workingHours === 'number' && !!user?.workingShiftLabel;
  const visibleTimeSlots = isShiftExpanded ? workingTimeSlots : workingTimeSlots.slice(0, 4);
  const hiddenSlotCount = Math.max(0, workingTimeSlots.length - visibleTimeSlots.length);

  const handleConnect = async () => {
    if (!user) {
      return;
    }

    setConnectingPlatform(true);
    try {
      const payload = await connectSelectedPlatform();
      setIsShiftExpanded(false);

      setUser({
        ...payload.user,
        avgDailyIncome: payload.averageDailyIncome,
        workingHours: payload.workingHours,
        workingShiftLabel: payload.workingShiftLabel,
        workingTimeSlots: payload.workingTimeSlots,
      });

      Alert.alert(
        'Mock rider data allocated',
        `${selectedPlatformLabel} income: Rs ${payload.averageDailyIncome}\nShift: ${payload.workingShiftLabel} (${payload.workingHours} hrs)`,
      );
    } catch (err: any) {
      Alert.alert(
        'Could not allocate mock rider data',
        err.response?.data?.message || err.message || 'Please try again.',
      );
    } finally {
      setConnectingPlatform(false);
    }
  };

  const performPlatformChange = async () => {
    if (!selectedPlatform) {
      return;
    }

    setUpdatingPlatform(true);
    try {
      const updatedUser = await updateSelectedPlatform(selectedPlatform);
      setIsShiftExpanded(false);
      setUser({
        ...updatedUser,
        avgDailyIncome: null,
        workingHours: null,
        workingShiftLabel: null,
        workingTimeSlots: null,
      });
      Alert.alert(
        'Platform updated',
        `${formatPlatformName(selectedPlatform)} is now your selected platform. Rider details were cleared and the current premium plan was removed if one was active.`,
      );
    } catch (err: any) {
      Alert.alert('Could not update platform', err.response?.data?.message || err.message || 'Please try again.');
    } finally {
      setUpdatingPlatform(false);
    }
  };

  const handlePlatformChange = async () => {
    if (!selectedPlatform || !hasPlatformChanged) {
      return;
    }

    try {
      const [activePolicyResponse, historyResponse] = await Promise.all([
        api.get('/policy/active'),
        api.get('/policy/history'),
      ]);

      const activePolicy = activePolicyResponse.data as PolicySummary | null;
      const history = Array.isArray(historyResponse.data) ? historyResponse.data as PolicySummary[] : [];
      const walletBalance = getWalletBalance(history);

      if (walletBalance > 0) {
        Alert.alert(
          'Redeem wallet balance first',
          `You still have ${formatCurrency(walletBalance)} in the wallet. Redeem the payment before changing your q-commerce platform.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Go to home',
              onPress: () => {
                router.replace('/home');
              },
            },
          ],
        );
        return;
      }

      if (activePolicy?.status === 'active') {
        Alert.alert(
          'Active premium plan found',
          'Changing the platform will clear the current rider details and you may lose the active premium plan. Do you want to continue?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Change platform',
              style: 'destructive',
              onPress: () => {
                void performPlatformChange();
              },
            },
          ],
        );
        return;
      }

      await performPlatformChange();
    } catch (err: any) {
      Alert.alert(
        'Could not verify platform change',
        err.response?.data?.message || err.message || 'Please try again.',
      );
    }
  };

  const handleDisconnect = async () => {
    if (!user) {
      return;
    }

    setDisconnectingPlatform(true);
    try {
      const payload = await disconnectSelectedPlatform();
      setIsShiftExpanded(false);

      setUser({
        ...payload.user,
        avgDailyIncome: null,
        workingHours: null,
        workingShiftLabel: null,
        workingTimeSlots: null,
      });
      Alert.alert('Mock rider data cleared', 'The test average income and rider shift have been removed.');
    } catch (err: any) {
      Alert.alert(
        'Could not clear working hours',
        err.response?.data?.message || err.message || 'Please try again.',
      );
    } finally {
      setDisconnectingPlatform(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0F" />
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.85}>
          <Text style={styles.backBtnText}>Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Connect platform</Text>
        <Text style={styles.subtitle}>
          This test flow assigns mock average daily income plus rider working hours and hourly time slots for your selected q-commerce platform.
        </Text>

        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>Selected platform</Text>
          <Text style={styles.heroValue}>{selectedPlatformLabel}</Text>
          <Text style={styles.heroMeta}>Chosen during onboarding</Text>
        </View>

        {!hasWorkingShift && (
          <TouchableOpacity
            style={[styles.primaryBtn, connectingPlatform && styles.primaryBtnDisabled]}
            onPress={handleConnect}
            activeOpacity={0.85}
            disabled={connectingPlatform || disconnectingPlatform}
          >
            {connectingPlatform ? (
              <ActivityIndicator color="#08110F" />
            ) : (
              <Text style={styles.primaryBtnText}>Connect {selectedPlatformLabel}</Text>
            )}
          </TouchableOpacity>
        )}

        {hasWorkingShift && (
          <View style={styles.connectedCard}>
            <Text style={styles.connectedEyebrow}>Mock shift ready</Text>
            <Text style={styles.connectedTitle}>Rider working hours assigned</Text>

            <View style={styles.connectedStats}>
              <View style={styles.connectedStatBlock}>
                <Text style={styles.connectedStatLabel}>Daily average income</Text>
                <Text style={styles.connectedStatValue}>Rs {user?.avgDailyIncome ?? 0}</Text>
              </View>
              <View style={styles.connectedDivider} />
              <View style={styles.connectedStatBlock}>
                <Text style={styles.connectedStatLabel}>Working zone</Text>
                <Text style={styles.connectedStatValueSmall}>{workingZone}</Text>
              </View>
            </View>

            {hasWorkingShift && (
              <View style={styles.shiftCard}>
                <Text style={styles.shiftCardLabel}>Fetched rider shift</Text>
                <Text style={styles.shiftCardValue}>{user?.workingShiftLabel}</Text>
                <Text style={styles.shiftCardMeta}>{user?.workingHours} working hours</Text>

                <View style={styles.timeSlotWrap}>
                  {visibleTimeSlots.map((slot) => (
                    <View key={slot} style={styles.timeSlotChip}>
                      <Text style={styles.timeSlotText}>{slot}</Text>
                    </View>
                  ))}
                </View>

                {workingTimeSlots.length > 4 && (
                  <TouchableOpacity
                    style={styles.expandShiftBtn}
                    onPress={() => setIsShiftExpanded((current) => !current)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.expandShiftBtnText}>
                      {isShiftExpanded ? 'Show fewer slots' : `Show +${hiddenSlotCount} more slots`}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            <Text style={styles.connectedMeta}>
              Mock allocation only. Each connect generates a random average daily income and a rider shift between 3 and 14 working hours.
            </Text>

            <TouchableOpacity
              style={[styles.disconnectBtn, disconnectingPlatform && styles.disconnectBtnDisabled]}
              onPress={handleDisconnect}
              activeOpacity={0.85}
              disabled={disconnectingPlatform || connectingPlatform}
            >
              {disconnectingPlatform ? (
                <ActivityIndicator color="#FCA5A5" />
              ) : (
            <Text style={styles.disconnectBtnText}>Disconnect platform</Text>
          )}
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>What connect does now</Text>
          <Text style={styles.infoText}>
            Connect now skips verification and allocates random mock rider data: average daily income plus a shift made of hourly time slots.
          </Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Change q-commerce platform</Text>
          <Text style={styles.infoText}>
            If you shift from one platform to another, update it here and the app will use the new selection going forward.
          </Text>

          <View style={styles.platformGrid}>
            {PLATFORMS.map((platform) => {
              const selected = selectedPlatform === platform.id;

              return (
                <TouchableOpacity
                  key={platform.id}
                  style={[
                    styles.platformCard,
                    selected && { borderColor: platform.tint, backgroundColor: `${platform.tint}14` },
                  ]}
                  onPress={() => setSelectedPlatform(platform.id)}
                  activeOpacity={0.85}
                >
                  <View style={[styles.platformDot, { backgroundColor: platform.tint }]} />
                  <Text style={styles.platformCardLabel}>{platform.label}</Text>
                  <Text style={styles.platformCardMeta}>
                    {selected ? 'Selected' : 'Tap to choose'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={[styles.secondaryBtn, (!hasPlatformChanged || updatingPlatform) && styles.secondaryBtnDisabled]}
            onPress={handlePlatformChange}
            disabled={!hasPlatformChanged || updatingPlatform}
            activeOpacity={0.85}
          >
            {updatingPlatform ? (
              <ActivityIndicator color="#08110F" />
            ) : (
              <Text style={styles.secondaryBtnText}>Change platform</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 40,
  },
  backBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#202634',
    backgroundColor: '#111723',
    marginBottom: 18,
  },
  backBtnText: {
    color: '#D1D5DB',
    fontSize: 13,
    fontWeight: '600',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: '#7A8597',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 24,
  },
  heroCard: {
    backgroundColor: '#11141B',
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1C2432',
    marginBottom: 16,
  },
  heroLabel: {
    color: '#7A8597',
    fontSize: 12,
    marginBottom: 8,
  },
  heroValue: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 6,
  },
  heroMeta: {
    color: '#00E5A0',
    fontSize: 13,
    fontWeight: '600',
  },
  connectedCard: {
    marginTop: 18,
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: '#00E5A033',
    backgroundColor: '#0F1F18',
  },
  connectedEyebrow: {
    color: '#00E5A0',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  connectedTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 18,
  },
  connectedStats: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: 16,
  },
  connectedStatBlock: {
    flex: 1,
  },
  connectedDivider: {
    width: 1,
    backgroundColor: '#1E2E26',
    marginHorizontal: 14,
  },
  connectedStatLabel: {
    color: '#8BA798',
    fontSize: 12,
    marginBottom: 8,
  },
  connectedStatValue: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
  },
  connectedStatValueSmall: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
  },
  connectedMeta: {
    color: '#9CA3AF',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 18,
  },
  shiftCard: {
    borderRadius: 18,
    padding: 16,
    backgroundColor: '#11261D',
    borderWidth: 1,
    borderColor: '#1E3A2F',
    marginBottom: 16,
  },
  shiftCardLabel: {
    color: '#8BA798',
    fontSize: 12,
    marginBottom: 8,
  },
  shiftCardValue: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 6,
  },
  shiftCardMeta: {
    color: '#CDE7DA',
    fontSize: 13,
    marginBottom: 14,
  },
  timeSlotWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  timeSlotChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: '#193528',
    borderWidth: 1,
    borderColor: '#275440',
  },
  timeSlotText: {
    color: '#E5F6EC',
    fontSize: 12,
    fontWeight: '600',
  },
  expandShiftBtn: {
    marginTop: 12,
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#102017',
    borderWidth: 1,
    borderColor: '#1E3A2F',
  },
  expandShiftBtnText: {
    color: '#9DB8AB',
    fontSize: 12,
    fontWeight: '700',
  },
  infoCard: {
    backgroundColor: '#13131A',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#1E1E2E',
    marginTop: 18,
  },
  infoTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  infoText: {
    color: '#7A8597',
    fontSize: 14,
    lineHeight: 20,
  },
  platformGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 16,
  },
  platformCard: {
    width: '47%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#232C3A',
    backgroundColor: '#10151E',
    padding: 16,
  },
  platformDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginBottom: 12,
  },
  platformCardLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  platformCardMeta: {
    color: '#7A8597',
    fontSize: 12,
  },
  primaryBtn: {
    height: 56,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#00E5A0',
  },
  primaryBtnDisabled: {
    opacity: 0.65,
  },
  primaryBtnText: {
    color: '#08110F',
    fontSize: 16,
    fontWeight: '700',
  },
  disconnectBtn: {
    marginTop: 14,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#7F1D1D',
    backgroundColor: '#2A1115',
  },
  disconnectBtnDisabled: {
    opacity: 0.65,
  },
  disconnectBtnText: {
    color: '#FCA5A5',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryBtn: {
    marginTop: 16,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#00E5A0',
  },
  secondaryBtnDisabled: {
    opacity: 0.45,
  },
  secondaryBtnText: {
    color: '#08110F',
    fontSize: 14,
    fontWeight: '700',
  },
});
