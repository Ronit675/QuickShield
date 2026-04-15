import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, TouchableOpacity, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { loadMockWeatherForecast, type MockWeatherIconName } from '../services/weather';
import { useLanguage } from '../directory/Languagecontext';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type HourlyData = {
  time: string;
  temp: number;
  icon: MockWeatherIconName;
  precipitationProbability: number;
  isCurrentHour: boolean;
};

type WeatherDay = {
  date: string;
  fullDate: string;
  temp: number;
  condition: string;
  icon: MockWeatherIconName;
  hourly: HourlyData[];
};

export default function WeatherCard() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [weatherData, setWeatherData] = useState<WeatherDay[]>([]);
  const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(0);
  const [error, setError] = useState<string | null>(null);

  const fetchWeather = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const weather = await loadMockWeatherForecast();
      const processedDays: WeatherDay[] = weather.daily.map((day) => ({
        date: day.dateLabel,
        fullDate: day.fullDateLabel,
        temp: day.maxTempC,
        condition: day.status,
        icon: day.icon,
        hourly: day.hourly.map((hour) => ({
          time: hour.timeLabel,
          temp: hour.temperatureC,
          icon: hour.icon,
          precipitationProbability: hour.precipitationProbability,
          isCurrentHour: hour.isCurrentHour,
        })),
      }));

      setWeatherData(processedDays);
    } catch (err: any) {
      console.error('Mock weather error:', err);
      setError(err.message || t('weathercard.errorText'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void fetchWeather();
  }, [fetchWeather]);

  const handleDayPress = (index: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedDayIndex(selectedDayIndex === index ? null : index);
  };

  if (loading) {
    return (
      <View style={[styles.card, styles.center]}>
        <ActivityIndicator color="#00E5A0" />
        <Text style={styles.loadingText}>{t('weathercard.loadingText')}</Text>
      </View>
    );
  }

  if (error) {
    return (
      <TouchableOpacity onPress={fetchWeather} activeOpacity={0.8} style={[styles.card, styles.center]}>
        <Ionicons name="cloud-offline" size={40} color="#FCA5A5" />
        <Text style={styles.errorText}>{error}</Text>
        <View style={styles.retryBtn}>
          <Text style={styles.retryText}>{t('weathercard.retryText')}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  const selectedDay = selectedDayIndex !== null ? weatherData[selectedDayIndex] : null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>{t('weathercard.eyebrow')}</Text>
          <Text style={styles.title}>{t('weathercard.title')}</Text>
        </View>
        <TouchableOpacity onPress={fetchWeather} activeOpacity={0.6} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={18} color="#00E5A0" />
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.forecastContainer}
      >
        {weatherData.map((day, index) => {
          const isSelected = selectedDayIndex === index;
          return (
            <TouchableOpacity
              key={index}
              activeOpacity={0.7}
              onPress={() => handleDayPress(index)}
              style={[
                styles.dayColumn,
                isSelected && styles.dayColumnSelected
              ]}
            >
              <Text style={[styles.dayDate, isSelected && styles.textActive]}>{day.date}</Text>
              <Ionicons
                name={day.icon}
                size={24}
                color={isSelected ? "#00E5A0" : "#FFFFFF"}
                style={styles.icon}
              />
              <Text style={[styles.dayTemp, isSelected && styles.textActive]}>{day.temp}°</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {selectedDay && (
        <View style={styles.hourlyContainer}>
          <View style={styles.hourlyHeader}>
          <Text style={styles.hourlyTitle}>{t('weathercard.hourlyTitle')}: {selectedDay.fullDate}</Text>
            <View style={styles.conditionBadge}>
              <Text style={styles.conditionText}>{selectedDay.condition}</Text>
            </View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hourlyScroll}>
            {selectedDay.hourly.map((hour) => (
              <View
                key={hour.time}
                style={[styles.hourItem, hour.isCurrentHour && styles.hourItemCurrentHour]}
              >
                <Text style={styles.hourTime}>{hour.time}</Text>
                <Ionicons
                  name={hour.icon}
                  size={22}
                  color={hour.icon === 'thunderstorm' ? '#F97316' : '#60A5FA'}
                  style={styles.hourIcon}
                />
                <Text style={styles.hourTemp}>{hour.temp}°</Text>
                <View style={styles.precipRow}>
                  <Ionicons name="rainy-outline" size={12} color="#60A5FA" />
                  <Text style={styles.precipText}>{hour.precipitationProbability}%</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={styles.footer}>
        <Ionicons name="information-circle-outline" size={14} color="#8B949E" style={{ marginRight: 6 }} />
        <Text style={styles.caption}>
          {selectedDayIndex === 0 ? t('weathercard.captionCurrentDay') : t('weathercard.captionOtherDay', { date: selectedDay?.date ?? '' })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#161B22',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#30363D',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  center: {
    minHeight: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#8B949E',
    marginTop: 14,
    fontSize: 14,
    fontWeight: '500',
  },
  errorText: {
    color: '#FCA5A5',
    marginTop: 12,
    textAlign: 'center',
    fontSize: 14,
    paddingHorizontal: 20,
    lineHeight: 20,
  },
  retryBtn: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#21262D',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#30363D',
  },
  retryText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  refreshBtn: {
    padding: 4,
  },
  eyebrow: {
    color: '#00E5A0',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  forecastContainer: {
    gap: 12,
    paddingRight: 10,
    paddingBottom: 4,
  },
  dayColumn: {
    alignItems: 'center',
    minWidth: 54,
    backgroundColor: '#1C2128',
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#30363D',
  },
  dayColumnSelected: {
    borderColor: '#00E5A0',
    backgroundColor: '#00E5A015',
  },
  textActive: {
    color: '#00E5A0',
    fontWeight: '700',
  },
  dayDate: {
    color: '#8B949E',
    fontSize: 12,
    marginBottom: 6,
  },
  icon: {
    marginVertical: 10,
  },
  dayTemp: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  hourlyContainer: {
    marginTop: 24,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#30363D',
  },
  hourlyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  hourlyTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  conditionBadge: {
    backgroundColor: '#00E5A015',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  conditionText: {
    color: '#00E5A0',
    fontSize: 12,
    fontWeight: '700',
  },
  hourlyScroll: {
    paddingRight: 10,
    paddingBottom: 4,
  },
  hourItem: {
    alignItems: 'center',
    marginRight: 10,
    backgroundColor: '#0D1117',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 14,
    minWidth: 58,
    borderWidth: 1,
    borderColor: '#21262D',
  },
  hourItemCurrentHour: {
    borderColor: '#00E5A0',
  },
  hourTime: {
    color: '#8B949E',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 8,
  },
  hourIcon: {
    marginVertical: 4,
  },
  hourTemp: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  precipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  precipText: {
    color: '#60A5FA',
    fontSize: 11,
    fontWeight: '700',
  },
  footer: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#30363D',
    flexDirection: 'row',
    alignItems: 'center',
  },
  caption: {
    color: '#8B949E',
    fontSize: 13,
    lineHeight: 18,
  },
});
