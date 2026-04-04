import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../Jwt/jwtauth.guard';
import { PolicyService } from './policy.service';

@Controller('policy')
@UseGuards(JwtAuthGuard)
export class PolicyController {
  constructor(private readonly policyService: PolicyService) {}

  @Get('active')
  active(@Request() req: any) {
    return this.policyService.getActivePolicy(req.user.userId);
  }

  @Get('history')
  history(@Request() req: any) {
    return this.policyService.getPolicyHistory(req.user.userId);
  }

  @Post('purchase')
  purchase(
    @Request() req: any,
    @Body('coveragePerDay') coveragePerDay: number,
    @Body('rainfallForecastMm') rainfallForecastMm?: number,
    @Body('forecastRisk') forecastRisk?: number,
    @Body('civicFlag') civicFlag?: number,
  ) {
    return this.policyService.purchasePolicy({
      userId: req.user.userId,
      coveragePerDay,
      rainfallForecastMm,
      forecastRisk,
      civicFlag,
    });
  }

  @Post('remove-active')
  removeActive(@Request() req: any) {
    return this.policyService.removeActivePolicy(req.user.userId);
  }

  @Post('mock-rain-claim')
  creditMockRainClaim(
    @Request() req: any,
    @Body('claimSessionKey') claimSessionKey: string,
    @Body('disruptedHours') disruptedHours: number,
  ) {
    return this.policyService.creditMockRainClaim(req.user.userId, claimSessionKey, disruptedHours);
  }
}
