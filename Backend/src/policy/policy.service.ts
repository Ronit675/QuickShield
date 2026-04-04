import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PremiumInput, PremiumService } from '../premium/premium.service';
import { PrismaService } from '../prisma/prisma.service';

const HOURS_PER_DAY = 24;
const MS_PER_HOUR = 60 * 60 * 1000;

const getLocalDayKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getStartOfLocalDay = (date: Date) => {
  const nextDate = new Date(date);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
};

const extractSessionStartedAtMs = (claimSessionKey: string) => {
  const matchedStartedAtMs = claimSessionKey.match(/:(\d+)$/)?.[1];
  const parsedStartedAtMs = Number(matchedStartedAtMs);
  return Number.isFinite(parsedStartedAtMs) ? parsedStartedAtMs : null;
};

@Injectable()
export class PolicyService {
  constructor(
    private prisma: PrismaService,
    private premiumService: PremiumService,
  ) {}

  private async expireCompletedPolicies(userId: string) {
    await this.prisma.policy.updateMany({
      where: {
        userId,
        status: 'active',
        weekEndDate: { lt: new Date() },
      },
      data: { status: 'expired' },
    });
  }

  async getActivePolicy(userId: string) {
    await this.expireCompletedPolicies(userId);

    return this.prisma.policy.findFirst({
      where: { userId, status: 'active' },
      orderBy: { weekStartDate: 'desc' },
      include: {
        claims: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });
  }

  async getPolicyHistory(userId: string) {
    await this.expireCompletedPolicies(userId);

    return this.prisma.policy.findMany({
      where: { userId },
      orderBy: { weekStartDate: 'desc' },
      include: {
        claims: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async removeActivePolicy(userId: string) {
    await this.expireCompletedPolicies(userId);

    const result = await this.prisma.policy.updateMany({
      where: {
        userId,
        status: 'active',
      },
      data: { status: 'expired' },
    });

    return {
      removed: result.count > 0,
    };
  }

  async expireActivePoliciesForPlatformChange(userId: string) {
    return this.removeActivePolicy(userId);
  }

  async creditMockRainClaim(userId: string, claimSessionKey: string, disruptedHours: number) {
    await this.expireCompletedPolicies(userId);

    const normalizedClaimSessionKey = claimSessionKey?.trim();
    const normalizedDisruptedHours = Math.max(0, Math.floor(Number(disruptedHours) || 0));

    if (!normalizedClaimSessionKey) {
      throw new BadRequestException('claimSessionKey is required.');
    }

    if (normalizedDisruptedHours <= 0) {
      throw new BadRequestException('disruptedHours must be greater than 0.');
    }

    const activePolicy = await this.prisma.policy.findFirst({
      where: { userId, status: 'active' },
      orderBy: { weekStartDate: 'desc' },
      include: {
        claims: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!activePolicy) {
      throw new NotFoundException('No active policy found for this user.');
    }

    const now = new Date();
    const startOfToday = getStartOfLocalDay(now);
    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

    const sessionStartedAtMs = extractSessionStartedAtMs(normalizedClaimSessionKey);
    const completedHoursBeforeToday = sessionStartedAtMs !== null && sessionStartedAtMs < startOfToday.getTime()
      ? Math.floor((startOfToday.getTime() - sessionStartedAtMs) / MS_PER_HOUR)
      : 0;
    const disruptedHoursForToday = Math.max(0, normalizedDisruptedHours - completedHoursBeforeToday);

    if (disruptedHoursForToday <= 0) {
      return this.getActivePolicy(userId);
    }

    const dayKey = getLocalDayKey(now);
    const sessionSignature = JSON.stringify([normalizedClaimSessionKey, dayKey]);
    const perHourPayout = activePolicy.coveragePerDay / HOURS_PER_DAY;
    const nextDisruptedHours = disruptedHoursForToday;

    const existingClaim = activePolicy.claims.find((claim) =>
      claim.triggerType === 'rain' && claim.affectedSlots === sessionSignature,
    );

    const paidOutTodayExcludingCurrentClaim = activePolicy.claims
      .filter((claim) =>
        (claim.status === 'paid' || claim.status === 'auto_approved')
        && claim.createdAt >= startOfToday
        && claim.createdAt < startOfTomorrow
        && claim.id !== existingClaim?.id,
      )
      .reduce((sum, claim) => sum + claim.payoutAmount, 0);

    const remainingCoverageToday = Math.max(0, activePolicy.coveragePerDay - paidOutTodayExcludingCurrentClaim);
    const nextPayoutAmount = Number(
      Math.min(perHourPayout * disruptedHoursForToday, remainingCoverageToday).toFixed(2),
    );

    if (nextPayoutAmount <= 0) {
      return this.getActivePolicy(userId);
    }

    if (!existingClaim) {
      await this.prisma.claim.create({
        data: {
          policyId: activePolicy.id,
          userId,
          triggerType: 'rain',
          affectedSlots: sessionSignature,
          disruptedHours: nextDisruptedHours,
          payoutAmount: nextPayoutAmount,
          status: 'paid',
        },
      });
    } else if (
      nextPayoutAmount > existingClaim.payoutAmount
      || nextDisruptedHours > existingClaim.disruptedHours
    ) {
      await this.prisma.claim.update({
        where: { id: existingClaim.id },
        data: {
          disruptedHours: nextDisruptedHours,
          payoutAmount: nextPayoutAmount,
          status: 'paid',
        },
      });
    }

    return this.getActivePolicy(userId);
  }

  async purchasePolicy(input: PremiumInput) {
    await this.expireCompletedPolicies(input.userId);

    const premium = await this.premiumService.calculatePremium(input);
    const weekStartDate = new Date();
    const weekEndDate = new Date(weekStartDate.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Keep a single current policy on Home while preserving older purchases in History.
    await this.prisma.policy.updateMany({
      where: {
        userId: input.userId,
        status: 'active',
      },
      data: { status: 'expired' },
    });

    return this.prisma.policy.create({
      data: {
        userId: input.userId,
        status: 'active',
        weekStartDate,
        weekEndDate,
        coveragePerDay: premium.coveragePerDay,
        weeklyPremium: premium.weeklyPremium,
        riskSnapshot: premium.riskSnapshot,
      },
      include: {
        claims: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }
}
