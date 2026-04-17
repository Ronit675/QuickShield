import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AlertStatus, AlertSeverity, Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';

const ALERT_STATUSES = new Set<AlertStatus>(['OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED']);

const isMissingTableError = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021';

@Injectable()
export class AdminFraudAlertsService {
  constructor(private readonly prisma: PrismaService) {}

  async listFraudAlerts(adminId: string) {
    await this.assertFraudAlertReadAccess(adminId);

    try {
      const alerts = await this.prisma.fraudAlert.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          reviewedByAdmin: true,
          claim: {
            include: {
              policy: true,
            },
          },
        },
      });

      return alerts.map((alert) => this.serializeAlert(alert));
    } catch (error) {
      if (isMissingTableError(error)) {
        return [];
      }

      throw error;
    }
  }

  async getFraudAlert(adminId: string, alertId: string) {
    await this.assertFraudAlertReadAccess(adminId);

    try {
      const alert = await this.prisma.fraudAlert.findUnique({
        where: { id: alertId },
        include: {
          reviewedByAdmin: true,
          claim: {
            include: {
              policy: true,
            },
          },
        },
      });

      if (!alert) {
        throw new NotFoundException('Fraud alert not found');
      }

      return this.serializeAlert(alert);
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new NotFoundException('Fraud alert table is not available in the current database');
      }

      throw error;
    }
  }

  async updateFraudAlert(adminId: string, alertId: string, input: { status?: unknown; resolution?: unknown }) {
    const admin = await this.assertFraudAlertWriteAccess(adminId);

    const existingAlert = await this.prisma.fraudAlert.findUnique({
      where: { id: alertId },
    });

    if (!existingAlert) {
      throw new NotFoundException('Fraud alert not found');
    }

    const nextStatus = input.status === undefined ? existingAlert.status : this.normalizeStatus(input.status);
    const resolution = this.normalizeOptionalText(input.resolution);

    const updatedAlert = await this.prisma.fraudAlert.update({
      where: { id: alertId },
      data: {
        status: nextStatus,
        resolution,
        reviewedByAdminId: admin.id,
        resolvedAt: nextStatus === 'RESOLVED' || nextStatus === 'DISMISSED' ? new Date() : null,
      },
      include: {
        reviewedByAdmin: true,
        claim: {
          include: {
            policy: true,
          },
        },
      },
    });

    await this.logFraudAlertActivity(admin.id, 'fraud_alert.update', alertId, {
      previousStatus: existingAlert.status,
      nextStatus,
      resolution,
    });

    return this.serializeAlert(updatedAlert);
  }

  async assignFraudAlert(adminId: string, alertId: string) {
    const admin = await this.assertFraudAlertWriteAccess(adminId);

    const existingAlert = await this.prisma.fraudAlert.findUnique({
      where: { id: alertId },
    });

    if (!existingAlert) {
      throw new NotFoundException('Fraud alert not found');
    }

    const updatedAlert = await this.prisma.fraudAlert.update({
      where: { id: alertId },
      data: {
        status: existingAlert.status === 'OPEN' ? 'REVIEWING' : existingAlert.status,
        reviewedByAdminId: admin.id,
      },
      include: {
        reviewedByAdmin: true,
        claim: {
          include: {
            policy: true,
          },
        },
      },
    });

    await this.logFraudAlertActivity(admin.id, 'fraud_alert.assign', alertId, {
      previousStatus: existingAlert.status,
      nextStatus: updatedAlert.status,
    });

    return this.serializeAlert(updatedAlert);
  }

  private async assertFraudAlertReadAccess(adminId: string) {
    const admin = await this.prisma.admin.findUnique({
      where: { id: adminId },
    });

    if (!admin || !admin.isActive) {
      throw new ForbiddenException('Admin account is disabled');
    }

    if (!admin.canViewClaims && admin.role !== 'SUPERADMIN') {
      throw new ForbiddenException('Fraud alert read access is not enabled for this admin');
    }

    return admin;
  }

  private async assertFraudAlertWriteAccess(adminId: string) {
    const admin = await this.assertFraudAlertReadAccess(adminId);

    if (!admin.canApproveClaims && admin.role !== 'SUPERADMIN') {
      throw new ForbiddenException('Fraud alert update access is not enabled for this admin');
    }

    return admin;
  }

  private normalizeStatus(value: unknown) {
    if (typeof value !== 'string' || !ALERT_STATUSES.has(value as AlertStatus)) {
      throw new BadRequestException('Invalid fraud alert status');
    }

    return value as AlertStatus;
  }

  private normalizeOptionalText(value: unknown) {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private serializeAlert(alert: {
    id: string;
    claimId: string;
    severity: AlertSeverity;
    riskScore: number;
    reasons: string[];
    status: AlertStatus;
    resolution: string | null;
    createdAt: Date;
    updatedAt: Date;
    resolvedAt: Date | null;
    reviewedByAdmin: { displayName: string } | null;
    claim: {
      triggerType: string;
      payoutAmount: number;
      policy: {
        serviceZone: string | null;
      };
    };
  }) {
    return {
      id: alert.id,
      claimId: alert.claimId,
      severity: alert.severity,
      riskScore: alert.riskScore,
      reasons: alert.reasons,
      claimAmount: alert.claim.payoutAmount,
      zone: alert.claim.policy.serviceZone ?? 'unassigned-zone',
      disruptionType: alert.claim.triggerType,
      status: alert.status,
      createdAt: alert.createdAt.toISOString(),
      updatedAt: alert.updatedAt.toISOString(),
      resolvedAt: alert.resolvedAt?.toISOString() ?? null,
      resolution: alert.resolution,
      reviewedBy: alert.reviewedByAdmin?.displayName,
    };
  }

  private async logFraudAlertActivity(
    adminId: string,
    action: string,
    alertId: string,
    details: Prisma.InputJsonObject,
  ) {
    try {
      await this.prisma.adminActivityLog.create({
        data: {
          adminId,
          action,
          resourceType: 'fraud_alert',
          resourceId: alertId,
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
