import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  StatusBar, Alert, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const PLATFORMS = [
  { id: 'zepto',   label: 'Zepto',   color: '#A855F7', desc: 'Quick commerce' },
  { id: 'blinkit', label: 'Blinkit', color: '#F59E0B', desc: 'Quick commerce' },
  { id: 'swiggy',  label: 'Swiggy',  color: '#FF6B35', desc: 'Food delivery'  },
  { id: 'jio_mart',  label: 'Jio Mart',  color: '#EF4444', desc: 'Quick commerce'  },
];

export default function OnboardingPlatformScreen() {
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { setUser } = useAuth();

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
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0F" />

      <View style={styles.header}>
        <View style={styles.stepRow}>
          <View style={[styles.step, styles.stepActive]} />
          <View style={styles.step} />
        </View>
        <Text style={styles.stepLabel}>Step 1 of 2</Text>
        <Text style={styles.title}>Which platform{'\n'}do you ride for?</Text>
        <Text style={styles.subtitle}>
          We&apos;ll import your recent earnings to calculate your coverage
        </Text>
      </View>

      <View style={styles.grid}>
        {PLATFORMS.map((p) => (
          <TouchableOpacity
            key={p.id}
            style={[
              styles.card,
              selected === p.id && { borderColor: p.color, borderWidth: 2 },
            ]}
            onPress={() => setSelected(p.id)}
            activeOpacity={0.8}
          >
            <View style={[styles.dot, { backgroundColor: p.color }]} />
            <Text style={styles.cardLabel}>{p.label}</Text>
            <Text style={styles.cardDesc}>{p.desc}</Text>
            {selected === p.id && (
              <View style={[styles.checkBadge, { backgroundColor: p.color }]}>
                <Text style={styles.checkText}>✓</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.bottom}>
        <TouchableOpacity
          style={[styles.btn, !selected && styles.btnDisabled]}
          onPress={handleContinue}
          disabled={!selected || loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#0A0A0F" />
            : <Text style={styles.btnText}>Continue</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0F', paddingHorizontal: 24 },
  header: { paddingTop: 60, marginBottom: 32 },
  stepRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  step: { height: 4, flex: 1, borderRadius: 2, backgroundColor: '#1E1E2E' },
  stepActive: { backgroundColor: '#00E5A0' },
  stepLabel: { fontSize: 12, color: '#6B7280', marginBottom: 20 },
  title: { fontSize: 28, fontWeight: '700', color: '#FFFFFF', lineHeight: 36, marginBottom: 10 },
  subtitle: { fontSize: 14, color: '#6B7280', lineHeight: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: {
    width: '47%',
    backgroundColor: '#13131A',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1E1E2E',
    position: 'relative',
    minHeight: 110,
    justifyContent: 'flex-end',
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginBottom: 12 },
  cardLabel: { fontSize: 17, fontWeight: '700', color: '#FFFFFF', marginBottom: 2 },
  cardDesc: { fontSize: 12, color: '#6B7280' },
  checkBadge: {
    position: 'absolute', top: 12, right: 12,
    width: 22, height: 22, borderRadius: 11,
    justifyContent: 'center', alignItems: 'center',
  },
  checkText: { fontSize: 12, fontWeight: '700', color: '#0A0A0F' },
  bottom: { flex: 1, justifyContent: 'flex-end', paddingBottom: 48 },
  btn: {
    height: 56, backgroundColor: '#00E5A0', borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
  },
  btnDisabled: { opacity: 0.35 },
  btnText: { fontSize: 16, fontWeight: '700', color: '#0A0A0F' },
});
