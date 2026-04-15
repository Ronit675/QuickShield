import { useEffect, useRef, useState } from 'react';
import { Alert, Linking } from 'react-native';
import * as Location from 'expo-location';

export type LocationIntegrityReason =
  | 'high_speed'
  | 'teleportation'
  | 'impossible_acceleration'
  | 'unnatural_velocity_curve'
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

export type LocationIntegrityState = {
  isFlagged: boolean;
  isChecking: boolean;
  reasons: LocationIntegrityReason[];
  statusText: string;
  lastCheckedAt: number | null;
  redFlagCount: number;
  history: FlagHistoryEntry[];
};

const EARTH_RADIUS_KM = 6371;
const MAX_SAMPLE_HISTORY = 6;
const MAX_SPEED_HISTORY = 8;
const MAX_URBAN_DELIVERY_SPEED_KMH = 120;
const TELEPORT_DISTANCE_KM = 50;
const TELEPORT_WINDOW_SECONDS = 60;
const MAX_ALLOWED_ACCELERATION_MS2 = 6.5;

const REASON_TEXT: Record<LocationIntegrityReason, string> = {
  high_speed: 'Speed crossed 120 km/h',
  teleportation: 'Detected 50 km+ jump in under a minute',
  impossible_acceleration: 'Acceleration pattern is unrealistic',
  unnatural_velocity_curve: 'Velocity curve looks unnatural',
  permission_denied: 'Location permission denied',
  gps_unavailable: 'GPS services are disabled',
  location_error: 'Unable to read current location',
};

const toRadians = (value: number) => (value * Math.PI) / 180;

const calculateDistanceKm = (a: LocationSample, b: LocationSample) => {
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

export const useLocationIntegrityMonitor = ({
  enabled,
  pollIntervalMs = 60_000,
}: UseLocationIntegrityMonitorOptions): LocationIntegrityState => {
  const [state, setState] = useState<LocationIntegrityState>({
    isFlagged: false,
    isChecking: false,
    reasons: [],
    statusText: 'GPS check inactive',
    lastCheckedAt: null,
    redFlagCount: 0,
    history: [],
  });

  const locationSamplesRef = useRef<LocationSample[]>([]);
  const speedHistoryRef = useRef<number[]>([]);
  const inFlightRef = useRef(false);
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
      }));
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
              'QuickShield needs location access to check rider movement every minute and detect spoofing patterns.',
            );
          }

          if (!cancelled) {
            setState((current) => ({
              ...current,
              isFlagged: true,
              isChecking: false,
              reasons: ['permission_denied'],
              statusText: REASON_TEXT.permission_denied,
              lastCheckedAt: Date.now(),
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
              'GPS is off. Enable location services to keep checking for speed, teleportation, acceleration, and velocity anomalies.',
            );
          }

          if (!cancelled) {
            setState((current) => ({
              ...current,
              isFlagged: true,
              isChecking: false,
              reasons: ['gps_unavailable'],
              statusText: REASON_TEXT.gps_unavailable,
              lastCheckedAt: Date.now(),
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

        if (!previousSample) {
          if (!cancelled) {
            setState((current) => ({
              ...current,
              isFlagged: false,
              isChecking: false,
              reasons: [],
              statusText: 'GPS normal',
              lastCheckedAt: Date.now(),
              history: current.history,
            }));
          }
          return;
        }

        const deltaSeconds = (currentSample.timestamp - previousSample.timestamp) / 1000;
        if (deltaSeconds <= 0) {
          if (!cancelled) {
            setState((current) => ({
              ...current,
              isFlagged: false,
              isChecking: false,
              reasons: [],
              statusText: 'GPS normal',
              lastCheckedAt: Date.now(),
              history: current.history,
            }));
          }
          return;
        }

        const distanceKm = calculateDistanceKm(previousSample, currentSample);
        const speedKmh = distanceKm / (deltaSeconds / 3600);
        const nextSpeedHistory = [...speedHistoryRef.current, speedKmh].slice(-MAX_SPEED_HISTORY);
        speedHistoryRef.current = nextSpeedHistory;

        const reasons: LocationIntegrityReason[] = [];

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

        const uniqueReasons = Array.from(new Set(reasons));
        const isFlagged = uniqueReasons.length > 0;
        const anomalyReasons = uniqueReasons.filter(
          (reason) =>
            reason === 'high_speed'
            || reason === 'teleportation'
            || reason === 'impossible_acceleration'
            || reason === 'unnatural_velocity_curve',
        );
        const anomalyDetected = anomalyReasons.length > 0;

        if (!cancelled) {
          setState((current) => {
            const newHistory = [...current.history];
            const now = Date.now();
            if (anomalyDetected) {
              anomalyReasons.forEach((reason) => {
                newHistory.push({ reason, detectedAt: now });
              });
            }
            return {
              ...current,
              isFlagged,
              isChecking: false,
              reasons: uniqueReasons,
              statusText: isFlagged
                ? REASON_TEXT[uniqueReasons[0]]
                : 'GPS normal',
              lastCheckedAt: now,
              redFlagCount: current.redFlagCount + (anomalyDetected ? 1 : 0),
              history: newHistory,
            };
          });
        }
      } catch {
        if (!cancelled) {
          setState((current) => ({
            ...current,
            isFlagged: true,
            isChecking: false,
            reasons: ['location_error'],
            statusText: REASON_TEXT.location_error,
            lastCheckedAt: Date.now(),
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
