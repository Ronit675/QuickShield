import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  SafeAreaView,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import {
  connectSelectedPlatform,
  disconnectSelectedPlatform,
  updateSelectedPlatform,
} from '../services/auth.service';
import { getRainDisruptionTrackingState } from '../services/rain-disruption.service';
import type { PolicyClaim, PolicySummary } from '../types/policy';

const PLATFORMS_CONFIG = [
  {
    id: 'blinkit',
    label: 'Blinkit',
    icon: 'cart-outline',
    logoUrl: null,
    tint: '#F59E0B',
  },
  {
    id: 'zepto',
    label: 'Zepto',
    icon: 'bicycle-outline',
    logoUrl: null,
    tint: '#A855F7',
  },
  {
    id: 'swiggy',
    label: 'Swiggy',
    icon: 'restaurant-outline',
    logoUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBN0naqqhRAKCEWNqUz5tNbNreyqiLryM_pIV2bdTXRrGvJwsBEdm0sVqg3n2u-wX2NynrfQmGD0ACVt2YogbWfnQ5S2iYyqdKMy-3HWz-G485K97WbgM6JtRDa0e_YRt_7tFHdW1h2FsinGEQgLUKm2Trkl3He1MCROibWqLWnRZA1BBWozyhafkn-OaIsQqvCbTLDpOM6ZV2su7tkKNZq4khA2NRCwAiniYQGhmEptuouTqJF7cCMy007X0SnB26cLGwhyNA-VEwc',
    tint: '#FF6B35',
  },
  {
    id: 'jio_mart',
    label: 'Jio Mart',
    icon: 'storefront-outline',
    logoUrl: null,
    tint: '#EF4444',
  },
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

const getWalletBalance = (claims: PolicyClaim[] = []) =>
  claims
    .filter((claim) => claim.status === 'paid' || claim.status === 'auto_approved')
    .reduce((claimSum, claim) => claimSum + claim.payoutAmount, 0);

const formatCurrency = (value: number) =>
  `₹${value.toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : value < 1 ? 4 : 2,
    maximumFractionDigits: value < 1 ? 4 : 2,
  })}`;

export default function PlatformConnectScreen() {
  const { user, setUser } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [connectingPlatformId, setConnectingPlatformId] = useState<string | null>(null);
  const [disconnectingPlatform, setDisconnectingPlatform] = useState(false);
  const [isShiftExpanded, setIsShiftExpanded] = useState(false);

  const currentPlatformId = user?.platform;
  const hasWorkingShift = typeof user?.workingHours === 'number' && !!user?.workingShiftLabel;

  const workingZone = user?.serviceZone
    ? user.serviceZone
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
    : 'Not selected';

  const workingTimeSlots = user?.workingTimeSlots ?? [];
  const visibleTimeSlots = isShiftExpanded ? workingTimeSlots : workingTimeSlots.slice(0, 4);
  const hiddenSlotCount = Math.max(0, workingTimeSlots.length - visibleTimeSlots.length);

  const fetchActivePolicy = async () => {
    const activePolicyResponse = await api.get('/policy/active');
    return activePolicyResponse.data as PolicySummary | null;
  };

  const handleConnect = async (platformId: string) => {
    if (!user) {
      return;
    }

    setConnectingPlatformId(platformId);
    try {
      // Step 1: If switching to a different platform, update it first on the backend
      if (platformId !== user.platform) {
        const updatedUser = await updateSelectedPlatform(platformId);
        setUser({
          ...updatedUser,
          avgDailyIncome: null,
          workingHours: null,
          workingShiftLabel: null,
          workingTimeSlots: null,
        });
      }

      // Step 2: Call connectSelectedPlatform to get mock shift data
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
        'Platform connected',
        `${formatPlatformName(platformId)} details successfully allocated.\nAverage daily income: Rs ${payload.averageDailyIncome}\nShift: ${payload.workingShiftLabel} (${payload.workingHours} hrs)`,
      );
    } catch (err: any) {
      Alert.alert(
        'Could not connect platform',
        err.response?.data?.message || err.message || 'Please try again.',
      );
    } finally {
      setConnectingPlatformId(null);
    }
  };

  const handlePlatformPress = async (platformId: string) => {
    if (!user) return;

    // If it's already active and connected, do nothing
    if (platformId === user.platform && hasWorkingShift) {
      return;
    }

    try {
      const activePolicy = await fetchActivePolicy();
      const trackingState = await getRainDisruptionTrackingState(user);
      const walletBalance = getWalletBalance(activePolicy?.claims ?? []);

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

      if (trackingState.isTracking && activePolicy?.status === 'active') {
        Alert.alert(
          'Platform cannot be changed',
          'You cannot change the platform while a disruption window is being tracked for an active premium plan. Wait for the timer card to stop before switching platforms.',
        );
        return;
      }

      // If active shift is already connected to another platform, show switch warning
      if (hasWorkingShift && platformId !== user.platform) {
        Alert.alert(
          'Change platform',
          'Connecting to a new platform will disconnect your current active shift and clear its rider details. Do you want to continue?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Change platform',
              style: 'destructive',
              onPress: () => {
                void handleConnect(platformId);
              },
            },
          ],
        );
        return;
      }

      // If just onboarding selection is active or no shift is connected, connect immediately
      await handleConnect(platformId);
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

    try {
      const activePolicy = await fetchActivePolicy();
      const trackingState = await getRainDisruptionTrackingState(user);

      if (trackingState.isTracking && activePolicy?.status === 'active') {
        Alert.alert(
          'Platform cannot be disconnected',
          'You cannot disconnect the platform while a disruption window is being tracked for an active premium plan. Wait for the timer card to stop before disconnecting.',
        );
        return;
      }

      if (activePolicy?.status === 'active') {
        Alert.alert(
          'Remove active premium first',
          'You must cancel the active premium calculation from the premium section before disconnecting this platform.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Go to premium',
              onPress: () => {
                router.replace({
                  pathname: '/home',
                  params: { tab: 'premium' },
                });
              },
            },
          ],
        );
        return;
      }

      setDisconnectingPlatform(true);
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

  const linkedPlatform = PLATFORMS_CONFIG.find((p) => p.id === currentPlatformId);

  return (
    <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFBFF" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back" size={24} color="#736400" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Connect Platform</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.subtitle}>
          This test flow assigns mock average daily income plus rider working hours and hourly time slots for your selected q-commerce platform.
        </Text>

        {/* Linked Platforms Section (Only if connected) */}
        {hasWorkingShift && linkedPlatform && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Linked Platforms</Text>
            <View style={styles.linkedCard}>
              <View style={styles.linkedInfoRow}>
                <View style={styles.logoContainer}>
                  {linkedPlatform.logoUrl ? (
                    <Image source={{ uri: linkedPlatform.logoUrl }} style={styles.logoImage} />
                  ) : (
                    <View style={[styles.logoPlaceholder, { backgroundColor: linkedPlatform.tint }]}>
                      <Ionicons name={linkedPlatform.icon as any} size={24} color="#FFFFFF" />
                    </View>
                  )}
                </View>
                <View style={styles.linkedMeta}>
                  <Text style={styles.linkedName}>{linkedPlatform.label}</Text>
                  <View style={styles.statusLabelRow}>
                    <View style={styles.statusDot} />
                    <Text style={styles.statusLabelText}>Current Primary Platform</Text>
                  </View>
                </View>
              </View>
              <View style={styles.badgeContainer}>
                <View style={styles.activeBadge}>
                  <Text style={styles.activeBadgeText}>ACTIVE</Text>
                </View>
              </View>
            </View>

            {/* Disconnect platform Button */}
            <TouchableOpacity
              style={[styles.disconnectButton, disconnectingPlatform && styles.buttonDisabled]}
              onPress={handleDisconnect}
              activeOpacity={0.85}
              disabled={disconnectingPlatform}
            >
              {disconnectingPlatform ? (
                <ActivityIndicator color="#BE2D06" />
              ) : (
                <>
                  <Ionicons name="log-out-outline" size={18} color="#BE2D06" />
                  <Text style={styles.disconnectButtonText}>Disconnect platform</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Mock shift details (Only if connected) */}
        {hasWorkingShift && (
          <View style={styles.section}>
            <View style={styles.shiftCard}>
              <Text style={styles.shiftCardHeader}>Mock Shift Allocated</Text>
              
              <View style={styles.shiftStatsRow}>
                <View style={styles.shiftStatBlock}>
                  <Text style={styles.shiftStatLabel}>Daily average income</Text>
                  <Text style={styles.shiftStatValue}>₹{user?.avgDailyIncome ?? 0}</Text>
                </View>
                <View style={styles.shiftDivider} />
                <View style={styles.shiftStatBlock}>
                  <Text style={styles.shiftStatLabel}>Working zone</Text>
                  <Text style={styles.shiftStatValueSmall}>{workingZone}</Text>
                </View>
              </View>

              <View style={styles.shiftDetailBox}>
                <Text style={styles.shiftDetailLabel}>Fetched rider shift</Text>
                <Text style={styles.shiftDetailValue}>{user?.workingShiftLabel}</Text>
                <Text style={styles.shiftDetailMeta}>{user?.workingHours} working hours</Text>

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

              <Text style={styles.shiftDisclaimer}>
                Mock allocation only. Each connect generates a random average daily income and a rider shift between 3 and 14 working hours.
              </Text>
            </View>
          </View>
        )}

        {/* Available Platforms Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Available Platforms</Text>
          <View style={styles.availableList}>
            {PLATFORMS_CONFIG.map((platform) => {
              const isLinked = platform.id === currentPlatformId && hasWorkingShift;
              const isConnecting = connectingPlatformId === platform.id;

              return (
                <View
                  key={platform.id}
                  style={[styles.platformRowCard, isLinked && styles.platformRowCardLinked]}
                >
                  <View style={styles.rowLeft}>
                    <View style={styles.rowLogoContainer}>
                      {platform.logoUrl ? (
                        <Image source={{ uri: platform.logoUrl }} style={styles.logoImageSmall} />
                      ) : (
                        <View style={[styles.rowLogoPlaceholder, { backgroundColor: '#FFFCCB' }]}>
                          <Ionicons name={platform.icon as any} size={20} color="#736400" />
                        </View>
                      )}
                    </View>
                    <Text style={styles.platformName}>{platform.label}</Text>
                  </View>

                  {isLinked ? (
                    <View style={styles.linkedIndicator}>
                      <Ionicons name="checkmark-circle" size={18} color="#696710" />
                      <Text style={styles.linkedIndicatorText}>Linked</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[styles.connectButton, isConnecting && styles.buttonDisabled]}
                      onPress={() => handlePlatformPress(platform.id)}
                      activeOpacity={0.85}
                      disabled={connectingPlatformId !== null || disconnectingPlatform}
                    >
                      {isConnecting ? (
                        <ActivityIndicator color="#5C5000" size="small" />
                      ) : (
                        <>
                          <Ionicons name="link-outline" size={14} color="#5C5000" />
                          <Text style={styles.connectButtonText}>Connect</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        </View>

        {/* Information Bento Cards */}
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
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFBFF',
  },
  header: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: '#FFFBFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E4E4E7',
    gap: 12,
  },
  backButton: {
    padding: 6,
    borderRadius: 20,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#736400',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 24,
    gap: 24,
    paddingBottom: 48,
  },
  subtitle: {
    fontSize: 14,
    color: '#696710',
    lineHeight: 20,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#3B3A00',
    paddingHorizontal: 4,
  },
  linkedCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#FFDF00',
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#736400',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  linkedInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    flex: 1,
  },
  logoContainer: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#F4F4F5',
    overflow: 'hidden',
  },
  logoImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  logoPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  linkedMeta: {
    flex: 1,
    gap: 4,
  },
  linkedName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#3B3A00',
  },
  statusLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#5E6A32',
  },
  statusLabelText: {
    fontSize: 12,
    color: '#696710',
  },
  badgeContainer: {
    alignItems: 'flex-end',
  },
  activeBadge: {
    backgroundColor: '#EFFEB7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: 'rgba(94, 106, 50, 0.2)',
  },
  activeBadgeText: {
    color: '#45501b',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  disconnectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: '#BE2D06',
    borderRadius: 12,
    paddingVertical: 12,
    backgroundColor: '#FFFBFF',
  },
  disconnectButtonText: {
    color: '#BE2D06',
    fontSize: 14,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  shiftCard: {
    backgroundColor: '#FFFCCB',
    borderWidth: 1,
    borderColor: '#C0BD5F',
    borderRadius: 20,
    padding: 20,
    gap: 16,
  },
  shiftCardHeader: {
    fontSize: 12,
    fontWeight: '800',
    color: '#5C5000',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  shiftStatsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  shiftStatBlock: {
    flex: 1,
  },
  shiftDivider: {
    width: 1,
    backgroundColor: '#C0BD5F',
    marginHorizontal: 16,
    opacity: 0.5,
  },
  shiftStatLabel: {
    fontSize: 12,
    color: '#696710',
    marginBottom: 6,
  },
  shiftStatValue: {
    fontSize: 24,
    fontWeight: '900',
    color: '#3B3A00',
  },
  shiftStatValueSmall: {
    fontSize: 15,
    fontWeight: '700',
    color: '#3B3A00',
    lineHeight: 20,
  },
  shiftDetailBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(192, 189, 95, 0.3)',
    padding: 16,
  },
  shiftDetailLabel: {
    fontSize: 11,
    color: '#696710',
    marginBottom: 4,
  },
  shiftDetailValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#3B3A00',
    marginBottom: 2,
  },
  shiftDetailMeta: {
    fontSize: 13,
    color: '#696710',
    marginBottom: 12,
  },
  timeSlotWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  timeSlotChip: {
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#ECE942',
    borderWidth: 1,
    borderColor: 'rgba(115, 100, 0, 0.2)',
  },
  timeSlotText: {
    color: '#5C5000',
    fontSize: 11,
    fontWeight: '700',
  },
  expandShiftBtn: {
    marginTop: 12,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    borderWidth: 1,
    borderColor: 'rgba(192, 189, 95, 0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 99,
  },
  expandShiftBtnText: {
    color: '#696710',
    fontSize: 11,
    fontWeight: '700',
  },
  shiftDisclaimer: {
    fontSize: 12,
    color: '#696710',
    lineHeight: 18,
    opacity: 0.8,
  },
  availableList: {
    gap: 12,
  },
  platformRowCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.02,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  platformRowCardLinked: {
    opacity: 0.8,
    backgroundColor: '#F4F4F5',
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowLogoContainer: {
    width: 44,
    height: 44,
    borderRadius: 10,
    overflow: 'hidden',
  },
  logoImageSmall: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  rowLogoPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(192, 189, 95, 0.2)',
  },
  platformName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#3B3A00',
  },
  linkedIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: '#E4E4E7',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#FFFFFF',
  },
  linkedIndicatorText: {
    color: '#696710',
    fontSize: 13,
    fontWeight: '700',
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFDF00',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    shadowColor: '#736400',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  connectButtonText: {
    color: '#5C5000',
    fontSize: 13,
    fontWeight: '800',
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E4E4E7',
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#3B3A00',
  },
  infoText: {
    fontSize: 13,
    color: '#696710',
    lineHeight: 18,
  },
});
