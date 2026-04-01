import { Injectable } from '@nestjs/common';
import { PremiumInput, PremiumService } from '../premium/premium.service';
import { PrismaService } from '../prisma/prisma.service';

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
