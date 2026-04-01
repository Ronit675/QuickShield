import { Injectable } from '@nestjs/common';
import { MlService, RiskPrediction } from '../ml/ml.service';
import { PrismaService } from '../prisma/prisma.service';

export interface PremiumInput {
  userId: string;
  coveragePerDay: number;      // rider-selected ₹/day (only thing the caller provides)
  rainfallForecastMm?: number; // from OpenWeatherMap — omit to default to 0
  forecastRisk?: number;       // normalized precipitation risk from the weather API (0..1)
  civicFlag?: number;          // 1 if a civic event is active today — omit to default to 0
}

export interface RiderContext {
  // Pulled from RiderProfile
  avgDailyIncome: number;
  serviceZone: string;
  platform: string;
  zoneRiskScore: number;
  weeklyWorkDays: number;
  // Derived from current date at call time
  month: number;
  dayOfWeek: number;
}

export interface PremiumResult {
  // Rider context (all from DB + current date — nothing from the caller)
  riderContext: RiderContext;
  // Inputs
  coveragePerDay: number;
  // Risk breakdown
  F: number;
  Z: number;
  A: number;
  composite: number;
  riskMultiplier: number;
  // Formula steps
  basePremium: number;
  coverageFactor: number;
  rawPremium: number;
  // Final
  weeklyPremium: number;
  // Meta
  riskSource: 'ml_model' | 'static_fallback';
  riskSnapshot: Record<string, number | string>;
}

@Injectable()
export class PremiumService {
  constructor(
    private prisma: PrismaService,
    private mlService: MlService,
  ) {}

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  async calculatePremium(input: PremiumInput): Promise<PremiumResult> {
    // 1. Fetch everything needed from RiderProfile — caller only supplies
    //    coveragePerDay (slider value) and optional weather/civic inputs.
    const profile = await this.prisma.riderProfile.findUnique({
      where: { userId: input.userId },
    });
    if (!profile) throw new Error('Rider profile not found. Complete onboarding first.');

    // 2. Derive temporal context from the current date (single source of truth).
    const now        = new Date();
    const month      = now.getMonth() + 1; // 1–12
    const dayOfWeek  = now.getDay();        // 0=Sun … 6=Sat (matches Python weekday convention)

    const riderContext: RiderContext = {
      avgDailyIncome: profile.avgDailyIncome,
      serviceZone:    profile.serviceZone,
      platform:       profile.platform,
      zoneRiskScore:  profile.zoneRiskScore,
      weeklyWorkDays: profile.weeklyWorkDays,
      month,
      dayOfWeek,
    };

    // 3. Call ML service — every field comes from the profile or current date,
    //    none from the HTTP request body.
    const risk: RiskPrediction = await this.mlService.predictRisk({
      zoneId:                   profile.serviceZone,
      platform:                 profile.platform,
      rainfallForecastMm:       input.rainfallForecastMm ?? 0,
      forecastRisk:             input.forecastRisk,
      historicalDisruptionRate: profile.zoneRiskScore,
      civicFlag:                input.civicFlag ?? 0,
      month,
      dayOfWeek,
    });

    // 4. Apply the QuickShield premium formula:
    //    clip(max(20, 30×income/900) × (0.8+0.7×composite^1.5) × clip(cov/0.9×income, 0.7, 1.3), 20, 80)
    const { avgDailyIncome } = profile;
    const basePremium    = Math.max(20, 30 * (avgDailyIncome / 900));
    const riskMultiplier = risk.riskMultiplier;
    const rawCovFactor   = input.coveragePerDay / (0.9 * avgDailyIncome);
    const coverageFactor = this.clamp(rawCovFactor, 0.7, 1.3);
    const rawPremium     = basePremium * riskMultiplier * coverageFactor;
    const weeklyPremium  = this.clamp(rawPremium, 20, 80);

    const riskSnapshot: Record<string, number | string> = {
      F: risk.F, Z: risk.Z, A: risk.A,
      composite:      risk.composite,
      riskMultiplier: parseFloat(riskMultiplier.toFixed(4)),
      basePremium:    parseFloat(basePremium.toFixed(2)),
      coverageFactor: parseFloat(coverageFactor.toFixed(3)),
      rawPremium:     parseFloat(rawPremium.toFixed(2)),
      source:         risk.source,
      zone:           profile.serviceZone,
      platform:       profile.platform,
      month,
      dayOfWeek,
    };

    return {
      riderContext,
      coveragePerDay:  input.coveragePerDay,
      F: risk.F, Z: risk.Z, A: risk.A,
      composite:       risk.composite,
      riskMultiplier:  parseFloat(riskMultiplier.toFixed(4)),
      basePremium:     parseFloat(basePremium.toFixed(2)),
      coverageFactor:  parseFloat(coverageFactor.toFixed(3)),
      rawPremium:      parseFloat(rawPremium.toFixed(2)),
      weeklyPremium:   parseFloat(weeklyPremium.toFixed(2)),
      riskSource:      risk.source,
      riskSnapshot,
    };
  }

  /** Called by GET /premium/recommendation — returns slider bounds from the rider's own profile. */
  async getRecommendation(userId: string): Promise<{
    recommended: number;
    min: number;
    max: number;
    avgDailyIncome: number;
  }> {
    const profile = await this.prisma.riderProfile.findUnique({
      where: { userId },
      select: { avgDailyIncome: true },
    });
    if (!profile) throw new Error('Rider profile not found.');
    const { avgDailyIncome } = profile;
    return {
      avgDailyIncome,
      recommended: Math.round(avgDailyIncome * 0.9),
      min:         Math.round(avgDailyIncome * 0.6),
      max:         Math.round(avgDailyIncome * 1.2),
    };
  }
}
