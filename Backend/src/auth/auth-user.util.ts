type UserWithProfile = {
  id: string;
  email: string | null;
  phone: string | null;
  fullName?: string | null;
  dateOfBirth?: Date | null;
  address?: string | null;
  profilePhoto?: string | null;
  authProvider?: string;
  profile?: {
    serviceZone: string;
    platform?: string;
    city?: string | null;
    avgDailyIncome?: number;
    workingHours?: number | null;
    workingShiftLabel?: string | null;
    workingTimeSlots?: string[];
    platformConnectionStatus?: string;
  } | null;
};

export type AuthUserResponse = {
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
  workingHours: number | null;
  workingShiftLabel: string | null;
  workingTimeSlots: string[] | null;
  platformConnectionStatus: 'not_connected' | 'verified';
  authProvider: string;
  profileStatus: 'auth_only' | 'platform_linked' | 'active';
};

export const buildAuthUser = (user: UserWithProfile): AuthUserResponse => {
  const profileStatus = !user.profile
    ? 'auth_only'
    : user.profile.serviceZone === 'unknown-zone'
      ? 'platform_linked'
      : 'active';
  const isPlatformVerified = user.profile?.platformConnectionStatus === 'verified';

  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    fullName: user.fullName ?? null,
    dateOfBirth: user.dateOfBirth ? user.dateOfBirth.toISOString().slice(0, 10) : null,
    address: user.address ?? null,
    profilePhoto: user.profilePhoto ?? null,
    platform: user.profile?.platform ?? null,
    city: user.profile?.city ?? null,
    serviceZone: user.profile?.serviceZone ?? null,
    avgDailyIncome: isPlatformVerified ? user.profile?.avgDailyIncome ?? null : null,
    workingHours: isPlatformVerified ? user.profile?.workingHours ?? null : null,
    workingShiftLabel: isPlatformVerified ? user.profile?.workingShiftLabel ?? null : null,
    workingTimeSlots:
      isPlatformVerified && user.profile?.workingTimeSlots?.length
        ? user.profile.workingTimeSlots
        : null,
    platformConnectionStatus: isPlatformVerified ? 'verified' : 'not_connected',
    authProvider: user.authProvider ?? 'phone',
    profileStatus,
  };
};
