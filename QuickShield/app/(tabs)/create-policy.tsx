import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';

import api from './src/services/api';
import { useAuth } from './src/context/AuthContext';
import {
  getCurrentCoordinates,
  LocationPermissionError,
  startBackgroundLocationTracking,
} from './src/services/location';

type PremiumRecommendation = {
  recommended: number;
  min: number;
  max: number;
  avgDailyIncome: number;
};

type PremiumCalculation = {
  weeklyPremium: number;
  coveragePerDay: number;
  riderContext: {
    avgDailyIncome: number;
    serviceZone: string;
    platform: string;
  };
  composite: number;
  riskSource: 'ml_model' | 'static_fallback';
};

type ForecastDay = {
  id: string;
  dateLabel: string;
  weatherStatus: string;
  temperatureBand: string;
  precipitationRiskPercent: number;
  forecastRisk: number;
};

type CurrentWeatherSnapshot = {
  status: string;
  temperatureLabel: string;
  feelsLikeLabel: string;
  humidityLabel: string;
};

type GoogleWeatherCondition = {
  description?: { text?: string };
  type?: string;
};

type GoogleTemperature = {
  degrees?: number;
  unit?: 'CELSIUS' | 'FAHRENHEIT' | string;
};

type GoogleCurrentConditionsResponse = {
  weatherCondition?: GoogleWeatherCondition;
  temperature?: GoogleTemperature;
  feelsLikeTemperature?: GoogleTemperature;
  relativeHumidity?: number;
};

type GoogleForecastDay = {
  displayDate?: {
    year?: number;
    month?: number;
    day?: number;
  };
  daytimeForecast?: {
    weatherCondition?: GoogleWeatherCondition;
    precipitation?: {
      probability?: {
        percent?: number;
      };
    };
  };
  nighttimeForecast?: {
    weatherCondition?: GoogleWeatherCondition;
    precipitation?: {
      probability?: {
        percent?: number;
      };
    };
  };
  maxTemperature?: GoogleTemperature;
  minTemperature?: GoogleTemperature;
};

type GoogleForecastDaysResponse = {
  forecastDays?: GoogleForecastDay[];
};

type WeatherLoadState =
  | 'idle'
  | 'locating'
  | 'loading'
  | 'ready'
  | 'permission_denied'
  | 'gps_unavailable'
  | 'error';

const GOOGLE_WEATHER_API_KEY = 'AIzaSyD1EmLhJzswzvT6OoNJ76tux_ZgY4JaMNU';
const GOOGLE_CURRENT_CONDITIONS_ENDPOINT = 'https://weather.googleapis.com/v1/currentConditions:lookup';
const GOOGLE_FORECAST_DAYS_ENDPOINT = 'https://weather.googleapis.com/v1/forecast/days:lookup';

const formatZoneName = (value: string | null | undefined) => {
  if (!value) return 'Not selected';
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const buildRecommendationFromIncome = (avgDailyIncome: number): PremiumRecommendation => ({
  avgDailyIncome,
  recommended: Math.round(avgDailyIncome * 0.9),
  min: Math.round(avgDailyIncome * 0.6),
  max: Math.round(avgDailyIncome * 1.2),
});

const normalizeForecastRisk = (precipitationRiskPercent?: number) => {
  if (typeof precipitationRiskPercent !== 'number' || Number.isNaN(precipitationRiskPercent)) {
    return 0;
  }

  return clamp(precipitationRiskPercent / 100, 0, 1);
};

const WEATHER_TINTS: Record<string, string> = {
  Sunny: '#F59E0B',
  Cloudy: '#60A5FA',
  Stormy: '#F97316',
  Rain: '#38BDF8',
  Clear: '#F59E0B',
};

const createWeatherError = (message: string, code: WeatherLoadState) =>
  Object.assign(new Error(message), { code });

const titleCaseWeather = (value: string) =>
  value
    .toLowerCase()
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const normalizeWeatherStatus = (condition?: GoogleWeatherCondition) => {
  const description = condition?.description?.text?.trim();
  if (description) {
    return titleCaseWeather(description);
  }

  if (condition?.type) {
    return titleCaseWeather(condition.type.replace(/_/g, ' '));
  }

  return 'Weather unavailable';
};

const formatTemperature = (temperature?: GoogleTemperature) => {
  if (typeof temperature?.degrees !== 'number') {
    return '--';
  }

  const rounded = Math.round(temperature.degrees);
  const symbol = temperature.unit === 'FAHRENHEIT' ? 'F' : 'C';
  return `${rounded}°${symbol}`;
};

const getPrecipitationRiskPercent = (day: GoogleForecastDay) => {
  const precipitationPercents = [
    day.daytimeForecast?.precipitation?.probability?.percent,
    day.nighttimeForecast?.precipitation?.probability?.percent,
  ].filter((value): value is number => typeof value === 'number' && !Number.isNaN(value));

  if (!precipitationPercents.length) {
    return 0;
  }

  return clamp(Math.max(...precipitationPercents), 0, 100);
};

const formatGoogleDisplayDate = (displayDate?: { year?: number; month?: number; day?: number }) => {
  if (!displayDate?.year || !displayDate?.month || !displayDate?.day) {
    return 'Upcoming day';
  }

  return new Date(displayDate.year, displayDate.month - 1, displayDate.day).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
};

const buildWeatherUrl = (
  baseUrl: string,
  latitude: number,
  longitude: number,
  extraParams?: Record<string, string>,
) => {
  const params = new URLSearchParams({
    key: GOOGLE_WEATHER_API_KEY,
    'location.latitude': String(latitude),
    'location.longitude': String(longitude),
    unitsSystem: 'METRIC',
    languageCode: 'en',
    ...(extraParams ?? {}),
  });

  return `${baseUrl}?${params.toString()}`;
};

const parseWeatherErrorResponse = async (response: Response) => {
  const fallbackMessage = `Weather lookup failed with status ${response.status}.`;

  try {
    const body = await response.json();
    return body?.error?.message || fallbackMessage;
  } catch {
    return fallbackMessage;
  }
};

const fetchCurrentConditions = async (latitude: number, longitude: number): Promise<CurrentWeatherSnapshot> => {
  const response = await fetch(buildWeatherUrl(GOOGLE_CURRENT_CONDITIONS_ENDPOINT, latitude, longitude));

  if (!response.ok) {
    throw createWeatherError(await parseWeatherErrorResponse(response), 'error');
  }

  const data = await response.json() as GoogleCurrentConditionsResponse;

  return {
    status: normalizeWeatherStatus(data.weatherCondition),
    temperatureLabel: formatTemperature(data.temperature),
    feelsLikeLabel: formatTemperature(data.feelsLikeTemperature),
    humidityLabel:
      typeof data.relativeHumidity === 'number' ? `${data.relativeHumidity}% humidity` : 'Humidity unavailable',
  };
};

const fetchForecastDays = async (latitude: number, longitude: number): Promise<ForecastDay[]> => {
  const response = await fetch(
    buildWeatherUrl(GOOGLE_FORECAST_DAYS_ENDPOINT, latitude, longitude, {
      days: '7',
      pageSize: '7',
    }),
  );

  if (!response.ok) {
    throw createWeatherError(await parseWeatherErrorResponse(response), 'error');
  }

  const data = await response.json() as GoogleForecastDaysResponse;

  return (data.forecastDays ?? []).map((day, index) => {
    const precipitationRiskPercent = getPrecipitationRiskPercent(day);

    return {
      id: `${day.displayDate?.year ?? 'x'}-${day.displayDate?.month ?? 'x'}-${day.displayDate?.day ?? index}`,
      dateLabel: formatGoogleDisplayDate(day.displayDate),
      weatherStatus: normalizeWeatherStatus(
        day.daytimeForecast?.weatherCondition ?? day.nighttimeForecast?.weatherCondition,
      ),
      temperatureBand: `${formatTemperature(day.minTemperature)} / ${formatTemperature(day.maxTemperature)}`,
      precipitationRiskPercent,
      forecastRisk: normalizeForecastRisk(precipitationRiskPercent),
    };
  });
};

const getWeatherTint = (status: string) => {
  if (/storm|thunder/i.test(status)) return '#F97316';
  if (/rain|shower/i.test(status)) return '#38BDF8';
  if (/cloud/i.test(status)) return '#60A5FA';
  if (/clear|sun/i.test(status)) return '#F59E0B';
  return WEATHER_TINTS[status] ?? '#34D399';
};

function WeatherForecastCard({
  currentWeather,
  forecast,
}: {
  currentWeather: CurrentWeatherSnapshot;
  forecast: ForecastDay[];
}) {
  return (
    <View style={styles.forecastCard}>
      <Text style={styles.cardEyebrow}>Next 7 days</Text>
      <Text style={styles.forecastTitle}>Live weather outlook</Text>
      <Text style={styles.forecastSubtitle}>
        Pulled from your current GPS location after premium calculation.
      </Text>

      <View style={styles.currentWeatherCard}>
        <View>
          <Text style={styles.currentWeatherLabel}>Current conditions</Text>
          <Text style={styles.currentWeatherValue}>{currentWeather.status}</Text>
          <Text style={styles.currentWeatherMeta}>{currentWeather.humidityLabel}</Text>
        </View>
        <View style={styles.currentWeatherRight}>
          <Text style={styles.currentWeatherTemp}>{currentWeather.temperatureLabel}</Text>
          <Text style={styles.currentWeatherFeelsLike}>Feels like {currentWeather.feelsLikeLabel}</Text>
        </View>
      </View>

      <View style={styles.forecastList}>
        {forecast.map((day) => (
          <View key={day.id} style={styles.forecastRow}>
            <View>
              <Text style={styles.forecastDate}>{day.dateLabel}</Text>
              <Text style={styles.forecastHint}>
                {day.temperatureBand} | Rain chance {day.precipitationRiskPercent}%
              </Text>
            </View>
            <View
              style={[
                styles.forecastBadge,
                { backgroundColor: `${getWeatherTint(day.weatherStatus)}22`, borderColor: `${getWeatherTint(day.weatherStatus)}55` },
              ]}
            >
              <Text style={[styles.forecastBadgeText, { color: getWeatherTint(day.weatherStatus) }]}>
                {day.weatherStatus}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function WeatherStateCard({
  title,
  description,
  loading = false,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  loading?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.forecastCard}>
      <Text style={styles.cardEyebrow}>Live weather</Text>
      <Text style={styles.forecastTitle}>{title}</Text>
      <Text style={styles.forecastSubtitle}>{description}</Text>

      {loading ? (
        <View style={styles.weatherLoadingRow}>
          <ActivityIndicator color="#00E5A0" />
          <Text style={styles.weatherLoadingText}>Loading weather for your current location</Text>
        </View>
      ) : null}

      {actionLabel && onAction ? (
        <TouchableOpacity style={styles.weatherActionBtn} onPress={onAction} activeOpacity={0.85}>
          <Text style={styles.weatherActionBtnText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export default function CreatePolicyRoute() {
  const { user } = useAuth();
  const [recommendation, setRecommendation] = useState<PremiumRecommendation | null>(null);
  const [coveragePerDay, setCoveragePerDay] = useState(0);
  const [premium, setPremium] = useState<PremiumCalculation | null>(null);
  const [lastForecastRisk, setLastForecastRisk] = useState<number | undefined>(undefined);
  const [forecast, setForecast] = useState<ForecastDay[] | null>(null);
  const [currentWeather, setCurrentWeather] = useState<CurrentWeatherSnapshot | null>(null);
  const [weatherLoadState, setWeatherLoadState] = useState<WeatherLoadState>('idle');
  const [weatherErrorMessage, setWeatherErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [buying, setBuying] = useState(false);

  const fetchRecommendation = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/premium/recommendation');
      const data = response.data as PremiumRecommendation;
      const hasValidRecommendation =
        Number.isFinite(data?.avgDailyIncome)
        && Number.isFinite(data?.recommended)
        && Number.isFinite(data?.min)
        && Number.isFinite(data?.max)
        && data.avgDailyIncome > 0
        && data.recommended > 0
        && data.max >= data.min;

      const nextRecommendation = hasValidRecommendation
        ? data
        : (
          typeof user?.avgDailyIncome === 'number' && user.avgDailyIncome > 0
            ? buildRecommendationFromIncome(user.avgDailyIncome)
            : null
        );

      if (!nextRecommendation) {
        throw new Error('Coverage recommendation is unavailable until rider income is connected.');
      }
      setRecommendation(nextRecommendation);
      setCoveragePerDay(nextRecommendation.recommended);
    } catch (err: any) {
      if (typeof user?.avgDailyIncome === 'number' && user.avgDailyIncome > 0) {
        const fallbackRecommendation = buildRecommendationFromIncome(user.avgDailyIncome);
        setRecommendation(fallbackRecommendation);
        setCoveragePerDay(fallbackRecommendation.recommended);
      } else {
        Alert.alert(
          'Premium unavailable',
          err.response?.data?.message || err.message || 'Could not load policy recommendation.',
        );
      }
    } finally {
      setLoading(false);
    }
  }, [user?.avgDailyIncome]);

  useEffect(() => {
    fetchRecommendation();
  }, [fetchRecommendation]);

  const loadLiveWeather = async () => {
    setWeatherLoadState('locating');
    setWeatherErrorMessage(null);
    setCurrentWeather(null);
    setForecast(null);

    try {
      const { latitude, longitude } = await getCurrentCoordinates();
      setWeatherLoadState('loading');

      try {
        await startBackgroundLocationTracking();
      } catch (backgroundError: any) {
        console.warn('Background location tracking could not be started:', backgroundError?.message || backgroundError);
      }

      const [currentConditions, forecastDays] = await Promise.all([
        fetchCurrentConditions(latitude, longitude),
        fetchForecastDays(latitude, longitude),
      ]);

      setCurrentWeather(currentConditions);
      setForecast(forecastDays);
      setWeatherLoadState('ready');
      return { currentConditions, forecastDays };
    } catch (err: any) {
      const code = err instanceof LocationPermissionError
        ? err.code
        : (err?.code as WeatherLoadState | undefined) ?? 'error';
      setWeatherLoadState(code);
      setWeatherErrorMessage(err?.message || 'Could not load live weather right now.');
      throw err;
    }
  };

  const adjustCoverage = (delta: number) => {
    if (!recommendation) return;
    setCoveragePerDay((current) => clamp(current + delta, recommendation.min, recommendation.max));
    setPremium(null);
    setCurrentWeather(null);
    setForecast(null);
    setWeatherLoadState('idle');
    setWeatherErrorMessage(null);
    setLastForecastRisk(undefined);
  };

  const handleCalculatePremium = async () => {
    setCalculating(true);
    try {
      let forecastRisk: number | undefined;

      try {
        const { forecastDays } = await loadLiveWeather();
        if (forecastDays.length > 0) {
          forecastRisk = forecastDays[0]?.forecastRisk;
        }
      } catch {
        forecastRisk = undefined;
      }

      const response = await api.post('/premium/calculate', {
        coveragePerDay,
        forecastRisk,
      });
      setLastForecastRisk(forecastRisk);
      setPremium(response.data as PremiumCalculation);
    } catch (err: any) {
      setCurrentWeather(null);
      setForecast(null);
      setWeatherLoadState('idle');
      setWeatherErrorMessage(null);
      Alert.alert(
        'Calculation failed',
        err.response?.data?.message || err.message || 'Could not calculate premium.',
      );
    } finally {
      setCalculating(false);
    }
  };

  const handleBuyPremium = async () => {
    if (!premium) {
      return;
    }

    setBuying(true);

    try {
      await api.post('/policy/purchase', {
        coveragePerDay: premium.coveragePerDay,
        forecastRisk: lastForecastRisk,
      });

      Alert.alert('Protection activated', 'Your weekly premium has been purchased and added to purchase history.', [
        {
          text: 'Go to Home',
          onPress: () => router.replace('/home'),
        },
      ]);
    } catch (err: any) {
      Alert.alert(
        'Purchase failed',
        err.response?.data?.message || err.message || 'Could not buy this weekly premium.',
      );
    } finally {
      setBuying(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#00E5A0" size="large" />
      </View>
    );
  }

  if (!recommendation) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.emptyTitle}>Policy creation unavailable</Text>
        <TouchableOpacity onPress={() => router.replace('/home')} style={styles.primaryBtn} activeOpacity={0.85}>
          <Text style={styles.primaryBtnText}>Back to home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0F" />
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.85}>
          <Text style={styles.backBtnText}>Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Create policy</Text>
        <Text style={styles.subtitle}>
          Your premium is calculated from your rider profile and the ML-backed premium engine.
        </Text>

        <View style={styles.contextCard}>
          <Text style={styles.cardEyebrow}>Rider context</Text>
          <Text style={styles.contextLine}>Platform: {user?.platform ? user.platform.toUpperCase() : 'Not set'}</Text>
          <Text style={styles.contextLine}>Zone: {formatZoneName(user?.serviceZone)}</Text>
          <Text style={styles.contextLine}>Avg daily income: Rs {recommendation.avgDailyIncome}</Text>
        </View>

        <View style={styles.coverageCard}>
          <Text style={styles.sectionTitle}>Coverage per day</Text>
          <Text style={styles.coverageValue}>Rs {coveragePerDay}</Text>
          <Text style={styles.coverageHint}>
            Recommended: Rs {recommendation.recommended} | Range: Rs {recommendation.min} to Rs {recommendation.max}
          </Text>

          <View style={styles.adjustRow}>
            <TouchableOpacity style={styles.adjustBtn} onPress={() => adjustCoverage(-50)} activeOpacity={0.85}>
              <Text style={styles.adjustBtnText}>- 50</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.adjustBtn} onPress={() => adjustCoverage(50)} activeOpacity={0.85}>
              <Text style={styles.adjustBtnText}>+ 50</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, calculating && styles.primaryBtnDisabled]}
            onPress={handleCalculatePremium}
            disabled={calculating}
            activeOpacity={0.85}
          >
            {calculating ? (
              <ActivityIndicator color="#08110F" />
            ) : (
              <Text style={styles.primaryBtnText}>Calculate premium</Text>
            )}
          </TouchableOpacity>
        </View>

        {premium && (
          <>
            <View style={styles.resultCard}>
              <Text style={styles.cardEyebrow}>Premium result</Text>
              <Text style={styles.premiumValue}>Rs {premium.weeklyPremium.toFixed(2)}</Text>
              <Text style={styles.premiumMeta}>weekly premium for Rs {premium.coveragePerDay} daily coverage</Text>

              <View style={styles.resultGrid}>
                <View style={styles.resultStat}>
                  <Text style={styles.resultStatLabel}>Risk source</Text>
                  <Text style={styles.resultStatValue}>{premium.riskSource === 'ml_model' ? 'ML model' : 'Static fallback'}</Text>
                </View>
                <View style={styles.resultStat}>
                  <Text style={styles.resultStatLabel}>Composite risk</Text>
                  <Text style={styles.resultStatValue}>{premium.composite.toFixed(2)}</Text>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.purchaseBtn, buying && styles.primaryBtnDisabled]}
                onPress={handleBuyPremium}
                disabled={buying}
                activeOpacity={0.85}
              >
                {buying ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.purchaseBtnText}>Buy this weekly premium</Text>
                )}
              </TouchableOpacity>
            </View>

            {weatherLoadState === 'locating' && (
              <WeatherStateCard
                title="Checking your location"
                description="QuickShield needs GPS access to load live weather for your current area."
                loading
              />
            )}
            {weatherLoadState === 'loading' && (
              <WeatherStateCard
                title="Fetching weather"
                description="Location found. Pulling live weather data from Google Weather API."
                loading
              />
            )}
            {weatherLoadState === 'permission_denied' && (
              <WeatherStateCard
                title="Location access required"
                description={weatherErrorMessage || 'Enable GPS permission to view live weather for your current area.'}
                actionLabel="Allow location access"
                onAction={loadLiveWeather}
              />
            )}
            {weatherLoadState === 'gps_unavailable' && (
              <WeatherStateCard
                title="GPS unavailable"
                description={weatherErrorMessage || 'Turn on location services and try again.'}
                actionLabel="Try again"
                onAction={loadLiveWeather}
              />
            )}
            {weatherLoadState === 'error' && (
              <WeatherStateCard
                title="Weather unavailable"
                description={weatherErrorMessage || 'Could not load weather data right now.'}
                actionLabel="Retry weather lookup"
                onAction={loadLiveWeather}
              />
            )}
            {weatherLoadState === 'ready' && currentWeather && forecast && (
              <WeatherForecastCard currentWeather={currentWeather} forecast={forecast} />
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#0A0A0F',
    gap: 18,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 40,
  },
  backBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#202634',
    backgroundColor: '#111723',
    marginBottom: 18,
  },
  backBtnText: {
    color: '#D1D5DB',
    fontSize: 13,
    fontWeight: '600',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: '#7A8597',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 24,
  },
  contextCard: {
    backgroundColor: '#11141B',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#1C2432',
    marginBottom: 18,
  },
  cardEyebrow: {
    color: '#00E5A0',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 12,
  },
  contextLine: {
    color: '#D1D5DB',
    fontSize: 14,
    marginBottom: 8,
  },
  coverageCard: {
    backgroundColor: '#13131A',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1E1E2E',
    marginBottom: 18,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 14,
  },
  coverageValue: {
    color: '#FFFFFF',
    fontSize: 38,
    fontWeight: '800',
    marginBottom: 6,
  },
  coverageHint: {
    color: '#7A8597',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 16,
  },
  adjustRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 18,
  },
  adjustBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#293141',
    backgroundColor: '#0B1017',
  },
  adjustBtnText: {
    color: '#D1D5DB',
    fontSize: 14,
    fontWeight: '700',
  },
  primaryBtn: {
    height: 54,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#00E5A0',
    minWidth: 180,
  },
  primaryBtnDisabled: {
    opacity: 0.65,
  },
  primaryBtnText: {
    color: '#08110F',
    fontSize: 15,
    fontWeight: '700',
  },
  resultCard: {
    backgroundColor: '#0F1F18',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#00E5A033',
    marginBottom: 18,
  },
  premiumValue: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '800',
    marginBottom: 6,
  },
  premiumMeta: {
    color: '#8BA798',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 16,
  },
  resultGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  resultStat: {
    flex: 1,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#0B1512',
  },
  resultStatLabel: {
    color: '#8BA798',
    fontSize: 12,
    marginBottom: 8,
  },
  resultStatValue: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  purchaseBtn: {
    marginTop: 18,
    height: 54,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1D4ED8',
  },
  purchaseBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  forecastCard: {
    backgroundColor: '#13131A',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1E1E2E',
  },
  forecastTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 6,
  },
  forecastSubtitle: {
    color: '#7A8597',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 16,
  },
  currentWeatherCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 16,
    padding: 16,
    backgroundColor: '#0B1512',
    borderWidth: 1,
    borderColor: '#1E2E26',
    marginBottom: 14,
    gap: 12,
  },
  currentWeatherLabel: {
    color: '#8BA798',
    fontSize: 12,
    marginBottom: 6,
  },
  currentWeatherValue: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  currentWeatherMeta: {
    color: '#9FB7AB',
    fontSize: 12,
  },
  currentWeatherRight: {
    alignItems: 'flex-end',
  },
  currentWeatherTemp: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 4,
  },
  currentWeatherFeelsLike: {
    color: '#9FB7AB',
    fontSize: 12,
  },
  forecastList: {
    gap: 10,
  },
  forecastRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#0B1017',
    borderWidth: 1,
    borderColor: '#1C2432',
  },
  forecastDate: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  forecastHint: {
    color: '#6B7280',
    fontSize: 12,
  },
  forecastBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
  },
  forecastBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  weatherLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  weatherLoadingText: {
    color: '#9FB7AB',
    fontSize: 13,
  },
  weatherActionBtn: {
    alignSelf: 'flex-start',
    marginTop: 4,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#00E5A0',
  },
  weatherActionBtnText: {
    color: '#08110F',
    fontSize: 13,
    fontWeight: '700',
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
});
