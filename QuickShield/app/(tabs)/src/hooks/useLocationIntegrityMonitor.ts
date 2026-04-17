import { useEffect, useRef, useState } from 'react';
import { Alert, Linking } from 'react-native';
import * as Location from 'expo-location';
import type { AuthUser } from '../services/auth.service';
import { getActiveWorkingWindow } from '../services/rain-disruption.service';
import { loadMockWeatherForecast, type MockWeatherBundle } from '../services/weather';

export type LocationIntegrityReason =
  | 'mock_location_detected'
  | 'teleportation'
  | 'unnatural_velocity_curve'
  | 'outside_working_area'
  | 'suspicious_outside_working_area'
  | 'invigilating_location_fluctuation'
  | 'account_suspended_location_pattern'
  | 'permission_denied'
  | 'gps_unavailable'
  | 'location_error';

type LocationSample = {
  latitude: number;
  longitude: number;
  timestamp: number;
};

type LocationWeatherDetails = {
  latitude: number;
  longitude: number;
  weather: MockWeatherBundle['current'] & {
    generatedAt: string;
    locationLabel: string;
    isHeavyRainfall: boolean;
  };
};

export type FlagHistoryEntry = {
  reason: LocationIntegrityReason;
  detectedAt: number;
};

type UseLocationIntegrityMonitorOptions = {
  enabled: boolean;
  pollIntervalMs?: number;
  hydratedState?: Partial<LocationIntegrityState> | null;
  forceOutsideAreaRedAt?: number | null;
  riderProfile?: Pick<AuthUser, 'workingShiftLabel' | 'workingTimeSlots'> | null;
};

export type LocationIntegrityFlagLevel = 'none' | 'yellow' | 'red' | 'green';

export type LocationIntegrityState = {
  isFlagged: boolean;
  flagLevel: LocationIntegrityFlagLevel;
  isChecking: boolean;
  reasons: LocationIntegrityReason[];
  statusText: string;
  lastCheckedAt: number | null;
  redFlagCount: number;
  history: FlagHistoryEntry[];
  redFlagDetectedAt: number | null;
  normalizedAfterRedAt: number | null;
  consecutiveInnerRadiusPoints: number;
  suspiciousHoldUntilMs: number | null;
  lastSuspiciousDetectedAt: number | null;
  invigilatingHoldUntilMs: number | null;
  lastInvigilatingDetectedAt: number | null;
  accountSuspendedUntilMs: number | null;
  lastAccountSuspendedAt: number | null;
};

const EARTH_RADIUS_KM = 6371;
export const WORKING_AREA_RADIUS_KM = 10;
const INNER_RADIUS_KM = 10;
const DURATION_CHECK_GPS_POINTS = 5;
const MAX_SAMPLE_HISTORY = 6;
const MAX_SPEED_HISTORY = 8;
const TELEPORT_DISTANCE_KM = 2;
const TELEPORT_WINDOW_SECONDS = 90;
const GREEN_FLAG_RECOVERY_WINDOW_MS = 2 * 60 * 1000; // 2 minutes of stable movement after re-entering 10 km zone
const MAX_STABLE_MOVEMENT_KM_PER_CHECK = 0.5; // per poll interval
const LOCATION_CHANGE_RESTART_THRESHOLD_KM = 0.25;
const HEAVY_RAINFALL_THRESHOLD_MM_PER_HR = 22;
const SUSPICIOUS_CLAIMS_HOLD_MS = 60 * 60 * 1000;
const LOCATION_CHANGE_INVIGILATING_THRESHOLD = 4;
const INVIGILATING_WINDOW_MS = 30 * 60 * 1000;
const INVIGILATING_CLAIMS_HOLD_MS = 30 * 60 * 1000;
const LOCATION_CHANGE_PATTERN_WINDOW = 4;
const LOCATION_CHANGE_PATTERN_MIN_HITS_FOR_SUSPEND = 2;
const ACCOUNT_SUSPEND_MS = 60 * 60 * 1000;
export const WORKING_AREA_CENTER = {
  // Whitefield, Bengaluru
  latitude: 12.9698,
  longitude: 77.7499,
};

const REASON_TEXT: Record<LocationIntegrityReason, string> = {
  mock_location_detected: 'Mock location provider detected',
  teleportation: 'Detected 2 km+ jump in under 90 seconds',
  unnatural_velocity_curve: 'Velocity curve looks unnatural',
  outside_working_area: 'Outside 10 km working area',
  suspicious_outside_working_area: 'Suspicious movement outside 10 km area during heavy rainfall/working hours',
  invigilating_location_fluctuation: 'Invigilating - location changed repeatedly during 5 checks',
  account_suspended_location_pattern: 'Account suspended - repeated changed locations matched rainfall/working-slot pattern',
  permission_denied: 'Location permission denied',
  gps_unavailable: 'GPS services are disabled',
  location_error: 'Unable to read current location',
};

const toRadians = (value: number) => (value * Math.PI) / 180;

const calculateDistanceKm = (
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) => {
  const latDistance = toRadians(b.latitude - a.latitude);
  const lonDistance = toRadians(b.longitude - a.longitude);

  const sinLat = Math.sin(latDistance / 2);
  const sinLon = Math.sin(lonDistance / 2);

  const root = sinLat * sinLat
    + Math.cos(toRadians(a.latitude))
    * Math.cos(toRadians(b.latitude))
    * sinLon * sinLon;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(root));
};

const hasUnnaturalVelocityCurve = (speedsKmh: number[]) => {
  if (speedsKmh.length < 4) {
    return false;
  }

  const windowSpeeds = speedsKmh.slice(-4);
  const deltas = windowSpeeds.slice(1).map((speed, index) => speed - windowSpeeds[index]);
  const maxDelta = Math.max(...deltas.map((delta) => Math.abs(delta)));
  const averageDelta = deltas.reduce((sum, delta) => sum + Math.abs(delta), 0) / deltas.length;
  const velocityRange = Math.max(...windowSpeeds) - Math.min(...windowSpeeds);

  let signFlips = 0;
  for (let index = 1; index < deltas.length; index += 1) {
    if (deltas[index] * deltas[index - 1] < 0) {
      signFlips += 1;
    }
  }

  return signFlips >= 2
    && maxDelta >= 45
    && averageDelta >= 30
    && velocityRange >= 70;
};

const normalizeTimestamp = (timestamp: number, previousTimestamp: number | null) => {
  if (previousTimestamp === null) {
    return timestamp;
  }

  if (timestamp > previousTimestamp) {
    return timestamp;
  }

  return previousTimestamp + 1_000;
};

export const isWithinWorkingAreaRadius = (latitude: number, longitude: number) => {
  const distanceFromWorkingAreaKm = calculateDistanceKm(
    { latitude, longitude },
    WORKING_AREA_CENTER,
  );

  return distanceFromWorkingAreaKm <= WORKING_AREA_RADIUS_KM;
};

const isWithinInnerRadius = (latitude: number, longitude: number) => {
  const distanceFromWorkingAreaKm = calculateDistanceKm(
    { latitude, longitude },
    WORKING_AREA_CENTER,
  );

  return distanceFromWorkingAreaKm <= INNER_RADIUS_KM;
};

const isMockedLocation = (location: Location.LocationObject) => {
  const coordsWithMocked = location.coords as Location.LocationObjectCoords & { mocked?: boolean };
  const locationWithMocked = location as Location.LocationObject & { mocked?: boolean };
  return Boolean(coordsWithMocked?.mocked ?? locationWithMocked?.mocked);
};

const isRedSeverityReason = (reason: LocationIntegrityReason) =>
  reason === 'mock_location_detected'
  || reason === 'teleportation'
  || reason === 'unnatural_velocity_curve';

const loadMockHeavyRainfallDetailsForLocation = async (
  location: { latitude: number; longitude: number },
): Promise<LocationWeatherDetails> => {
  const weather = await loadMockWeatherForecast();

  return {
    latitude: location.latitude,
    longitude: location.longitude,
    weather: {
      ...weather.current,
      generatedAt: weather.generatedAt,
      locationLabel: weather.location.label,
      isHeavyRainfall: weather.current.rainfallRateMmPerHr >= HEAVY_RAINFALL_THRESHOLD_MM_PER_HR,
    },
  };
};

export const useLocationIntegrityMonitor = ({
  enabled,
  pollIntervalMs = 60_000,
  hydratedState = null,
  forceOutsideAreaRedAt = null,
  riderProfile = null,
}: UseLocationIntegrityMonitorOptions): LocationIntegrityState => {
  const [state, setState] = useState<LocationIntegrityState>({
    isFlagged: false,
    flagLevel: 'none',
    isChecking: false,
    reasons: [],
    statusText: 'GPS check inactive',
    lastCheckedAt: null,
    redFlagCount: 0,
    history: [],
    redFlagDetectedAt: null,
    normalizedAfterRedAt: null,
    consecutiveInnerRadiusPoints: 0,
    suspiciousHoldUntilMs: null,
    lastSuspiciousDetectedAt: null,
    invigilatingHoldUntilMs: null,
    lastInvigilatingDetectedAt: null,
    accountSuspendedUntilMs: null,
    lastAccountSuspendedAt: null,
  });

  const inFlightRef = useRef(false);
  const locationSamplesRef = useRef<LocationSample[]>([]);
  const speedHistoryRef = useRef<number[]>([]);
  const consecutiveInnerRadiusPointsRef = useRef<number>(0);
  const hasCompletedInitialForegroundCheckRef = useRef(false);
  const hasPromptedForPermissionRef = useRef(false);
  const hasPromptedForGpsRef = useRef(false);
  const hasAppliedHydratedStateRef = useRef(false);
  const hadTeleportationInCurrentRedCycleRef = useRef(false);
  const redCycleAnchorLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const locationChangeCountInCurrentCycleRef = useRef(0);
  const invigilatingMarkedInCurrentCycleRef = useRef(false);
  const invigilatingEventTimestampsRef = useRef<number[]>([]);
  const locationChangeConditionHitsInCurrentCycleRef = useRef<boolean[]>([]);

  useEffect(() => {
    if (!hydratedState) {
      hasAppliedHydratedStateRef.current = false;
      return;
    }

    if (hasAppliedHydratedStateRef.current) {
      return;
    }

    setState((current) => ({
      ...current,
      ...hydratedState,
      isFlagged: hydratedState.isFlagged ?? (hydratedState.flagLevel ?? current.flagLevel) !== 'none',
      reasons: hydratedState.reasons ? [...hydratedState.reasons] : current.reasons,
      history: hydratedState.history ? [...hydratedState.history] : current.history,
    }));
    hasAppliedHydratedStateRef.current = true;
  }, [hydratedState]);

  useEffect(() => {
    if (!enabled || !forceOutsideAreaRedAt) {
      return;
    }

    locationSamplesRef.current = [];
    speedHistoryRef.current = [];
    consecutiveInnerRadiusPointsRef.current = 0;
    redCycleAnchorLocationRef.current = null;
    locationChangeCountInCurrentCycleRef.current = 0;
    invigilatingMarkedInCurrentCycleRef.current = false;
    locationChangeConditionHitsInCurrentCycleRef.current = [];
    hadTeleportationInCurrentRedCycleRef.current = false;

    setState((current) => ({
      ...current,
      isFlagged: true,
      flagLevel: 'red',
      isChecking: false,
      reasons: ['outside_working_area'],
      statusText: 'Outside 10 km working area - recovery checks restarted',
      lastCheckedAt: forceOutsideAreaRedAt,
      redFlagCount: current.redFlagCount + 1,
      history: [...current.history, { reason: 'outside_working_area', detectedAt: forceOutsideAreaRedAt }],
      redFlagDetectedAt: forceOutsideAreaRedAt,
      normalizedAfterRedAt: null,
      consecutiveInnerRadiusPoints: 0,
      suspiciousHoldUntilMs: current.suspiciousHoldUntilMs,
      lastSuspiciousDetectedAt: current.lastSuspiciousDetectedAt,
      invigilatingHoldUntilMs: current.invigilatingHoldUntilMs,
      lastInvigilatingDetectedAt: current.lastInvigilatingDetectedAt,
      accountSuspendedUntilMs: current.accountSuspendedUntilMs,
      lastAccountSuspendedAt: current.lastAccountSuspendedAt,
    }));
    hadTeleportationInCurrentRedCycleRef.current = false;
  }, [enabled, forceOutsideAreaRedAt]);

  const promptToOpenSettings = (title: string, message: string) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Open Settings',
        onPress: () => {
          void Linking.openSettings();
        },
      },
    ]);
  };

  useEffect(() => {
    if (!enabled) {
      setState((current) => ({
        ...current,
        isChecking: false,
        redFlagDetectedAt: null,
        normalizedAfterRedAt: null,
        consecutiveInnerRadiusPoints: 0,
      }));
      consecutiveInnerRadiusPointsRef.current = 0;
      hasCompletedInitialForegroundCheckRef.current = false;
      hasPromptedForPermissionRef.current = false;
      hasPromptedForGpsRef.current = false;
      hadTeleportationInCurrentRedCycleRef.current = false;
      redCycleAnchorLocationRef.current = null;
      locationChangeCountInCurrentCycleRef.current = 0;
      invigilatingMarkedInCurrentCycleRef.current = false;
      locationChangeConditionHitsInCurrentCycleRef.current = [];
      return;
    }

    hasPromptedForPermissionRef.current = false;
    hasPromptedForGpsRef.current = false;

    let cancelled = false;

    const runIntegrityCheck = async () => {
      if (inFlightRef.current) {
        return;
      }

      inFlightRef.current = true;

      try {
        const existingPermission = await Location.getForegroundPermissionsAsync();
        const permission = existingPermission.granted
          ? existingPermission
          : await Location.requestForegroundPermissionsAsync();

        if (!permission.granted) {
          if (!hasPromptedForPermissionRef.current) {
            hasPromptedForPermissionRef.current = true;
            promptToOpenSettings(
              'Location access required',
              'QuickShield needs location access to verify if a rider is within the 10 km working area.',
            );
          }

          if (!cancelled) {
            setState((current) => ({
              ...current,
              isFlagged: false,
              flagLevel: 'none',
              isChecking: false,
              reasons: [],
              statusText: REASON_TEXT.permission_denied,
              lastCheckedAt: Date.now(),
              redFlagDetectedAt: null,
              normalizedAfterRedAt: null,
              consecutiveInnerRadiusPoints: 0,
              history: current.history,
            }));
          }
          return;
        }

        const servicesEnabled = await Location.hasServicesEnabledAsync();
        if (!servicesEnabled) {
          if (!hasPromptedForGpsRef.current) {
            hasPromptedForGpsRef.current = true;
            promptToOpenSettings(
              'Turn on location services',
              'GPS is off. Enable location services to verify if the rider is within the 10 km working area.',
            );
          }

          if (!cancelled) {
            setState((current) => ({
              ...current,
              isFlagged: false,
              flagLevel: 'none',
              isChecking: false,
              reasons: [],
              statusText: REASON_TEXT.gps_unavailable,
              lastCheckedAt: Date.now(),
              redFlagDetectedAt: null,
              normalizedAfterRedAt: null,
              consecutiveInnerRadiusPoints: 0,
              history: current.history,
            }));
          }
          return;
        }

        const currentLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Highest,
        });

        const previousSample = locationSamplesRef.current[locationSamplesRef.current.length - 1] ?? null;
        const normalizedTimestamp = normalizeTimestamp(
          currentLocation.timestamp ?? Date.now(),
          previousSample?.timestamp ?? null,
        );

        const currentSample: LocationSample = {
          latitude: currentLocation.coords.latitude,
          longitude: currentLocation.coords.longitude,
          timestamp: normalizedTimestamp,
        };

        const nextSamples = [...locationSamplesRef.current, currentSample].slice(-MAX_SAMPLE_HISTORY);
        locationSamplesRef.current = nextSamples;

        const isOutsideWorkingArea = !isWithinWorkingAreaRadius(
          currentLocation.coords.latitude,
          currentLocation.coords.longitude,
        );

        const reasons: LocationIntegrityReason[] = [];
        const isInitialForegroundCheck = !hasCompletedInitialForegroundCheckRef.current;
        if (isInitialForegroundCheck && isOutsideWorkingArea) {
          reasons.push('outside_working_area');
        }

        if (isMockedLocation(currentLocation)) {
          reasons.push('mock_location_detected');
        }

        if (previousSample) {
          const deltaSeconds = (currentSample.timestamp - previousSample.timestamp) / 1000;
          if (deltaSeconds > 0) {
            const distanceKm = calculateDistanceKm(previousSample, currentSample);
            const speedKmh = distanceKm / (deltaSeconds / 3600);
            const nextSpeedHistory = [...speedHistoryRef.current, speedKmh].slice(-MAX_SPEED_HISTORY);
            speedHistoryRef.current = nextSpeedHistory;

            if (distanceKm >= TELEPORT_DISTANCE_KM && deltaSeconds < TELEPORT_WINDOW_SECONDS) {
              reasons.push('teleportation');
            }

            if (hasUnnaturalVelocityCurve(nextSpeedHistory)) {
              reasons.push('unnatural_velocity_curve');
            }
          }
        }

        hasCompletedInitialForegroundCheckRef.current = true;

        const uniqueReasons = Array.from(new Set(reasons));
        const hasSuddenChangeReason = uniqueReasons.some(isRedSeverityReason);
        const now = Date.now();
        const movementDistanceFromPreviousKm = previousSample
          ? calculateDistanceKm(previousSample, currentSample)
          : 0;
        const isMovementStableThisCheck = movementDistanceFromPreviousKm <= MAX_STABLE_MOVEMENT_KM_PER_CHECK;

        const isLocationWithinInnerRadius = isWithinInnerRadius(
          currentLocation.coords.latitude,
          currentLocation.coords.longitude,
        );
        const currentLocationWeather = await loadMockHeavyRainfallDetailsForLocation({
          latitude: currentLocation.coords.latitude,
          longitude: currentLocation.coords.longitude,
        });
        const isHeavyRainAtChangedLocation = currentLocationWeather.weather.isHeavyRainfall;
        const isWithinWorkingHoursNow = getActiveWorkingWindow(
          {
            id: 'integrity-monitor',
            fullName: '',
            email: '',
            phone: '',
            avatar: undefined,
            platformConnectionStatus: 'pending',
            avgDailyIncome: null,
            workingHours: null,
            workingShiftLabel: riderProfile?.workingShiftLabel ?? null,
            workingTimeSlots: riderProfile?.workingTimeSlots ?? null,
          } as unknown as AuthUser,
          new Date(),
        ) !== null;

        if (uniqueReasons.includes('teleportation')) {
          hadTeleportationInCurrentRedCycleRef.current = true;
        }

        if (!cancelled) {
          setState((current) => {
            // Keep red active until rider is back inside working area,
            // then allow 1 minute clean recovery to green.
            let nextFlagLevel: LocationIntegrityFlagLevel;
            let nextRedFlagDetectedAt: number | null = current.redFlagDetectedAt;
            let nextNormalizedAfterRedAt: number | null = current.normalizedAfterRedAt;
            let nextConsecutiveInnerRadiusPoints = consecutiveInnerRadiusPointsRef.current;
            let shouldMarkInvigilatingThisCheck = false;
            let shouldSuspendAccountThisCheck = false;

            if (hasSuddenChangeReason) {
              // New anomaly detected - reset to red
              nextFlagLevel = 'red';
              nextRedFlagDetectedAt = now; // Start persistence timer
              nextNormalizedAfterRedAt = null; // Clear recovery timer
              nextConsecutiveInnerRadiusPoints = 0; // Restart 5-check window
              redCycleAnchorLocationRef.current = null;
              locationChangeCountInCurrentCycleRef.current = 0;
              invigilatingMarkedInCurrentCycleRef.current = false;
              locationChangeConditionHitsInCurrentCycleRef.current = [];
              hadTeleportationInCurrentRedCycleRef.current = uniqueReasons.includes('teleportation');
            } else if (isInitialForegroundCheck && isOutsideWorkingArea) {
              // On app open, show yellow for out-of-working-area so the QnA flow can trigger.
              nextFlagLevel = 'yellow';
              nextRedFlagDetectedAt = null;
              nextNormalizedAfterRedAt = null;
              nextConsecutiveInnerRadiusPoints = 0;
              redCycleAnchorLocationRef.current = null;
              locationChangeCountInCurrentCycleRef.current = 0;
              invigilatingMarkedInCurrentCycleRef.current = false;
              locationChangeConditionHitsInCurrentCycleRef.current = [];
              hadTeleportationInCurrentRedCycleRef.current = false;
            } else if (current.flagLevel === 'red' && nextRedFlagDetectedAt !== null) {
              if (isLocationWithinInnerRadius) {
                redCycleAnchorLocationRef.current = null;
                locationChangeCountInCurrentCycleRef.current = 0;
                invigilatingMarkedInCurrentCycleRef.current = false;
                locationChangeConditionHitsInCurrentCycleRef.current = [];
                hadTeleportationInCurrentRedCycleRef.current = false;
                if (nextNormalizedAfterRedAt === null) {
                  // Rider re-entered the 10 km zone before/during 5th check; begin 2-minute stability monitoring.
                  nextNormalizedAfterRedAt = now;
                }

                const hasCompletedStabilityMonitor = now - nextNormalizedAfterRedAt >= GREEN_FLAG_RECOVERY_WINDOW_MS;

                if (!isMovementStableThisCheck) {
                  // Unstable movement during monitoring; keep red and restart the whole recovery process.
                  nextFlagLevel = 'red';
                  nextNormalizedAfterRedAt = null;
                  nextConsecutiveInnerRadiusPoints = 0;
                  redCycleAnchorLocationRef.current = null;
                  locationChangeCountInCurrentCycleRef.current = 0;
                  invigilatingMarkedInCurrentCycleRef.current = false;
                  locationChangeConditionHitsInCurrentCycleRef.current = [];
                  hadTeleportationInCurrentRedCycleRef.current = false;
                } else if (hasCompletedStabilityMonitor) {
                  // Stable for full 2 minutes inside 10 km zone: clear to green.
                  nextFlagLevel = 'green';
                  nextRedFlagDetectedAt = null;
                  nextNormalizedAfterRedAt = null;
                  nextConsecutiveInnerRadiusPoints = DURATION_CHECK_GPS_POINTS;
                  redCycleAnchorLocationRef.current = null;
                  locationChangeCountInCurrentCycleRef.current = 0;
                  invigilatingMarkedInCurrentCycleRef.current = false;
                  locationChangeConditionHitsInCurrentCycleRef.current = [];
                  hadTeleportationInCurrentRedCycleRef.current = false;
                } else {
                  nextFlagLevel = 'red';
                }
              } else {
                // Outside 10 km zone while red: keep red and cancel stability monitor.
                nextNormalizedAfterRedAt = null;
                const currentOutsideLocation = {
                  latitude: currentLocation.coords.latitude,
                  longitude: currentLocation.coords.longitude,
                };
                const anchorLocation = redCycleAnchorLocationRef.current;
                if (!anchorLocation) {
                  redCycleAnchorLocationRef.current = currentOutsideLocation;
                  nextConsecutiveInnerRadiusPoints = 1;
                } else {
                  const anchorDistanceKm = calculateDistanceKm(anchorLocation, currentOutsideLocation);
                  if (anchorDistanceKm > LOCATION_CHANGE_RESTART_THRESHOLD_KM) {
                    // Location changed during 5 checks; restart checks for this new location.
                    redCycleAnchorLocationRef.current = currentOutsideLocation;
                    nextConsecutiveInnerRadiusPoints = 1;
                    locationChangeCountInCurrentCycleRef.current += 1;
                    const matchesRainAndWorkingSlot = isHeavyRainAtChangedLocation && isWithinWorkingHoursNow;
                    locationChangeConditionHitsInCurrentCycleRef.current = [
                      ...locationChangeConditionHitsInCurrentCycleRef.current,
                      matchesRainAndWorkingSlot,
                    ].slice(-LOCATION_CHANGE_PATTERN_WINDOW);

                    if (
                      locationChangeCountInCurrentCycleRef.current >= LOCATION_CHANGE_PATTERN_WINDOW
                      && locationChangeConditionHitsInCurrentCycleRef.current.length >= LOCATION_CHANGE_PATTERN_WINDOW
                    ) {
                      const positiveHits = locationChangeConditionHitsInCurrentCycleRef.current
                        .filter(Boolean)
                        .length;
                      if (positiveHits >= LOCATION_CHANGE_PATTERN_MIN_HITS_FOR_SUSPEND) {
                        shouldSuspendAccountThisCheck = true;
                      }
                    }

                    if (
                      locationChangeCountInCurrentCycleRef.current > LOCATION_CHANGE_INVIGILATING_THRESHOLD
                      && !invigilatingMarkedInCurrentCycleRef.current
                    ) {
                      shouldMarkInvigilatingThisCheck = true;
                      invigilatingMarkedInCurrentCycleRef.current = true;
                      invigilatingEventTimestampsRef.current = [
                        ...invigilatingEventTimestampsRef.current.filter(
                          (timestamp) => now - timestamp <= INVIGILATING_WINDOW_MS,
                        ),
                        now,
                      ];
                    }
                  } else {
                    // Only advance 5-check count while the outside location is unchanged.
                    nextConsecutiveInnerRadiusPoints = Math.min(
                      nextConsecutiveInnerRadiusPoints + 1,
                      DURATION_CHECK_GPS_POINTS,
                    );
                  }
                }
                if (nextConsecutiveInnerRadiusPoints >= DURATION_CHECK_GPS_POINTS) {
                  const shouldMarkSuspicious = isHeavyRainAtChangedLocation
                    && isWithinWorkingHoursNow
                    && !isLocationWithinInnerRadius;

                  if (shouldMarkSuspicious) {
                    nextFlagLevel = 'none';
                    nextRedFlagDetectedAt = null;
                    nextNormalizedAfterRedAt = null;
                    nextConsecutiveInnerRadiusPoints = 0;
                    uniqueReasons.splice(0, uniqueReasons.length, 'suspicious_outside_working_area');
                    hadTeleportationInCurrentRedCycleRef.current = false;
                    redCycleAnchorLocationRef.current = null;
                    locationChangeCountInCurrentCycleRef.current = 0;
                    invigilatingMarkedInCurrentCycleRef.current = false;
                    locationChangeConditionHitsInCurrentCycleRef.current = [];
                  } else {
                    // After 5th check, if the rider is still outside 10 km and the suspicious
                    // conditions are not fully met, keep the red flag active instead of marking recovery.
                    nextFlagLevel = 'red';
                    nextConsecutiveInnerRadiusPoints = DURATION_CHECK_GPS_POINTS;
                  }
                } else {
                  nextFlagLevel = 'red';
                }
              }
            } else if (uniqueReasons.includes('outside_working_area')) {
              nextFlagLevel = 'yellow';
              nextRedFlagDetectedAt = null; // Clear red flag persistence when downgrading
              nextNormalizedAfterRedAt = null; // Clear recovery timer
              nextConsecutiveInnerRadiusPoints = 0;
              redCycleAnchorLocationRef.current = null;
              locationChangeCountInCurrentCycleRef.current = 0;
              invigilatingMarkedInCurrentCycleRef.current = false;
              locationChangeConditionHitsInCurrentCycleRef.current = [];
              hadTeleportationInCurrentRedCycleRef.current = false;
            } else {
              nextFlagLevel = 'none';
              nextRedFlagDetectedAt = null; // Clear red flag persistence when clearing
              nextNormalizedAfterRedAt = null; // Clear recovery timer
              nextConsecutiveInnerRadiusPoints = 0;
              redCycleAnchorLocationRef.current = null;
              locationChangeCountInCurrentCycleRef.current = 0;
              invigilatingMarkedInCurrentCycleRef.current = false;
              locationChangeConditionHitsInCurrentCycleRef.current = [];
              hadTeleportationInCurrentRedCycleRef.current = false;
            }

            consecutiveInnerRadiusPointsRef.current = nextConsecutiveInnerRadiusPoints;

            const newHistory = [...current.history];
            const newAnomalyReasons = uniqueReasons.filter((reason) => !current.reasons.includes(reason));
            if (shouldMarkInvigilatingThisCheck) {
              newAnomalyReasons.push('invigilating_location_fluctuation');
            }
            if (shouldSuspendAccountThisCheck) {
              newAnomalyReasons.push('account_suspended_location_pattern');
            }
            newAnomalyReasons.forEach((reason) => {
              newHistory.push({ reason, detectedAt: now });
            });

            const redSeverityNewReasons = newAnomalyReasons.filter(isRedSeverityReason);

            return {
              ...current,
              isFlagged: nextFlagLevel !== 'none',
              flagLevel: nextFlagLevel,
              isChecking: false,
              reasons: uniqueReasons,
              statusText: nextFlagLevel === 'green'
                ? 'GPS normal - rider stable in working area for 2 minutes'
                : uniqueReasons.includes('suspicious_outside_working_area')
                  ? 'Suspicious case detected after heavy rainfall and working-hours overlap while still outside 10 km. Claims are held for 60 minutes.'
                : shouldMarkInvigilatingThisCheck
                  ? 'Invigilating - frequent location fluctuations detected.'
                : shouldSuspendAccountThisCheck
                  ? 'Account suspended for 60 minutes due to repeated location-change pattern.'
                : nextFlagLevel === 'red' && current.flagLevel === 'red' && isLocationWithinInnerRadius && nextNormalizedAfterRedAt !== null
                  ? 'Inside 10 km zone. Monitoring movement stability for 2 minutes...'
                  : nextFlagLevel === 'red' && isOutsideWorkingArea
                    ? REASON_TEXT.outside_working_area
                    : uniqueReasons.length > 0
                  ? REASON_TEXT[uniqueReasons[0]]
                    : 'GPS normal',
              lastCheckedAt: now,
              redFlagCount: current.redFlagCount + redSeverityNewReasons.length,
              history: newHistory,
              redFlagDetectedAt: nextRedFlagDetectedAt,
              normalizedAfterRedAt: nextNormalizedAfterRedAt,
              consecutiveInnerRadiusPoints: nextConsecutiveInnerRadiusPoints,
              suspiciousHoldUntilMs: uniqueReasons.includes('suspicious_outside_working_area')
                ? now + SUSPICIOUS_CLAIMS_HOLD_MS
                : current.suspiciousHoldUntilMs,
              lastSuspiciousDetectedAt: uniqueReasons.includes('suspicious_outside_working_area')
                ? now
                : current.lastSuspiciousDetectedAt,
              invigilatingHoldUntilMs:
                shouldMarkInvigilatingThisCheck && invigilatingEventTimestampsRef.current.length > 2
                  ? now + INVIGILATING_CLAIMS_HOLD_MS
                  : current.invigilatingHoldUntilMs,
              lastInvigilatingDetectedAt: shouldMarkInvigilatingThisCheck
                ? now
                : current.lastInvigilatingDetectedAt,
              accountSuspendedUntilMs: shouldSuspendAccountThisCheck
                ? now + ACCOUNT_SUSPEND_MS
                : current.accountSuspendedUntilMs,
              lastAccountSuspendedAt: shouldSuspendAccountThisCheck
                ? now
                : current.lastAccountSuspendedAt,
            };
          });
        }
      } catch {
        if (!cancelled) {
          setState((current) => ({
            ...current,
            isFlagged: false,
            flagLevel: 'none',
            isChecking: false,
            reasons: [],
            statusText: REASON_TEXT.location_error,
            lastCheckedAt: Date.now(),
            redFlagDetectedAt: null,
            normalizedAfterRedAt: null,
            consecutiveInnerRadiusPoints: 0,
            suspiciousHoldUntilMs: current.suspiciousHoldUntilMs,
            lastSuspiciousDetectedAt: current.lastSuspiciousDetectedAt,
            invigilatingHoldUntilMs: current.invigilatingHoldUntilMs,
            lastInvigilatingDetectedAt: current.lastInvigilatingDetectedAt,
            accountSuspendedUntilMs: current.accountSuspendedUntilMs,
            lastAccountSuspendedAt: current.lastAccountSuspendedAt,
            history: current.history,
          }));
        }
      } finally {
        inFlightRef.current = false;
      }
    };

    setState((current) => ({
      ...current,
      isChecking: true,
      statusText: 'Checking GPS...',
    }));

    void runIntegrityCheck();
    const intervalId = setInterval(() => {
      void runIntegrityCheck();
    }, pollIntervalMs);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [enabled, pollIntervalMs, riderProfile?.workingShiftLabel, riderProfile?.workingTimeSlots]);

  return state;
};
