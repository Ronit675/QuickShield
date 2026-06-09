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
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const PLATFORMS = [
  {
    id: 'swiggy',
    label: 'Swiggy',
    desc: 'Food & Instamart',
    color: '#FF6B35',
    logoUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCNwN3ImKe0ZlS7L3Jkj36b8psJnPJ7YZLkuMIo_aps4BSBoz1IKIhj6RSXPHXdHjkhBEET6BbZ_qTuWD3NsRrFrjmEhmdg1Mj5Kq0UnFNZbAQMLUqcZ7qZOgKOPTl7MHjnzZJekU2pjDaCTobgZd_1mXUQ74aKhiOURhg2L6bNIINem7d5e2SOodQoKMz16rD2MlDp_dkhOUi1pQQ_ZSCkdhw3Aw-uLhJKmzgcn9sGsgtIexVZ9L68_y4FWmlp14KQ9-DRfJRbnrrs',
  },
  {
    id: 'blinkit',
    label: 'Blinkit',
    desc: 'Quick Commerce',
    color: '#F59E0B',
    logoUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDwj8SalCOunyyP-N0bExs9uWaJlf-YwEDWWvlbUdRR8iX8ZRJyzvHTl2IuX0J6sGeMuCWg_o02qppuV2LRmSvUxikh9ihMwUlc0O9TcY7KZO7hQYBBh5jFdjboDqoB9rnc_sOHIg3UxLbWDR8Vt-FiAVO3Sh8kuwgmj82JQ95hZ4LuQv885GdoBLxv9g73-cKCPsFoNMcFK5n5NO8_I0_lZjYlWv0vXu9p2I9kRaIbJHDO6rJfdsWEuaCw3UO-Q4bM3sY_XzBXQOSA',
  },
  {
    id: 'zepto',
    label: 'Zepto',
    desc: '10-Min Delivery',
    color: '#A855F7',
    logoUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCV1lwlL6dlTleLM77MQvAF2IC-asA4OXfhG5bihZtS6CAh1pOq2O2pj7neahPJRiIelXry2CBUz4qmqhANdhrtinqb-Y03m1mX33aGFrT-ELJeGz9CP92H4g9KdujNFdB_9WKnsNJNWyOv4zPL1gSiKp7gLvf5pJn-TriEFMsYw1AdZQF1qOxVnDR06mNPxMXmB6hFSjWi2I6xOVHfuibveLGm6tqg7EENiq05oXogpekD_rx1fG2poo6DmBrcDihzSW3QyJbORi8g',
  },
  {
    id: 'jio_mart',
    label: 'Jio Mart',
    desc: 'Groceries & Fashion',
    color: '#EF4444',
    logoUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCv_Bu5OHa03rVwOJMGbeWyZ_ibO6FjVjC3Mr_JThZA1o5LkZW0ZsOu5qg6nKxkkw7MF_E8Y7BTXR_PMo8RllHfe9cEWnEblbKOKfDIRlv_G4iTLnVzfk2rwVma-GpXrFZEblAxEVgAOHKi4JaFkTZiNxZByMXdT4IjQA0TsaEx8ZhUziCZLy0V9qKzkrL6Zn9tWBz1glnM2anhbnmP07KJ56fUtZ5a3VQWROMCxC1VK4NtjknXcFAhPB0ixIS4M5mcRmiEG2z5dpqv',
  },
];

export default function OnboardingPlatformScreen() {
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { setUser } = useAuth();
  const insets = useSafeAreaInsets();

  const handleContinue = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      const res = await api.post('/profile/platform', { platform: selected });
      setUser(res.data.user);
      router.replace('/onboarding-zone');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFBFF" />

      {/* Top Bar Navigation / Step Indicator */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back" size={24} color="#736400" />
        </TouchableOpacity>
        <View style={styles.progressContainer}>
          <View style={styles.progressBarBg}>
            <View style={styles.progressBarFill} />
          </View>
          <Text style={styles.stepLabel}>Step 1 of 2</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Hero Illustration & Introduction */}
        <View style={styles.introSection}>
          <Image
            source={{
              uri: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA4DMd36gAvivRW-REvdYFHCtobFTxwYTl7zjW2EwdTHYCoY8ejaiWv4ZoMudUby0clRDgk0Fe5EINdmOJaOjuxdfU-lWBF_kaksX-TFmp1iYZFYko6iPMP9MUErkF-vhywUlmL9LFvyUbTKsybtJTz4yyALOotMNuDF3F4RiZPizdemsN3rLPBvTSnDjCFgxE6aaXoEzZThZkybuciliMP5N4NqCpG3Zq4fc9a1_gHs6ekU41WPCbFoLwh-FnLY7vchbcXripbECNo',
            }}
            style={styles.heroImage}
          />
          <Text style={styles.title}>Welcome to Connect</Text>
          <Text style={styles.subtitle}>
            To start your insurance protection and track your payouts, please link your primary work platforms below.
          </Text>
        </View>

        {/* Platforms List (Bento single-column style) */}
        <View style={styles.platformsContainer}>
          {PLATFORMS.map((platform) => {
            const isSelected = selected === platform.id;

            return (
              <TouchableOpacity
                key={platform.id}
                style={[
                  styles.platformCard,
                  isSelected && styles.platformCardSelected,
                ]}
                onPress={() => setSelected(platform.id)}
                activeOpacity={0.9}
              >
                <View style={styles.cardLeft}>
                  <View style={styles.logoContainer}>
                    <Image source={{ uri: platform.logoUrl }} style={styles.logoImage} />
                  </View>
                  <View style={styles.textColumn}>
                    <Text style={styles.platformLabel}>{platform.label}</Text>
                    <Text style={styles.platformDesc}>{platform.desc}</Text>
                  </View>
                </View>

                <View
                  style={[
                    styles.connectBadge,
                    isSelected ? styles.connectBadgeSelected : styles.connectBadgeNormal,
                  ]}
                >
                  {isSelected ? (
                    <>
                      <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                      <Text style={styles.connectBadgeTextSelected}>Selected</Text>
                    </>
                  ) : (
                    <Text style={styles.connectBadgeTextNormal}>Connect</Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Bank grade Encryption Card */}
        <View style={styles.encryptionCard}>
          <Ionicons name="shield-checkmark" size={28} color="#5E6A32" />
          <View style={styles.encryptionTextWrap}>
            <Text style={styles.encryptionTitle}>Secure Connection</Text>
            <Text style={styles.encryptionDesc}>
              We use bank-grade encryption to sync your earnings. We never see your password and your data is always protected.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Bottom Continue Action */}
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
            <Text style={styles.btnText}>Continue</Text>
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
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E4E4E7',
    gap: 12,
  },
  backButton: {
    padding: 6,
    borderRadius: 20,
  },
  progressContainer: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
    paddingRight: 16,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: 'rgba(115, 100, 0, 0.1)',
    borderRadius: 99,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    width: '50%',
    backgroundColor: '#736400',
    borderRadius: 99,
  },
  stepLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#696710',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
    gap: 24,
  },
  introSection: {
    alignItems: 'center',
    textAlign: 'center',
    gap: 12,
  },
  heroImage: {
    width: '100%',
    height: 180,
    borderRadius: 16,
    resizeMode: 'cover',
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    color: '#3B3A00',
    textAlign: 'center',
    marginTop: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#696710',
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  platformsContainer: {
    gap: 12,
  },
  platformCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E4E4E7',
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.02,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  platformCardSelected: {
    borderColor: '#736400',
    backgroundColor: 'rgba(255, 252, 203, 0.2)',
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  logoContainer: {
    width: 48,
    height: 48,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#F4F4F5',
  },
  logoImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  textColumn: {
    flex: 1,
    gap: 2,
  },
  platformLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: '#3B3A00',
  },
  platformDesc: {
    fontSize: 11,
    fontWeight: '700',
    color: '#696710',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  connectBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 99,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
    minWidth: 90,
  },
  connectBadgeNormal: {
    backgroundColor: '#736400',
  },
  connectBadgeSelected: {
    backgroundColor: '#5E6A32',
  },
  connectBadgeTextNormal: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  connectBadgeTextSelected: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  encryptionCard: {
    backgroundColor: 'rgba(239, 254, 183, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(94, 106, 50, 0.2)',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    gap: 12,
  },
  encryptionTextWrap: {
    flex: 1,
    gap: 4,
  },
  encryptionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#45501B',
  },
  encryptionDesc: {
    fontSize: 12,
    color: '#616D35',
    lineHeight: 18,
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
  btnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});
