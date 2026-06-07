import React, { useMemo, useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { loadMockWeatherForecast, MockWeatherBundle } from '../src/services/weather';

type Params = {
  day: string;
};

const HOURLY_TEMPLATE = [
  { time: '8 AM', icon: 'cloud', label: 'Cloudy', prob: '10%', temp: '14°' },
  { time: '10 AM', icon: 'rainy', label: 'Light Rain', prob: '45%', temp: '15°' },
  { time: '12 PM', icon: 'rainy_heavy', label: 'Showers', prob: '70%', temp: '16°' },
  { time: '2 PM', icon: 'thunderstorm', label: 'Storms', prob: '85%', temp: '17°', highRisk: true },
  { time: '3 PM', icon: 'thunderstorm', label: 'Heavy Storms', prob: '95%', temp: '17°', peak: true },
  { time: '5 PM', icon: 'rainy_heavy', label: 'Heavy Rain', prob: '80%', temp: '16°' },
  { time: '8 PM', icon: 'partly_cloudy_night', label: 'Cloudy', prob: '20%', temp: '14°' },
];

const DAY_META: Record<string, { day: string; date: string; title?: string }> = {
  mon: { day: 'Mon', date: 'Oct 23' },
  tue: { day: 'Tue', date: 'Oct 24' },
  wed: { day: 'Wed', date: 'Oct 25', title: 'Wednesday Forecast' },
  thu: { day: 'Thu', date: 'Oct 26' },
  fri: { day: 'Fri', date: 'Oct 27' },
  sat: { day: 'Sat', date: 'Oct 28' },
  sun: { day: 'Sun', date: 'Oct 29' },
};

export default function DayDetails() {
  const router = useRouter();
  const params = useLocalSearchParams<Params>();
  const key = params.day ?? 'wed';

  const meta = DAY_META[key] ?? { day: key, date: '' };

  const [bundle, setBundle] = useState<MockWeatherBundle | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await loadMockWeatherForecast();
        if (mounted) setBundle(data);
      } catch (err) {
        // ignore for now
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const hourly = useMemo(() => {
    if (!bundle) return [];
    const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const index = DAY_KEYS.indexOf(key);
    const dayIndex = index >= 0 ? index : 0;
    const day = bundle.daily[dayIndex] ?? bundle.daily[0];
    return day.hourly.map((h) => ({
      time: h.timeLabel,
      icon: h.icon,
      label: h.condition,
      prob: `${h.precipitationProbability}%`,
      temp: `${h.temperatureC}°`,
      highRisk: h.precipitationProbability >= 85,
      peak: h.rainfallRateMmPerHr >= Math.max(...day.hourly.map((x) => x.rainfallRateMmPerHr)),
    }));
  }, [bundle, key]);

  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top }]}> 
      <View style={[styles.topBar, { height: insets.top }]}>
        <TouchableOpacity style={styles.topBack} onPress={() => router.back()} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={20} color="#3B3A00" />
        </TouchableOpacity>
        <Text style={styles.topTitle}>{meta.title ?? `${meta.day} ${meta.date}`}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Hourly Breakdown</Text>
          <Text style={styles.sectionSub}>Local Time (EDT)</Text>
        </View>

        {loading && (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <ActivityIndicator size="small" color="#736400" />
          </View>
        )}

        {!loading && hourly.length === 0 && (
          <View style={{ padding: 20 }}>
            <Text style={{ color: '#696710' }}>No hourly data available.</Text>
          </View>
        )}

        {!loading && hourly.length > 0 && (
          <View>
            {hourly.map((h) => (
              <View key={h.time} style={[styles.hourRow, h.highRisk && styles.hourRowHigh]}>
                <View style={styles.hourLeft}>
                  <Text style={styles.hourTime}>{h.time}</Text>
                  <Ionicons name={h.icon as any} size={24} color="#736400" />
                </View>
                <View style={styles.hourCenter}>
                  <Text style={styles.hourLabel}>{h.label}</Text>
                  <Text style={styles.hourProb}>{h.prob} Rain Probability</Text>
                </View>
                <Text style={[styles.hourTemp, h.peak && styles.hourTempPeak]}>{h.temp}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fffbff' },
  topBar: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e6e2b0',
    backgroundColor: '#fffbff',
  },
  topBack: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: { fontSize: 18, fontWeight: '800', color: '#3b3a00' },
  content: { padding: 16, paddingBottom: 32 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#3b3a00' },
  sectionSub: { fontSize: 12, color: '#696710' },
  hourRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#e6e2b0', backgroundColor: '#ffffff', marginBottom: 10 },
  hourRowHigh: { backgroundColor: '#f7f376', borderColor: '#736400' },
  hourLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, width: 140 },
  hourTime: { fontSize: 16, fontWeight: '700', color: '#3b3a00', width: 48 },
  hourCenter: { flex: 1, marginLeft: 8 },
  hourLabel: { fontSize: 14, fontWeight: '700', color: '#3b3a00' },
  hourProb: { fontSize: 11, color: '#696710' },
  hourTemp: { fontSize: 16, fontWeight: '900', color: '#736400' },
  hourTempPeak: { color: '#3b3a00' },
});
