import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import api from './src/services/api';
import ProfileAvatar from './src/components/ProfileAvatar';
import { useAuth } from './src/context/AuthContext';
import { getIncompleteProfileFields, isProfileComplete } from './src/services/auth.service';

type PremiumRecommendation = {
  recommended: number;
  min: number;
  max: number;
  avgDailyIncome: number;
};

type PremiumCalculation = {
  weeklyPremium: number;
  coveragePerDay: number;
  riderContext: {
    avgDailyIncome: number;
    serviceZone: string;
    platform: string;
  };
  composite: number;
  riskSource: 'ml_model' | 'static_fallback';
};

const MAP_IMAGE = {
  uri: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCinLcCCTe6R_cCJhcx_T0GRNkbMFx7o2UXVkJSIK0j2OC0TtlUQvx123xfc7WrJvglXLNRp7tmdluG_t4tAfvX1-5C_DcMZcTgZfzlndthAp-dQ6EhhJ4Watsnel1UuVJVmg3OR0aI-4q8AQQ4lEs7UN12IzglraWo-YVpRzQ8yH4xd8xfZGq3KyXue2-VWNQkWefxGLdLiZoEpjcUyUPnf-Dm9HoDQv9yRXo26OhqYmPicIuhb48O6buyjGo79AZHujUCsMTOD6mj',
};

const COVERAGE_PERCENTAGES = [60, 80, 100, 120] as const;

const formatZoneName = (value: string | null | undefined) => {
  if (!value) return 'Not selected';
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const formatCurrency = (value: number) => `₹${Math.round(value).toLocaleString('en-IN')}`;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const buildRecommendationFromIncome = (avgDailyIncome: number): PremiumRecommendation => ({
  avgDailyIncome,
  recommended: Math.round(avgDailyIncome * 0.9),
  min: Math.round(avgDailyIncome * 0.6),
  max: Math.round(avgDailyIncome * 1.2),
});

function LocalWeatherCard() {
  return (
    <View style={styles.localWeatherCard}>
      <View style={styles.localWeatherLeft}>
        <View style={styles.localWeatherIconWrap}>
          <Ionicons name="rainy" size={30} color="#5E6A32" />
        </View>
        <View>
          <Text style={styles.localWeatherEyebrow}>Local Weather</Text>
          <View style={styles.localWeatherReading}>
            <Text style={styles.localWeatherTemp}>24°C</Text>
            <Text style={styles.localWeatherStatus}>Rainy</Text>
          </View>
        </View>
      </View>

      <View style={styles.localWeatherAction}>
        <Text style={styles.localWeatherActionText}>View Full Forecast</Text>
        <Ionicons name="chevron-forward" size={18} color="#736400" />
      </View>
    </View>
  );
}

export default function CreatePolicyRoute() {
  const { user } = useAuth();
  const hasPromptedForProfileRef = useRef(false);
  const [recommendation, setRecommendation] = useState<PremiumRecommendation | null>(null);
  const [coveragePerDay, setCoveragePerDay] = useState(0);
  const [premium, setPremium] = useState<PremiumCalculation | null>(null);
  const [showCheckoutPreview, setShowCheckoutPreview] = useState(false);
  const [lastForecastRisk, setLastForecastRisk] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [buying, setBuying] = useState(false);
  const [coverageTrackWidth, setCoverageTrackWidth] = useState(0);

  const fetchRecommendation = useCallback(async () => {
    if (user?.platformConnectionStatus !== 'verified' || !isProfileComplete(user)) {
      setLoading(false);
      setRecommendation(null);
      return;
    }

    setLoading(true);
    try {
      const response = await api.get('/premium/recommendation');
      const data = response.data as PremiumRecommendation;
      const hasValidRecommendation =
        Number.isFinite(data?.avgDailyIncome)
        && Number.isFinite(data?.recommended)
        && Number.isFinite(data?.min)
        && Number.isFinite(data?.max)
        && data.avgDailyIncome > 0
        && data.recommended > 0
        && data.max >= data.min;

      const nextRecommendation = hasValidRecommendation
        ? data
        : (
          typeof user?.avgDailyIncome === 'number' && user.avgDailyIncome > 0
            ? buildRecommendationFromIncome(user.avgDailyIncome)
            : null
        );

      if (!nextRecommendation) {
        throw new Error('Coverage recommendation unavailable. Connect rider income first.');
      }
      setRecommendation(nextRecommendation);
      setCoveragePerDay(nextRecommendation.recommended);
      setShowCheckoutPreview(false);
    } catch (err: any) {
      if (typeof user?.avgDailyIncome === 'number' && user.avgDailyIncome > 0) {
        const fallbackRecommendation = buildRecommendationFromIncome(user.avgDailyIncome);
        setRecommendation(fallbackRecommendation);
        setCoveragePerDay(fallbackRecommendation.recommended);
        setShowCheckoutPreview(false);
      } else {
        Alert.alert(
          'Premium unavailable',
          err.response?.data?.message || err.message || 'Could not load policy recommendation.',
        );
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchRecommendation();
  }, [fetchRecommendation]);

  useEffect(() => {
    if (isProfileComplete(user) || hasPromptedForProfileRef.current) {
      return;
    }

    hasPromptedForProfileRef.current = true;
    const missingFields = getIncompleteProfileFields(user);

    Alert.alert(
      'Complete your profile first',
      `Finish your ${missingFields.join(', ')} before protecting your income.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Go to profile',
          onPress: () => {
            router.replace('/profile');
          },
        },
      ],
    );
  }, [user]);

  if (user?.platformConnectionStatus !== 'verified') {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.emptyTitle}>Connect your q-commerce platform first</Text>
        <Text style={styles.emptySubtitle}>
          Rider income and working details are required before protection can be purchased.
        </Text>
        <TouchableOpacity onPress={() => router.replace('/platform-connect')} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnText}>Go to platform connection</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!isProfileComplete(user)) {
    const missingFields = getIncompleteProfileFields(user);

    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.emptyTitle}>Complete your profile first</Text>
        <Text style={styles.emptySubtitle}>
          Add your {missingFields.join(', ')} before protecting your income.
        </Text>
        <TouchableOpacity onPress={() => router.replace('/profile')} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnText}>Go to profile</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const setSelectedCoverage = (nextCoverage: number) => {
    if (!recommendation) return;

    setCoveragePerDay(clamp(nextCoverage, recommendation.min, recommendation.max));
    setPremium(null);
    setShowCheckoutPreview(false);
  };

  const handleCoverageTrackPress = (locationX: number) => {
    if (!recommendation || coverageTrackWidth <= 0) return;

    const position = clamp(locationX / coverageTrackWidth, 0, 1);
    const rawCoverage = recommendation.min + ((recommendation.max - recommendation.min) * position);
    setSelectedCoverage(Math.round(rawCoverage / 50) * 50);
  };

  const selectCoveragePercentage = (percentage: number) => {
    if (!recommendation) return;
    setSelectedCoverage(Math.round(recommendation.avgDailyIncome * (percentage / 100)));
  };

  const handleCalculatePremium = async () => {
    setCalculating(true);
    try {
      const response = await api.post('/premium/calculate', {
        coveragePerDay,
      });
      setLastForecastRisk(undefined);
      setPremium(response.data as PremiumCalculation);
      setShowCheckoutPreview(true);
    } catch (err: any) {
      Alert.alert(
        'Calculation failed',
        err.response?.data?.message || err.message || 'Could not calculate premium.',
      );
    } finally {
      setCalculating(false);
    }
  };

  const handleBuyPremium = async () => {
    if (!premium) return;
    setBuying(true);
    try {
      await api.post('/policy/purchase', {
        coveragePerDay: premium.coveragePerDay,
        forecastRisk: lastForecastRisk,
      });

      Alert.alert('Protection activated', 'Your weekly premium has been purchased.', [
        { text: 'Go to Home', onPress: () => router.replace('/home') },
      ]);
    } catch (err: any) {
      Alert.alert('Purchase failed', err.response?.data?.message || err.message);
    } finally {
      setBuying(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#736400" size="large" />
      </View>
    );
  }

  if (!recommendation) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.emptyTitle}>Policy creation unavailable</Text>
        <TouchableOpacity onPress={() => router.replace('/home')} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnText}>Back to home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const coverageProgress = recommendation.max === recommendation.min
    ? 0
    : clamp((coveragePerDay - recommendation.min) / (recommendation.max - recommendation.min), 0, 1);

  const zoneLabel = formatZoneName(user?.serviceZone);
  const platformLabel = user?.platform ? formatZoneName(user.platform) : 'Not selected';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <SafeAreaView edges={['top']} style={styles.topSafeArea}>
        <View style={styles.header}>
          <View style={styles.headerBrand}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backBtn}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Ionicons name="arrow-back" size={24} color="#696710" />
            </TouchableOpacity>
            <Text style={styles.brandText}>QuickShield</Text>
          </View>

          <View style={styles.headerActions}>
            <Ionicons name="notifications-outline" size={23} color="#736400" />
            <View style={styles.headerAvatar}>
              <ProfileAvatar uri={user?.profilePhoto} size={32} borderRadius={16} />
            </View>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>Review Your Plan</Text>
          <Text style={styles.heroSubtitle}>
            We&apos;ve automatically synced your platform data to ensure the most accurate protection for your daily hustle.
          </Text>
          <Ionicons name="shield-checkmark" size={128} color="rgba(115, 100, 0, 0.09)" style={styles.heroIcon} />
        </View>

        <View style={styles.contextGrid}>
          <View style={styles.platformCard}>
            <View style={styles.platformIcon}>
              <Ionicons name="bicycle" size={25} color="#5C5000" />
            </View>
            <View>
              <Text style={styles.contextEyebrow}>Active Platform</Text>
              <Text style={styles.platformValue}>{platformLabel}</Text>
            </View>
          </View>

          <View style={styles.contextMiniCard}>
            <Ionicons name="location" size={22} color="#5E6A32" />
            <Text style={styles.contextLabel}>Working Zone</Text>
            <Text style={styles.contextValue}>{zoneLabel}</Text>
          </View>

          <View style={styles.contextMiniCard}>
            <Ionicons name="cash" size={23} color="#696700" />
            <Text style={styles.contextLabel}>Daily Avg Income</Text>
            <Text style={styles.contextValue}>{formatCurrency(recommendation.avgDailyIncome)} / day</Text>
          </View>
        </View>

        <View style={styles.syncRow}>
          <Ionicons name="sync" size={16} color="#5E6A32" />
          <Text style={styles.syncText}>Details fetched via Platform API for convenience</Text>
        </View>

        <View style={styles.coverageCard}>
          <Text style={styles.sectionTitle}>Select Coverage Level</Text>
          <Text style={styles.sectionSubtitle}>Choose protection based on your average daily income</Text>

          <View style={styles.coverageAmountWrap}>
            <Text style={styles.coverageAmountLabel}>Daily Protection</Text>
            <Text style={styles.coverageValue}>{formatCurrency(coveragePerDay)}</Text>
          </View>

          <Pressable
            style={styles.coverageTrack}
            onLayout={(event) => setCoverageTrackWidth(event.nativeEvent.layout.width)}
            onPress={(event) => handleCoverageTrackPress(event.nativeEvent.locationX)}
            accessibilityRole="adjustable"
            accessibilityLabel="Daily protection coverage"
            accessibilityValue={{
              min: recommendation.min,
              max: recommendation.max,
              now: coveragePerDay,
            }}
          >
            <View style={[styles.coverageTrackFill, { width: `${coverageProgress * 100}%` }]} />
            <View style={[styles.coverageThumb, { left: `${coverageProgress * 100}%` }]} />
          </Pressable>

          <View style={styles.coverageStops}>
            {COVERAGE_PERCENTAGES.map((percentage) => (
              <TouchableOpacity
                key={percentage}
                onPress={() => selectCoveragePercentage(percentage)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Set coverage to ${percentage} percent of daily income`}
              >
                <Text style={styles.coverageStopText}>{percentage}%</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.coverageHint}>
            Recommended {formatCurrency(recommendation.recommended)} · Range {formatCurrency(recommendation.min)} to {formatCurrency(recommendation.max)}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.calculateBtn, calculating && styles.primaryBtnDisabled]}
          onPress={handleCalculatePremium}
          disabled={calculating}
          activeOpacity={0.85}
        >
          {calculating ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="calculator-outline" size={20} color="#FFFFFF" />
              <Text style={styles.calculateBtnText}>Calculate Premium</Text>
            </>
          )}
        </TouchableOpacity>
        <Text style={styles.termsText}>
          By continuing, you agree to the terms of protection based on your selected coverage.
        </Text>

        {showCheckoutPreview && premium && (
          <>
            <View style={styles.checkoutSummaryCard}>
              <Text style={styles.cardEyebrow}>Estimated Cost</Text>
              <View style={styles.checkoutAmountRow}>
                <Text style={styles.checkoutAmountPrefix}>₹</Text>
                <Text style={styles.checkoutAmountValue}>{premium.weeklyPremium.toFixed(2)}</Text>
                <Text style={styles.checkoutAmountSuffix}>/ week</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.purchaseBtn, buying && styles.primaryBtnDisabled]}
              onPress={handleBuyPremium}
              disabled={buying}
              activeOpacity={0.85}
            >
              {buying ? (
                <ActivityIndicator color="#473D00" />
              ) : (
                <>
                  <Text style={styles.purchaseBtnText}>Pay for Premium</Text>
                  <Ionicons name="arrow-forward" size={18} color="#473D00" />
                </>
              )}
            </TouchableOpacity>

            <LocalWeatherCard />

          </>
        )}

        <ImageBackground source={MAP_IMAGE} imageStyle={styles.mapImage} style={styles.mapCard}>
          <View style={styles.mapOverlay} />
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveBadgeText}>Live in {zoneLabel} Cluster</Text>
          </View>
        </ImageBackground>
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={styles.bottomNavSafeArea}>
        <View style={styles.bottomNav}>
          <TouchableOpacity style={styles.navItem} onPress={() => router.replace({ pathname: '/home', params: { tab: 'home' } })}>
            <Ionicons name="grid-outline" size={22} color="#696710" />
            <Text style={styles.navLabel}>Dashboard</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.navItem, styles.navItemActive]} onPress={() => router.replace({ pathname: '/home', params: { tab: 'premium' } })}>
            <Ionicons name="shield-checkmark" size={22} color="#5C5000" />
            <Text style={[styles.navLabel, styles.navLabelActive]}>Insurance</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navItem} onPress={() => router.replace({ pathname: '/home', params: { tab: 'history' } })}>
            <Ionicons name="time-outline" size={22} color="#696710" />
            <Text style={styles.navLabel}>History</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navItem} onPress={() => router.replace({ pathname: '/home', params: { tab: 'flags' } })}>
            <Ionicons name="flag-outline" size={22} color="#696710" />
            <Text style={styles.navLabel}>Flags</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFBFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFBFF',
    paddingHorizontal: 24,
    gap: 18,
  },
  topSafeArea: {
    backgroundColor: '#FFFFFF',
  },
  header: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F1EA',
    backgroundColor: '#FFFFFF',
    shadowColor: '#736400',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  headerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
  },
  brandText: {
    color: '#736400',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.6,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  headerAvatar: {
    borderWidth: 2,
    borderColor: '#FFDF00',
    borderRadius: 18,
    padding: 1,
  },
  content: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 116,
  },
  heroCard: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(192, 189, 95, 0.3)',
    backgroundColor: '#FFFCCB',
    padding: 20,
    marginBottom: 18,
  },
  heroTitle: {
    color: '#3B3A00',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 7,
  },
  heroSubtitle: {
    maxWidth: 320,
    color: '#696710',
    fontSize: 14,
    lineHeight: 21,
  },
  heroIcon: {
    position: 'absolute',
    right: -16,
    bottom: -30,
  },
  contextGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 14,
  },
  platformCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    borderRadius: 12,
    backgroundColor: '#F7F376',
    padding: 15,
  },
  platformIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#FFDF00',
  },
  contextEyebrow: {
    color: '#736400',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  platformValue: {
    color: '#3B3A00',
    fontSize: 18,
    fontWeight: '800',
  },
  contextMiniCard: {
    flex: 1,
    minWidth: 140,
    minHeight: 114,
    justifyContent: 'space-between',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(192, 189, 95, 0.24)',
    backgroundColor: '#FFFCCB',
    padding: 14,
  },
  contextLabel: {
    color: '#696710',
    fontSize: 12,
    fontWeight: '600',
  },
  contextValue: {
    color: '#3B3A00',
    fontSize: 14,
    fontWeight: '800',
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 8,
    marginBottom: 6,
  },
  syncText: {
    color: '#5E6A32',
    fontSize: 12,
    fontWeight: '600',
  },
  coverageCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(192, 189, 95, 0.3)',
    backgroundColor: 'rgba(255, 252, 203, 0.52)',
    padding: 20,
    marginBottom: 18,
  },
  sectionTitle: {
    color: '#3B3A00',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  sectionSubtitle: {
    color: '#696710',
    fontSize: 12,
    marginBottom: 24,
  },
  coverageAmountWrap: {
    alignItems: 'center',
    marginBottom: 28,
  },
  coverageAmountLabel: {
    color: '#696710',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 5,
  },
  coverageValue: {
    color: '#736400',
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: -1,
  },
  coverageTrack: {
    height: 8,
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#F7F376',
    marginHorizontal: 2,
    marginBottom: 15,
  },
  coverageTrackFill: {
    height: 8,
    borderRadius: 8,
    backgroundColor: '#736400',
  },
  coverageThumb: {
    position: 'absolute',
    width: 22,
    height: 22,
    marginLeft: -11,
    borderRadius: 11,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    backgroundColor: '#736400',
    shadowColor: '#736400',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 4,
    elevation: 3,
  },
  coverageStops: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  coverageStopText: {
    color: '#696710',
    fontSize: 11,
    fontWeight: '800',
  },
  coverageHint: {
    color: '#86842C',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  primaryBtn: {
    minWidth: 180,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingHorizontal: 18,
    backgroundColor: '#FFDF00',
  },
  primaryBtnDisabled: { opacity: 0.65 },
  primaryBtnText: { color: '#473D00', fontSize: 15, fontWeight: '800' },
  calculateBtn: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: 12,
    backgroundColor: '#736400',
    shadowColor: '#736400',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  calculateBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  termsText: {
    color: '#86842C',
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
    paddingHorizontal: 16,
    marginTop: 12,
    marginBottom: 22,
  },
  resultCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(192, 189, 95, 0.34)',
    backgroundColor: '#EFFEB7',
    padding: 18,
    marginBottom: 18,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  resultCopy: {
    flex: 1,
  },
  cardEyebrow: {
    color: '#5E6A32',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  premiumValue: { color: '#3B3A00', fontSize: 36, fontWeight: '900', marginBottom: 4 },
  premiumMeta: { color: '#616D35', fontSize: 13, lineHeight: 19, marginBottom: 16 },
  resultGrid: { flexDirection: 'row', gap: 12 },
  resultStat: { flex: 1, padding: 12, borderRadius: 12, backgroundColor: 'rgba(255, 255, 255, 0.56)' },
  resultStatLabel: { color: '#616D35', fontSize: 12, marginBottom: 6 },
  resultStatValue: { color: '#3B3A00', fontSize: 14, fontWeight: '800' },
  purchaseBtn: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    backgroundColor: '#FFDF00',
    marginTop: 18,
  },
  purchaseBtnText: { color: '#473D00', fontSize: 15, fontWeight: '800' },
  localWeatherCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(192, 189, 95, 0.3)',
    backgroundColor: '#FFFCCB',
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginTop: 16,
    marginBottom: 8,
    shadowColor: '#736400',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  localWeatherLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  localWeatherIconWrap: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 23,
    backgroundColor: 'rgba(239, 254, 183, 0.9)',
  },
  localWeatherEyebrow: {
    color: '#5E6A32',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  localWeatherReading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  localWeatherTemp: {
    color: '#3B3A00',
    fontSize: 20,
    fontWeight: '900',
  },
  localWeatherStatus: {
    color: '#696710',
    fontSize: 13,
    fontWeight: '600',
  },
  localWeatherAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  localWeatherActionText: {
    color: '#736400',
    fontSize: 12,
    fontWeight: '800',
  },
  checkoutSummaryCard: {
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'rgba(115, 100, 0, 0.14)',
    backgroundColor: 'rgba(255, 223, 0, 0.16)',
    padding: 22,
    alignItems: 'center',
    marginBottom: 14,
    shadowColor: '#736400',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  checkoutAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 4,
  },
  checkoutAmountPrefix: {
    color: '#3B3A00',
    fontSize: 20,
    fontWeight: '700',
  },
  checkoutAmountValue: {
    color: '#3B3A00',
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  checkoutAmountSuffix: {
    color: '#616D35',
    fontSize: 13,
    fontWeight: '600',
  },
  checkoutWeatherCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(192, 189, 95, 0.28)',
    backgroundColor: '#FFFCCB',
    paddingHorizontal: 16,
    paddingVertical: 15,
    marginTop: 12,
    marginBottom: 18,
  },
  checkoutWeatherLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  checkoutWeatherIconWrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: 'rgba(239, 254, 183, 0.9)',
  },
  checkoutWeatherEyebrow: {
    color: '#5E6A32',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  checkoutWeatherRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    flexWrap: 'wrap',
  },
  checkoutWeatherTemp: {
    color: '#3B3A00',
    fontSize: 20,
    fontWeight: '900',
  },
  checkoutWeatherStatus: {
    color: '#696710',
    fontSize: 13,
    fontWeight: '600',
  },
  checkoutWeatherLink: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingLeft: 8,
  },
  checkoutWeatherLinkText: {
    color: '#736400',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
  },
  mapCard: {
    height: 160,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    borderRadius: 14,
    marginTop: 2,
  },
  mapImage: {
    borderRadius: 14,
  },
  mapOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(59, 58, 0, 0.14)',
  },
  liveBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    margin: 12,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#736400',
  },
  liveBadgeText: {
    color: '#3B3A00',
    fontSize: 11,
    fontWeight: '800',
  },
  bottomNavSafeArea: {
    backgroundColor: '#FFFFFF',
  },
  bottomNav: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    gap: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(192, 189, 95, 0.26)',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 8,
  },
  navItem: {
    flex: 1,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 12,
    paddingHorizontal: 4,
  },
  navItemActive: {
    backgroundColor: '#FFDF00',
  },
  navLabel: {
    color: '#696710',
    fontSize: 11,
    fontWeight: '600',
  },
  navLabelActive: {
    color: '#5C5000',
    fontWeight: '800',
  },
  emptyTitle: { color: '#3B3A00', fontSize: 22, fontWeight: '800', textAlign: 'center' },
  emptySubtitle: { color: '#696710', fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 6, maxWidth: 300 },
});
