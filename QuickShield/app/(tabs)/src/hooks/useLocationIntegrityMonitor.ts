import { useEffect, useRef, useState } from 'react';
import { Alert, Linking } from 'react-native';
import * as Location from 'expo-location';

export type LocationIntegrityReason =
  | 'mock_location_detected'
  | 'high_speed'
  | 'teleportation'
  | 'impossible_acceleration'
  | 'unnatural_velocity_curve'
  | 'outside_working_area'
  | 'permission_denied'
  | 'gps_unavailable'
  | 'location_error';

type LocationSample = {
  latitude: number;
  longitude: number;
  timestamp: number;
};

export type FlagHistoryEntry = {
  reason: LocationIntegrityReason;
  detectedAt: number;
};

type UseLocationIntegrityMonitorOptions = {
  enabled: boolean;
  pollIntervalMs?: number;
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
};

const EARTH_RADIUS_KM = 6371;
export const WORKING_AREA_RADIUS_KM = 25;
const MAX_SAMPLE_HISTORY = 6;
const MAX_SPEED_HISTORY = 8;
const MAX_URBAN_DELIVERY_SPEED_KMH = 80;
const TELEPORT_DISTANCE_KM = 2;
const TELEPORT_WINDOW_SECONDS = 90;
const MAX_ALLOWED_ACCELERATION_MS2 = 6.5;
const GREEN_FLAG_RECOVERY_WINDOW_MS = 60 * 1000; // 1 minute of clean GPS after red
export const WORKING_AREA_CENTER = {
  // Whitefield, Bengaluru
  latitude: 12.9698,
  longitude: 77.7499,
};

const REASON_TEXT: Record<LocationIntegrityReason, string> = {
  mock_location_detected: 'Mock location provider detected',
  high_speed: 'Speed crossed 80 km/h',
  teleportation: 'Detected 2 km+ jump in under 90 seconds',
  impossible_acceleration: 'Acceleration pattern is unrealistic',
  unnatural_velocity_curve: 'Velocity curve looks unnatural',
  outside_working_area: 'Outside 25 km working area',
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

const kmhToMs = (kmh: number) => kmh / 3.6;

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

const isMockedLocation = (location: Location.LocationObject) => {
  const coordsWithMocked = location.coords as Location.LocationObjectCoords & { mocked?: boolean };
  const locationWithMocked = location as Location.LocationObject & { mocked?: boolean };
  return Boolean(coordsWithMocked?.mocked ?? locationWithMocked?.mocked);
};

export const useLocationIntegrityMonitor = ({
  enabled,
  pollIntervalMs = 60_000,
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
  });

  const inFlightRef = useRef(false);
  const locationSamplesRef = useRef<LocationSample[]>([]);
  const speedHistoryRef = useRef<number[]>([]);
  const hasCompletedInitialForegroundCheckRef = useRef(false);
  const hasPromptedForPermissionRef = useRef(false);
  const hasPromptedForGpsRef = useRef(false);

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
      }));
      hasCompletedInitialForegroundCheckRef.current = false;
      hasPromptedForPermissionRef.current = false;
      hasPromptedForGpsRef.current = false;
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
              'QuickShield needs location access to verify if a rider is within the 25 km working area.',
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
              'GPS is off. Enable location services to verify if the rider is within the 25 km working area.',
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

            if (speedKmh > MAX_URBAN_DELIVERY_SPEED_KMH) {
              reasons.push('high_speed');
            }

            if (distanceKm >= TELEPORT_DISTANCE_KM && deltaSeconds < TELEPORT_WINDOW_SECONDS) {
              reasons.push('teleportation');
            }

            const previousSpeedKmh = nextSpeedHistory.length >= 2
              ? nextSpeedHistory[nextSpeedHistory.length - 2]
              : null;

            if (previousSpeedKmh !== null) {
              const accelerationMs2 = (kmhToMs(speedKmh) - kmhToMs(previousSpeedKmh)) / deltaSeconds;
              if (Math.abs(accelerationMs2) > MAX_ALLOWED_ACCELERATION_MS2) {
                reasons.push('impossible_acceleration');
              }
            }

            if (hasUnnaturalVelocityCurve(nextSpeedHistory)) {
              reasons.push('unnatural_velocity_curve');
            }
          }
        }

        hasCompletedInitialForegroundCheckRef.current = true;

        const uniqueReasons = Array.from(new Set(reasons));
        const hasSuddenChangeReason = uniqueReasons.some((reason) =>
          reason === 'mock_location_detected'
          || reason === 'high_speed'
          || reason === 'teleportation'
          || reason === 'impossible_acceleration'
          || reason === 'unnatural_velocity_curve',
        );
        const now = Date.now();

        if (!cancelled) {
          setState((current) => {
            // Keep red active until rider is back inside working area,
            // then allow 1 minute clean recovery to green.
            let nextFlagLevel: LocationIntegrityFlagLevel;
            let nextRedFlagDetectedAt: number | null = current.redFlagDetectedAt;
            let nextNormalizedAfterRedAt: number | null = current.normalizedAfterRedAt;

            if (hasSuddenChangeReason) {
              // New anomaly detected - reset to red
              nextFlagLevel = 'red';
              if (current.flagLevel !== 'red') {
                nextRedFlagDetectedAt = now; // Start persistence timer
                nextNormalizedAfterRedAt = null; // Clear recovery timer
              }
            } else if ((current.flagLevel === 'red' || current.flagLevel === 'green') && nextRedFlagDetectedAt !== null) {
              if (isOutsideWorkingArea) {
                // User is still outside 25km radius: keep hard red.
                nextFlagLevel = 'red';
                nextNormalizedAfterRedAt = null;
              } else if (nextNormalizedAfterRedAt === null) {
                // First clean in-radius check after red.
                nextNormalizedAfterRedAt = now;
                nextFlagLevel = 'red';
              } else {
                const timeSinceNormalization = now - nextNormalizedAfterRedAt;
                nextFlagLevel = timeSinceNormalization >= GREEN_FLAG_RECOVERY_WINDOW_MS ? 'green' : 'red';
              }
            } else if (uniqueReasons.includes('outside_working_area')) {
              nextFlagLevel = 'yellow';
              nextRedFlagDetectedAt = null; // Clear red flag persistence when downgrading
              nextNormalizedAfterRedAt = null; // Clear recovery timer
            } else {
              nextFlagLevel = 'none';
              nextRedFlagDetectedAt = null; // Clear red flag persistence when clearing
              nextNormalizedAfterRedAt = null; // Clear recovery timer
            }

            const newHistory = [...current.history];
            const newAnomalyReasons = uniqueReasons.filter((reason) => !current.reasons.includes(reason));
            newAnomalyReasons.forEach((reason) => {
              newHistory.push({ reason, detectedAt: now });
            });

            const shouldIncreaseOutsideAfterRed = current.flagLevel === 'red' && isOutsideWorkingArea;
            const additionalCount = shouldIncreaseOutsideAfterRed ? 1 : 0;

            return {
              ...current,
              isFlagged: nextFlagLevel !== 'none',
              flagLevel: nextFlagLevel,
              isChecking: false,
              reasons: uniqueReasons,
              statusText: nextFlagLevel === 'red' && isOutsideWorkingArea
                ? REASON_TEXT.outside_working_area
                : uniqueReasons.length > 0
                  ? REASON_TEXT[uniqueReasons[0]]
                  : nextFlagLevel === 'green'
                    ? 'GPS normal - rider back in working area'
                    : 'GPS normal',
              lastCheckedAt: now,
              redFlagCount: current.redFlagCount + newAnomalyReasons.length + additionalCount,
              history: newHistory,
              redFlagDetectedAt: nextRedFlagDetectedAt,
              normalizedAfterRedAt: nextNormalizedAfterRedAt,
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
  }, [enabled, pollIntervalMs]);

  return state;
};
