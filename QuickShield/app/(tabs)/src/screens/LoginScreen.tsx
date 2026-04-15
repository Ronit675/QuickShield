import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  StatusBar, ActivityIndicator, Alert, Dimensions, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { requestPhoneOtp, signInWithGoogle, signInWithPhoneOtp, type AuthUser } from '../services/auth.service';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../directory/Languagecontext';

const { width } = Dimensions.get('window');
type LoginMethod = 'google' | 'phone';

const sanitizePhoneInput = (value: string) => {
  const trimmed = value.replace(/[^\d+]/g, '');
  if (trimmed.startsWith('+')) {
    return `+${trimmed.slice(1).replace(/\+/g, '')}`;
  }

  return trimmed.replace(/\+/g, '');
};

export default function LoginScreen() {
  const [googleLoading, setGoogleLoading] = useState(false);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('google');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [normalizedPhone, setNormalizedPhone] = useState('');
  const [otpRequested, setOtpRequested] = useState(false);
  const { setUser } = useAuth();
  const { t } = useLanguage();

  const routeSignedInUser = (user: AuthUser) => {
    setUser(user);
    if (user.profileStatus === 'auth_only') {
      router.replace('/onboarding-platform');
    } else if (user.profileStatus === 'platform_linked') {
      router.replace('/onboarding-zone');
    } else {
      router.replace('/home');
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      const user = await signInWithGoogle();
      routeSignedInUser(user);
    } catch (err: any) {
      Alert.alert(t('login.signInFailed'), err.message || t('login.retry'));
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleRequestOtp = async () => {
    setPhoneLoading(true);
    try {
      const response = await requestPhoneOtp(phone);
      setNormalizedPhone(response.phone);
      setOtpRequested(true);

      const message = response.debugOtp
        ? t('login.otpUse', { otp: response.debugOtp })
        : t('login.otpRequested');

      Alert.alert(t('login.otpSent'), message);
    } catch (err: any) {
      Alert.alert(t('login.otpSendFailed'), err.response?.data?.message || err.message || t('login.retry'));
    } finally {
      setPhoneLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setPhoneLoading(true);
    try {
      const user = await signInWithPhoneOtp(normalizedPhone || phone, otp);
      routeSignedInUser(user);
    } catch (err: any) {
      Alert.alert(t('login.otpVerifyFailed'), err.response?.data?.message || err.message || t('login.retry'));
    } finally {
      setPhoneLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0F" />

      <View style={styles.glow} />

      <View style={styles.logoArea}>
        <View style={styles.shieldIcon}>
          <Text style={styles.shieldText}>QS</Text>
        </View>
        <Text style={styles.appName}>QuickShield</Text>
        <Text style={styles.tagline}>{t('login.tagline')}</Text>
      </View>

      <View style={styles.props}>
        {[
          { icon: '⚡', text: t('login.propAutoPayout') },
          { icon: '🌧', text: t('login.propWeatherTriggers') },
          { icon: '₹', text: t('login.propFromPrice') },
        ].map((item) => (
          <View key={item.text} style={styles.propRow}>
            <Text style={styles.propIcon}>{item.icon}</Text>
            <Text style={styles.propText}>{item.text}</Text>
          </View>
        ))}
      </View>

      <View style={styles.authCard}>
        <View style={styles.methodTabs}>
          <TouchableOpacity
            style={[styles.methodTab, loginMethod === 'google' && styles.methodTabActive]}
            onPress={() => setLoginMethod('google')}
            activeOpacity={0.85}
          >
            <Text style={[styles.methodTabText, loginMethod === 'google' && styles.methodTabTextActive]}>
              {t('login.methodGoogle')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.methodTab, loginMethod === 'phone' && styles.methodTabActive]}
            onPress={() => setLoginMethod('phone')}
            activeOpacity={0.85}
          >
            <Text style={[styles.methodTabText, loginMethod === 'phone' && styles.methodTabTextActive]}>
              {t('login.methodPhoneOtp')}
            </Text>
          </TouchableOpacity>
        </View>

        {loginMethod === 'google' ? (
          <TouchableOpacity
            style={[styles.googleBtn, googleLoading && styles.actionDisabled]}
            onPress={handleGoogleSignIn}
            disabled={googleLoading || phoneLoading}
            activeOpacity={0.85}
          >
            {googleLoading ? (
              <ActivityIndicator color="#0A0A0F" />
            ) : (
              <>
                <Text style={styles.googleG}>G</Text>
                <Text style={styles.googleBtnText}>{t('login.continueGoogle')}</Text>
              </>
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.phoneSection}>
            <Text style={styles.inputLabel}>{t('login.mobileNumber')}</Text>
            <TextInput
              value={phone}
              onChangeText={(value) => {
                setPhone(sanitizePhoneInput(value));
                if (otpRequested) {
                  setOtpRequested(false);
                  setOtp('');
                  setNormalizedPhone('');
                }
              }}
              placeholder={t('login.phonePlaceholder')}
              placeholderTextColor="#4B5563"
              keyboardType="phone-pad"
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
            />

            {otpRequested && (
              <>
                <Text style={styles.inputLabel}>{t('login.otpLabel')}</Text>
                <TextInput
                  value={otp}
                  onChangeText={(value) => setOtp(value.replace(/\D/g, '').slice(0, 6))}
                  placeholder={t('login.otpPlaceholder')}
                  placeholderTextColor="#4B5563"
                  keyboardType="number-pad"
                  style={styles.input}
                  maxLength={6}
                />
                <Text style={styles.helperText}>
                  {t('login.verifying', { phone: normalizedPhone || phone })}
                </Text>
              </>
            )}

            <TouchableOpacity
              style={[styles.primaryBtn, phoneLoading && styles.actionDisabled]}
              onPress={otpRequested ? handleVerifyOtp : handleRequestOtp}
              disabled={phoneLoading || googleLoading}
              activeOpacity={0.85}
            >
              {phoneLoading ? (
                <ActivityIndicator color="#0A0A0F" />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {otpRequested ? t('login.verifyOtp') : t('login.sendOtp')}
                </Text>
              )}
            </TouchableOpacity>

            {otpRequested && (
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={handleRequestOtp}
                disabled={phoneLoading}
                activeOpacity={0.85}
              >
                <Text style={styles.secondaryBtnText}>{t('login.resendOtp')}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      <View style={styles.bottom}>
        <Text style={styles.disclaimer}>
          {t('login.terms')}
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
    paddingHorizontal: 28,
  },
  glow: {
    position: 'absolute',
    top: -80,
    left: width * 0.1,
    width: width * 0.8,
    height: 300,
    borderRadius: 200,
    backgroundColor: '#00E5A0',
    opacity: 0.06,
  },
  logoArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  shieldIcon: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: '#00E5A0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  shieldText: {
    fontSize: 26,
    fontWeight: '700',
    color: '#0A0A0F',
    letterSpacing: 1,
  },
  appName: {
    fontSize: 34,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 8,
    letterSpacing: 0.2,
  },
  props: {
    marginBottom: 28,
  },
  propRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: '#13131A',
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1E1E2E',
  },
  propIcon: {
    fontSize: 20,
    marginRight: 14,
  },
  propText: {
    fontSize: 15,
    color: '#D1D5DB',
    fontWeight: '500',
  },
  authCard: {
    backgroundColor: '#11131B',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#1E2432',
    gap: 16,
  },
  methodTabs: {
    flexDirection: 'row',
    backgroundColor: '#0A0F18',
    padding: 4,
    borderRadius: 14,
  },
  methodTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  methodTabActive: {
    backgroundColor: '#00E5A0',
  },
  methodTabText: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '600',
  },
  methodTabTextActive: {
    color: '#091018',
  },
  phoneSection: {
    gap: 12,
  },
  inputLabel: {
    color: '#D1D5DB',
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    height: 54,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#273041',
    backgroundColor: '#0A0F18',
    color: '#FFFFFF',
    paddingHorizontal: 16,
    fontSize: 16,
  },
  helperText: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: -2,
  },
  bottom: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 48,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00E5A0',
    borderRadius: 14,
    height: 56,
    gap: 10,
  },
  actionDisabled: {
    opacity: 0.6,
  },
  googleG: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0A0A0F',
  },
  googleBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0A0A0F',
    letterSpacing: 0.2,
  },
  primaryBtn: {
    height: 56,
    backgroundColor: '#00E5A0',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0A0A0F',
  },
  secondaryBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  secondaryBtnText: {
    color: '#8EECCD',
    fontSize: 14,
    fontWeight: '600',
  },
  disclaimer: {
    textAlign: 'center',
    color: '#4B5563',
    fontSize: 12,
  },
});
