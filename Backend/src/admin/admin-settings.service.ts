import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AdminRole, Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { buildAdminUser } from '../auth/admin-user.util';

type CreateAdminInput = {
  displayName?: string;
  email?: string;
  phone?: string | null;
  role?: string;
  canViewClaims?: boolean;
  canApproveClaims?: boolean;
  canManageAdmins?: boolean;
  canViewAnalytics?: boolean;
  canManagePricing?: boolean;
};

type UpdateAdminInput = CreateAdminInput & {
  isActive?: boolean;
};

const ADMIN_ROLES = new Set([
  'ADMIN',
  'FRAUD_REVIEWER',
  'CLAIMS_OFFICER',
  'ANALYTICS_LEAD',
  'SUPERADMIN',
]);

@Injectable()
export class AdminSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(adminId: string) {
    const admin = await this.prisma.admin.findUnique({
      where: { id: adminId },
    });

    if (!admin || !admin.isActive) {
      throw new ForbiddenException('Admin account is disabled');
    }

    return buildAdminUser(admin);
  }

  async listAdmins(requestingAdminId: string) {
    await this.assertManageAdminsAccess(requestingAdminId, false);

    const admins = await this.prisma.admin.findMany({
      orderBy: [
        { createdAt: 'desc' },
        { displayName: 'asc' },
      ],
    });

    return admins.map((admin) => ({
      ...buildAdminUser(admin),
      isActive: admin.isActive,
      lastLoginAt: admin.lastLoginAt?.toISOString() ?? null,
      loginAttempts: admin.loginAttempts,
      canViewClaims: admin.canViewClaims,
      canApproveClaims: admin.canApproveClaims,
      canManageAdmins: admin.canManageAdmins,
      canViewAnalytics: admin.canViewAnalytics,
      canManagePricing: admin.canManagePricing,
      createdAt: admin.createdAt.toISOString(),
    }));
  }

  async createAdmin(requestingAdminId: string, input: CreateAdminInput) {
    const actor = await this.assertManageAdminsAccess(requestingAdminId, true);
    const payload = await this.normalizeCreateAdminInput(input);

    const createdAdmin = await this.prisma.admin.create({
      data: payload,
    });

    await this.logAdminActivity(actor.id, 'admin.create', createdAdmin.id, {
      role: createdAdmin.role,
      email: createdAdmin.email,
      phone: createdAdmin.phone,
    });

    return {
      admin: {
        ...buildAdminUser(createdAdmin),
        isActive: createdAdmin.isActive,
        lastLoginAt: createdAdmin.lastLoginAt?.toISOString() ?? null,
        loginAttempts: createdAdmin.loginAttempts,
        canViewClaims: createdAdmin.canViewClaims,
        canApproveClaims: createdAdmin.canApproveClaims,
        canManageAdmins: createdAdmin.canManageAdmins,
        canViewAnalytics: createdAdmin.canViewAnalytics,
        canManagePricing: createdAdmin.canManagePricing,
        createdAt: createdAdmin.createdAt.toISOString(),
      },
    };
  }

  async updateAdmin(requestingAdminId: string, targetAdminId: string, input: UpdateAdminInput) {
    const actor = await this.assertManageAdminsAccess(requestingAdminId, true);
    const existingAdmin = await this.prisma.admin.findUnique({
      where: { id: targetAdminId },
    });

    if (!existingAdmin) {
      throw new NotFoundException('Admin not found');
    }

    const payload = await this.normalizeUpdateAdminInput(input, existingAdmin.id);

    if (existingAdmin.id === actor.id && payload.isActive === false) {
      throw new BadRequestException('You cannot disable your own admin account');
    }

    const updatedAdmin = await this.prisma.admin.update({
      where: { id: targetAdminId },
      data: payload,
    });

    await this.logAdminActivity(actor.id, 'admin.update', updatedAdmin.id, {
      role: updatedAdmin.role,
      isActive: updatedAdmin.isActive,
    });

    return {
      admin: {
        ...buildAdminUser(updatedAdmin),
        isActive: updatedAdmin.isActive,
        lastLoginAt: updatedAdmin.lastLoginAt?.toISOString() ?? null,
        loginAttempts: updatedAdmin.loginAttempts,
        canViewClaims: updatedAdmin.canViewClaims,
        canApproveClaims: updatedAdmin.canApproveClaims,
        canManageAdmins: updatedAdmin.canManageAdmins,
        canViewAnalytics: updatedAdmin.canViewAnalytics,
        canManagePricing: updatedAdmin.canManagePricing,
        createdAt: updatedAdmin.createdAt.toISOString(),
      },
    };
  }

  async resetOtp(requestingAdminId: string, targetAdminId: string) {
    const actor = await this.assertManageAdminsAccess(requestingAdminId, true);
    const existingAdmin = await this.prisma.admin.findUnique({
      where: { id: targetAdminId },
    });

    if (!existingAdmin) {
      throw new NotFoundException('Admin not found');
    }

    await this.prisma.admin.update({
      where: { id: targetAdminId },
      data: {
        loginAttempts: 0,
      },
    });

    await this.logAdminActivity(actor.id, 'admin.reset_otp', targetAdminId, {
      email: existingAdmin.email,
      phone: existingAdmin.phone,
    });

    return {
      success: true,
      message: 'OTP state reset for admin login',
    };
  }

  private async assertManageAdminsAccess(adminId: string, strict: boolean) {
    const admin = await this.prisma.admin.findUnique({
      where: { id: adminId },
    });

    if (!admin || !admin.isActive) {
      throw new ForbiddenException('Admin account is disabled');
    }

    if (strict && !admin.canManageAdmins && admin.role !== 'SUPERADMIN') {
      throw new ForbiddenException('Admin management access is required');
    }

    return admin;
  }

  private async normalizeCreateAdminInput(input: CreateAdminInput): Promise<Prisma.AdminCreateInput> {
    const displayName = this.normalizeRequiredText(input.displayName, 'Display name');
    const email = this.normalizeEmail(input.email);
    const phone = this.normalizePhone(input.phone);
    const role = this.normalizeRole(input.role);

    const existingEmail = await this.prisma.admin.findUnique({
      where: { email },
    });

    if (existingEmail) {
      throw new BadRequestException('That admin email is already in use');
    }

    if (phone) {
      const existingPhone = await this.prisma.admin.findUnique({
        where: { phone },
      });

      if (existingPhone) {
        throw new BadRequestException('That admin phone number is already in use');
      }
    }

    return {
      displayName,
      email,
      phone,
      role,
      canViewClaims: Boolean(input.canViewClaims),
      canApproveClaims: Boolean(input.canApproveClaims),
      canManageAdmins: Boolean(input.canManageAdmins),
      canViewAnalytics: Boolean(input.canViewAnalytics),
      canManagePricing: Boolean(input.canManagePricing),
      isActive: true,
    };
  }

  private async normalizeUpdateAdminInput(
    input: UpdateAdminInput,
    currentAdminId: string,
  ): Promise<Prisma.AdminUpdateInput> {
    const displayName = this.normalizeRequiredText(input.displayName, 'Display name');
    const email = this.normalizeEmail(input.email);
    const phone = this.normalizePhone(input.phone);
    const role = this.normalizeRole(input.role);

    const existingEmail = await this.prisma.admin.findUnique({
      where: { email },
    });

    if (existingEmail && existingEmail.id !== currentAdminId) {
      throw new BadRequestException('That admin email is already in use');
    }

    if (phone) {
      const existingPhone = await this.prisma.admin.findUnique({
        where: { phone },
      });

      if (existingPhone && existingPhone.id !== currentAdminId) {
        throw new BadRequestException('That admin phone number is already in use');
      }
    }

    const nextPayload: Prisma.AdminUpdateInput = {
      displayName,
      email,
      phone,
      role,
      canViewClaims: Boolean(input.canViewClaims),
      canApproveClaims: Boolean(input.canApproveClaims),
      canManageAdmins: Boolean(input.canManageAdmins),
      canViewAnalytics: Boolean(input.canViewAnalytics),
      canManagePricing: Boolean(input.canManagePricing),
    };

    if (typeof input.isActive === 'boolean') {
      nextPayload.isActive = input.isActive;
    }

    return nextPayload;
  }

  private normalizeRequiredText(value: unknown, label: string) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`${label} is required`);
    }

    return value.trim();
  }

  private normalizeEmail(value: unknown) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException('Email is required');
    }

    const normalizedEmail = value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw new BadRequestException('Enter a valid email address');
    }

    return normalizedEmail;
  }

  private normalizePhone(value: unknown) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    if (typeof value !== 'string') {
      throw new BadRequestException('Phone number must be a string');
    }

    const digitsOnly = value.trim().replace(/\D/g, '');
    if (!digitsOnly) {
      return null;
    }

    if (digitsOnly.length === 10) {
      return `+91${digitsOnly}`;
    }

    if (digitsOnly.length >= 11 && digitsOnly.length <= 15) {
      return `+${digitsOnly}`;
    }

    throw new BadRequestException('Enter a valid phone number');
  }

  private normalizeRole(value: unknown) {
    if (typeof value !== 'string' || !ADMIN_ROLES.has(value)) {
      throw new BadRequestException('Enter a valid admin role');
    }

    return value as AdminRole;
  }

  private async logAdminActivity(
    adminId: string,
    action: string,
    resourceId: string,
    details: Prisma.InputJsonObject,
  ) {
    await this.prisma.adminActivityLog.create({
      data: {
        adminId,
        action,
        resourceType: 'admin',
        resourceId,
        details,
      },
    });
  }
}
