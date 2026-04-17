import { Body, Controller, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { AdminJwtAuthGuard } from '../auth/admin-jwt.guard';
import { AdminFraudAlertsService } from './admin-fraud-alerts.service';

@Controller('admin/fraud-alerts')
@UseGuards(AdminJwtAuthGuard)
export class AdminFraudAlertsController {
  constructor(private readonly adminFraudAlertsService: AdminFraudAlertsService) {}

  @Get()
  getFraudAlerts(@Request() req: any) {
    return this.adminFraudAlertsService.listFraudAlerts(req.user.adminId);
  }

  @Get(':id')
  getFraudAlert(@Request() req: any, @Param('id') alertId: string) {
    return this.adminFraudAlertsService.getFraudAlert(req.user.adminId, alertId);
  }

  @Patch(':id')
  updateFraudAlert(@Request() req: any, @Param('id') alertId: string, @Body() body: any) {
    return this.adminFraudAlertsService.updateFraudAlert(req.user.adminId, alertId, body);
  }

  @Post(':id/assign')
  assignFraudAlert(@Request() req: any, @Param('id') alertId: string) {
    return this.adminFraudAlertsService.assignFraudAlert(req.user.adminId, alertId);
  }
}
