import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import api from './api';

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const WORKING_SHIFT_STORAGE_KEY_PREFIX = 'working-shift:';

type StoredWorkingShift = {
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

const getWorkingShiftStorageKey = (userId: string) => `${WORKING_SHIFT_STORAGE_KEY_PREFIX}${userId}`;

const readStoredWorkingShift = async (userId: string): Promise<StoredWorkingShift> => {
  const serializedShift = await AsyncStorage.getItem(getWorkingShiftStorageKey(userId));
  if (!serializedShift) {
    return {};
  }

  try {
    return JSON.parse(serializedShift) as StoredWorkingShift;
  } catch {
    await AsyncStorage.removeItem(getWorkingShiftStorageKey(userId));
    return {};
  }
};

const persistWorkingShift = async (userId: string, shift: StoredWorkingShift) => {
  await AsyncStorage.setItem(getWorkingShiftStorageKey(userId), JSON.stringify(shift));
};

const clearWorkingShift = async (userId: string) => {
  await AsyncStorage.removeItem(getWorkingShiftStorageKey(userId));
};

const mergeWorkingShift = async (user: AuthUser): Promise<AuthUser> => ({
  ...user,
  ...(await readStoredWorkingShift(user.id)),
});

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
  await persistWorkingShift(userId, snapshot);
};

export const clearMockRiderProfileSnapshot = async (userId: string) => {
  await clearWorkingShift(userId);
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
  return user;
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
  return user;
};

export const restoreSession = async (): Promise<AuthUser | null> => {
  const token = await AsyncStorage.getItem('accessToken');
  if (!token) return null;

  try {
    const response = await api.get('/auth/me');
    return mergeWorkingShift(response.data as AuthUser);
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
  return response.data.user;
};

export const updateSelectedPlatform = async (platform: string): Promise<AuthUser> => {
  const response = await api.post('/profile/platform', { platform });
  const user = response.data.user as AuthUser;
  await clearWorkingShift(user.id);
  return user;
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

  await persistWorkingShift(payload.user.id, {
    workingHours: payload.workingHours,
    workingShiftLabel: payload.workingShiftLabel,
    workingTimeSlots: payload.workingTimeSlots,
  });
  return payload;
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

  await clearWorkingShift(payload.user.id);
  return payload;
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
