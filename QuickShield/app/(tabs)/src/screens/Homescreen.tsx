import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, View, Text, TouchableOpacity, StyleSheet, Pressable,
  StatusBar, ScrollView, RefreshControl, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { getIncompleteProfileFields, isProfileComplete, signOut } from '../services/auth.service';
import ProfileAvatar from '../components/ProfileAvatar';
import RainDisruptionCard from '../components/RainDisruptionCard';
import WeatherCard from '../components/WeatherCard';
import type { PolicySummary } from '../types/policy';

type HomeScreenProps = {
  isActive?: boolean;
  bottomInset?: number;
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

export default function HomeScreen({ isActive = false, bottomInset = 40 }: HomeScreenProps) {
  const { user, setUser } = useAuth();
  const [policy, setPolicy] = useState<PolicySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profileMenuVisible, setProfileMenuVisible] = useState(false);
  const [removingPolicy, setRemovingPolicy] = useState(false);

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

  const displayName = user?.fullName?.trim() || 'Complete your profile';
  const contactLine = user?.email || user?.phone || 'Add your details';
  const platformLabel = formatPlatformName(user?.platform ?? null);
  const hasRedeemableBalance = totalPaidOut > 0;

  const handleSignOut = async () => {
    await signOut();
    setUser(null);
    router.replace('/login');
  };

  const handleRedeem = useCallback(() => {
    Alert.alert(
      hasRedeemableBalance ? 'Redeem request received' : 'No balance available',
      hasRedeemableBalance
        ? 'Your wallet balance is ready. Connect the redemption flow when the backend endpoint is available.'
        : 'Your wallet will show redeemable payouts here as soon as a claim is paid.',
    );
  }, [hasRedeemableBalance]);

  const handleGetProtected = useCallback(() => {
    if (user?.platformConnectionStatus !== 'verified') {
      Alert.alert(
        'Connect your q-commerce platform first',
        'Connect your rider platform before buying protection so the app can fetch rider details and calculate coverage.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Connect platform',
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
        'Complete your profile first',
        `Finish your ${missingFields.join(', ')} before protecting your income.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Go to profile',
            onPress: () => {
              router.push('/profile');
            },
          },
        ],
      );
      return;
    }

    router.push('/create-policy');
  }, [user]);

  const handleRemoveActivePolicy = useCallback(async () => {
    setRemovingPolicy(true);

    try {
      await api.post('/policy/remove-active');
      setPolicy(null);
    } catch (err: any) {
      Alert.alert(
        'Could not remove calculation',
        err?.response?.data?.message || err?.message || 'Please try again.',
      );
    } finally {
      setRemovingPolicy(false);
    }
  }, []);

  const confirmRemoveActivePolicy = useCallback(() => {
    Alert.alert(
      'Remove current calculation',
      'Are you sure you want to remove the current calculation?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void handleRemoveActivePolicy();
          },
        },
      ],
    );
  }, [handleRemoveActivePolicy]);

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

      {profileMenuVisible && (
        <>
          <Pressable style={styles.menuBackdrop} onPress={() => setProfileMenuVisible(false)} />
          <View style={styles.profileMenu}>
            <TouchableOpacity
              style={styles.profileMenuItem}
              onPress={() => {
                setProfileMenuVisible(false);
                router.push('/profile');
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.profileMenuLabel}>My profile</Text>
              <Text style={styles.profileMenuHint}>View and edit your details</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.profileMenuItem}
              onPress={() => {
                setProfileMenuVisible(false);
                router.push('/platform-connect');
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.profileMenuLabel}>Connect {platformLabel}</Text>
              <Text style={styles.profileMenuHint}>Go to your selected q-commerce platform</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

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
            <Text style={styles.greeting}>Good morning 👋</Text>
            <Text style={styles.profileName}>{displayName}</Text>
            <Text style={styles.email}>{contactLine}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomInset }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchPolicy(); }} tintColor="#00E5A0" />}
      >
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

        {/* Weather Card */}
        <WeatherCard />

        {policy?.status === 'active' ? (
          <>
            <RainDisruptionCard isActive={isActive} onPolicyRefresh={syncPolicy} policy={policy} user={user} />

            {/* Active policy card */}
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

            {/* Recent claims */}
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
          /* No active policy CTA */
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
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0F', paddingHorizontal: 20 },
  center: { flex: 1, backgroundColor: '#0A0A0F', justifyContent: 'center', alignItems: 'center' },
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
  profileMenu: {
    position: 'absolute',
    top: 116,
    left: 20,
    width: 250,
    backgroundColor: '#11141B',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1C2432',
    padding: 8,
    zIndex: 20,
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  profileMenuItem: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#131923',
    marginBottom: 8,
  },
  profileMenuLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  profileMenuHint: {
    color: '#7A8597',
    fontSize: 12,
    lineHeight: 18,
  },
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
  email: { fontSize: 12, color: '#6B7280' },
  signOutBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#1E1E2E' },
  signOutText: { fontSize: 12, color: '#6B7280' },

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
