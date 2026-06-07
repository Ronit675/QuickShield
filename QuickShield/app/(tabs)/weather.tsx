import React from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';


const FORECAST = [
  { key: 'mon', day: 'Mon', date: 'Oct 23', status: 'Heavy Rain', detail: 'Persistent showers', icon: 'rainy', prob: '85%', high: '21°', low: '14°', prominent: false },
  { key: 'tue', day: 'Tue', date: 'Oct 24', status: 'Showers', detail: 'Intermittent rain', icon: 'rainy', prob: '40%', high: '19°', low: '12°', prominent: false },
  { key: 'wed', day: 'Wed', date: 'Oct 25', status: 'Storms', detail: 'Thunder risk high', icon: 'thunderstorm', prob: '95%', high: '17°', low: '11°', prominent: true },
  { key: 'thu', day: 'Thu', date: 'Oct 26', status: 'Scattered', detail: 'Cloudy with sun', icon: 'partly-sunny', prob: '15%', high: '22°', low: '15°', prominent: false },
  { key: 'fri', day: 'Fri', date: 'Oct 27', status: 'Drizzle', detail: 'Light morning mist', icon: 'water', prob: '30%', high: '20°', low: '13°', prominent: false },
  { key: 'sat', day: 'Sat', date: 'Oct 28', status: 'Rain', detail: 'Afternoon downpour', icon: 'rainy', prob: '70%', high: '18°', low: '10°', prominent: false },
  { key: 'sun', day: 'Sun', date: 'Oct 29', status: 'Clear Skies', detail: 'Perfect dry conditions', icon: 'sunny', prob: '5%', high: '24°', low: '14°', prominent: false },
];

export default function WeatherScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top }]}> 
      {/* Top App Bar */}
      <View style={[styles.topBar, { height:insets.top }]}> 
        <TouchableOpacity style={styles.topBack} onPress={() => router.back()} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={20} color="#3B3A00" />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Rain Forecast</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Summary Section */}
        <View style={styles.heroCard}>
          <View style={styles.heroInner}>
            <View>
              <View style={styles.badge}><Text style={styles.badgeText}>Next 7 Days</Text></View>
              <Text style={styles.heroTitle}>Extended Precipitation Window</Text>
              <Text style={styles.heroDesc}>Expect heavy rain accumulation through mid-week. Total predicted volume: 42mm.</Text>

              <View style={styles.summaryGrid}>
                <View style={styles.summaryCard}>
                  <View style={styles.summaryHeader}>
                    <Ionicons name="water" size={16} color="#736400" />
                    <Text style={styles.summaryLabel}>Risk Level</Text>
                  </View>
                  <Text style={styles.summaryValue}>High Alert</Text>
                </View>

                <View style={styles.summaryCard}>
                  <View style={styles.summaryHeader}>
                    <Ionicons name="umbrella" size={16} color="#736400" />
                    <Text style={styles.summaryLabel}>Peak Day</Text>
                  </View>
                  <Text style={styles.summaryValue}>Wednesday</Text>
                </View>
              </View>
            </View>
          </View>
          <View style={styles.decorative} />
        </View>

        {/* Forecast List */}
        <View style={styles.section}>
          <Text style={styles.sectionHint}>Detailed Daily Forecast</Text>
          {FORECAST.map((day) => (
            <TouchableOpacity key={day.key} style={[styles.dayRow, day.prominent && styles.dayRowProminent]} activeOpacity={0.85} onPress={() => router.push(`/weather/${day.key}`)}>
              <View style={styles.dayLeft}>
                <Text style={[styles.dayLabel, day.prominent && styles.dayLabelOnPrimary]}>{day.day}</Text>
                <Text style={[styles.dayDate, day.prominent && styles.dayDateProminent]}>{day.date}</Text>
              </View>

              <View style={styles.dayCenter}>
                <Ionicons name={day.icon as any} size={34} color={day.prominent ? '#3B3A00' : '#736400'} />
                <View style={{ marginLeft: 10 }}>
                  <Text style={[styles.dayTitle, day.prominent && styles.dayTitleOnPrimary]}>{day.status}</Text>
                  <Text style={[styles.daySubtitle, day.prominent && styles.daySubtitleOnPrimary]}>{day.detail}</Text>
                </View>
              </View>

              <View style={styles.dayRight}>
                <View style={[styles.probPill, day.prominent && styles.probPillProminent]}>
                  <Text style={[styles.probText, day.prominent && styles.probTextProminent]}>{day.prob}</Text>
                </View>
                <View style={styles.tempWrap}>
                  <Text style={[styles.tempText, day.prominent && styles.tempTextOnPrimary]}>{day.high} / <Text style={styles.tempLow}>{day.low}</Text></Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Protection Banner */}
        <View style={styles.protectBanner}>
          <View style={styles.protectIcon}><Ionicons name="shield" size={20} color="#565400" /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.protectTitle}>Coverage Alert</Text>
            <Text style={styles.protectText}>Your &quot;Rain Shield&quot; policy is active for the Wednesday peak event.</Text>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fffbff'},
  topBar: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
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
    backgroundColor: 'transparent',
  },
  topTitle: { fontSize: 18, fontWeight: '800', marginLeft: 8, color: '#3b3a00' },
  content: { padding: 16, paddingBottom: 32 },
  heroCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    backgroundColor: '#fffccb',
    borderWidth: 1,
    borderColor: '#c0bd5f',
    overflow: 'hidden',
  },
  heroInner: { zIndex: 10 },
  badge: { alignSelf: 'flex-start', backgroundColor: '#736400', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, marginBottom: 8 },
  badgeText: { color: '#ffffff', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  heroTitle: { fontSize: 24, fontWeight: '900', color: '#3b3a00', marginBottom: 6 },
  heroDesc: { color: '#696710', fontSize: 14, fontWeight: '600' },
  summaryGrid: { flexDirection: 'row', gap: 12, marginTop: 12 },
  summaryCard: { flex: 1, backgroundColor: 'rgba(255,255,255,0.5)', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(192,189,95,0.3)' },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  summaryLabel: { fontSize: 11, color: '#696710', textTransform: 'uppercase', fontWeight: '700' },
  summaryValue: { fontSize: 18, fontWeight: '800', color: '#3b3a00' },
  decorative: { position: 'absolute', right: -20, top: -20, width: 96, height: 96, borderRadius: 48, backgroundColor: '#ffdf00', opacity: 0.3, transform: [{ scale: 1.2 }], filter: undefined },
  section: { marginTop: 8 },
  sectionHint: { fontSize: 12, fontWeight: '800', color: '#696710', textTransform: 'uppercase', marginBottom: 12 },
  dayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#c0bd5f', backgroundColor: '#ffffff', marginBottom: 10 },
  dayRowProminent: { backgroundColor: '#ffdf00', borderColor: '#736400' },
  dayLeft: { width: 68, alignItems: 'center' },
  dayLabel: { fontSize: 16, fontWeight: '700', color: '#3b3a00' },
  dayLabelOnPrimary: { color: '#3b3a00' },
  dayDate: { fontSize: 10, color: '#696710' },
  dayDateProminent: { color: '#3b3a00', fontWeight: '700' },
  dayCenter: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  dayTitle: { fontSize: 16, fontWeight: '800', color: '#3b3a00' },
  dayTitleOnPrimary: { color: '#3b3a00' },
  daySubtitle: { fontSize: 12, color: '#696710' },
  daySubtitleOnPrimary: { color: '#3b3a00' },
  dayRight: { alignItems: 'flex-end', width: 100 },
  probPill: { backgroundColor: 'transparent', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  probPillProminent: { backgroundColor: '#3b3a00' },
  probText: { color: '#696710', fontWeight: '700' },
  probTextProminent: { color: '#ffdf00' },
  tempWrap: { marginTop: 8 },
  tempText: { fontSize: 14, fontWeight: '700', color: '#3b3a00' },
  tempTextOnPrimary: { color: '#3b3a00' },
  tempLow: { color: '#696710', fontWeight: '500' },
  protectBanner: { marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: '#ece942', borderWidth: 1, borderColor: '#c0bd5f', flexDirection: 'row', alignItems: 'center', gap: 12 },
  protectIcon: { backgroundColor: '#ffffff', padding: 8, borderRadius: 999 },
  protectTitle: { fontSize: 16, fontWeight: '800', color: '#565400' },
  protectText: { fontSize: 13, color: '#565400', opacity: 0.9 },
});
