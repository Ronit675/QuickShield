import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

export const BACKGROUND_LOCATION_TASK_NAME = 'quickshield-background-location';

const LAST_LOCATION_STORAGE_KEY = 'quickshield:last-location';

export type AppLocationCoordinates = {
  latitude: number;
  longitude: number;
  timestamp: number;
};

type BackgroundLocationTaskPayload = {
  locations?: Location.LocationObject[];
};

export class LocationPermissionError extends Error {
  code: 'permission_denied' | 'gps_unavailable';

  constructor(message: string, code: 'permission_denied' | 'gps_unavailable') {
    super(message);
    this.name = 'LocationPermissionError';
    this.code = code;
  }
}

const persistCoordinates = async (coords: AppLocationCoordinates) => {
  await AsyncStorage.setItem(LAST_LOCATION_STORAGE_KEY, JSON.stringify(coords));
};

export const getStoredCoordinates = async (): Promise<AppLocationCoordinates | null> => {
  const rawValue = await AsyncStorage.getItem(LAST_LOCATION_STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as AppLocationCoordinates;
  } catch {
    await AsyncStorage.removeItem(LAST_LOCATION_STORAGE_KEY);
    return null;
  }
};

if (!TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK_NAME)) {
  TaskManager.defineTask<BackgroundLocationTaskPayload>(BACKGROUND_LOCATION_TASK_NAME, async ({ data, error }) => {
    if (error) {
      console.warn('Background location task failed:', error.message);
      return;
    }

    const latestLocation = data?.locations?.[data.locations.length - 1];
    if (!latestLocation) {
      return;
    }

    await persistCoordinates({
      latitude: latestLocation.coords.latitude,
      longitude: latestLocation.coords.longitude,
      timestamp: latestLocation.timestamp,
    });
  });
}

export const ensureForegroundLocationPermission = async () => {
  const existingPermission = await Location.getForegroundPermissionsAsync();
  if (existingPermission.granted) {
    return existingPermission;
  }

  const requestedPermission = await Location.requestForegroundPermissionsAsync();
  if (!requestedPermission.granted) {
    throw new LocationPermissionError(
      'Location access was denied. Allow foreground location to fetch weather and current coordinates.',
      'permission_denied',
    );
  }

  return requestedPermission;
};

export const ensureBackgroundLocationPermission = async () => {
  const existingPermission = await Location.getBackgroundPermissionsAsync();
  if (existingPermission.granted) {
    return existingPermission;
  }

  const requestedPermission = await Location.requestBackgroundPermissionsAsync();
  if (!requestedPermission.granted) {
    throw new LocationPermissionError(
      'Background location permission was not granted. Enable "Always" access to keep tracking after the app closes.',
      'permission_denied',
    );
  }

  return requestedPermission;
};

export const ensureLocationPermissions = async () => {
  await ensureForegroundLocationPermission();
  await ensureBackgroundLocationPermission();
};

export const getCurrentCoordinates = async (): Promise<AppLocationCoordinates> => {
  await ensureLocationPermissions();

  const servicesEnabled = await Location.hasServicesEnabledAsync();
  if (!servicesEnabled) {
    throw new LocationPermissionError(
      'Location services are turned off. Enable GPS and try again.',
      'gps_unavailable',
    );
  }

  const currentLocation = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  const coords = {
    latitude: currentLocation.coords.latitude,
    longitude: currentLocation.coords.longitude,
    timestamp: currentLocation.timestamp,
  };

  await persistCoordinates(coords);
  return coords;
};

export const startBackgroundLocationTracking = async () => {
  await ensureLocationPermissions();

  const servicesEnabled = await Location.hasServicesEnabledAsync();
  if (!servicesEnabled) {
    throw new LocationPermissionError(
      'Location services are turned off. Enable GPS to start background tracking.',
      'gps_unavailable',
    );
  }

  const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME);
  if (alreadyStarted) {
    return;
  }

  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 60_000,
    distanceInterval: 50,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'QuickShield location tracking',
      notificationBody: 'QuickShield is tracking your location for background rider updates.',
      killServiceOnDestroy: false,
    },
  });
};

export const stopBackgroundLocationTracking = async () => {
  const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME);
  if (!alreadyStarted) {
    return;
  }

  await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME);
};
