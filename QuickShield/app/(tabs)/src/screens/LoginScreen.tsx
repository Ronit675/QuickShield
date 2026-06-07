import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../directory/Languagecontext';
import { requestPhoneOtp, signInWithGoogle, signInWithPhoneOtp, type AuthUser } from '../services/auth.service';

const HERO_IMAGE = {
  uri: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBjUuLVf2vyCImwjHBcp4QJPFAbSa1U-mJY77Yoept9ufhNprArWdBwMKq8KhVy5kqidW43YpmX_T096IyITWxGVSbXrjvn0JIpXuq7OCOGXtA42eMPo_0UUAWNT8l1YgmEi93GGTYPNz3yxqQOLRvrbALz-EYSwYkaHvtCtmog8voYInKeloz1sDlCFQ927UmoYR4IzRrvTjQpzXb9gEhC28nMab2VIe2abtXDku1M95XGNuL6MIKQuNvjPEmf2XHS0233vokgnF1w',
};

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
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <View style={styles.header}>
        <MaterialCommunityIcons name="shield-outline" size={27} color="#B59E00" />
        <Text style={styles.brand}>QuickShield</Text>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardArea}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <ImageBackground source={HERO_IMAGE} imageStyle={styles.heroImage} style={styles.hero}>
            <View style={styles.heroWash} />
            <View style={styles.heroText}>
              <Text style={styles.heroTitle}>{t('login.welcome')}</Text>
              <Text style={styles.heroSubtitle}>{t('login.protectionTagline')}</Text>
            </View>
          </ImageBackground>

          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>{t('login.mobileNumber')}</Text>
              <View style={styles.inputShell}>
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
                  placeholderTextColor="#A8A55A"
                  keyboardType="phone-pad"
                  style={styles.input}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <MaterialCommunityIcons name="cellphone" size={21} color="#96933F" />
              </View>
            </View>

            <View style={styles.field}>
              <View style={styles.otpLabelRow}>
                <Text style={styles.label}>{t('login.otpLabel')}</Text>
                {otpRequested && (
                  <TouchableOpacity onPress={handleRequestOtp} disabled={phoneLoading} activeOpacity={0.7}>
                    <Text style={styles.resendText}>{t('login.resendOtp')}</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={[styles.inputShell, !otpRequested && styles.inputShellDisabled]}>
                <TextInput
                  value={otp}
                  onChangeText={(value) => setOtp(value.replace(/\D/g, '').slice(0, 6))}
                  placeholder={t('login.otpPlaceholder')}
                  placeholderTextColor="#A8A55A"
                  keyboardType="number-pad"
                  style={styles.input}
                  maxLength={6}
                  editable={otpRequested}
                />
                <MaterialCommunityIcons name="lock-outline" size={20} color="#96933F" />
              </View>
              {otpRequested && (
                <Text style={styles.helperText}>
                  {t('login.verifying', { phone: normalizedPhone || phone })}
                </Text>
              )}
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, phoneLoading && styles.actionDisabled]}
              onPress={otpRequested ? handleVerifyOtp : handleRequestOtp}
              disabled={phoneLoading || googleLoading}
              activeOpacity={0.85}
            >
              {phoneLoading ? (
                <ActivityIndicator color="#5C5000" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {otpRequested ? t('login.verifyOtp') : t('login.sendOtp')}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>{t('login.orContinueWith')}</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={[styles.googleButton, googleLoading && styles.actionDisabled]}
            onPress={handleGoogleSignIn}
            disabled={googleLoading || phoneLoading}
            activeOpacity={0.85}
          >
            {googleLoading ? (
              <ActivityIndicator color="#3B3A00" />
            ) : (
              <>
                <MaterialCommunityIcons name="google" size={21} color="#4285F4" />
                <Text style={styles.googleButtonText}>{t('login.methodGoogle')}</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.terms}>{t('login.terms')}</Text>

          <View style={styles.securityCard}>
            <View style={styles.securityIcon}>
              <MaterialCommunityIcons name="shield-check-outline" size={22} color="#5C5000" />
            </View>
            <View style={styles.securityText}>
              <Text style={styles.securityTitle}>{t('login.secureConnection')}</Text>
              <Text style={styles.securityDescription}>{t('login.encryptedData')}</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  keyboardArea: {
    flex: 1,
    backgroundColor: '#FFFBFF',
  },
  header: {
    height: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F1EA',
  },
  brand: {
    color: '#B59E00',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  content: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 28,
  },
  hero: {
    height: 192,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    borderRadius: 14,
    backgroundColor: '#ECE942',
    marginBottom: 32,
  },
  heroImage: {
    borderRadius: 14,
  },
  heroWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 251, 255, 0.42)',
  },
  heroText: {
    paddingHorizontal: 20,
    paddingBottom: 18,
  },
  heroTitle: {
    color: '#3B3A00',
    fontSize: 27,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 33,
  },
  heroSubtitle: {
    color: '#696710',
    fontSize: 14,
    fontWeight: '500',
    marginTop: 4,
  },
  form: {
    gap: 18,
  },
  field: {
    gap: 8,
  },
  label: {
    color: '#3B3A00',
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 4,
  },
  otpLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  resendText: {
    color: '#736400',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  inputShell: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#C0BD5F',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 15,
  },
  inputShellDisabled: {
    opacity: 0.58,
  },
  input: {
    flex: 1,
    height: '100%',
    color: '#3B3A00',
    fontSize: 16,
    paddingRight: 10,
  },
  helperText: {
    color: '#86842C',
    fontSize: 12,
    marginLeft: 4,
  },
  primaryButton: {
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#FFDF00',
    marginTop: 2,
  },
  primaryButtonText: {
    color: '#5C5000',
    fontSize: 17,
    fontWeight: '800',
  },
  actionDisabled: {
    opacity: 0.58,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 30,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#C0BD5F',
  },
  dividerText: {
    color: '#696710',
    fontSize: 13,
    fontWeight: '600',
  },
  googleButton: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 11,
    borderWidth: 1,
    borderColor: '#C0BD5F',
    borderRadius: 14,
    backgroundColor: '#FFFBFF',
  },
  googleButtonText: {
    color: '#3B3A00',
    fontSize: 15,
    fontWeight: '700',
  },
  terms: {
    color: '#86842C',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 18,
  },
  securityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(192, 189, 95, 0.45)',
    borderRadius: 16,
    backgroundColor: '#FFFCCB',
    marginTop: 30,
  },
  securityIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#FFDF00',
  },
  securityText: {
    flex: 1,
    gap: 2,
  },
  securityTitle: {
    color: '#3B3A00',
    fontSize: 12,
    fontWeight: '800',
  },
  securityDescription: {
    color: '#696710',
    fontSize: 10,
    lineHeight: 14,
  },
});
