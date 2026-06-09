import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
  ActivityIndicator,
  ScrollView,
  SafeAreaView,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const ZONES = [
  { id: 'bengaluru-koramangala', label: 'Koramangala', city: 'Bengaluru', risk: 'Medium' },
  { id: 'bengaluru-indiranagar',  label: 'Indiranagar',  city: 'Bengaluru', risk: 'Low'    },
  { id: 'bengaluru-whitefield',   label: 'Whitefield',   city: 'Bengaluru', risk: 'Low'    },
  { id: 'bengaluru-btm',          label: 'BTM Layout',   city: 'Bengaluru', risk: 'High'   },
  { id: 'mumbai-andheri',         label: 'Andheri',      city: 'Mumbai',    risk: 'High'   },
  { id: 'mumbai-bandra',          label: 'Bandra',       city: 'Mumbai',    risk: 'Medium' },
  { id: 'delhi-connaught',        label: 'Connaught Pl', city: 'Delhi',     risk: 'Medium' },
  { id: 'delhi-lajpat',           label: 'Lajpat Nagar', city: 'Delhi',     risk: 'Low'    },
];

const RISK_COLORS: Record<string, string> = {
  Low: '#5E6A32',
  Medium: '#736400',
  High: '#BE2D06',
};

const RISK_BG_COLORS: Record<string, string> = {
  Low: 'rgba(94, 106, 50, 0.12)',
  Medium: 'rgba(115, 100, 0, 0.12)',
  High: 'rgba(190, 45, 6, 0.12)',
};

export default function OnboardingZoneScreen() {
  const [selected, setSelected] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const { setUser } = useAuth();
  const insets = useSafeAreaInsets();

  const handleContinue = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      const zone = ZONES.find((z) => z.id === selected)!;
      const res = await api.post('/profile/zone', {
        serviceZone: selected,
        city: zone.city,
      });
      setUser(res.data.user);
      router.replace('/home');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const filteredZones = ZONES.filter((z) => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return z.label.toLowerCase().includes(query) || z.city.toLowerCase().includes(query);
  });

  const selectedZone = ZONES.find((z) => z.id === selected);

  return (
    <SafeAreaView style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFBFF" />

      {/* Progress Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back" size={24} color="#736400" />
        </TouchableOpacity>
        <Text style={styles.headerCenterTitle}>QuickShield</Text>
        <View style={styles.headerRightPlaceholder} />
      </View>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBarBg}>
          <View style={styles.progressBarFill} />
        </View>
        <Text style={styles.stepLabel}>Step 2 of 2</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Headline Section */}
        <View style={styles.headlineSection}>
          <Text style={styles.title}>Define your area.</Text>
          <Text style={styles.subtitle}>
            We use this to track local weather and calculate your shield payouts.
          </Text>
        </View>

        {/* Search Input */}
        <View style={styles.searchBarContainer}>
          <Ionicons name="search" size={20} color="#696710" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search for a neighborhood or city"
            placeholderTextColor="rgba(105, 103, 16, 0.6)"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} activeOpacity={0.7}>
              <Ionicons name="close-circle" size={18} color="#696710" style={styles.clearIcon} />
            </TouchableOpacity>
          )}
        </View>

        {/* Selected Zone Bento Card */}
        {selectedZone && (
          <View style={styles.selectedZoneCard}>
            <View style={styles.selectedZoneIconBox}>
              <Ionicons name="pin" size={22} color="#FFFFFF" />
            </View>
            <View style={styles.selectedZoneTextWrap}>
              <Text style={styles.selectedZoneTitle}>Selected Zone</Text>
              <Text style={styles.selectedZoneValue}>{selectedZone.label}, {selectedZone.city}</Text>
            </View>
          </View>
        )}

        {/* Suggested Zones List */}
        <View style={styles.zonesSection}>
          <Text style={styles.sectionTitle}>Suggested Zones</Text>
          <View style={styles.zonesList}>
            {filteredZones.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="alert-circle-outline" size={24} color="#696710" />
                <Text style={styles.emptyText}>No matching zones found.</Text>
              </View>
            ) : (
              filteredZones.map((z) => {
                const isSelected = selected === z.id;

                return (
                  <TouchableOpacity
                    key={z.id}
                    style={[
                      styles.zoneRow,
                      isSelected && styles.zoneRowSelected,
                    ]}
                    onPress={() => setSelected(z.id)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.rowLeft}>
                      <Ionicons
                        name="business-outline"
                        size={20}
                        color={isSelected ? '#736400' : '#696710'}
                      />
                      <View style={styles.rowTextColumn}>
                        <Text style={styles.zoneName}>{z.label}</Text>
                        <Text style={styles.zoneCity}>{z.city}</Text>
                      </View>
                    </View>

                    <View style={styles.rowRight}>
                      <View
                        style={[
                          styles.riskBadge,
                          { backgroundColor: RISK_BG_COLORS[z.risk] },
                        ]}
                      >
                        <Text style={[styles.riskText, { color: RISK_COLORS[z.risk] }]}>
                          {z.risk}
                        </Text>
                      </View>
                      <Ionicons
                        name={isSelected ? 'checkmark-circle' : 'chevron-forward'}
                        size={18}
                        color={isSelected ? '#736400' : '#696710'}
                      />
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </View>

        {/* Bottom Earnings Note (when selected) */}
        {selectedZone && (
          <View style={styles.earningsNote}>
            <Ionicons name="information-circle" size={20} color="#736400" />
            <Text style={styles.earningsNoteText}>
              We&apos;ll import your last 8 weeks of earnings from the platform to set your recommended coverage.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Fixed Action Footer */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.btn, !selected && styles.btnDisabled]}
          onPress={handleContinue}
          disabled={!selected || loading}
          activeOpacity={0.88}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <View style={styles.btnContent}>
              <Text style={styles.btnText}>Confirm & Finish</Text>
              <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
            </View>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFBFF',
  },
  header: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E4E4E7',
  },
  backButton: {
    padding: 6,
    borderRadius: 20,
  },
  headerCenterTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#736400',
  },
  headerRightPlaceholder: {
    width: 36,
  },
  progressContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 4,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: 'rgba(115, 100, 0, 0.1)',
    borderRadius: 99,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    width: '100%',
    backgroundColor: '#736400',
    borderRadius: 99,
  },
  stepLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#696710',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
    gap: 24,
  },
  headlineSection: {
    gap: 8,
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    color: '#3B3A00',
  },
  subtitle: {
    fontSize: 14,
    color: '#696710',
    lineHeight: 20,
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(236, 233, 66, 0.08)',
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 52,
    borderWidth: 1.5,
    borderColor: 'rgba(192, 189, 95, 0.25)',
  },
  searchIcon: {
    marginRight: 10,
  },
  clearIcon: {
    marginLeft: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#3B3A00',
    fontWeight: '600',
  },
  selectedZoneCard: {
    backgroundColor: 'rgba(255, 223, 0, 0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(115, 100, 0, 0.3)',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    shadowColor: '#736400',
    shadowOpacity: 0.02,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  selectedZoneIconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#736400',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedZoneTextWrap: {
    flex: 1,
    gap: 2,
  },
  selectedZoneTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#5C5000',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  selectedZoneValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#3B3A00',
  },
  zonesSection: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#696710',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  zonesList: {
    gap: 10,
  },
  emptyState: {
    paddingVertical: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#696710',
    fontWeight: '500',
  },
  zoneRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E4E4E7',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000000',
    shadowOpacity: 0.02,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  zoneRowSelected: {
    borderColor: '#736400',
    backgroundColor: 'rgba(255, 252, 203, 0.2)',
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  rowTextColumn: {
    gap: 2,
  },
  zoneName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#3B3A00',
  },
  zoneCity: {
    fontSize: 12,
    color: '#696710',
    fontWeight: '500',
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  riskBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
  },
  riskText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  earningsNote: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: 'rgba(255, 223, 0, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(115, 100, 0, 0.15)',
    borderRadius: 16,
    padding: 14,
  },
  earningsNoteText: {
    flex: 1,
    fontSize: 12,
    color: '#736400',
    lineHeight: 18,
    fontWeight: '500',
  },
  bottomBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E4E4E7',
    padding: 16,
    backgroundColor: '#FFFBFF',
  },
  btn: {
    height: 52,
    backgroundColor: '#736400',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnDisabled: {
    backgroundColor: '#A1A1AA',
    opacity: 0.5,
  },
  btnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});
