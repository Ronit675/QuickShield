import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import HistoryScreen from './HistoryScreen';
import HomeScreen from './Homescreen';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../directory/Languagecontext';
import {
  useLocationIntegrityMonitor,
  type LocationIntegrityState,
  type LocationIntegrityReason,
} from '../hooks/useLocationIntegrityMonitor';
import {
  fetchPersistedAppState,
  mapPersistedAppStateToLocationIntegrity,
  syncPersistedAppState,
} from '../services/app-state.service';
import { startBackgroundLocationTracking } from '../services/location';
const FlagsScreen = React.lazy(() => import('./FlagsScreen'));

type TabKey = 'home' | 'flags' | 'premium' | 'history';

type TabDefinition = {
  key: TabKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const isTabKey = (value: unknown): value is TabKey =>
  value === 'home' || value === 'flags' || value === 'premium' || value === 'history';

export default function MainTabsScreen() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [isClaimsFeatureDisabled, setIsClaimsFeatureDisabled] = useState(false);
  const [selectedReturnDateLabel, setSelectedReturnDateLabel] = useState<string | null>(null);
  const [outOfTownSinceMs, setOutOfTownSinceMs] = useState<number | null>(null);
  const [outOfTownUntilDate, setOutOfTownUntilDate] = useState<Date | null>(null);
  const [flagCounterOffset, setFlagCounterOffset] = useState(0);
  const [forceGreenUntilMs, setForceGreenUntilMs] = useState<number | null>(null);
  const [appBackToNormalAtMs, setAppBackToNormalAtMs] = useState<number | null>(null);
  const [forceOutsideAreaRedAt, setForceOutsideAreaRedAt] = useState<number | null>(null);
  const [isFlagQnaPending, setIsFlagQnaPending] = useState(false);
  const [hydratedLocationIntegrity, setHydratedLocationIntegrity] =
    useState<Partial<LocationIntegrityState> | null>(null);
  const [isAppStateReady, setIsAppStateReady] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const handledTabParam = useRef<string | null>(null);
  const locationIntegrity = useLocationIntegrityMonitor({
    enabled: isAppStateReady,
    pollIntervalMs: 60_000,
    hydratedState: hydratedLocationIntegrity,
    forceOutsideAreaRedAt,
    riderProfile: user
      ? {
        workingShiftLabel: user.workingShiftLabel ?? null,
        workingTimeSlots: user.workingTimeSlots ?? null,
      }
      : null,
  });
  const TABS: TabDefinition[] = [
    { key: 'home', label: t('tabs.home'), icon: 'home' },
    { key: 'flags', label: 'Flags', icon: 'flag' },
    { key: 'premium', label: t('tabs.premium'), icon: 'shield-checkmark' },
    { key: 'history', label: t('tabs.history'), icon: 'time' },
  ];
  const activeIndex = TABS.findIndex((tab) => tab.key === activeTab);

  useEffect(() => {
    const requestedTab = Array.isArray(params.tab) ? params.tab[0] : params.tab;

    if (isTabKey(requestedTab) && handledTabParam.current !== requestedTab) {
      handledTabParam.current = requestedTab;
      setActiveTab(requestedTab);
    }
  }, [params.tab]);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: activeIndex,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [activeIndex, progress]);

  useEffect(() => {
    let cancelled = false;

    const startTracking = async () => {
      try {
        await startBackgroundLocationTracking();
      } catch (error) {
        if (!cancelled) {
          console.warn('Background location tracking not started:', error);
        }
      }
    };

    void startTracking();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadPersistedAppState = async () => {
      if (!user?.id) {
        if (!cancelled) {
          setHydratedLocationIntegrity(null);
          setIsClaimsFeatureDisabled(false);
          setSelectedReturnDateLabel(null);
          setOutOfTownSinceMs(null);
          setOutOfTownUntilDate(null);
          setFlagCounterOffset(0);
          setForceGreenUntilMs(null);
          setAppBackToNormalAtMs(null);
          setIsAppStateReady(true);
        }
        return;
      }

      if (!cancelled) {
        setIsAppStateReady(false);
      }

      try {
        const appState = await fetchPersistedAppState();
        if (cancelled) {
          return;
        }

        setHydratedLocationIntegrity(mapPersistedAppStateToLocationIntegrity(appState));
        setIsClaimsFeatureDisabled(appState.outOfStationActive);
        setSelectedReturnDateLabel(appState.outOfStationReturnLabel);
        setOutOfTownSinceMs(appState.outOfStationSince);
        setOutOfTownUntilDate(appState.outOfStationUntil ? new Date(appState.outOfStationUntil) : null);
        setFlagCounterOffset(0);
        setAppBackToNormalAtMs(appState.appBackToNormalAt);

        if (appState.appBackToNormalAt && appState.appBackToNormalAt + 70_000 > Date.now()) {
          setForceGreenUntilMs(appState.appBackToNormalAt + 70_000);
        } else {
          setForceGreenUntilMs(null);
        }
      } catch {
        if (!cancelled) {
          setHydratedLocationIntegrity(null);
          setIsClaimsFeatureDisabled(false);
          setSelectedReturnDateLabel(null);
          setOutOfTownSinceMs(null);
          setOutOfTownUntilDate(null);
          setFlagCounterOffset(0);
          setForceGreenUntilMs(null);
          setAppBackToNormalAtMs(null);
        }
      } finally {
        if (!cancelled) {
          setIsAppStateReady(true);
        }
      }
    };

    void loadPersistedAppState();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!forceGreenUntilMs) {
      return;
    }

    if (Date.now() >= forceGreenUntilMs) {
      setForceGreenUntilMs(null);
      return;
    }

    const timer = setTimeout(() => {
      setForceGreenUntilMs(null);
    }, forceGreenUntilMs - Date.now());

    return () => {
      clearTimeout(timer);
    };
  }, [forceGreenUntilMs]);

  const handleImBackRecovered = useCallback(() => {
    const resumedAt = Date.now();
    setFlagCounterOffset((previousOffset) => {
      const currentCount = locationIntegrity.redFlagCount + previousOffset;
      return currentCount > 0 ? previousOffset - 1 : previousOffset;
    });
    setOutOfTownSinceMs(null);
    setAppBackToNormalAtMs(resumedAt);
    setForceGreenUntilMs(resumedAt + 70_000);
  }, [locationIntegrity.redFlagCount]);

  const handleYellowFlagNoOutOfTown = useCallback(() => {
    setForceGreenUntilMs(null);
    setForceOutsideAreaRedAt(Date.now());
  }, []);

  const adjustedRedFlagCount = Math.max(0, locationIntegrity.redFlagCount + flagCounterOffset);
  const shouldForceGreen = Boolean(forceGreenUntilMs && Date.now() < forceGreenUntilMs);
  const sharedLocationIntegrity = shouldForceGreen
    ? {
      ...locationIntegrity,
      isFlagged: false,
      flagLevel: 'none' as const,
      reasons: [],
      statusText: 'GPS normal',
      redFlagCount: adjustedRedFlagCount,
    }
    : {
      ...locationIntegrity,
      redFlagCount: adjustedRedFlagCount,
    };
  const displayLocationIntegrity = isFlagQnaPending
    ? {
      ...sharedLocationIntegrity,
      isFlagged: true,
      flagLevel: 'yellow' as const,
      reasons: sharedLocationIntegrity.reasons.length > 0
        ? sharedLocationIntegrity.reasons
        : (['outside_working_area'] as unknown as LocationIntegrityReason[]),
      statusText: 'Action required: please answer the out-of-town questions.',
    }
    : sharedLocationIntegrity;
  const appStateSyncKey = JSON.stringify({
    flagCount: adjustedRedFlagCount,
    history: locationIntegrity.history,
    currentFlagLevel: displayLocationIntegrity.flagLevel,
    currentReasons: displayLocationIntegrity.reasons,
    currentStatusText: displayLocationIntegrity.statusText,
    lastCheckedAt: displayLocationIntegrity.lastCheckedAt,
    redFlagDetectedAt: locationIntegrity.redFlagDetectedAt,
    normalizedAfterRedAt: locationIntegrity.normalizedAfterRedAt,
    outOfStationActive: isClaimsFeatureDisabled,
    outOfStationSince: outOfTownSinceMs,
    outOfStationUntil: outOfTownUntilDate?.getTime() ?? null,
    outOfStationReturnLabel: selectedReturnDateLabel,
    appBackToNormalAt: appBackToNormalAtMs,
  });

  useEffect(() => {
    if (!locationIntegrity.lastSuspiciousDetectedAt || !locationIntegrity.suspiciousHoldUntilMs) {
      return;
    }

    setIsClaimsFeatureDisabled(true);
    setOutOfTownSinceMs((current) => current ?? locationIntegrity.lastSuspiciousDetectedAt);
    setOutOfTownUntilDate((current) => {
      const suspiciousHoldUntil = new Date(locationIntegrity.suspiciousHoldUntilMs!);
      if (!current || current.getTime() < suspiciousHoldUntil.getTime()) {
        return suspiciousHoldUntil;
      }
      return current;
    });
    setSelectedReturnDateLabel('Suspicious movement hold (60 mins)');
  }, [
    locationIntegrity.lastSuspiciousDetectedAt,
    locationIntegrity.suspiciousHoldUntilMs,
  ]);

  useEffect(() => {
    if (!locationIntegrity.lastInvigilatingDetectedAt || !locationIntegrity.invigilatingHoldUntilMs) {
      return;
    }

    setIsClaimsFeatureDisabled(true);
    setOutOfTownSinceMs((current) => current ?? locationIntegrity.lastInvigilatingDetectedAt);
    setOutOfTownUntilDate((current) => {
      const invigilatingHoldUntil = new Date(locationIntegrity.invigilatingHoldUntilMs!);
      if (!current || current.getTime() < invigilatingHoldUntil.getTime()) {
        return invigilatingHoldUntil;
      }
      return current;
    });
    setSelectedReturnDateLabel('Invigilating fluctuation hold (30 mins)');
  }, [
    locationIntegrity.lastInvigilatingDetectedAt,
    locationIntegrity.invigilatingHoldUntilMs,
  ]);

  useEffect(() => {
    if (!locationIntegrity.lastAccountSuspendedAt || !locationIntegrity.accountSuspendedUntilMs) {
      return;
    }

    setIsClaimsFeatureDisabled(true);
    setOutOfTownSinceMs((current) => current ?? locationIntegrity.lastAccountSuspendedAt);
    setOutOfTownUntilDate((current) => {
      const suspendedUntil = new Date(locationIntegrity.accountSuspendedUntilMs!);
      if (!current || current.getTime() < suspendedUntil.getTime()) {
        return suspendedUntil;
      }
      return current;
    });
    setSelectedReturnDateLabel('Account suspended (60 mins)');
  }, [
    locationIntegrity.lastAccountSuspendedAt,
    locationIntegrity.accountSuspendedUntilMs,
  ]);

  useEffect(() => {
    if (!user?.id || !isAppStateReady) {
      return;
    }

    const syncTimeout = setTimeout(() => {
      void syncPersistedAppState({
        flagCount: adjustedRedFlagCount,
        history: locationIntegrity.history,
        currentFlagLevel: displayLocationIntegrity.flagLevel,
        currentReasons: displayLocationIntegrity.reasons,
        currentStatusText: displayLocationIntegrity.statusText,
        lastCheckedAt: displayLocationIntegrity.lastCheckedAt,
        redFlagDetectedAt: locationIntegrity.redFlagDetectedAt,
        normalizedAfterRedAt: locationIntegrity.normalizedAfterRedAt,
        outOfStationActive: isClaimsFeatureDisabled,
        outOfStationSince: outOfTownSinceMs,
        outOfStationUntil: outOfTownUntilDate?.getTime() ?? null,
        outOfStationReturnLabel: selectedReturnDateLabel,
        appBackToNormalAt: appBackToNormalAtMs,
      }).catch(() => {
        // Ignore sync failures and continue with the in-memory state.
      });
    }, 500);

    return () => {
      clearTimeout(syncTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    appStateSyncKey,
    isAppStateReady,
    user?.id,
  ]);

  const baseTabHeight = width >= 768 ? 84 : 74;
  const contentBottomInset = baseTabHeight + Math.max(insets.bottom, 12) + 20;

  const renderScene = (tabKey: TabKey) => {
    switch (tabKey) {
      case 'home':
        return (
          <HomeScreen
            isActive={activeTab === 'home'}
            bottomInset={contentBottomInset}
            variant="home"
            onOpenPremium={() => setActiveTab('premium')}
            locationIntegrity={displayLocationIntegrity}
            isClaimsFeatureDisabled={isClaimsFeatureDisabled}
            setIsClaimsFeatureDisabled={setIsClaimsFeatureDisabled}
            selectedReturnDateLabel={selectedReturnDateLabel}
            setSelectedReturnDateLabel={setSelectedReturnDateLabel}
            outOfTownSinceMs={outOfTownSinceMs}
            setOutOfTownSinceMs={setOutOfTownSinceMs}
            outOfTownUntilDate={outOfTownUntilDate}
            setOutOfTownUntilDate={setOutOfTownUntilDate}
            onImBackRecovered={handleImBackRecovered}
            onYellowFlagNoOutOfTown={handleYellowFlagNoOutOfTown}
            onFlagQnaPendingChange={setIsFlagQnaPending}
          />
        );
      case 'flags':
        return (
          <React.Suspense
            fallback={(
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0A0A0F' }}>
                <Text style={{ color: '#D1D5DB', fontSize: 14, fontWeight: '600' }}>Loading flags...</Text>
              </View>
            )}
          >
            <FlagsScreen
              isActive={activeTab === 'flags'}
              bottomInset={contentBottomInset}
              locationIntegrity={displayLocationIntegrity}
            />
          </React.Suspense>
        );
      case 'premium':
        return (
          <HomeScreen
            isActive={activeTab === 'premium'}
            bottomInset={contentBottomInset}
            variant="premium"
            onOpenPremium={() => setActiveTab('premium')}
            locationIntegrity={displayLocationIntegrity}
            isClaimsFeatureDisabled={isClaimsFeatureDisabled}
            setIsClaimsFeatureDisabled={setIsClaimsFeatureDisabled}
            selectedReturnDateLabel={selectedReturnDateLabel}
            setSelectedReturnDateLabel={setSelectedReturnDateLabel}
            outOfTownSinceMs={outOfTownSinceMs}
            setOutOfTownSinceMs={setOutOfTownSinceMs}
            outOfTownUntilDate={outOfTownUntilDate}
            setOutOfTownUntilDate={setOutOfTownUntilDate}
            onImBackRecovered={handleImBackRecovered}
            onYellowFlagNoOutOfTown={handleYellowFlagNoOutOfTown}
            onFlagQnaPendingChange={setIsFlagQnaPending}
          />
        );
      case 'history':
        return <HistoryScreen isActive={activeTab === 'history'} bottomInset={contentBottomInset} />;
      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.sceneContainer}>
        {TABS.map((tab, index) => {
          const opacity = progress.interpolate({
            inputRange: [index - 1, index, index + 1],
            outputRange: [0, 1, 0],
            extrapolate: 'clamp',
          });

          const translateX = progress.interpolate({
            inputRange: [index - 1, index, index + 1],
            outputRange: [-16, 0, 16],
            extrapolate: 'clamp',
          });

          return (
            <Animated.View
              key={tab.key}
              pointerEvents={activeTab === tab.key ? 'auto' : 'none'}
              style={[
                styles.scene,
                {
                  opacity,
                  transform: [{ translateX }],
                  zIndex: activeTab === tab.key ? 2 : 1,
                },
              ]}
            >
              {renderScene(tab.key)}
            </Animated.View>
          );
        })}
      </View>

      <View pointerEvents="box-none" style={styles.tabBarWrap}>
        <View
          style={[
            styles.tabBar,
            {
              paddingBottom: Math.max(insets.bottom, 12),
              minHeight: width >= 768 ? 84 : 74,
            },
          ]}
        >
          {TABS.map((tab) => {
            const focused = activeTab === tab.key;

            return (
              <TouchableOpacity
                key={tab.key}
                activeOpacity={0.9}
                onPress={() => setActiveTab(tab.key)}
                style={[styles.tabButton, focused && styles.tabButtonActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: focused }}
              >
                <Ionicons
                  name={focused ? tab.icon : `${tab.icon}-outline` as keyof typeof Ionicons.glyphMap}
                  size={22}
                  color={focused ? '#736400' : '#A8A29E'}
                />
                <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
    position: 'relative',
  },
  sceneContainer: {
    flex: 1,
  },
  scene: {
    ...StyleSheet.absoluteFillObject,
  },
  tabBarWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    zIndex: 50,
    elevation: 50,
  },
  tabBar: {
    alignSelf: 'center',
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 4,
    paddingHorizontal: 8,
    paddingTop: 10,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderTopWidth: 1,
    borderColor: '#F3F1EA',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -2 },
    elevation: 12,
  },
  tabButton: {
    flex: 1,
    minHeight: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 7,
  },
  tabButtonActive: {
    backgroundColor: '#FFFCCB',
  },
  tabLabel: {
    color: '#A8A29E',
    fontSize: 12,
    fontWeight: '600',
  },
  tabLabelActive: {
    color: '#736400',
    fontWeight: '800',
  },
});
