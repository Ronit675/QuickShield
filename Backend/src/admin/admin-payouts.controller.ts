import { Body, Controller, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { AdminJwtAuthGuard } from '../auth/admin-jwt.guard';
import { AdminPayoutsService } from './admin-payouts.service';

@Controller('admin/payouts')
@UseGuards(AdminJwtAuthGuard)
export class AdminPayoutsController {
  constructor(private readonly adminPayoutsService: AdminPayoutsService) {}

  @Get()
  getPayouts(@Request() req: any) {
    return this.adminPayoutsService.listPayouts(req.user.adminId);
  }

  @Get(':id')
  getPayout(@Request() req: any, @Param('id') payoutId: string) {
    return this.adminPayoutsService.getPayout(req.user.adminId, payoutId);
  }

  @Patch(':id/status')
  updatePayoutStatus(@Request() req: any, @Param('id') payoutId: string, @Body('status') status: string) {
    return this.adminPayoutsService.updatePayoutStatus(req.user.adminId, payoutId, status);
  }

  @Post(':id/export')
  exportPayout(@Request() req: any, @Param('id') payoutId: string) {
    return this.adminPayoutsService.exportPayout(req.user.adminId, payoutId);
  }
}
