const padNumber = (value: number) => value.toString().padStart(2, '0');

const formatLocalHourKey = (date: Date) =>
  `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}T${padNumber(date.getHours())}:00`;

const addDays = (date: Date, days: number) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
};

const buildHourDate = (date: Date, hour: number) => {
  const hourDate = new Date(date);
  hourDate.setHours(hour, 0, 0, 0);
  return hourDate;
};

const getDayLabel = (date: Date, dayIndex: number) =>
  dayIndex === 0
    ? 'Today'
    : date.toLocaleDateString('en-IN', { weekday: 'short' });

const getFullDateLabel = (date: Date) =>
  date.toLocaleDateString('en-IN', { month: 'long', day: 'numeric' });

const getTimeLabel = (date: Date) =>
  date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

const MOCK_HOURLY_TEMPERATURES_C = [
  22, 22, 22, 21, 21, 21, 22, 23, 24, 25, 26, 27,
  28, 28, 29, 28, 27, 26, 25, 24, 24, 23, 23, 22,
];

const MOCK_HOURLY_RAIN_MM_PER_HR = [
  15, 15, 16, 16, 17, 18, 20, 22, 24, 25, 23, 21,
  19, 18, 17, 16, 16, 18, 20, 22, 24, 23, 20, 18,
];

const MOCK_HOURLY_PRECIPITATION_PROBABILITY = [
  92, 92, 93, 93, 94, 95, 96, 97, 98, 99, 99, 98,
  97, 96, 95, 95, 95, 96, 97, 98, 99, 99, 98, 96,
];

const MOCK_HOURLY_HUMIDITY = [
  88, 88, 89, 89, 90, 91, 92, 93, 94, 95, 95, 94,
  93, 92, 91, 90, 90, 91, 92, 93, 94, 94, 92, 90,
];

const getHourlyValue = (values: number[], hour: number, fallback: number) =>
  values[hour] ?? fallback;

const getRainfallRateForHour = (dayIndex: number, hour: number) =>
  getHourlyValue(MOCK_HOURLY_RAIN_MM_PER_HR, hour, 18) + Math.min(dayIndex, 2);

const getTemperatureForHour = (dayIndex: number, hour: number) =>
  getHourlyValue(MOCK_HOURLY_TEMPERATURES_C, hour, 24) - Math.min(dayIndex, 2);

const getHumidityForHour = (hour: number) => getHourlyValue(MOCK_HOURLY_HUMIDITY, hour, 90);

const getPrecipitationProbabilityForHour = (dayIndex: number, hour: number) =>
  Math.min(100, getHourlyValue(MOCK_HOURLY_PRECIPITATION_PROBABILITY, hour, 95) + dayIndex);

export type MockWeatherIconName = 'rainy' | 'thunderstorm';

export type MockWeatherHourly = {
  timeKey: string;
  timeLabel: string;
  temperatureC: number;
  precipitationProbability: number;
  rainfallRateMmPerHr: number;
  humidityPercent: number;
  condition: string;
  icon: MockWeatherIconName;
  isCurrentHour: boolean;
};

export type MockWeatherDay = {
  id: string;
  dateLabel: string;
  fullDateLabel: string;
  status: string;
  icon: MockWeatherIconName;
  maxTempC: number;
  minTempC: number;
  precipitationRiskPercent: number;
  forecastRisk: number;
  hourly: MockWeatherHourly[];
};

export type MockWeatherBundle = {
  generatedAt: string;
  currentHourKey: string;
  current: {
    status: string;
    temperatureC: number;
    feelsLikeC: number;
    humidityPercent: number;
    rainfallRateMmPerHr: number;
    icon: MockWeatherIconName;
  };
  daily: MockWeatherDay[];
};

export type CurrentWeatherSnapshot = {
  rainfallRateMmPerHr: number;
  observedAt: string;
};

const getIconForRainfall = (rainfallRateMmPerHr: number): MockWeatherIconName =>
  rainfallRateMmPerHr >= 22 ? 'thunderstorm' : 'rainy';

const getConditionForRainfall = (rainfallRateMmPerHr: number) =>
  rainfallRateMmPerHr >= 22 ? 'Heavy rainfall' : 'Steady heavy rain';

export const loadMockWeatherForecast = async (): Promise<MockWeatherBundle> => {
  const now = new Date();
  const currentHourKey = formatLocalHourKey(now);
  const currentHour = now.getHours();

  const daily = Array.from({ length: 7 }, (_, dayIndex) => {
    const forecastDate = addDays(now, dayIndex);
    const hourly = Array.from({ length: 24 }, (_, hour) => {
      const hourDate = buildHourDate(forecastDate, hour);
      const rainfallRateMmPerHr = getRainfallRateForHour(dayIndex, hour);

      return {
        timeKey: formatLocalHourKey(hourDate),
        timeLabel: getTimeLabel(hourDate),
        temperatureC: getTemperatureForHour(dayIndex, hour),
        precipitationProbability: getPrecipitationProbabilityForHour(dayIndex, hour),
        rainfallRateMmPerHr,
        humidityPercent: getHumidityForHour(hour),
        condition: getConditionForRainfall(rainfallRateMmPerHr),
        icon: getIconForRainfall(rainfallRateMmPerHr),
        isCurrentHour: dayIndex === 0 && hour === currentHour,
      };
    });

    const rainfallPeak = Math.max(...hourly.map((entry) => entry.rainfallRateMmPerHr));
    const maxTempC = Math.max(...hourly.map((entry) => entry.temperatureC));
    const minTempC = Math.min(...hourly.map((entry) => entry.temperatureC));
    const precipitationRiskPercent = Math.max(...hourly.map((entry) => entry.precipitationProbability));

    return {
      id: forecastDate.toISOString(),
      dateLabel: getDayLabel(forecastDate, dayIndex),
      fullDateLabel: getFullDateLabel(forecastDate),
      status: getConditionForRainfall(rainfallPeak),
      icon: getIconForRainfall(rainfallPeak),
      maxTempC,
      minTempC,
      precipitationRiskPercent,
      forecastRisk: precipitationRiskPercent / 100,
      hourly,
    };
  });

  const currentHourSnapshot = daily[0]?.hourly[currentHour];
  if (!currentHourSnapshot) {
    throw new Error('Mock weather could not be generated for the current hour.');
  }

  return {
    generatedAt: currentHourKey,
    currentHourKey,
    current: {
      status: currentHourSnapshot.condition,
      temperatureC: currentHourSnapshot.temperatureC,
      feelsLikeC: currentHourSnapshot.temperatureC + 1,
      humidityPercent: currentHourSnapshot.humidityPercent,
      rainfallRateMmPerHr: currentHourSnapshot.rainfallRateMmPerHr,
      icon: currentHourSnapshot.icon,
    },
    daily,
  };
};

export const fetchCurrentWeatherSnapshot = async (): Promise<CurrentWeatherSnapshot> => {
  const forecast = await loadMockWeatherForecast();

  return {
    rainfallRateMmPerHr: forecast.current.rainfallRateMmPerHr,
    observedAt: forecast.currentHourKey,
  };
};
