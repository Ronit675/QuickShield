import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';

const CLAIM_STATUSES = new Set(['auto_approved', 'pending_review', 'paid']);

const isMissingTableError = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021';

@Injectable()
export class AdminClaimsService {
  constructor(private readonly prisma: PrismaService) {}

  async listClaims(adminId: string) {
    await this.assertClaimReadAccess(adminId);

    const claims = await this.prisma.claim.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        reviewedByAdmin: true,
        fraudAlert: true,
        payout: true,
        policy: {
          include: {
            user: true,
          },
        },
      },
    });

    return claims.map((claim) => this.serializeClaim(claim));
  }

  async getClaim(adminId: string, claimId: string) {
    await this.assertClaimReadAccess(adminId);

    const claim = await this.prisma.claim.findUnique({
      where: { id: claimId },
      include: {
        reviewedByAdmin: true,
        fraudAlert: true,
        payout: true,
        policy: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!claim) {
      throw new NotFoundException('Claim not found');
    }

    return this.serializeClaim(claim);
  }

  async updateClaimStatus(adminId: string, claimId: string, status: unknown) {
    const admin = await this.assertClaimWriteAccess(adminId);
    const nextStatus = this.normalizeStatus(status);

    const existingClaim = await this.prisma.claim.findUnique({
      where: { id: claimId },
    });

    if (!existingClaim) {
      throw new NotFoundException('Claim not found');
    }

    const updatedClaim = await this.prisma.claim.update({
      where: { id: claimId },
      data: {
        status: nextStatus,
        reviewedByAdminId: admin.id,
        reviewedAt: new Date(),
      },
      include: {
        reviewedByAdmin: true,
        fraudAlert: true,
        payout: true,
        policy: {
          include: {
            user: true,
          },
        },
      },
    });

    await this.logClaimActivity(admin.id, 'claim.status_update', claimId, {
      previousStatus: existingClaim.status,
      nextStatus,
    });

    return this.serializeClaim(updatedClaim);
  }

  async addClaimNote(adminId: string, claimId: string, note: unknown) {
    const admin = await this.assertClaimWriteAccess(adminId);
    const nextNote = this.normalizeNote(note);

    const existingClaim = await this.prisma.claim.findUnique({
      where: { id: claimId },
    });

    if (!existingClaim) {
      throw new NotFoundException('Claim not found');
    }

    const mergedNotes = existingClaim.reviewNotes
      ? `${existingClaim.reviewNotes}\n\n[${new Date().toISOString()}] ${nextNote}`
      : `[${new Date().toISOString()}] ${nextNote}`;

    const updatedClaim = await this.prisma.claim.update({
      where: { id: claimId },
      data: {
        reviewNotes: mergedNotes,
        reviewedByAdminId: admin.id,
        reviewedAt: new Date(),
      },
      include: {
        reviewedByAdmin: true,
        fraudAlert: true,
        payout: true,
        policy: {
          include: {
            user: true,
          },
        },
      },
    });

    await this.logClaimActivity(admin.id, 'claim.note_added', claimId, {
      note: nextNote,
    });

    return this.serializeClaim(updatedClaim);
  }

  private async assertClaimReadAccess(adminId: string) {
    const admin = await this.prisma.admin.findUnique({
      where: { id: adminId },
    });

    if (!admin || !admin.isActive) {
      throw new ForbiddenException('Admin account is disabled');
    }

    if (!admin.canViewClaims && admin.role !== 'SUPERADMIN') {
      throw new ForbiddenException('Claim read access is not enabled for this admin');
    }

    return admin;
  }

  private async assertClaimWriteAccess(adminId: string) {
    const admin = await this.assertClaimReadAccess(adminId);

    if (!admin.canApproveClaims && admin.role !== 'SUPERADMIN') {
      throw new ForbiddenException('Claim update access is not enabled for this admin');
    }

    return admin;
  }

  private normalizeStatus(value: unknown) {
    if (typeof value !== 'string' || !CLAIM_STATUSES.has(value)) {
      throw new BadRequestException('Invalid claim status');
    }

    return value;
  }

  private normalizeNote(value: unknown) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException('Claim note is required');
    }

    return value.trim();
  }

  private serializeClaim(claim: {
    id: string;
    triggerType: string;
    disruptedHours: number;
    payoutAmount: number;
    status: string;
    claimSessionKey: string | null;
    riskScore: number;
    isSuspicious: boolean;
    reviewNotes: string | null;
    reviewedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    reviewedByAdmin: { displayName: string } | null;
    fraudAlert: { severity: string; status: string } | null;
    payout: { id: string; status: string } | null;
    policy: {
      id: string;
      serviceZone: string | null;
      city: string | null;
      user: {
        id: string;
        fullName: string | null;
        phone: string | null;
        email: string | null;
      };
    };
  }) {
    return {
      id: claim.id,
      policyId: claim.policy.id,
      userId: claim.policy.user.id,
      userName: claim.policy.user.fullName ?? 'Unnamed user',
      userPhone: claim.policy.user.phone,
      userEmail: claim.policy.user.email,
      zone: claim.policy.serviceZone ?? 'unassigned-zone',
      city: claim.policy.city,
      triggerType: claim.triggerType,
      disruptedHours: claim.disruptedHours,
      payoutAmount: claim.payoutAmount,
      status: claim.status,
      claimSessionKey: claim.claimSessionKey,
      riskScore: claim.riskScore,
      isSuspicious: claim.isSuspicious,
      reviewNotes: claim.reviewNotes,
      reviewedAt: claim.reviewedAt?.toISOString() ?? null,
      reviewedBy: claim.reviewedByAdmin?.displayName ?? null,
      createdAt: claim.createdAt.toISOString(),
      updatedAt: claim.updatedAt.toISOString(),
      fraudAlert: claim.fraudAlert
        ? {
            severity: claim.fraudAlert.severity,
            status: claim.fraudAlert.status,
          }
        : null,
      payout: claim.payout
        ? {
            id: claim.payout.id,
            status: claim.payout.status,
          }
        : null,
    };
  }

  private async logClaimActivity(
    adminId: string,
    action: string,
    claimId: string,
    details: Prisma.InputJsonObject,
  ) {
    try {
      await this.prisma.adminActivityLog.create({
        data: {
          adminId,
          action,
          resourceType: 'claim',
          resourceId: claimId,
          details,
        },
      });
    } catch (error) {
      if (isMissingTableError(error)) {
        return;
      }

      throw error;
    }
  }
}
