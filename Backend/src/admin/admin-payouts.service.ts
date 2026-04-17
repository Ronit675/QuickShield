import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PayoutStatus } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';

const PAYOUT_STATUSES = new Set<PayoutStatus>([
  'PENDING',
  'APPROVED',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);

const isMissingTableError = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021';

@Injectable()
export class AdminPayoutsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPayouts(adminId: string) {
    await this.assertPayoutReadAccess(adminId);

    try {
      const payouts = await this.prisma.payout.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          processedByAdmin: true,
          claim: {
            include: {
              policy: true,
            },
          },
        },
      });

      return payouts.map((payout) => this.serializePayout(payout));
    } catch (error) {
      if (isMissingTableError(error)) {
        return [];
      }

      throw error;
    }
  }

  async getPayout(adminId: string, payoutId: string) {
    await this.assertPayoutReadAccess(adminId);

    try {
      const payout = await this.prisma.payout.findUnique({
        where: { id: payoutId },
        include: {
          processedByAdmin: true,
          claim: {
            include: {
              policy: true,
            },
          },
        },
      });

      if (!payout) {
        throw new NotFoundException('Payout not found');
      }

      return this.serializePayout(payout);
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new NotFoundException('Payout table is not available in the current database');
      }

      throw error;
    }
  }

  async updatePayoutStatus(adminId: string, payoutId: string, status: unknown) {
    const admin = await this.assertPayoutWriteAccess(adminId);
    const nextStatus = this.normalizeStatus(status);

    try {
      const existingPayout = await this.prisma.payout.findUnique({
        where: { id: payoutId },
      });

      if (!existingPayout) {
        throw new NotFoundException('Payout not found');
      }

      const updatedPayout = await this.prisma.payout.update({
        where: { id: payoutId },
        data: {
          status: nextStatus,
          processedByAdminId: admin.id,
          processedAt: new Date(),
        },
        include: {
          processedByAdmin: true,
          claim: {
            include: {
              policy: true,
            },
          },
        },
      });

      await this.logPayoutActivity(admin.id, 'payout.status_update', payoutId, {
        previousStatus: existingPayout.status,
        nextStatus,
      });

      return this.serializePayout(updatedPayout);
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new NotFoundException('Payout table is not available in the current database');
      }

      throw error;
    }
  }

  async exportPayout(adminId: string, payoutId: string) {
    const admin = await this.assertPayoutWriteAccess(adminId);
    const payout = await this.getPayout(admin.id, payoutId);

    await this.logPayoutActivity(admin.id, 'payout.export', payoutId, {
      status: payout.status,
      amount: payout.amount,
    });

    return {
      payoutId: payout.id,
      exportedAt: new Date().toISOString(),
      exportFormat: 'json',
      data: payout,
    };
  }

  private async assertPayoutReadAccess(adminId: string) {
    const admin = await this.prisma.admin.findUnique({
      where: { id: adminId },
    });

    if (!admin || !admin.isActive) {
      throw new ForbiddenException('Admin account is disabled');
    }

    if (!admin.canViewClaims && admin.role !== 'SUPERADMIN') {
      throw new ForbiddenException('Payout read access is not enabled for this admin');
    }

    return admin;
  }

  private async assertPayoutWriteAccess(adminId: string) {
    const admin = await this.assertPayoutReadAccess(adminId);

    if (!admin.canApproveClaims && admin.role !== 'SUPERADMIN') {
      throw new ForbiddenException('Payout update access is not enabled for this admin');
    }

    return admin;
  }

  private normalizeStatus(value: unknown) {
    if (typeof value !== 'string' || !PAYOUT_STATUSES.has(value as PayoutStatus)) {
      throw new NotFoundException('Invalid payout status');
    }

    return value as PayoutStatus;
  }

  private serializePayout(payout: {
    id: string;
    claimId: string;
    amount: number;
    status: PayoutStatus;
    method: string;
    externalReference: string | null;
    processedAt: Date | null;
    scheduledFor: Date | null;
    createdAt: Date;
    updatedAt: Date;
    processedByAdmin: { displayName: string } | null;
    claim: {
      triggerType: string;
      payoutAmount: number;
      status: string;
      policy: {
        serviceZone: string | null;
      };
    };
  }) {
    return {
      id: payout.id,
      claimId: payout.claimId,
      amount: payout.amount,
      status: payout.status,
      method: payout.method,
      externalReference: payout.externalReference,
      processedAt: payout.processedAt?.toISOString() ?? null,
      scheduledFor: payout.scheduledFor?.toISOString() ?? null,
      createdAt: payout.createdAt.toISOString(),
      updatedAt: payout.updatedAt.toISOString(),
      processedBy: payout.processedByAdmin?.displayName ?? null,
      zone: payout.claim.policy.serviceZone ?? 'unassigned-zone',
      triggerType: payout.claim.triggerType,
      claimStatus: payout.claim.status,
      claimPayoutAmount: payout.claim.payoutAmount,
    };
  }

  private async logPayoutActivity(
    adminId: string,
    action: string,
    payoutId: string,
    details: Prisma.InputJsonObject,
  ) {
    await this.prisma.adminActivityLog.create({
      data: {
        adminId,
        action,
        resourceType: 'payout',
        resourceId: payoutId,
        details,
      },
    });
  }
}
