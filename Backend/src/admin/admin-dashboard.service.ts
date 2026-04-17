import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';

type DashboardZoneRisk = {
  zone: string;
  percentage: number;
  claims: number;
};

type DashboardCluster = {
  id: string;
  location: string;
  claims: number;
  riskScore: number;
  status: 'MEDIUM' | 'HIGH' | 'CRITICAL';
};

type DashboardActivity = {
  id: string;
  type: 'claim' | 'alert' | 'payout';
  title: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  timestamp: string;
  zone: string;
};

const HOURS_PER_DAY = 24;

const clampPercentage = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const isMissingTableError = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021';

@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(adminId: string) {
    await this.assertAnalyticsAccess(adminId);

    const now = new Date();
    const pastDay = new Date(now.getTime() - HOURS_PER_DAY * 60 * 60 * 1000);

    const [
      totalClaims,
      pendingClaims,
      claimPayoutAggregate,
      averageRiskAggregate,
      claimsLastDay,
      riskDistribution,
      suspiciousClusters,
      fraudAlerts,
      payoutsProcessing,
    ] = await Promise.all([
      this.prisma.claim.count(),
      this.prisma.claim.count({
        where: {
          status: 'pending_review',
        },
      }),
      this.prisma.claim.aggregate({
        _sum: {
          payoutAmount: true,
        },
        where: {
          status: {
            in: ['paid', 'auto_approved'],
          },
        },
      }),
      this.prisma.claim.aggregate({
        _avg: {
          riskScore: true,
        },
      }),
      this.prisma.claim.count({
        where: {
          createdAt: {
            gte: pastDay,
          },
        },
      }),
      this.getRiskDistribution(),
      this.getSuspiciousClusters(pastDay),
      this.getFraudAlertCount(),
      this.getPayoutsProcessingCount(),
    ]);

    return {
      stats: {
        totalClaims,
        pendingClaims,
        fraudAlerts,
        payoutsProcessing,
        totalPayouts: Number(claimPayoutAggregate._sum.payoutAmount ?? 0),
        suspiciousClusters: suspiciousClusters.length,
        averageRiskScore: Number(averageRiskAggregate._avg.riskScore ?? 0),
        claimsPerHour: Number((claimsLastDay / HOURS_PER_DAY).toFixed(1)),
      },
      riskDistribution,
      suspiciousClusters,
    };
  }

  async getActivity(adminId: string) {
    await this.assertAnalyticsAccess(adminId);

    const [claimActivities, alertActivities, payoutActivities] = await Promise.all([
      this.getRecentClaimActivities(),
      this.getRecentAlertActivities(),
      this.getRecentPayoutActivities(),
    ]);

    return [...claimActivities, ...alertActivities, ...payoutActivities]
      .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
      .slice(0, 8);
  }

  private async assertAnalyticsAccess(adminId: string) {
    const admin = await this.prisma.admin.findUnique({
      where: { id: adminId },
      select: {
        isActive: true,
        canViewAnalytics: true,
        role: true,
      },
    });

    if (!admin?.isActive) {
      throw new ForbiddenException('Admin account is disabled');
    }

    if (!admin.canViewAnalytics && admin.role !== 'SUPERADMIN') {
      throw new ForbiddenException('Analytics access is not enabled for this admin');
    }
  }

  private async getFraudAlertCount() {
    try {
      return await this.prisma.fraudAlert.count({
        where: {
          status: {
            in: ['OPEN', 'REVIEWING'],
          },
        },
      });
    } catch (error) {
      if (isMissingTableError(error)) {
        return this.prisma.claim.count({
          where: {
            isSuspicious: true,
          },
        });
      }

      throw error;
    }
  }

  private async getPayoutsProcessingCount() {
    try {
      return await this.prisma.payout.count({
        where: {
          status: {
            in: ['PENDING', 'APPROVED', 'PROCESSING'],
          },
        },
      });
    } catch (error) {
      if (isMissingTableError(error)) {
        return 0;
      }

      throw error;
    }
  }

  private async getRiskDistribution(): Promise<DashboardZoneRisk[]> {
    const claims = await this.prisma.claim.findMany({
      select: {
        id: true,
        riskScore: true,
        policy: {
          select: {
            serviceZone: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 500,
    });

    const zoneMap = new Map<string, { claims: number; riskTotal: number }>();

    claims.forEach((claim) => {
      const zone = claim.policy.serviceZone?.trim() || 'unassigned-zone';
      const current = zoneMap.get(zone) ?? { claims: 0, riskTotal: 0 };
      current.claims += 1;
      current.riskTotal += claim.riskScore;
      zoneMap.set(zone, current);
    });

    return Array.from(zoneMap.entries())
      .map(([zone, value]) => ({
        zone,
        claims: value.claims,
        percentage: clampPercentage((value.riskTotal / value.claims) * 100),
      }))
      .sort((left, right) => right.percentage - left.percentage || right.claims - left.claims)
      .slice(0, 3);
  }

  private async getSuspiciousClusters(since: Date): Promise<DashboardCluster[]> {
    const suspiciousClaims = await this.prisma.claim.findMany({
      where: {
        OR: [
          {
            isSuspicious: true,
          },
          {
            reviewedByAdminId: {
              not: null,
            },
            riskScore: {
              gte: 0.7,
            },
          },
        ],
        createdAt: {
          gte: since,
        },
      },
      select: {
        id: true,
        riskScore: true,
        policy: {
          select: {
            serviceZone: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 200,
    });

    const groupedByZone = new Map<string, { claims: number; riskTotal: number }>();

    suspiciousClaims.forEach((claim) => {
      const zone = claim.policy.serviceZone?.trim() || 'unassigned-zone';
      const current = groupedByZone.get(zone) ?? { claims: 0, riskTotal: 0 };
      current.claims += 1;
      current.riskTotal += claim.riskScore;
      groupedByZone.set(zone, current);
    });

    return Array.from(groupedByZone.entries())
      .map(([location, value], index) => {
        const averageRiskScore = value.riskTotal / value.claims;

        return {
          id: `CLUSTER-${String(index + 1).padStart(3, '0')}`,
          location,
          claims: value.claims,
          riskScore: Number(averageRiskScore.toFixed(2)),
          status:
            averageRiskScore >= 0.9 ? 'CRITICAL' : averageRiskScore >= 0.8 ? 'HIGH' : 'MEDIUM',
        } as DashboardCluster;
      })
      .sort((left, right) => right.riskScore - left.riskScore || right.claims - left.claims)
      .slice(0, 3);
  }

  private async getRecentClaimActivities(): Promise<Array<DashboardActivity & { timestamp: string }>> {
    const claims = await this.prisma.claim.findMany({
      select: {
        id: true,
        status: true,
        isSuspicious: true,
        createdAt: true,
        policy: {
          select: {
            serviceZone: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 4,
    });

    return claims.map((claim) => ({
      id: claim.id,
      type: 'claim',
      title:
        claim.status === 'pending_review'
          ? 'Claim queued for manual review'
          : claim.isSuspicious
            ? 'Suspicious claim pattern detected'
            : 'Claim created',
      severity: claim.isSuspicious ? 'high' : claim.status === 'pending_review' ? 'medium' : 'low',
      timestamp: claim.createdAt.toISOString(),
      zone: claim.policy.serviceZone?.trim() || 'unassigned-zone',
    }));
  }

  private async getRecentAlertActivities(): Promise<Array<DashboardActivity & { timestamp: string }>> {
    try {
      const alerts = await this.prisma.fraudAlert.findMany({
        select: {
          id: true,
          severity: true,
          createdAt: true,
          claim: {
            select: {
              policy: {
                select: {
                  serviceZone: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 2,
      });

      return alerts.map((alert) => ({
        id: alert.id,
        type: 'alert',
        title: 'Fraud alert opened for review',
        severity: alert.severity.toLowerCase() as DashboardActivity['severity'],
        timestamp: alert.createdAt.toISOString(),
        zone: alert.claim.policy.serviceZone?.trim() || 'unassigned-zone',
      }));
    } catch (error) {
      if (isMissingTableError(error)) {
        return [];
      }

      throw error;
    }
  }

  private async getRecentPayoutActivities(): Promise<Array<DashboardActivity & { timestamp: string }>> {
    try {
      const payouts = await this.prisma.payout.findMany({
        select: {
          id: true,
          status: true,
          createdAt: true,
          claim: {
            select: {
              policy: {
                select: {
                  serviceZone: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 2,
      });

      return payouts.map((payout) => ({
        id: payout.id,
        type: 'payout',
        title: `Payout ${payout.status.toLowerCase()} for claim`,
        severity: payout.status === 'FAILED' ? 'high' : 'low',
        timestamp: payout.createdAt.toISOString(),
        zone: payout.claim.policy.serviceZone?.trim() || 'unassigned-zone',
      }));
    } catch (error) {
      if (isMissingTableError(error)) {
        return [];
      }

      throw error;
    }
  }
}
