import React, { useMemo, useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker, {
  type DateTimePickerEvent,
  DateTimePickerAndroid,
} from '@react-native-community/datetimepicker';

import { useAuth } from '../context/AuthContext';
import { updateProfileDetails } from '../services/auth.service';
import ProfileAvatar from '../components/ProfileAvatar';
import { useLanguage } from '../directory/Languagecontext';

const parseStoredDob = (value: string | null) => {
  if (!value) return null;

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDobForApi = (value: Date | null) => {
  if (!value) return '';
  return value.toISOString().slice(0, 10);
};

const formatDobForDisplay = (value: Date | null, locale: string, emptyLabel: string) => {
  if (!value) return emptyLabel;

  return value.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

const calculateAge = (value: Date | null) => {
  if (!value) return null;

  const today = new Date();
  let age = today.getFullYear() - value.getUTCFullYear();
  const monthDifference = today.getMonth() - value.getUTCMonth();
  const hasBirthdayPassed =
    monthDifference > 0
    || (monthDifference === 0 && today.getDate() >= value.getUTCDate());

  if (!hasBirthdayPassed) {
    age -= 1;
  }

  return age >= 0 ? age : null;
};

export default function ProfileScreen() {
  const { user, setUser } = useAuth();
  const { language, t } = useLanguage();
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [dateOfBirth, setDateOfBirth] = useState<Date | null>(parseStoredDob(user?.dateOfBirth ?? null));
  const [address, setAddress] = useState(user?.address ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [profilePhoto, setProfilePhoto] = useState(user?.profilePhoto ?? null);
  const [saving, setSaving] = useState(false);
  const [pickingPhoto, setPickingPhoto] = useState(false);
  const [showIosDobPicker, setShowIosDobPicker] = useState(false);

  const isGoogleUser = user?.authProvider === 'google';
  const displayName = useMemo(
    () => fullName.trim() || user?.fullName || t('profile.quickshieldMember'),
    [fullName, t, user?.fullName],
  );
  const age = useMemo(() => calculateAge(dateOfBirth), [dateOfBirth]);
  const dobLocale = language === 'hi' ? 'hi-IN' : language === 'kn' ? 'kn-IN' : 'en-IN';

  const handlePickPhoto = async () => {
    setPickingPhoto(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t('profile.permissionNeededTitle'), t('profile.permissionNeededMessage'));
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.55,
        base64: true,
      });

      if (result.canceled) {
        return;
      }

      const asset = result.assets[0];
      if (!asset?.base64) {
        Alert.alert(t('profile.uploadFailedTitle'), t('profile.uploadFailedReadMessage'));
        return;
      }

      const mimeType = asset.mimeType || 'image/jpeg';
      setProfilePhoto(`data:${mimeType};base64,${asset.base64}`);
    } catch (err: any) {
      Alert.alert(t('profile.uploadFailedTitle'), err.message || t('login.retry'));
    } finally {
      setPickingPhoto(false);
    }
  };

  const handleRemovePhoto = () => {
    setProfilePhoto(null);
  };

  const applySelectedDob = (selectedDate?: Date) => {
    if (!selectedDate) {
      return;
    }

    setDateOfBirth(selectedDate);
  };

  const handleDobChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'ios') {
      if (selectedDate) {
        applySelectedDob(selectedDate);
      }
      return;
    }

    if (event.type === 'set') {
      applySelectedDob(selectedDate);
    }
  };

  const openDobPicker = () => {
    const currentValue = dateOfBirth ?? new Date('2000-01-01T00:00:00.000Z');

    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: currentValue,
        mode: 'date',
        display: 'calendar',
        maximumDate: new Date(),
        onChange: handleDobChange,
      });
      return;
    }

    setShowIosDobPicker((current) => !current);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updatedUser = await updateProfileDetails({
        fullName,
        dateOfBirth: formatDobForApi(dateOfBirth),
        address,
        email,
        profilePhoto,
      });
      setUser(updatedUser);
      Alert.alert(t('profile.profileSavedTitle'), t('profile.profileSavedMessage'));
      router.back();
    } catch (err: any) {
      Alert.alert(t('profile.profileSaveFailedTitle'), err.response?.data?.message || err.message || t('login.retry'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFBFF" />

      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('profile.back')}
        >
          <MaterialCommunityIcons name="arrow-left" size={25} color="#736400" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('profile.headerTitle')}</Text>
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
          <View style={styles.profileHero}>
            <View style={styles.avatarWrap}>
              <View style={styles.avatarBorder}>
                <ProfileAvatar uri={profilePhoto} size={96} borderRadius={48} />
              </View>
              <TouchableOpacity
                style={styles.editPhotoBtn}
                onPress={handlePickPhoto}
                disabled={pickingPhoto || saving}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={profilePhoto ? t('profile.changePhoto') : t('profile.uploadPhoto')}
              >
                {pickingPhoto ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <MaterialCommunityIcons name="pencil" size={15} color="#FFFFFF" />
                )}
              </TouchableOpacity>
            </View>

            <Text style={styles.profileName}>{displayName}</Text>
            <View style={styles.profileMetaRow}>
              <MaterialCommunityIcons name="phone-outline" size={17} color="#696710" />
              <Text style={styles.profileMeta}>
                {user?.phone || user?.email || t('profile.addContactDetails')}
              </Text>
            </View>
            {profilePhoto && (
              <TouchableOpacity
                onPress={handleRemovePhoto}
                disabled={saving}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <Text style={styles.useDefaultText}>{t('profile.useDefault')}</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>{t('profile.fullNameLabel')}</Text>
              <TextInput
                value={fullName}
                onChangeText={setFullName}
                placeholder={t('profile.fullNamePlaceholder')}
                placeholderTextColor="#96933F"
                style={styles.input}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>{t('profile.emailLabel')}</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder={t('profile.emailPlaceholder')}
                placeholderTextColor="#96933F"
                style={[styles.input, isGoogleUser && styles.inputDisabled]}
                autoCapitalize="none"
                keyboardType="email-address"
                editable={!isGoogleUser}
              />
              {isGoogleUser && (
                <Text style={styles.helperText}>
                  {t('profile.googleEmailLocked')}
                </Text>
              )}
            </View>

            <View style={styles.dobRow}>
              <View style={[styles.field, styles.dobField]}>
                <Text style={styles.label}>{t('profile.dobLabel')}</Text>
                <TouchableOpacity
                  style={styles.dateField}
                  onPress={openDobPicker}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[styles.dateFieldText, !dateOfBirth && styles.dateFieldPlaceholder]}
                    numberOfLines={1}
                  >
                    {formatDobForDisplay(dateOfBirth, dobLocale, t('profile.dobPlaceholder'))}
                  </Text>
                  <MaterialCommunityIcons name="calendar-blank-outline" size={19} color="#736400" />
                </TouchableOpacity>
              </View>

              <View style={[styles.field, styles.ageField]}>
                <Text style={styles.label}>{t('profile.ageLabel')}</Text>
                <View style={styles.ageCard}>
                  <Text style={styles.ageValue}>{age ?? '--'}</Text>
                </View>
              </View>
            </View>

            {Platform.OS === 'ios' && showIosDobPicker && (
              <View style={styles.iosDatePickerCard}>
                <DateTimePicker
                  value={dateOfBirth ?? new Date('2000-01-01T00:00:00.000Z')}
                  mode="date"
                  display="inline"
                  maximumDate={new Date()}
                  onChange={handleDobChange}
                />
                <TouchableOpacity
                  style={styles.iosDateDoneBtn}
                  onPress={() => setShowIosDobPicker(false)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.iosDateDoneBtnText}>{t('profile.done')}</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.field}>
              <Text style={styles.label}>{t('profile.addressLabel')}</Text>
              <TextInput
                value={address}
                onChangeText={setAddress}
                placeholder={t('profile.addressPlaceholder')}
                placeholderTextColor="#96933F"
                style={[styles.input, styles.textArea]}
                multiline
                textAlignVertical="top"
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#5C5000" />
            ) : (
              <>
                <MaterialCommunityIcons name="check-circle-outline" size={22} color="#5C5000" />
                <Text style={styles.saveBtnText}>{t('profile.saveProfile')}</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFBFF',
  },
  keyboardArea: {
    flex: 1,
    backgroundColor: '#FFFBFF',
  },
  header: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    backgroundColor: '#FFFBFF',
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
  },
  headerTitle: {
    color: '#736400',
    fontSize: 20,
    fontWeight: '800',
  },
  content: {
    width: '100%',
    maxWidth: 540,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 36,
  },
  profileHero: {
    alignItems: 'center',
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingVertical: 24,
    backgroundColor: '#FFFCCB',
    marginBottom: 24,
    shadowColor: '#736400',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  avatarWrap: {
    position: 'relative',
    marginBottom: 14,
  },
  avatarBorder: {
    borderRadius: 54,
    borderWidth: 4,
    borderColor: '#FFDF00',
    padding: 2,
    backgroundColor: '#FFFFFF',
    shadowColor: '#736400',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 5,
    elevation: 3,
  },
  editPhotoBtn: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#FFFBFF',
    backgroundColor: '#736400',
  },
  profileName: {
    color: '#3B3A00',
    fontSize: 23,
    fontWeight: '800',
    marginBottom: 6,
  },
  profileMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  profileMeta: {
    color: '#696710',
    fontSize: 14,
    fontWeight: '600',
  },
  useDefaultText: {
    color: '#736400',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 9,
    textDecorationLine: 'underline',
  },
  form: {
    gap: 18,
  },
  field: {
    gap: 8,
  },
  label: {
    color: '#696710',
    fontSize: 13,
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  input: {
    minHeight: 56,
    borderRadius: 12,
    backgroundColor: '#FFFCCB',
    color: '#3B3A00',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
  },
  dobRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  dobField: {
    flex: 1,
  },
  ageField: {
    width: 92,
  },
  dateField: {
    minHeight: 56,
    borderRadius: 12,
    backgroundColor: '#FFFCCB',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  dateFieldText: {
    flex: 1,
    color: '#3B3A00',
    fontSize: 14,
    fontWeight: '600',
  },
  dateFieldPlaceholder: {
    color: '#96933F',
    fontWeight: '500',
  },
  iosDatePickerCard: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#FFFCCB',
  },
  iosDateDoneBtn: {
    height: 46,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFDF00',
  },
  iosDateDoneBtnText: {
    color: '#5C5000',
    fontSize: 14,
    fontWeight: '700',
  },
  ageCard: {
    minHeight: 56,
    borderRadius: 12,
    backgroundColor: 'rgba(241, 238, 104, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(192, 189, 95, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ageValue: {
    color: '#3B3A00',
    fontSize: 18,
    fontWeight: '800',
  },
  inputDisabled: {
    opacity: 0.65,
  },
  textArea: {
    minHeight: 96,
  },
  helperText: {
    color: '#696710',
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 4,
  },
  saveBtn: {
    height: 58,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 9,
    borderRadius: 12,
    backgroundColor: '#FFDF00',
    marginTop: 34,
    shadowColor: '#736400',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 9,
    elevation: 4,
  },
  saveBtnDisabled: {
    opacity: 0.65,
  },
  saveBtnText: {
    color: '#5C5000',
    fontSize: 17,
    fontWeight: '800',
  },
});
