import React, { useCallback, useEffect, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import api from './src/services/api';
import { useAuth } from './src/context/AuthContext';
import ProfileAvatar from './src/components/ProfileAvatar';

type PolicyClaim = {
  id: string;
  triggerType: string;
  payoutAmount: number;
  status: string;
  createdAt: string;
};

type PolicySummary = {
  id: string;
  status: string;
  coveragePerDay: number;
  weeklyPremium: number;
  claims: PolicyClaim[];
};

export default function WalletScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [policy, setPolicy] = useState<PolicySummary | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPolicy = useCallback(async () => {
    try {
      const response = await api.get('/policy/active');
      setPolicy(response.data as PolicySummary);
    } catch (err) {
      console.log('Error fetching policy in Wallet:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPolicy();
  }, [fetchPolicy]);

  const formatCurrency = (value: number) =>
    `₹${value.toLocaleString('en-IN', {
      minimumFractionDigits: Number.isInteger(value) ? 0 : value < 1 ? 4 : 2,
      maximumFractionDigits: value < 1 ? 4 : 2,
    })}`;

  const formatDateTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const claims = policy?.claims ?? [];

  // Completed claims balance
  const completedClaimsAmount = claims
    .filter((c) => c.status === 'paid' || c.status === 'auto_approved')
    .reduce((s, c) => s + c.payoutAmount, 0);

  // Pending claims balance
  const pendingClaimsAmount = claims
    .filter((c) => c.status === 'pending_review')
    .reduce((s, c) => s + c.payoutAmount, 0);

  const totalBalance = completedClaimsAmount;
  const pendingPayout = pendingClaimsAmount;

  // Activities: actual claims only
  const activityList = claims.map((claim) => ({
    id: claim.id,
    title: claim.triggerType === 'rain' ? 'Rain Shield Payout' : 'Outage Payout',
    date: formatDateTime(claim.createdAt),
    amount: `+${formatCurrency(claim.payoutAmount)}`,
    status: claim.status === 'pending_review' ? 'Pending' : 'Completed',
    isPositive: true,
  }));

  const handleWithdraw = () => {
    Alert.alert(
      'Withdraw Funds',
      'Your request to withdraw has been submitted. Payout processing takes 5-10 minutes under parametric auto-approval, or up to 24 hours for review.'
    );
  };

  const handleTransfer = () => {
    Alert.alert(
      'Transfer Funds',
      'Rider-to-rider or instant wallet-to-wallet transfers will be enabled in a future release.'
    );
  };

  return (
    <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top }]}>
      {/* Top Bar Header */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={24} color="#736400" />
          </TouchableOpacity>
          <Text style={styles.topTitle}>Wallet</Text>
        </View>
        <View style={styles.avatarContainer}>
          <ProfileAvatar uri={user?.profilePhoto} size={40} borderRadius={20} />
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#736400" size="large" />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {/* Balance Bento Card */}
          <View style={styles.balanceCard}>
            <View style={styles.balanceCardHeader}>
              <Text style={styles.balanceEyebrow}>TOTAL BALANCE</Text>
              <View style={styles.walletIconWrap}>
                <Ionicons name="wallet-outline" size={24} color="#5C5000" />
              </View>
            </View>
            <Text style={styles.balanceValue}>{formatCurrency(totalBalance)}</Text>

            <View style={styles.balanceCardFooter}>
              <View>
                <Text style={styles.pendingEyebrow}>Pending Payout</Text>
                <Text style={styles.pendingValue}>{formatCurrency(pendingPayout)}</Text>
              </View>
              {completedClaimsAmount > 0 && (
                <View style={styles.badgeSuccess}>
                  <Text style={styles.badgeSuccessText}>Ready</Text>
                </View>
              )}
            </View>
            {/* Decorative background circle */}
            <View style={styles.decorativeCircle} />
          </View>

          {/* Quick Actions */}
          <View style={styles.quickActions}>
            <TouchableOpacity style={styles.actionButton} onPress={handleWithdraw} activeOpacity={0.85}>
              <View style={styles.actionIconContainer}>
                <Ionicons name="cash-outline" size={24} color="#696700" />
              </View>
              <Text style={styles.actionLabel}>Withdraw</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton} onPress={handleTransfer} activeOpacity={0.85}>
              <View style={styles.actionIconContainer}>
                <Ionicons name="send-outline" size={22} color="#696700" style={{ marginLeft: 2 }} />
              </View>
              <Text style={styles.actionLabel}>Transfer</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton} onPress={() => {}} activeOpacity={0.85}>
              <View style={styles.actionIconContainer}>
                <Ionicons name="time-outline" size={24} color="#696700" />
              </View>
              <Text style={styles.actionLabel}>History</Text>
            </TouchableOpacity>
          </View>

          {/* Recent Activity Section */}
          <View style={styles.activitySection}>
            <View style={styles.activityHeader}>
              <Text style={styles.activityTitle}>Recent Activity</Text>
              <TouchableOpacity activeOpacity={0.7}>
                <Text style={styles.viewAllText}>View All</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.activityList}>
              {activityList.length === 0 ? (
                <View style={styles.emptyActivityState}>
                  <Text style={styles.emptyActivityText}>No recent activity.</Text>
                </View>
              ) :
                activityList.map((item) => (
                  <View key={item.id} style={styles.activityItem}>
                    <View style={styles.activityLeft}>
                    <View
                      style={[
                        styles.activityIconWrap,
                        item.title.includes('Withdrawal')
                          ? styles.activityIconWithdrawal
                          : item.title.includes('Earnings')
                          ? styles.activityIconEarnings
                          : styles.activityIconPayout,
                      ]}
                    >
                      <Ionicons
                        name={
                          item.title.includes('Withdrawal')
                            ? 'business-outline'
                            : item.title.includes('Earnings')
                            ? 'trending-up-outline'
                            : 'shield-checkmark-outline'
                        }
                        size={20}
                        color={
                          item.title.includes('Withdrawal')
                            ? '#BE2D06'
                            : item.title.includes('Earnings')
                            ? '#5E6A32'
                            : '#736400'
                        }
                      />
                    </View>
                    <View>
                      <Text style={styles.activityName}>{item.title}</Text>
                      <Text style={styles.activityDate}>{item.date}</Text>
                    </View>
                  </View>

                  <View style={styles.activityRight}>
                    <Text
                      style={[
                        styles.activityAmount,
                        item.isPositive ? styles.amountPositive : styles.amountNegative,
                      ]}
                    >
                      {item.amount}
                    </Text>
                    <View
                      style={[
                        styles.statusPill,
                        item.status === 'Completed' ? styles.statusCompleted : styles.statusPending,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusPillText,
                          item.status === 'Completed'
                            ? styles.statusCompletedText
                            : styles.statusPendingText,
                        ]}
                      >
                        {item.status}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFBFF',
  },
  topBar: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    backgroundColor: '#FFFBFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E4E4E7',
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    padding: 4,
  },
  topTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#3B3A00',
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F4F4F5',
    overflow: 'hidden',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    gap: 24,
  },
  balanceCard: {
    backgroundColor: '#FFDF00',
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(115, 100, 0, 0.1)',
    shadowColor: '#736400',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  balanceCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  balanceEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5C5000',
    opacity: 0.8,
    letterSpacing: 1.2,
  },
  walletIconWrap: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  balanceValue: {
    fontSize: 36,
    fontWeight: '900',
    color: '#5C5000',
    letterSpacing: -0.5,
    marginBottom: 24,
  },
  balanceCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  pendingEyebrow: {
    fontSize: 11,
    fontWeight: '600',
    color: '#5C5000',
    opacity: 0.7,
  },
  pendingValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#5C5000',
    marginTop: 2,
  },
  badgeSuccess: {
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeSuccessText: {
    color: '#5C5000',
    fontSize: 11,
    fontWeight: '700',
  },
  decorativeCircle: {
    position: 'absolute',
    right: -40,
    top: -40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(236, 233, 66, 0.25)',
    zIndex: -1,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#FFFCCB',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(192, 189, 95, 0.3)',
  },
  actionIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ECE942',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#696710',
  },
  activitySection: {
    gap: 16,
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  activityTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#3B3A00',
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#736400',
  },
  activityList: {
    gap: 12,
  },
  activityItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(192, 189, 95, 0.15)',
    shadowColor: '#000000',
    shadowOpacity: 0.02,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  activityLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  activityIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activityIconPayout: {
    backgroundColor: '#EFFEB7',
  },
  activityIconEarnings: {
    backgroundColor: '#E1EFAA',
  },
  activityIconWithdrawal: {
    backgroundColor: 'rgba(190, 45, 6, 0.1)',
  },
  activityName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#3B3A00',
  },
  activityDate: {
    fontSize: 12,
    color: '#696710',
    marginTop: 2,
  },
  activityRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  activityAmount: {
    fontSize: 14,
    fontWeight: '800',
  },
  amountPositive: {
    color: '#5E6A32',
  },
  amountNegative: {
    color: '#3B3A00',
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 99,
  },
  statusCompleted: {
    backgroundColor: 'rgba(94, 106, 50, 0.1)',
  },
  statusPending: {
    backgroundColor: 'rgba(115, 100, 0, 0.1)',
  },
  statusPillText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  statusCompletedText: {
    color: '#5E6A32',
  },
  statusPendingText: {
    color: '#736400',
  },
  emptyActivityState: {
    paddingVertical: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(192, 189, 95, 0.15)',
  },
  emptyActivityText: {
    color: '#696710',
    fontSize: 14,
    fontWeight: '500',
  },
});
