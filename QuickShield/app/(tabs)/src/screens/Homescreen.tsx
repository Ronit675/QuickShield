import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, View, Text, TouchableOpacity, StyleSheet, Modal,
  StatusBar, ScrollView, RefreshControl, ActivityIndicator, Pressable,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { getIncompleteProfileFields, isProfileComplete, signOut } from '../services/auth.service';
import {
  clearStoredRainDisruptionTimer,
  getRainDisruptionStorageKey,
  getRainDisruptionTrackingState,
} from '../services/rain-disruption.service';
import { stopBackgroundLocationTracking } from '../services/location';
import ProfileAvatar from '../components/ProfileAvatar';
import QuickShieldSidebar from '../components/QuickShieldSidebar';
import RainDisruptionCard from '../components/RainDisruptionCard';
import WeatherCard from '../components/WeatherCard';
import { useLanguage } from '../directory/Languagecontext';
import type { PolicySummary } from '../types/policy';
import { isWithinWorkingAreaRadius } from '../hooks/useLocationIntegrityMonitor';
import type { LocationIntegrityState } from '../hooks/useLocationIntegrityMonitor';

type HomeScreenProps = {
  isActive?: boolean;
  bottomInset?: number;
  variant?: 'home' | 'premium';
  onOpenPremium?: () => void;
  locationIntegrity: LocationIntegrityState;
  isClaimsFeatureDisabled: boolean;
  setIsClaimsFeatureDisabled: React.Dispatch<React.SetStateAction<boolean>>;
  selectedReturnDateLabel: string | null;
  setSelectedReturnDateLabel: React.Dispatch<React.SetStateAction<string | null>>;
  outOfTownSinceMs: number | null;
  setOutOfTownSinceMs: React.Dispatch<React.SetStateAction<number | null>>;
  outOfTownUntilDate: Date | null;
  setOutOfTownUntilDate: React.Dispatch<React.SetStateAction<Date | null>>;
  onImBackRecovered?: () => void;
  onYellowFlagNoOutOfTown?: () => void;
  onFlagQnaPendingChange?: (isPending: boolean) => void;
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

const formatDateOptionLabel = (date: Date) => date.toLocaleDateString('en-GB', {
  day: '2-digit',
  month: '2-digit',
});

const formatTimeLabel = (date: Date) => date.toLocaleTimeString('en-IN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

const startOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const endOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
};

type AnimatedAutoRenewSwitchProps = {
  value: boolean;
  onValueChange: (nextValue: boolean) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  duration?: number;
  trackColors?: { on: string; off: string };
  thumbColors?: { on: string; off: string };
};

const AnimatedAutoRenewSwitch = ({
  value,
  onValueChange,
  disabled = false,
  style,
  duration = 400,
  trackColors = { on: '#00E5A0', off: '#304255' },
  thumbColors = { on: '#0A0A0F', off: '#E5E7EB' },
}: AnimatedAutoRenewSwitchProps) => {
  const progress = useSharedValue(value ? 1 : 0);
  const trackHeight = useSharedValue(0);
  const trackWidth = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(value ? 1 : 0, { duration });
  }, [duration, progress, value]);

  const trackAnimatedStyle = useAnimatedStyle(() => {
    const backgroundColor = interpolateColor(
      progress.value,
      [0, 1],
      [trackColors.off, trackColors.on],
    );

    return {
      backgroundColor,
      borderRadius: trackHeight.value / 2,
      opacity: disabled ? 0.65 : 1,
    };
  }, [disabled, trackColors.off, trackColors.on]);

  const thumbAnimatedStyle = useAnimatedStyle(() => {
    const translateX = interpolate(
      progress.value,
      [0, 1],
      [0, Math.max(0, trackWidth.value - trackHeight.value)],
    );

    const backgroundColor = interpolateColor(
      progress.value,
      [0, 1],
      [thumbColors.off, thumbColors.on],
    );

    return {
      transform: [{ translateX }],
      borderRadius: trackHeight.value / 2,
      backgroundColor,
    };
  }, [thumbColors.off, thumbColors.on]);

  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      hitSlop={6}
    >
      <Animated.View
        onLayout={(event) => {
          trackHeight.value = event.nativeEvent.layout.height;
          trackWidth.value = event.nativeEvent.layout.width;
        }}
        style={[styles.autoRenewSwitchTrack, style, trackAnimatedStyle]}
      >
        <Animated.View style={[styles.autoRenewSwitchThumb, thumbAnimatedStyle]} />
      </Animated.View>
    </Pressable>
  );
};

export default function HomeScreen({
  isActive = false,
  bottomInset = 40,
  variant = 'home',
  onOpenPremium,
  locationIntegrity,
  isClaimsFeatureDisabled,
  setIsClaimsFeatureDisabled,
  selectedReturnDateLabel,
  setSelectedReturnDateLabel,
  outOfTownSinceMs,
  setOutOfTownSinceMs,
  outOfTownUntilDate,
  setOutOfTownUntilDate,
  onImBackRecovered,
  onYellowFlagNoOutOfTown,
  onFlagQnaPendingChange,
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
  const [showFlagQna, setShowFlagQna] = useState(false);
  const [flagQnaAnswer, setFlagQnaAnswer] = useState<'yes' | 'no' | null>(null);
  const [flagQnaStep, setFlagQnaStep] = useState<'q1' | 'return_date'>('q1');
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);
  const [showTodayTimePicker, setShowTodayTimePicker] = useState(false);
  const [pendingTodayReturnDate, setPendingTodayReturnDate] = useState<Date | null>(null);
  const [isCheckingImBack, setIsCheckingImBack] = useState(false);
  const hasAskedCurrentFlagRef = useRef(false);

  useEffect(() => {
    onFlagQnaPendingChange?.(showFlagQna);
  }, [onFlagQnaPendingChange, showFlagQna]);

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
    if (isClaimsFeatureDisabled) {
      setMiniTrackingLoading(false);
      setMiniIsTracking(false);
      setMiniTrackedStartMs(null);
      setMiniWeatherSummary(
        outOfTownUntilDate
          ? `Claims disabled until ${formatDateOptionLabel(outOfTownUntilDate)} ${formatTimeLabel(outOfTownUntilDate)}. Tap I'm Back after returning to your working area.`
          : "Claims feature is temporarily disabled. Tap I'm Back after returning to your working area.",
      );
      return;
    }

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
  }, [isClaimsFeatureDisabled, needsPlatformConnectForMiniTimer, outOfTownUntilDate, t, user]);

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
    if (!isClaimsFeatureDisabled || !outOfTownUntilDate) {
      return;
    }

    const holdUntil = outOfTownUntilDate.getTime();

    if (Date.now() > holdUntil) {
      setIsClaimsFeatureDisabled(false);
      setOutOfTownSinceMs(null);
      setOutOfTownUntilDate(null);
      setSelectedReturnDateLabel(null);
      return;
    }

    const unlockInterval = setInterval(() => {
      if (Date.now() > holdUntil) {
        setIsClaimsFeatureDisabled(false);
        setOutOfTownSinceMs(null);
        setOutOfTownUntilDate(null);
        setSelectedReturnDateLabel(null);
      }
    }, 60_000);

    return () => {
      clearInterval(unlockInterval);
    };
  }, [
    isClaimsFeatureDisabled,
    outOfTownSinceMs,
    outOfTownUntilDate,
    setIsClaimsFeatureDisabled,
    setOutOfTownSinceMs,
    setOutOfTownUntilDate,
    setSelectedReturnDateLabel,
  ]);

  useEffect(() => {
    setAutoRenewEnabled(Boolean(policy?.riskSnapshot?.autoRenew));
  }, [policy?.id, policy?.riskSnapshot?.autoRenew]);

  useEffect(() => {
    if (isPremiumTab || !isActive) {
      return;
    }

    // If pause is already active, do not ask the out-of-town QnA again on restart.
    if (isClaimsFeatureDisabled) {
      hasAskedCurrentFlagRef.current = false;
      setShowFlagQna(false);
      setFlagQnaAnswer(null);
      setFlagQnaStep('q1');
      setShowCustomDatePicker(false);
      setShowTodayTimePicker(false);
      setPendingTodayReturnDate(null);
      return;
    }

    if (locationIntegrity.flagLevel === 'yellow') {
      if (!hasAskedCurrentFlagRef.current) {
        hasAskedCurrentFlagRef.current = true;
        setFlagQnaAnswer(null);
        setFlagQnaStep('q1');
        setSelectedReturnDateLabel(null);
        setShowCustomDatePicker(false);
        setShowTodayTimePicker(false);
        setPendingTodayReturnDate(null);
        setShowFlagQna(true);
      }
      return;
    }

    // Keep QnA open until answered; do not auto-dismiss on transient flag changes.
    if (showFlagQna) {
      return;
    }

    hasAskedCurrentFlagRef.current = false;
    setShowFlagQna(false);
    setFlagQnaAnswer(null);
    setFlagQnaStep('q1');
    setSelectedReturnDateLabel(null);
    setShowCustomDatePicker(false);
    setShowTodayTimePicker(false);
    setPendingTodayReturnDate(null);
  }, [
    isActive,
    isPremiumTab,
    isClaimsFeatureDisabled,
    locationIntegrity.flagLevel,
    showFlagQna,
    setSelectedReturnDateLabel,
  ]);

  const now = new Date();
  const baseDay = startOfDay(now);
  const returnDateOptions = [
    { key: 'today', label: 'Today', dateLabel: formatDateOptionLabel(baseDay), date: baseDay },
    {
      key: 'tomorrow',
      label: 'Tomorrow',
      dateLabel: formatDateOptionLabel(new Date(baseDay.getFullYear(), baseDay.getMonth(), baseDay.getDate() + 1)),
      date: new Date(baseDay.getFullYear(), baseDay.getMonth(), baseDay.getDate() + 1),
    },
    {
      key: 'plus2',
      label: formatDateOptionLabel(new Date(baseDay.getFullYear(), baseDay.getMonth(), baseDay.getDate() + 2)),
      dateLabel: null,
      date: new Date(baseDay.getFullYear(), baseDay.getMonth(), baseDay.getDate() + 2),
    },
    {
      key: 'plus3',
      label: formatDateOptionLabel(new Date(baseDay.getFullYear(), baseDay.getMonth(), baseDay.getDate() + 3)),
      dateLabel: null,
      date: new Date(baseDay.getFullYear(), baseDay.getMonth(), baseDay.getDate() + 3),
    },
    {
      key: 'plus4',
      label: formatDateOptionLabel(new Date(baseDay.getFullYear(), baseDay.getMonth(), baseDay.getDate() + 4)),
      dateLabel: null,
      date: new Date(baseDay.getFullYear(), baseDay.getMonth(), baseDay.getDate() + 4),
    },
  ];

  const applyReturnFreeze = (label: string, freezeUntil: Date, freezeAtExactTime = false) => {
    const matchingOption = returnDateOptions.find((option) => {
      const optionLabel = option.dateLabel
        ? `${option.label} (${option.dateLabel})`
        : option.label;
      return optionLabel === label;
    });

    setSelectedReturnDateLabel(label);
    setOutOfTownSinceMs((currentValue) => currentValue ?? Date.now());
    setOutOfTownUntilDate(
      freezeAtExactTime || matchingOption?.key === 'today' ? freezeUntil : endOfDay(freezeUntil),
    );
    setIsClaimsFeatureDisabled(true);
    setMiniIsTracking(false);
    setMiniTrackedStartMs(null);
    void clearStoredRainDisruptionTimer(getRainDisruptionStorageKey(user?.id));
    setShowFlagQna(false);
    setShowTodayTimePicker(false);
    setPendingTodayReturnDate(null);
  };

  const handleReturnDateSelect = (label: string, selectedDate?: Date) => {
    const matchingOption = returnDateOptions.find((option) => {
      const optionLabel = option.dateLabel
        ? `${option.label} (${option.dateLabel})`
        : option.label;
      return optionLabel === label;
    });
    const chosenDate = selectedDate ?? (matchingOption ? new Date(matchingOption.date) : null);
    if (!chosenDate) {
      return;
    }

    if (matchingOption?.key === 'today') {
      setPendingTodayReturnDate(chosenDate);
      setShowTodayTimePicker(true);
      return;
    }

    applyReturnFreeze(label, chosenDate);
  };

  const handleCustomDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowCustomDatePicker(false);
    if (event.type === 'dismissed' || !selectedDate) {
      return;
    }

    const normalized = startOfDay(selectedDate);
    const label = formatDateOptionLabel(normalized);
    handleReturnDateSelect(label, normalized);
  };

  const handleTodayTimeChange = (event: DateTimePickerEvent, selectedTime?: Date) => {
    setShowTodayTimePicker(false);
    if (event.type === 'dismissed' || !selectedTime || !pendingTodayReturnDate) {
      setPendingTodayReturnDate(null);
      return;
    }

    const freezeUntil = new Date(pendingTodayReturnDate);
    freezeUntil.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);

    if (freezeUntil.getTime() <= Date.now()) {
      Alert.alert('Invalid return time', 'Please choose a time later than the current time.');
      setPendingTodayReturnDate(pendingTodayReturnDate);
      setShowTodayTimePicker(true);
      return;
    }

    const todayLabel = `Today (${formatDateOptionLabel(pendingTodayReturnDate)}) at ${formatTimeLabel(freezeUntil)}`;
    applyReturnFreeze(todayLabel, freezeUntil, true);
  };

  const handleImBack = useCallback(async () => {
    setIsCheckingImBack(true);

    try {
      const existingPermission = await Location.getForegroundPermissionsAsync();
      const permission = existingPermission.granted
        ? existingPermission
        : await Location.requestForegroundPermissionsAsync();

      if (!permission.granted) {
        Alert.alert('Location required', "Location access is required to verify you're back in the working area.");
        return;
      }

      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        Alert.alert('GPS off', 'Please enable location services and try again.');
        return;
      }

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      });

      const isWithinWorkingArea = isWithinWorkingAreaRadius(
        currentLocation.coords.latitude,
        currentLocation.coords.longitude,
      );

      if (!isWithinWorkingArea) {
        Alert.alert(
          'Still outside working area',
          "You're still outside the 25 km working area. Claims timer remains disabled.",
        );
        return;
      }

      setIsClaimsFeatureDisabled(false);
      setOutOfTownSinceMs(null);
      setOutOfTownUntilDate(null);
      setSelectedReturnDateLabel(null);
      onImBackRecovered?.();
      await refreshMiniDisruptionState();
      Alert.alert('Welcome back', 'Claims timer is enabled again and the app is now working normally.');
    } catch {
      Alert.alert('Location check failed', 'Could not verify your location right now. Please try again.');
    } finally {
      setIsCheckingImBack(false);
    }
  }, [
    refreshMiniDisruptionState,
    setIsClaimsFeatureDisabled,
    setOutOfTownSinceMs,
    setOutOfTownUntilDate,
    setSelectedReturnDateLabel,
    onImBackRecovered,
  ]);

  const handleSignOut = async () => {
    try {
      await stopBackgroundLocationTracking();
    } catch {
      // Ignore stop failures during logout.
    }
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

        {!isPremiumTab && (
          <View
            style={[
              styles.integrityFlag,
              locationIntegrity.flagLevel === 'red'
                ? styles.integrityFlagDanger
                : locationIntegrity.flagLevel === 'yellow'
                  ? styles.integrityFlagWarning
                  : locationIntegrity.flagLevel === 'green'
                    ? styles.integrityFlagRecovery
                    : styles.integrityFlagSafe,
            ]}
          >
            {locationIntegrity.isChecking ? (
              <ActivityIndicator
                color={
                  locationIntegrity.flagLevel === 'red'
                    ? '#FCA5A5'
                    : locationIntegrity.flagLevel === 'yellow'
                      ? '#FDE68A'
                      : locationIntegrity.flagLevel === 'green'
                        ? '#86EFAC'
                        : '#86EFAC'
                }
                size="small"
              />
            ) : (
              <Ionicons
                name={locationIntegrity.isFlagged ? 'flag' : 'flag-outline'}
                size={18}
                color={
                  locationIntegrity.flagLevel === 'red'
                    ? '#FCA5A5'
                    : locationIntegrity.flagLevel === 'yellow'
                      ? '#FDE68A'
                      : locationIntegrity.flagLevel === 'green'
                        ? '#86EFAC'
                        : '#86EFAC'
                }
              />
            )}
            <Text style={styles.integrityLabel}>
              {locationIntegrity.flagLevel === 'red'
                ? 'Red Flag'
                : locationIntegrity.flagLevel === 'yellow'
                  ? 'Yellow Flag'
                  : locationIntegrity.flagLevel === 'green'
                    ? 'Recovered'
                    : 'Safe'}
            </Text>
          </View>
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomInset }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchPolicy(); }} tintColor="#00E5A0" />}
      >
        {isClaimsFeatureDisabled && (
          <View style={styles.imBackCard}>
            <View style={styles.imBackHeader}>
              <Ionicons name="pause-circle" size={18} color="#FDE68A" />
              <Text style={styles.imBackTitle}>Claims timer paused</Text>
            </View>
            <Text style={styles.imBackSubtitle}>
              {selectedReturnDateLabel
                ? `Feature disabled until ${selectedReturnDateLabel}.`
                : 'Feature disabled for your selected out-of-town period.'}
            </Text>
            <TouchableOpacity
              style={[styles.imBackButton, isCheckingImBack && styles.imBackButtonDisabled]}
              activeOpacity={0.88}
              onPress={() => {
                void handleImBack();
              }}
              disabled={isCheckingImBack}
            >
              {isCheckingImBack ? (
                <ActivityIndicator color="#1B1304" />
              ) : (
                <Text style={styles.imBackButtonText}>I&apos;m Back</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {!isPremiumTab ? (
          <>
            <View
              style={[
                styles.miniTimerCard,
                isClaimsFeatureDisabled
                  ? styles.miniTimerCardDisabled
                  : miniIsTracking
                    ? styles.miniTimerCardActive
                    : styles.miniTimerCardIdle,
              ]}
            >
              <View style={styles.miniTimerHeader}>
                <Text style={styles.miniTimerEyebrow}>{t('home.activeDisruption')}</Text>
                <Text style={styles.miniTimerCTA}>
                  {isClaimsFeatureDisabled
                    ? 'Disabled'
                    : needsPlatformConnectForMiniTimer
                      ? t('home.required')
                      : t('home.open')}
                </Text>
              </View>

              {isClaimsFeatureDisabled ? (
                <>
                  <Text style={styles.miniTimerValue}>Paused</Text>
                  <Text numberOfLines={3} style={styles.miniTimerSummary}>
                    {miniWeatherSummary}
                  </Text>
                </>
              ) : needsPlatformConnectForMiniTimer ? (
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
                  disabled={isClaimsFeatureDisabled}
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
            <RainDisruptionCard
              isActive={isActive}
              isPaused={isClaimsFeatureDisabled}
              pausedUntilLabel={selectedReturnDateLabel}
              onPolicyRefresh={syncPolicy}
              policy={policy}
              user={user}
            />

            <View style={styles.autoRenewCard}>
              <View style={styles.autoRenewHeader}>
                <View style={styles.autoRenewTextWrap}>
                  <Text style={styles.autoRenewTitle}>Auto renew premium</Text>
                  <Text style={styles.autoRenewSubtitle}>
                    Automatically renew this weekly premium at cycle end.
                  </Text>
                </View>

                <AnimatedAutoRenewSwitch
                  value={autoRenewEnabled}
                  onValueChange={(nextValue) => {
                    void handleToggleAutoRenew(nextValue);
                  }}
                  disabled={updatingAutoRenew}
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

                <AnimatedAutoRenewSwitch
                  value={false}
                  onValueChange={(nextValue) => {
                    void handleToggleAutoRenew(nextValue);
                  }}
                  disabled
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

      {!isPremiumTab && showFlagQna && (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => {}}
        >
          <BlurView intensity={36} tint="dark" style={styles.qnaOverlay}>
            <View style={styles.qnaBackdrop} />

            <View style={styles.qnaModalCard}>
              <View style={styles.qnaImportantBadge}>
                <Ionicons name="alert-circle" size={14} color="#FDE68A" />
                <Text style={styles.qnaImportantText}>Important</Text>
              </View>

              <Text style={styles.qnaTitle}>Action Required</Text>
              <Text style={styles.qnaSubtitle}>
                Please complete this QnA to continue using app features.
              </Text>

              {flagQnaStep === 'q1' ? (
                <>
                  <Text style={styles.qnaQuestion}>Q1. Are you out of Town??</Text>

                  <View style={styles.qnaOptionsRow}>
                    <TouchableOpacity
                      style={[styles.qnaOptionBtn, flagQnaAnswer === 'yes' && styles.qnaOptionBtnActive]}
                      activeOpacity={0.9}
                      onPress={() => {
                        setFlagQnaAnswer('yes');
                        setFlagQnaStep('return_date');
                      }}
                    >
                      <Text style={[styles.qnaOptionText, flagQnaAnswer === 'yes' && styles.qnaOptionTextActive]}>Yes</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.qnaOptionBtn, flagQnaAnswer === 'no' && styles.qnaOptionBtnActive]}
                      activeOpacity={0.9}
                      onPress={() => {
                        setFlagQnaAnswer('no');
                        setIsClaimsFeatureDisabled(false);
                        setOutOfTownSinceMs(null);
                        setOutOfTownUntilDate(null);
                        setSelectedReturnDateLabel(null);
                        setShowFlagQna(false);
                        setShowTodayTimePicker(false);
                        setPendingTodayReturnDate(null);
                        onYellowFlagNoOutOfTown?.();
                      }}
                    >
                      <Text style={[styles.qnaOptionText, flagQnaAnswer === 'no' && styles.qnaOptionTextActive]}>No</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.qnaQuestion}>When you will return?</Text>
                  <View style={styles.qnaDateOptionsWrap}>
                    {returnDateOptions.map((option) => {
                      const optionLabel = option.dateLabel
                        ? `${option.label} (${option.dateLabel})`
                        : option.label;
                      return (
                        <TouchableOpacity
                          key={option.key}
                          style={styles.qnaDateOptionBtn}
                          activeOpacity={0.9}
                          onPress={() => handleReturnDateSelect(optionLabel)}
                        >
                          <Text style={styles.qnaDateOptionText}>{optionLabel}</Text>
                        </TouchableOpacity>
                      );
                    })}

                    <TouchableOpacity
                      style={styles.qnaDateOptionBtn}
                      activeOpacity={0.9}
                      onPress={() => setShowCustomDatePicker(true)}
                    >
                      <Text style={styles.qnaDateOptionText}>Custom Date</Text>
                    </TouchableOpacity>
                  </View>

                  {selectedReturnDateLabel && (
                    <Text style={styles.qnaSelectionText}>Selected return: {selectedReturnDateLabel}</Text>
                  )}
                </>
              )}
            </View>

            {showCustomDatePicker && (
              <DateTimePicker
                value={baseDay}
                mode="date"
                display="default"
                minimumDate={baseDay}
                onChange={handleCustomDateChange}
              />
            )}
            {showTodayTimePicker && (
              <DateTimePicker
                value={new Date()}
                mode="time"
                display="default"
                onChange={handleTodayTimeChange}
              />
            )}
          </BlurView>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0F', paddingHorizontal: 20 },
  center: { flex: 1, backgroundColor: '#0A0A0F', justifyContent: 'center', alignItems: 'center' },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
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
  integrityFlag: {
    minHeight: 42,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  integrityFlagSafe: {
    backgroundColor: '#0C2B1F',
    borderColor: '#14532D',
  },
  integrityFlagRecovery: {
    backgroundColor: '#0F3B2E',
    borderColor: '#1DAA6E',
  },
  integrityFlagWarning: {
    backgroundColor: '#3D2F0C',
    borderColor: '#92400E',
  },
  integrityFlagDanger: {
    backgroundColor: '#321118',
    borderColor: '#7F1D1D',
  },
  integrityLabel: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  imBackCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#92400E',
    backgroundColor: '#3D2F0C',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  imBackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  imBackTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  imBackSubtitle: {
    color: '#F6E7B6',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 10,
  },
  imBackButton: {
    minHeight: 38,
    borderRadius: 10,
    backgroundColor: '#FDE68A',
    borderWidth: 1,
    borderColor: '#D97706',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imBackButtonDisabled: {
    opacity: 0.75,
  },
  imBackButtonText: {
    color: '#1B1304',
    fontSize: 14,
    fontWeight: '800',
  },
  qnaOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  qnaBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 6, 14, 0.58)',
  },
  qnaModalCard: {
    width: '100%',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#92400E',
    backgroundColor: 'rgba(36, 24, 7, 0.96)',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  qnaImportantBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: '#3D2F0C',
    borderWidth: 1,
    borderColor: '#B45309',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 10,
  },
  qnaImportantText: {
    color: '#FDE68A',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  qnaTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  qnaSubtitle: {
    color: '#E5E7EB',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  qnaQuestion: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 10,
  },
  qnaOptionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  qnaOptionBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#B45309',
    backgroundColor: '#5C4308',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qnaOptionBtnActive: {
    borderColor: '#FDE68A',
    backgroundColor: '#92400E',
  },
  qnaOptionText: {
    color: '#FDE68A',
    fontSize: 14,
    fontWeight: '700',
  },
  qnaOptionTextActive: {
    color: '#FFFFFF',
  },
  qnaDateOptionsWrap: {
    gap: 8,
  },
  qnaDateOptionBtn: {
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#B45309',
    backgroundColor: '#5C4308',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  qnaDateOptionText: {
    color: '#FDE68A',
    fontSize: 14,
    fontWeight: '700',
  },
  qnaSelectionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 10,
    textAlign: 'center',
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
  miniTimerCardDisabled: {
    backgroundColor: '#2F2610',
    borderColor: '#6E4D10',
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
  claimsDisabledCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#6E4D10',
    backgroundColor: '#2F2610',
    padding: 16,
    marginBottom: 16,
  },
  claimsDisabledTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 6,
  },
  claimsDisabledText: {
    color: '#E2D5A8',
    fontSize: 13,
    lineHeight: 18,
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
  autoRenewSwitchTrack: {
    width: 52,
    height: 32,
    padding: 3,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  autoRenewSwitchThumb: {
    height: '100%',
    aspectRatio: 1,
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
