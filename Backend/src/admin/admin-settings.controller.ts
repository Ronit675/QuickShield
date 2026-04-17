import { Body, Controller, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { AdminJwtAuthGuard } from '../auth/admin-jwt.guard';
import { AdminSettingsService } from './admin-settings.service';

@Controller('admin/settings')
@UseGuards(AdminJwtAuthGuard)
export class AdminSettingsController {
  constructor(private readonly adminSettingsService: AdminSettingsService) {}

  @Get('me')
  getMe(@Request() req: any) {
    return this.adminSettingsService.getMe(req.user.adminId);
  }

  @Get('admins')
  getAdmins(@Request() req: any) {
    return this.adminSettingsService.listAdmins(req.user.adminId);
  }

  @Post('admins')
  createAdmin(@Request() req: any, @Body() body: any) {
    return this.adminSettingsService.createAdmin(req.user.adminId, body);
  }

  @Patch('admins/:id')
  updateAdmin(@Request() req: any, @Param('id') adminId: string, @Body() body: any) {
    return this.adminSettingsService.updateAdmin(req.user.adminId, adminId, body);
  }

  @Post('admins/:id/reset-otp')
  resetOtp(@Request() req: any, @Param('id') adminId: string) {
    return this.adminSettingsService.resetOtp(req.user.adminId, adminId);
  }
}
