import { useEffect, useRef, useState } from 'react';
import { Alert, Linking } from 'react-native';
import * as Location from 'expo-location';

export type LocationIntegrityReason =
  | 'outside_working_area'
  | 'permission_denied'
  | 'gps_unavailable'
  | 'location_error';

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
export const WORKING_AREA_RADIUS_KM = 25;
export const WORKING_AREA_CENTER = {
  // Whitefield, Bengaluru
  latitude: 12.9698,
  longitude: 77.7499,
};

const REASON_TEXT: Record<LocationIntegrityReason, string> = {
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

export const isWithinWorkingAreaRadius = (latitude: number, longitude: number) => {
  const distanceFromWorkingAreaKm = calculateDistanceKm(
    { latitude, longitude },
    WORKING_AREA_CENTER,
  );

  return distanceFromWorkingAreaKm <= WORKING_AREA_RADIUS_KM;
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
              'QuickShield needs location access to verify if a rider is within the 25 km working area.',
            );
          }

          if (!cancelled) {
            setState((current) => ({
              ...current,
              isFlagged: false,
              isChecking: false,
              reasons: [],
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
              'GPS is off. Enable location services to verify if the rider is within the 25 km working area.',
            );
          }

          if (!cancelled) {
            setState((current) => ({
              ...current,
              isFlagged: false,
              isChecking: false,
              reasons: [],
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

        const isOutsideWorkingArea = !isWithinWorkingAreaRadius(
          currentLocation.coords.latitude,
          currentLocation.coords.longitude,
        );
        const uniqueReasons: LocationIntegrityReason[] = isOutsideWorkingArea
          ? ['outside_working_area']
          : [];

        if (!cancelled) {
          setState((current) => {
            const newHistory = [...current.history];
            const now = Date.now();
            if (isOutsideWorkingArea) {
              const wasOutsideLastCheck = current.reasons.includes('outside_working_area');
              if (!wasOutsideLastCheck) {
                newHistory.push({ reason: 'outside_working_area', detectedAt: now });
              }
            }

            return {
              ...current,
              isFlagged: isOutsideWorkingArea,
              isChecking: false,
              reasons: uniqueReasons,
              statusText: isOutsideWorkingArea
                ? REASON_TEXT[uniqueReasons[0]]
                : 'GPS normal',
              lastCheckedAt: now,
              redFlagCount: current.redFlagCount + (isOutsideWorkingArea && !current.reasons.includes('outside_working_area') ? 1 : 0),
              history: newHistory,
            };
          });
        }
      } catch {
        if (!cancelled) {
          setState((current) => ({
            ...current,
            isFlagged: false,
            isChecking: false,
            reasons: [],
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
