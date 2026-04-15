import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, View, Text, TouchableOpacity, StyleSheet,
  StatusBar, ScrollView, RefreshControl, ActivityIndicator, Switch,
} from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { getIncompleteProfileFields, isProfileComplete, signOut } from '../services/auth.service';
import { getRainDisruptionTrackingState } from '../services/rain-disruption.service';
import ProfileAvatar from '../components/ProfileAvatar';
import QuickShieldSidebar from '../components/QuickShieldSidebar';
import RainDisruptionCard from '../components/RainDisruptionCard';
import WeatherCard from '../components/WeatherCard';
import { useLanguage } from '../directory/Languagecontext';
import type { PolicySummary } from '../types/policy';

type HomeScreenProps = {
  isActive?: boolean;
  bottomInset?: number;
  variant?: 'home' | 'premium';
  onOpenPremium?: () => void;
};

const TRIGGER_LABELS: Record<string, string> = {
  rain: '🌧 Heavy rain',
  app_outage: '📵 App outage',
  zone_closure: '🚧 Zone closure',
};

const formatPlatformName = (platform: string | null) => {
  if (!platform) {
    return 'platform';
  }

  return platform
    .split(/[_-]/g)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

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

export default function HomeScreen({
  isActive = false,
  bottomInset = 40,
  variant = 'home',
  onOpenPremium,
}: HomeScreenProps) {
  const { user, setUser } = useAuth();
  const { t } = useLanguage();
  const [policy, setPolicy] = useState<PolicySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profileMenuVisible, setProfileMenuVisible] = useState(false);
  const [removingPolicy, setRemovingPolicy] = useState(false);
  const [autoRenewEnabled, setAutoRenewEnabled] = useState(false);
  const [updatingAutoRenew, setUpdatingAutoRenew] = useState(false);
  const [miniTrackingLoading, setMiniTrackingLoading] = useState(true);
  const [miniIsTracking, setMiniIsTracking] = useState(false);
  const [miniTrackedStartMs, setMiniTrackedStartMs] = useState<number | null>(null);
  const [miniWeatherSummary, setMiniWeatherSummary] = useState(t('home.waitingDisruption'));
  const [miniClockMs, setMiniClockMs] = useState(Date.now());

  const fetchPolicy = useCallback(async () => {
    try {
      const res = await api.get('/policy/active');
      setPolicy(res.data);
    } catch {
      setPolicy(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchPolicy();
    }, [fetchPolicy]),
  );
  useEffect(() => {
    if (isActive) {
      fetchPolicy();
    }
  }, [fetchPolicy, isActive]);

  const syncPolicy = useCallback(async (nextPolicy?: PolicySummary | null) => {
    if (nextPolicy !== undefined) {
      setPolicy(nextPolicy);
      return;
    }

    await fetchPolicy();
  }, [fetchPolicy]);

  const claims = policy?.claims ?? [];

  const daysLeft = policy
    ? Math.max(0, Math.ceil((new Date(policy.weekEndDate).getTime() - Date.now()) / 86400000))
    : 0;

  const totalPaidOut = claims
    .filter(c => c.status === 'paid' || c.status === 'auto_approved')
    .reduce((s, c) => s + c.payoutAmount, 0);

  const displayName = user?.fullName?.trim() || t('home.completeProfile');
  const contactLine = user?.email || user?.phone || t('home.addDetails');
  const platformLabel = formatPlatformName(user?.platform ?? null);
  const hasRedeemableBalance = totalPaidOut > 0;
  const isPremiumTab = variant === 'premium';
  const needsPlatformConnectForMiniTimer =
    user?.platformConnectionStatus !== 'verified'
    || user?.avgDailyIncome === null
    || !user?.workingTimeSlots?.length;

  const refreshMiniDisruptionState = useCallback(async () => {
    if (needsPlatformConnectForMiniTimer) {
      setMiniTrackingLoading(false);
      setMiniIsTracking(false);
      setMiniTrackedStartMs(null);
      setMiniWeatherSummary(t('home.connectForSlots'));
      return;
    }

    const trackingState = await getRainDisruptionTrackingState(user);
    setMiniWeatherSummary(trackingState.weatherSummary);
    setMiniIsTracking(trackingState.isTracking);
    setMiniTrackedStartMs(trackingState.trackedStartMs);
  }, [needsPlatformConnectForMiniTimer, user]);

  useEffect(() => {
    if (!isActive || isPremiumTab) {
      return;
    }

    let isMounted = true;

    const load = async () => {
      try {
        if (isMounted) {
          setMiniTrackingLoading(true);
        }

        await refreshMiniDisruptionState();
      } catch {
        if (isMounted) {
          setMiniIsTracking(false);
          setMiniTrackedStartMs(null);
          setMiniWeatherSummary(t('home.disruptionRefreshFailed'));
        }
      } finally {
        if (isMounted) {
          setMiniTrackingLoading(false);
        }
      }
    };

    void load();

    const refreshInterval = setInterval(() => {
      void refreshMiniDisruptionState().catch(() => {
        if (isMounted) {
          setMiniWeatherSummary(t('home.disruptionRefreshFailed'));
        }
      });
    }, 60_000);

    const timerInterval = setInterval(() => {
      if (isMounted) {
        setMiniClockMs(Date.now());
      }
    }, 1_000);

    return () => {
      isMounted = false;
      clearInterval(refreshInterval);
      clearInterval(timerInterval);
    };
  }, [isActive, isPremiumTab, refreshMiniDisruptionState, t]);

  const miniElapsedMs = miniIsTracking && miniTrackedStartMs
    ? Math.max(0, miniClockMs - miniTrackedStartMs)
    : 0;

  useEffect(() => {
    setAutoRenewEnabled(Boolean(policy?.riskSnapshot?.autoRenew));
  }, [policy?.id, policy?.riskSnapshot?.autoRenew]);

  const handleSignOut = async () => {
    await signOut();
    setUser(null);
    router.replace('/login');
  };

  const handleRedeem = useCallback(() => {
    Alert.alert(
      hasRedeemableBalance ? t('home.redeemReceivedTitle') : t('home.noBalanceTitle'),
      hasRedeemableBalance
        ? t('home.redeemReadyMessage')
        : t('home.redeemEmptyMessage'),
    );
  }, [hasRedeemableBalance, t]);

  const handleGetProtected = useCallback(() => {
    if (user?.platformConnectionStatus !== 'verified') {
      Alert.alert(
        t('home.connectPlatformFirstTitle'),
        t('home.connectPlatformFirstMessage'),
        [
          { text: t('home.cancel'), style: 'cancel' },
          {
            text: t('home.connectPlatform'),
            onPress: () => {
              router.push('/platform-connect');
            },
          },
        ],
      );
      return;
    }

    if (!isProfileComplete(user)) {
      const missingFields = getIncompleteProfileFields(user);
      Alert.alert(
        t('home.completeProfileFirstTitle'),
        t('home.completeProfileFirstMessage', { fields: missingFields.join(', ') }),
        [
          { text: t('home.cancel'), style: 'cancel' },
          {
            text: t('home.goToProfile'),
            onPress: () => {
              router.push('/profile');
            },
          },
        ],
      );
      return;
    }

    router.push('/create-policy');
  }, [t, user]);

  const handleToggleAutoRenew = useCallback(async (nextValue: boolean) => {
    if (!policy || policy.status !== 'active') {
      Alert.alert(t('home.noPremiumTitle'), t('home.noPremiumMessage'));
      return;
    }

    const previousValue = autoRenewEnabled;
    setAutoRenewEnabled(nextValue);
    setUpdatingAutoRenew(true);

    try {
      const response = await api.post('/policy/auto-renew', { enabled: nextValue });
      setPolicy(response.data as PolicySummary);
    } catch (err: any) {
      setAutoRenewEnabled(previousValue);
      Alert.alert(
        t('home.autoRenewUpdateFailedTitle'),
        err?.response?.data?.message || err?.message || t('login.retry'),
      );
    } finally {
      setUpdatingAutoRenew(false);
    }
  }, [autoRenewEnabled, policy, t]);

  const handleRemoveActivePolicy = useCallback(async () => {
    setRemovingPolicy(true);

    try {
      await api.post('/policy/remove-active');
      setPolicy(null);
    } catch (err: any) {
      Alert.alert(
        t('home.removeCalcFailedTitle'),
        err?.response?.data?.message || err?.message || t('login.retry'),
      );
    } finally {
      setRemovingPolicy(false);
    }
  }, [t]);

  const confirmRemoveActivePolicy = useCallback(async () => {
    const trackingState = await getRainDisruptionTrackingState(user);
    if (trackingState.isTracking) {
      Alert.alert(
        t('home.calcCannotRemoveTitle'),
        t('home.calcCannotRemoveMessage'),
      );
      return;
    }

    Alert.alert(
      t('home.removeCalcTitle'),
      t('home.removeCalcConfirm'),
      [
        {
          text: t('home.cancel'),
          style: 'cancel',
        },
        {
          text: t('home.remove'),
          style: 'destructive',
          onPress: () => {
            void handleRemoveActivePolicy();
          },
        },
      ],
    );
  }, [handleRemoveActivePolicy, t, user]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#00E5A0" size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0F" />

      <QuickShieldSidebar
        visible={profileMenuVisible}
        displayName={displayName}
        contactLine={contactLine}
        platformLabel={platformLabel}
        onClose={() => setProfileMenuVisible(false)}
        onProfilePress={() => {
          setProfileMenuVisible(false);
          router.push('/profile');
        }}
        onPlatformPress={() => {
          setProfileMenuVisible(false);
          router.push('/platform-connect');
        }}
        onSettingsPress={() => {
          setProfileMenuVisible(false);
          router.push('/settings');
        }}
        onSignOutPress={() => {
          setProfileMenuVisible(false);
          void handleSignOut();
        }}
      />

      {/* Top bar */}
      <View style={styles.topBar}>
        <View style={styles.profileEntry}>
          <TouchableOpacity
            onPress={() => setProfileMenuVisible((current) => !current)}
            activeOpacity={0.85}
            style={styles.avatarButton}
          >
            <ProfileAvatar uri={user?.profilePhoto} size={48} borderRadius={16} />
          </TouchableOpacity>
          <View style={styles.profileTextWrap}>
            <Text style={styles.greeting}>{t('home.greeting')} 🧑‍✈️</Text>
            <Text style={styles.profileName}>{displayName}</Text>
          </View>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomInset }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchPolicy(); }} tintColor="#00E5A0" />}
      >
        {!isPremiumTab ? (
          <>
            <View
              style={[styles.miniTimerCard, miniIsTracking ? styles.miniTimerCardActive : styles.miniTimerCardIdle]}
            >
              <View style={styles.miniTimerHeader}>
                <Text style={styles.miniTimerEyebrow}>{t('home.activeDisruption')}</Text>
                <Text style={styles.miniTimerCTA}>{needsPlatformConnectForMiniTimer ? t('home.required') : t('home.open')}</Text>
              </View>

              {needsPlatformConnectForMiniTimer ? (
                <>
                  <Text style={styles.miniTimerValue}>{t('home.connectPlatformShort')}</Text>
                  <Text numberOfLines={2} style={styles.miniTimerSummary}>
                    {miniWeatherSummary}
                  </Text>
                  <TouchableOpacity
                    activeOpacity={0.9}
                    style={styles.miniTimerConnectBtn}
                    onPress={() => router.push('/platform-connect')}
                    accessibilityRole="button"
                    accessibilityLabel={t('home.connectPlatformA11y')}
                  >
                    <Text style={styles.miniTimerConnectBtnText}>{t('home.connectQcommerce')}</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={onOpenPremium}
                  accessibilityRole="button"
                  accessibilityLabel={t('home.openPremiumA11y')}
                >
                  <Text style={styles.miniTimerValue}>
                    {miniTrackingLoading
                      ? t('home.checking')
                      : policy?.status !== 'active'
                        ? t('home.noPremiumTitle')
                        : miniIsTracking
                          ? formatDuration(miniElapsedMs)
                          : t('home.noActiveDisruption')}
                  </Text>

                  <Text numberOfLines={1} style={styles.miniTimerSummary}>
                    {miniWeatherSummary}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.walletCard}>
              <View style={styles.walletHeader}>
                <View>
                  <Text style={styles.walletEyebrow}>Wallet card</Text>
                  <Text style={styles.walletTitle}>Total balance</Text>
                </View>
                <View style={styles.walletChip}>
                  <Text style={styles.walletChipText}>{hasRedeemableBalance ? 'Ready to redeem' : 'No balance yet'}</Text>
                </View>
              </View>

              <Text style={styles.walletBalance}>{formatCurrency(totalPaidOut)}</Text>
              <Text style={styles.walletCaption}>
                Paid claims from your current protection cycle appear here and can be redeemed once available.
              </Text>

              <View style={styles.walletFooter}>
                <View style={styles.walletMetaBlock}>
                  <Text style={styles.walletMetaLabel}>Claims credited</Text>
                  <Text style={styles.walletMetaValue}>{claims.filter((claim) => claim.status === 'paid' || claim.status === 'auto_approved').length}</Text>
                </View>

                <TouchableOpacity
                  style={[styles.redeemBtn, !hasRedeemableBalance && styles.redeemBtnDisabled]}
                  onPress={handleRedeem}
                  activeOpacity={0.88}
                  accessibilityRole="button"
                  accessibilityLabel="Redeem wallet balance"
                >
                  <Text style={styles.redeemBtnText}>Redeem</Text>
                </TouchableOpacity>
              </View>
            </View>

            <WeatherCard />
          </>
        ) : policy?.status === 'active' ? (
          <>
            <RainDisruptionCard isActive={isActive} onPolicyRefresh={syncPolicy} policy={policy} user={user} />

            <View style={styles.autoRenewCard}>
              <View style={styles.autoRenewHeader}>
                <View style={styles.autoRenewTextWrap}>
                  <Text style={styles.autoRenewTitle}>Auto renew premium</Text>
                  <Text style={styles.autoRenewSubtitle}>
                    Automatically renew this weekly premium at cycle end.
                  </Text>
                </View>

                <Switch
                  value={autoRenewEnabled}
                  onValueChange={(value) => {
                    void handleToggleAutoRenew(value);
                  }}
                  disabled={updatingAutoRenew}
                  trackColor={{ false: '#304255', true: '#00E5A0' }}
                  thumbColor={autoRenewEnabled ? '#0A0A0F' : '#E5E7EB'}
                  ios_backgroundColor="#304255"
                />
              </View>
            </View>

            <View style={styles.policyCard}>
              <View style={styles.policyCardHeader}>
                <Text style={styles.policyCardTitle}>Active protection</Text>
                <View style={styles.activeBadge}>
                  <View style={styles.activeDot} />
                  <Text style={styles.activeBadgeText}>Active</Text>
                </View>
              </View>

              <Text style={styles.coverageAmount}>{formatCurrency(policy.coveragePerDay)}</Text>
              <Text style={styles.coverageLabel}>per day coverage</Text>

              <View style={styles.divider} />

              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Text style={styles.statVal}>{daysLeft}</Text>
                  <Text style={styles.statLabel}>Days left</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <Text style={styles.statVal}>{formatCurrency(policy.weeklyPremium)}</Text>
                  <Text style={styles.statLabel}>Weekly premium</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <Text style={[styles.statVal, { color: '#00E5A0' }]}>{formatCurrency(totalPaidOut)}</Text>
                  <Text style={styles.statLabel}>Paid out</Text>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.removePolicyBtn, removingPolicy && styles.removePolicyBtnDisabled]}
                onPress={confirmRemoveActivePolicy}
                disabled={removingPolicy}
                activeOpacity={0.85}
              >
                {removingPolicy ? (
                  <ActivityIndicator color="#FCA5A5" />
                ) : (
                  <Text style={styles.removePolicyBtnText}>Remove current calculation</Text>
                )}
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionTitle}>Recent claims</Text>
            {claims.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No disruptions this week. Stay protected!</Text>
              </View>
            ) : (
              claims.map((claim, i) => (
                <View key={i} style={styles.claimRow}>
                  <Text style={styles.claimType}>{TRIGGER_LABELS[claim.triggerType] ?? claim.triggerType}</Text>
                  <View style={styles.claimRight}>
                    <Text style={styles.claimAmount}>+{formatCurrency(claim.payoutAmount)}</Text>
                    <View style={[styles.claimBadge, claim.status === 'paid' && styles.claimBadgePaid]}>
                      <Text style={styles.claimBadgeText}>{claim.status === 'paid' ? 'Paid' : 'Processing'}</Text>
                    </View>
                  </View>
                </View>
              ))
            )}
          </>
        ) : (
          <>
            <View style={styles.autoRenewCard}>
              <View style={styles.autoRenewHeader}>
                <View style={styles.autoRenewTextWrap}>
                  <Text style={styles.autoRenewTitle}>Auto renew premium</Text>
                  <Text style={styles.autoRenewSubtitle}>
                    No premium plan found. Buy a plan to enable auto-renew.
                  </Text>
                </View>

                <Switch
                  value={false}
                  onValueChange={(value) => {
                    void handleToggleAutoRenew(value);
                  }}
                  disabled
                  trackColor={{ false: '#304255', true: '#00E5A0' }}
                  thumbColor="#E5E7EB"
                  ios_backgroundColor="#304255"
                />
              </View>
            </View>

            <View style={styles.ctaCard}>
              <Text style={styles.ctaTitle}>You&apos;re not protected yet</Text>
              <Text style={styles.ctaSubtitle}>
                Get weekly income protection from ₹20/week. Auto-payouts when disruptions hit your zone.
              </Text>
              <TouchableOpacity
                style={styles.ctaBtn}
                onPress={handleGetProtected}
                activeOpacity={0.85}
              >
                <Text style={styles.ctaBtnText}>Get protected now</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0F', paddingHorizontal: 20 },
  center: { flex: 1, backgroundColor: '#0A0A0F', justifyContent: 'center', alignItems: 'center' },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingTop: 60, paddingBottom: 24,
  },
  profileEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 14,
  },
  avatarButton: {
    borderRadius: 16,
  },
  profileTextWrap: {
    flex: 1,
  },
  greeting: { fontSize: 18, fontWeight: '700', color: '#FFFFFF', marginBottom: 2 },
  profileName: { fontSize: 15, fontWeight: '700', color: '#D1D5DB', marginBottom: 2 },

  miniTimerCard: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
  },
  miniTimerCardActive: {
    backgroundColor: '#102A26',
    borderColor: '#1D6E61',
  },
  miniTimerCardIdle: {
    backgroundColor: '#131A24',
    borderColor: '#273549',
  },
  miniTimerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  miniTimerEyebrow: {
    color: '#9FC8F0',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  miniTimerCTA: {
    color: '#00E5A0',
    fontSize: 12,
    fontWeight: '700',
  },
  miniTimerValue: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  miniTimerSummary: {
    color: '#8FAECC',
    fontSize: 12,
  },
  miniTimerConnectBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    minHeight: 34,
    borderRadius: 12,
    backgroundColor: '#00E5A0',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  miniTimerConnectBtnText: {
    color: '#07120D',
    fontSize: 12,
    fontWeight: '800',
  },

  walletCard: {
    backgroundColor: '#102235',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2B4763',
    marginBottom: 20,
    shadowColor: '#000000',
    shadowOpacity: 0.24,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  walletHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 18,
  },
  walletEyebrow: {
    color: '#8BC4FF',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  walletTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  walletChip: {
    backgroundColor: '#D8F3FF',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  walletChipText: {
    color: '#0F2940',
    fontSize: 11,
    fontWeight: '700',
  },
  walletBalance: {
    color: '#FFFFFF',
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: -1.2,
    marginBottom: 10,
  },
  walletCaption: {
    color: '#9FB8D3',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 20,
    maxWidth: 280,
  },
  walletFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  walletMetaBlock: {
    flex: 1,
    backgroundColor: '#132B43',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#274864',
  },
  walletMetaLabel: {
    color: '#8FAECC',
    fontSize: 11,
    marginBottom: 4,
  },
  walletMetaValue: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  redeemBtn: {
    minHeight: 54,
    minWidth: 128,
    borderRadius: 18,
    backgroundColor: '#00E5A0',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 22,
  },
  redeemBtnDisabled: {
    backgroundColor: '#1E3C35',
  },
  redeemBtnText: {
    color: '#07120D',
    fontSize: 16,
    fontWeight: '800',
  },

  autoRenewCard: {
    backgroundColor: '#102235',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2B4763',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
  },
  autoRenewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  autoRenewTextWrap: {
    flex: 1,
    paddingRight: 8,
  },
  autoRenewTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  autoRenewSubtitle: {
    color: '#9FB8D3',
    fontSize: 12,
    lineHeight: 18,
  },

  policyCard: {
    backgroundColor: '#0F1F18', borderRadius: 20, padding: 24,
    borderWidth: 1, borderColor: '#00E5A033', marginBottom: 24,
  },
  policyCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  policyCardTitle: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
  activeBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#00E5A022', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#00E5A0' },
  activeBadgeText: { fontSize: 12, color: '#00E5A0', fontWeight: '600' },
  coverageAmount: { fontSize: 42, fontWeight: '700', color: '#FFFFFF', letterSpacing: -1 },
  coverageLabel: { fontSize: 13, color: '#6B7280', marginBottom: 20 },
  divider: { height: 1, backgroundColor: '#1E2E26', marginBottom: 20 },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center' },
  statVal: { fontSize: 18, fontWeight: '700', color: '#FFFFFF', marginBottom: 2 },
  statLabel: { fontSize: 11, color: '#6B7280' },
  statDivider: { width: 1, height: 32, backgroundColor: '#1E2E26' },
  removePolicyBtn: {
    marginTop: 20,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#7F1D1D',
    backgroundColor: '#2A1116',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  removePolicyBtnDisabled: { opacity: 0.7 },
  removePolicyBtnText: { fontSize: 14, fontWeight: '700', color: '#FCA5A5' },

  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', marginBottom: 12 },
  claimRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#13131A', borderRadius: 12, padding: 16,
    marginBottom: 8, borderWidth: 1, borderColor: '#1E1E2E',
  },
  claimType: { fontSize: 14, color: '#D1D5DB', fontWeight: '500' },
  claimRight: { alignItems: 'flex-end', gap: 4 },
  claimAmount: { fontSize: 15, fontWeight: '700', color: '#00E5A0' },
  claimBadge: { backgroundColor: '#F59E0B22', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  claimBadgePaid: { backgroundColor: '#00E5A022' },
  claimBadgeText: { fontSize: 11, color: '#F59E0B', fontWeight: '600' },

  emptyCard: {
    backgroundColor: '#13131A', borderRadius: 12, padding: 20,
    borderWidth: 1, borderColor: '#1E1E2E', alignItems: 'center',
  },
  emptyText: { fontSize: 14, color: '#6B7280', textAlign: 'center' },

  ctaCard: {
    backgroundColor: '#13131A', borderRadius: 20, padding: 28,
    borderWidth: 1, borderColor: '#1E1E2E', marginTop: 20,
  },
  ctaTitle: { fontSize: 22, fontWeight: '700', color: '#FFFFFF', marginBottom: 10 },
  ctaSubtitle: { fontSize: 14, color: '#6B7280', lineHeight: 20, marginBottom: 24 },
  ctaBtn: { backgroundColor: '#00E5A0', borderRadius: 14, height: 52, justifyContent: 'center', alignItems: 'center' },
  ctaBtnText: { fontSize: 15, fontWeight: '700', color: '#0A0A0F' },
});
