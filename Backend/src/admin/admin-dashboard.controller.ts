import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { AdminJwtAuthGuard } from '../auth/admin-jwt.guard';
import { AdminDashboardService } from './admin-dashboard.service';

@Controller('admin/dashboard')
@UseGuards(AdminJwtAuthGuard)
export class AdminDashboardController {
  constructor(private readonly adminDashboardService: AdminDashboardService) {}

  @Get('overview')
  getOverview(@Request() req: any) {
    return this.adminDashboardService.getOverview(req.user.adminId);
  }

  @Get('activity')
  getActivity(@Request() req: any) {
    return this.adminDashboardService.getActivity(req.user.adminId);
  }
}
