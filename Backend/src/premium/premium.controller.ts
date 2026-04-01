import { Controller, Post, Get, Body, Request, UseGuards } from '@nestjs/common';
import { PremiumService } from './premium.service';
import { JwtAuthGuard } from '../Jwt/jwtauth.guard';

@Controller('premium')
@UseGuards(JwtAuthGuard)
export class PremiumController {
  constructor(private premiumService: PremiumService) {}

  /**
   * POST /premium/calculate
   * The app only sends { coveragePerDay }.
   * Zone, platform, income, month, and day_of_week are all fetched from
   * RiderProfile inside PremiumService — nothing rider-specific comes from
   * the request body.
   */
  @Post('calculate')
  calculate(
    @Request() req: any,
    @Body('coveragePerDay') coveragePerDay: number,
    @Body('rainfallForecastMm') rainfallForecastMm?: number,
    @Body('forecastRisk') forecastRisk?: number,
    @Body('civicFlag') civicFlag?: number,
  ) {
    return this.premiumService.calculatePremium({
      userId: req.user.userId,
      coveragePerDay,
      rainfallForecastMm,
      forecastRisk,
      civicFlag,
    });
  }

  /**
   * GET /premium/recommendation
   * Returns slider bounds (min/recommended/max coverage) derived from
   * the rider's own avgDailyIncome stored in RiderProfile.
   */
  @Get('recommendation')
  recommendation(@Request() req: any) {
    return this.premiumService.getRecommendation(req.user.userId);
  }
}
