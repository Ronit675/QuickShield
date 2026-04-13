import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import api from './api';

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const RIDER_DETAILS_STORAGE_KEY_PREFIX = 'rider-details:';
const LEGACY_WORKING_SHIFT_STORAGE_KEY_PREFIX = 'working-shift:';

type StoredRiderDetails = {
  avgDailyIncome?: number | null;
  workingHours?: number | null;
  workingShiftLabel?: string | null;
  workingTimeSlots?: string[] | null;
};

export type MockRiderProfileSnapshot = {
  avgDailyIncome: number;
  workingHours: number;
  workingShiftLabel: string;
  workingTimeSlots: string[];
};

const getGoogleSignInModule = () => {
  if (isExpoGo) {
    throw new Error(
      'This app uses native Google Sign-In and cannot complete login inside Expo Go. Install a development build on your Android phone instead.',
    );
  }

  return require('@react-native-google-signin/google-signin') as typeof import('@react-native-google-signin/google-signin');
};

const getRiderDetailsStorageKey = (userId: string) => `${RIDER_DETAILS_STORAGE_KEY_PREFIX}${userId}`;
const getLegacyWorkingShiftStorageKey = (userId: string) =>
  `${LEGACY_WORKING_SHIFT_STORAGE_KEY_PREFIX}${userId}`;

const readStoredRiderDetails = async (userId: string): Promise<StoredRiderDetails> => {
  const serializedRiderDetails = await AsyncStorage.getItem(getRiderDetailsStorageKey(userId));
  const serializedLegacyShift = serializedRiderDetails
    ? null
    : await AsyncStorage.getItem(getLegacyWorkingShiftStorageKey(userId));
  const serializedPayload = serializedRiderDetails ?? serializedLegacyShift;

  if (!serializedPayload) {
    return {};
  }

  try {
    return JSON.parse(serializedPayload) as StoredRiderDetails;
  } catch {
    await AsyncStorage.removeItem(getRiderDetailsStorageKey(userId));
    await AsyncStorage.removeItem(getLegacyWorkingShiftStorageKey(userId));
    return {};
  }
};

const persistRiderDetails = async (userId: string, riderDetails: StoredRiderDetails) => {
  await AsyncStorage.setItem(getRiderDetailsStorageKey(userId), JSON.stringify(riderDetails));
};

const clearRiderDetails = async (userId: string) => {
  await AsyncStorage.removeItem(getRiderDetailsStorageKey(userId));
  await AsyncStorage.removeItem(getLegacyWorkingShiftStorageKey(userId));
};

const hydrateUserWithStoredRiderDetails = async (user: AuthUser): Promise<AuthUser> => {
  if (user.platformConnectionStatus !== 'verified') {
    await clearRiderDetails(user.id);
    return {
      ...user,
      avgDailyIncome: null,
      workingHours: null,
      workingShiftLabel: null,
      workingTimeSlots: null,
    };
  }

  const storedRiderDetails = await readStoredRiderDetails(user.id);
  const hydratedUser = {
    ...user,
    avgDailyIncome: user.avgDailyIncome ?? storedRiderDetails.avgDailyIncome ?? null,
    workingHours: user.workingHours ?? storedRiderDetails.workingHours ?? null,
    workingShiftLabel: user.workingShiftLabel ?? storedRiderDetails.workingShiftLabel ?? null,
    workingTimeSlots:
      user.workingTimeSlots?.length
        ? user.workingTimeSlots
        : storedRiderDetails.workingTimeSlots ?? null,
  };

  await persistRiderDetails(user.id, {
    avgDailyIncome: hydratedUser.avgDailyIncome,
    workingHours: hydratedUser.workingHours,
    workingShiftLabel: hydratedUser.workingShiftLabel,
    workingTimeSlots: hydratedUser.workingTimeSlots,
  });

  return hydratedUser;
};

const formatHour = (hour: number) => {
  const normalizedHour = ((hour % 24) + 24) % 24;
  const period = normalizedHour >= 12 ? 'PM' : 'AM';
  const hourIn12Format = normalizedHour % 12 === 0 ? 12 : normalizedHour % 12;

  return `${hourIn12Format}:00 ${period}`;
};

const generateMockWorkingShift = () => {
  const workingHours = Math.floor(Math.random() * (14 - 3 + 1)) + 3;
  const earliestStartHour = 6;
  const latestEndHour = 22;
  const latestStartHour = Math.max(earliestStartHour, latestEndHour - workingHours);
  const startHour = Math.floor(
    Math.random() * (latestStartHour - earliestStartHour + 1),
  ) + earliestStartHour;

  const workingTimeSlots = Array.from({ length: workingHours }, (_, index) => {
    const slotStart = startHour + index;
    const slotEnd = slotStart + 1;

    return `${formatHour(slotStart)} - ${formatHour(slotEnd)}`;
  });

  return {
    workingHours,
    workingShiftLabel: `${formatHour(startHour)} - ${formatHour(startHour + workingHours)}`,
    workingTimeSlots,
  };
};

const generateMockAverageDailyIncome = () => Math.floor(Math.random() * (2500 - 300 + 1)) + 300;

export const generateMockRiderProfileSnapshot = (): MockRiderProfileSnapshot => {
  const workingShift = generateMockWorkingShift();

  return {
    avgDailyIncome: generateMockAverageDailyIncome(),
    ...workingShift,
  };
};

export const saveMockRiderProfileSnapshot = async (
  userId: string,
  snapshot: MockRiderProfileSnapshot,
) => {
  await persistRiderDetails(userId, snapshot);
};

export const clearMockRiderProfileSnapshot = async (userId: string) => {
  await clearRiderDetails(userId);
};

export const configureGoogleSignIn = () => {
  if (isExpoGo) {
    return;
  }

  const { GoogleSignin } = getGoogleSignInModule();

  GoogleSignin.configure({
    // Must be the WEB client ID, not the Android one
    webClientId: '236663446258-9tvhq82dh2q4r5mpbkion5ld5gv4kc5i.apps.googleusercontent.com',
    offlineAccess: false,
  });
};

export interface AuthUser {
  id: string;
  email: string | null;
  phone: string | null;
  fullName: string | null;
  dateOfBirth: string | null;
  address: string | null;
  profilePhoto: string | null;
  platform: string | null;
  city: string | null;
  serviceZone: string | null;
  avgDailyIncome: number | null;
  workingHours?: number | null;
  workingShiftLabel?: string | null;
  workingTimeSlots?: string[] | null;
  platformConnectionStatus: 'not_connected' | 'verified';
  authProvider: string;
  profileStatus: 'auth_only' | 'platform_linked' | 'active';
}

const hasTextValue = (value: string | null | undefined) => Boolean(value?.trim());

export const getIncompleteProfileFields = (user: AuthUser | null | undefined) => {
  const missingFields: string[] = [];

  if (!hasTextValue(user?.fullName)) {
    missingFields.push('full name');
  }

  if (!hasTextValue(user?.dateOfBirth)) {
    missingFields.push('date of birth');
  }

  if (!hasTextValue(user?.address)) {
    missingFields.push('address');
  }

  if (!hasTextValue(user?.email) && !hasTextValue(user?.phone)) {
    missingFields.push('contact details');
  }

  return missingFields;
};

export const isProfileComplete = (user: AuthUser | null | undefined) =>
  getIncompleteProfileFields(user).length === 0;

export const signInWithGoogle = async (): Promise<AuthUser> => {
  const { GoogleSignin, isSuccessResponse } = getGoogleSignInModule();

  await GoogleSignin.hasPlayServices();
  const googleResponse = await GoogleSignin.signIn();

  if (!isSuccessResponse(googleResponse)) {
    throw new Error('Google sign-in was cancelled');
  }

  const { idToken } = googleResponse.data;

  if (!idToken) {
    throw new Error('No ID token returned from Google');
  }

  // Exchange Google token for our own JWT
  const apiResponse = await api.post('/auth/google', { idToken });
  const { accessToken, user } = apiResponse.data;

  await AsyncStorage.setItem('accessToken', accessToken);
  return hydrateUserWithStoredRiderDetails(user as AuthUser);
};

export const requestPhoneOtp = async (phone: string) => {
  const response = await api.post('/auth/phone/send-otp', { phone });
  return response.data as {
    success: boolean;
    phone: string;
    expiresInSeconds: number;
    debugOtp?: string;
    delivery: 'debug' | 'pending_sms_setup';
  };
};

export const signInWithPhoneOtp = async (phone: string, otp: string): Promise<AuthUser> => {
  const response = await api.post('/auth/phone/verify-otp', { phone, otp });
  const { accessToken, user } = response.data;

  await AsyncStorage.setItem('accessToken', accessToken);
  return hydrateUserWithStoredRiderDetails(user as AuthUser);
};

export const restoreSession = async (): Promise<AuthUser | null> => {
  const token = await AsyncStorage.getItem('accessToken');
  if (!token) return null;

  try {
    const response = await api.get('/auth/me');
    return hydrateUserWithStoredRiderDetails(response.data as AuthUser);
  } catch {
    await AsyncStorage.removeItem('accessToken');
    return null;
  }
};

export const signOut = async () => {
  await AsyncStorage.removeItem('accessToken');

  if (isExpoGo) {
    return;
  }

  const { GoogleSignin } = getGoogleSignInModule();

  try {
    await GoogleSignin.revokeAccess();
    await GoogleSignin.signOut();
  } catch {
    // Ignore Google sign-out errors
  }
};

export const updateProfileDetails = async (payload: {
  fullName: string;
  dateOfBirth: string;
  address: string;
  email: string;
  profilePhoto?: string | null;
}): Promise<AuthUser> => {
  const response = await api.put('/profile/details', payload);
  return hydrateUserWithStoredRiderDetails(response.data.user as AuthUser);
};

export const updateSelectedPlatform = async (platform: string): Promise<AuthUser> => {
  const response = await api.post('/profile/platform', { platform });
  return hydrateUserWithStoredRiderDetails(response.data.user as AuthUser);
};

export const connectSelectedPlatform = async (): Promise<{
  verified: boolean;
  averageDailyIncome: number;
  workingHours: number;
  workingShiftLabel: string;
  workingTimeSlots: string[];
  message: string;
  user: AuthUser;
}> => {
  const response = await api.post('/profile/platform/connect');
  const payload = response.data as {
    verified: boolean;
    averageDailyIncome: number;
    workingHours: number;
    workingShiftLabel: string;
    workingTimeSlots: string[];
    message: string;
    user: AuthUser;
  };

  return {
    ...payload,
    user: await hydrateUserWithStoredRiderDetails(payload.user),
  };
};

export const disconnectSelectedPlatform = async (): Promise<{
  disconnected: boolean;
  message: string;
  user: AuthUser;
}> => {
  const response = await api.post('/profile/platform/disconnect');
  const payload = response.data as {
    disconnected: boolean;
    message: string;
    user: AuthUser;
  };

  return {
    ...payload,
    user: await hydrateUserWithStoredRiderDetails(payload.user),
  };
};

const authService = {
  configureGoogleSignIn,
  signInWithGoogle,
  requestPhoneOtp,
  signInWithPhoneOtp,
  restoreSession,
  signOut,
  updateProfileDetails,
  updateSelectedPlatform,
  connectSelectedPlatform,
  disconnectSelectedPlatform,
};

export default authService;
