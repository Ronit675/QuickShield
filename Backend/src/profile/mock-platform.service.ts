import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildAuthUser } from '../auth/auth-user.util';
import { UpdateUserProfileDto } from './update-user-profile.dto';

const ZONE_RISK_MAP: Record<string, number> = {
  'bengaluru-btm':          0.65,
  'bengaluru-koramangala':  0.45,
  'bengaluru-indiranagar':  0.25,
  'bengaluru-whitefield':   0.20,
  'mumbai-andheri':         0.70,
  'mumbai-bandra':          0.50,
  'delhi-connaught':        0.40,
  'delhi-lajpat':           0.30,
};

@Injectable()
export class ProfileService {
  constructor(private prisma: PrismaService) {}

  async setPlatform(userId: string, platform: string) {
    await this.prisma.riderProfile.upsert({
      where: { userId },
      create: {
        userId,
        platform,
        city: null,
        serviceZone: 'unknown-zone',
        avgDailyIncome: 0,
        zoneRiskScore: 0.35,
        platformConnectionStatus: 'not_connected',
      },
      update: {
        platform,
        avgDailyIncome: 0,
        platformConnectionStatus: 'not_connected',
      },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });

    return { user: buildAuthUser(user!) };
  }

  async setZone(userId: string, serviceZone: string, city: string) {
    const zoneRiskScore = ZONE_RISK_MAP[serviceZone] ?? 0.35;
    const existingProfile = await this.prisma.riderProfile.findUnique({
      where: { userId },
    });

    // Upsert profile
    await this.prisma.riderProfile.upsert({
      where: { userId },
      create: {
        userId,
        platform: existingProfile?.platform ?? 'unknown',
        city,
        serviceZone,
        avgDailyIncome: 0,
        zoneRiskScore,
        platformConnectionStatus: 'not_connected',
      },
      update: {
        city,
        serviceZone,
        zoneRiskScore,
      },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });

    return { user: buildAuthUser(user!) };
  }

  async connectPlatform(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });

    if (!user || !user.profile) {
      throw new BadRequestException('Complete onboarding before connecting a platform');
    }

    const averageDailyIncome = this.generateAverageDailyIncome();
    const riderShift = this.generateWorkingShift();
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        profile: {
          update: {
            avgDailyIncome: averageDailyIncome,
            platformConnectionStatus: 'verified',
          },
        },
      },
      include: { profile: true },
    });

    return {
      verified: true,
      averageDailyIncome,
      workingHours: riderShift.workingHours,
      workingShiftLabel: riderShift.workingShiftLabel,
      workingTimeSlots: riderShift.workingTimeSlots,
      message: 'Platform connected',
      user: buildAuthUser(updatedUser),
    };
  }

  async disconnectPlatform(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });

    if (!user || !user.profile) {
      throw new BadRequestException('No platform profile found');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        profile: {
          update: {
            avgDailyIncome: 0,
            platformConnectionStatus: 'not_connected',
          },
        },
      },
      include: { profile: true },
    });

    return {
      disconnected: true,
      message: 'Platform disconnected',
      user: buildAuthUser(updatedUser),
    };
  }

  async updateDetails(userId: string, dto: UpdateUserProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });

    if (!user) {
      throw new UnauthorizedException();
    }

    const fullName = dto.fullName.trim();
    const address = dto.address.trim();
    const email = dto.email.trim().toLowerCase();
    const dateOfBirth = this.parseDateOfBirth(dto.dateOfBirth);
    const profilePhoto = this.normalizeProfilePhoto(dto.profilePhoto);

    if (!fullName) {
      throw new BadRequestException('Full name is required');
    }

    if (!address) {
      throw new BadRequestException('Address is required');
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Enter a valid email address');
    }

    if (
      user.authProvider === 'google'
      && user.email
      && user.email.toLowerCase() !== email
    ) {
      throw new BadRequestException('Google sign-in email cannot be changed');
    }

    const existingEmailUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingEmailUser && existingEmailUser.id !== userId) {
      throw new BadRequestException('That email is already in use');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        fullName,
        dateOfBirth,
        address,
        email,
        profilePhoto,
      },
      include: { profile: true },
    });

    return { user: buildAuthUser(updatedUser) };
  }

  private parseDateOfBirth(rawDate: string) {
    const value = rawDate.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException('Date of birth must be in YYYY-MM-DD format');
    }

    const parsedDate = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsedDate.getTime())) {
      throw new BadRequestException('Enter a valid date of birth');
    }

    if (parsedDate > new Date()) {
      throw new BadRequestException('Date of birth cannot be in the future');
    }

    return parsedDate;
  }

  private normalizeProfilePhoto(photo: string | null | undefined) {
    if (!photo) {
      return null;
    }

    const value = photo.trim();
    const isDataUrl = /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(value);

    if (!isDataUrl) {
      throw new BadRequestException('Profile photo must be a valid image');
    }

    if (value.length > 2_500_000) {
      throw new BadRequestException('Profile photo is too large');
    }

    return value;
  }

  private generateAverageDailyIncome() {
    return Math.floor(Math.random() * (2500 - 300 + 1)) + 300;
  }

  private generateWorkingShift() {
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

      return `${this.formatHour(slotStart)} - ${this.formatHour(slotEnd)}`;
    });

    return {
      workingHours,
      workingShiftLabel: `${this.formatHour(startHour)} - ${this.formatHour(startHour + workingHours)}`,
      workingTimeSlots,
    };
  }

  private formatHour(hour: number) {
    const normalizedHour = ((hour % 24) + 24) % 24;
    const period = normalizedHour >= 12 ? 'PM' : 'AM';
    const hourIn12Format = normalizedHour % 12 === 0 ? 12 : normalizedHour % 12;

    return `${hourIn12Format}:00 ${period}`;
  }
}
