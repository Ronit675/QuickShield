import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';

const isMissingTableError = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021';

@Injectable()
export class AdminZonesService {
  constructor(private readonly prisma: PrismaService) {}

  async listZones(adminId: string) {
    await this.assertZoneReadAccess(adminId);

    try {
      const zones = await this.prisma.serviceZone.findMany({
        orderBy: [{ city: 'asc' }, { name: 'asc' }],
      });

      return Promise.all(zones.map((zone) => this.buildZoneSummary(zone.code)));
    } catch (error) {
      if (isMissingTableError(error)) {
        return [];
      }

      throw error;
    }
  }

  async getZone(adminId: string, code: string) {
    await this.assertZoneReadAccess(adminId);
    return this.buildZoneSummary(code);
  }

  async getZoneDisruptions(adminId: string, code: string) {
    await this.assertZoneReadAccess(adminId);

    const zone = await this.prisma.serviceZone.findUnique({
      where: { code },
    });

    if (!zone) {
      throw new NotFoundException('Zone not found');
    }

    const disruptions = await this.prisma.disruptionEvent.findMany({
      where: { zone: code },
      orderBy: { createdAt: 'desc' },
    });

    return disruptions.map((disruption) => ({
      id: disruption.id,
      triggerType: disruption.triggerType,
      startTime: disruption.startTime.toISOString(),
      endTime: disruption.endTime?.toISOString() ?? null,
      createdAt: disruption.createdAt.toISOString(),
    }));
  }

  async getZoneClaims(adminId: string, code: string) {
    await this.assertZoneReadAccess(adminId);

    const zone = await this.prisma.serviceZone.findUnique({
      where: { code },
    });

    if (!zone) {
      throw new NotFoundException('Zone not found');
    }

    const claims = await this.prisma.claim.findMany({
      where: {
        policy: {
          serviceZone: code,
        },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        policy: {
          include: {
            user: true,
          },
        },
      },
    });

    return claims.map((claim) => ({
      id: claim.id,
      userName: claim.policy.user.fullName ?? 'Unnamed user',
      triggerType: claim.triggerType,
      payoutAmount: claim.payoutAmount,
      status: claim.status,
      riskScore: claim.riskScore,
      isSuspicious: claim.isSuspicious,
      createdAt: claim.createdAt.toISOString(),
    }));
  }

  private async assertZoneReadAccess(adminId: string) {
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
      throw new ForbiddenException('Zone analytics access is not enabled for this admin');
    }
  }

  private async buildZoneSummary(code: string) {
    const zone = await this.prisma.serviceZone.findUnique({
      where: { code },
    });

    if (!zone) {
      throw new NotFoundException('Zone not found');
    }

    const [activePoliciesCount, claimsAggregate, recentDisruptionsCount] = await Promise.all([
      this.prisma.policy.count({
        where: {
          serviceZone: code,
          status: 'active',
        },
      }),
      this.prisma.claim.aggregate({
        where: {
          policy: {
            serviceZone: code,
          },
        },
        _count: {
          id: true,
        },
        _sum: {
          payoutAmount: true,
        },
        _avg: {
          riskScore: true,
        },
      }),
      this.prisma.disruptionEvent.count({
        where: {
          zone: code,
        },
      }),
    ]);

    const suspiciousClaimsCount = await this.prisma.claim.count({
      where: {
        policy: {
          serviceZone: code,
        },
        OR: [{ isSuspicious: true }, { riskScore: { gte: zone.alertThreshold } }],
      },
    });

    return {
      id: zone.id,
      code: zone.code,
      name: zone.name,
      city: zone.city,
      isActive: zone.isActive,
      baseRiskScore: zone.baseRiskScore,
      alertThreshold: zone.alertThreshold,
      activePoliciesCount,
      totalClaims: claimsAggregate._count.id,
      suspiciousClaimsCount,
      totalPayoutAmount: Number(claimsAggregate._sum.payoutAmount ?? 0),
      averageRiskScore: Number(claimsAggregate._avg.riskScore ?? 0),
      disruptionsCount: recentDisruptionsCount,
      createdAt: zone.createdAt.toISOString(),
      updatedAt: zone.updatedAt.toISOString(),
    };
  }
}
