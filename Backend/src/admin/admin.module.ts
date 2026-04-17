import { Module } from '@nestjs/common';
import { AdminClaimsController } from './admin-claims.controller';
import { AdminClaimsService } from './admin-claims.service';
import { AuthModule } from '../auth/auth.module';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminPayoutsController } from './admin-payouts.controller';
import { AdminPayoutsService } from './admin-payouts.service';
import { AdminSettingsController } from './admin-settings.controller';
import { AdminSettingsService } from './admin-settings.service';
import { AdminFraudAlertsController } from './admin-fraud-alerts.controller';
import { AdminFraudAlertsService } from './admin-fraud-alerts.service';
import { AdminZonesController } from './admin-zones.controller';
import { AdminZonesService } from './admin-zones.service';

@Module({
  imports: [AuthModule],
  controllers: [
    AdminDashboardController,
    AdminSettingsController,
    AdminPayoutsController,
    AdminClaimsController,
    AdminFraudAlertsController,
    AdminZonesController,
  ],
  providers: [
    AdminDashboardService,
    AdminSettingsService,
    AdminPayoutsService,
    AdminClaimsService,
    AdminFraudAlertsService,
    AdminZonesService,
  ],
})
export class AdminModule {}
