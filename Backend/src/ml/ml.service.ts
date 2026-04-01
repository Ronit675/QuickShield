import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

export interface RiskPrediction {
  F: number;           // forecast risk    0–1
  Z: number;           // zone risk        0–1
  A: number;           // app crash risk   0–1
  composite: number;   // 0.4F + 0.4Z + 0.2A
  riskMultiplier: number;
  source: 'ml_model' | 'static_fallback';
}

interface MlServiceResponse {
  F: number;
  Z: number;
  A: number;
  composite: number;
  risk_multiplier: number;
  source: string;
}

// Static fallbacks — used when ML service is unreachable
const ZONE_RISK_MAP: Record<string, number> = {
  'bengaluru-btm':         0.65,
  'bengaluru-koramangala': 0.45,
  'bengaluru-indiranagar': 0.25,
  'bengaluru-whitefield':  0.20,
  'mumbai-andheri':        0.70,
  'mumbai-bandra':         0.50,
  'delhi-connaught':       0.40,
  'delhi-lajpat':          0.30,
  'hyderabad-hitech':      0.35,
  'pune-koregaon':         0.28,
};

const PLATFORM_APP_RISK: Record<string, number> = {
  zepto:  0.15,
  blinkit: 0.08,
  swiggy:  0.12,
  zomato:  0.10,
};

@Injectable()
export class MlService {
  private readonly logger = new Logger(MlService.name);
  private readonly ML_URL = process.env.ML_SERVICE_URL ?? 'http://localhost:5001';

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private computeRiskMultiplier(composite: number): number {
    return 0.8 + 0.7 * Math.pow(composite, 1.5);
  }

  private buildRiskPrediction(
    Z: number,
    A: number,
    source: 'ml_model' | 'static_fallback',
    forecastRisk?: number,
    fallbackForecastRisk?: number,
  ): RiskPrediction {
    const F = this.clamp(forecastRisk ?? fallbackForecastRisk ?? 0, 0, 1);
    const composite = 0.4 * F + 0.4 * Z + 0.2 * A;
    const riskMultiplier = this.computeRiskMultiplier(composite);

    return {
      F: parseFloat(F.toFixed(4)),
      Z: parseFloat(Z.toFixed(4)),
      A: parseFloat(A.toFixed(4)),
      composite: parseFloat(composite.toFixed(4)),
      riskMultiplier: parseFloat(riskMultiplier.toFixed(4)),
      source,
    };
  }

  async predictRisk(params: {
    zoneId: string;
    platform: string;
    rainfallForecastMm: number;
    forecastRisk?: number;
    historicalDisruptionRate: number;
    civicFlag: number;
    month: number;        // 1–12, derived from current date in PremiumService
    dayOfWeek: number;    // 0=Mon … 6=Sun, derived from current date in PremiumService
  }): Promise<RiskPrediction> {
    try {
      const { data } = await axios.post<MlServiceResponse>(
        `${this.ML_URL}/predict/risk`,
        {
          zone_id:                    params.zoneId,
          platform:                   params.platform,
          rainfall_forecast_mm:       params.rainfallForecastMm,
          historical_disruption_rate: params.historicalDisruptionRate,
          civic_flag:                 params.civicFlag,
          month:                      params.month,
          day_of_week:                params.dayOfWeek,
        },
        { timeout: 3000 },
      );

      return this.buildRiskPrediction(
        data.Z,
        data.A,
        data.source as 'ml_model' | 'static_fallback',
        params.forecastRisk,
        data.F,
      );
    } catch (err) {
      this.logger.warn(
        `ML service unreachable (${err instanceof Error ? err.message : String(err)}). Using static fallback.`,
      );
      return this.staticFallback(params.zoneId, params.platform, params.month, params.forecastRisk);
    }
  }

  private staticFallback(
    zoneId: string,
    platform: string,
    month: number,
    forecastRisk?: number,
  ): RiskPrediction {
    const Z  = ZONE_RISK_MAP[zoneId] ?? 0.35;
    const A  = PLATFORM_APP_RISK[platform] ?? 0.12;
    const mi = Math.max(0, Math.sin(((month - 3) * Math.PI) / 6));
    const fallbackForecastRisk = Math.min(1, Math.max(0, 0.15 + 0.20 * mi));

    return this.buildRiskPrediction(Z, A, 'static_fallback', forecastRisk, fallbackForecastRisk);
  }
}
