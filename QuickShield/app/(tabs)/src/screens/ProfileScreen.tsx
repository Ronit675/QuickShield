import React, { useMemo, useState } from 'react';
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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0F" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.85}>
            <Text style={styles.backBtnText}>{t('profile.back')}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('profile.headerTitle')}</Text>
          <Text style={styles.headerSubtitle}>{t('profile.headerSubtitle')}</Text>
        </View>

        <View style={styles.profileHero}>
          <ProfileAvatar uri={profilePhoto} size={74} borderRadius={24} />
          <View style={styles.profileHeroText}>
            <Text style={styles.profileName}>{displayName}</Text>
            <Text style={styles.profileMeta}>{user?.phone || user?.email || t('profile.addContactDetails')}</Text>
          </View>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>{t('profile.sectionPhotoTitle')}</Text>
          <Text style={styles.helperCaption}>
            {t('profile.sectionPhotoHint')}
          </Text>

          <View style={styles.photoRow}>
            <ProfileAvatar uri={profilePhoto} size={88} borderRadius={28} />
            <View style={styles.photoActions}>
              <TouchableOpacity
                style={[styles.photoBtn, pickingPhoto && styles.photoBtnDisabled]}
                onPress={handlePickPhoto}
                disabled={pickingPhoto || saving}
                activeOpacity={0.85}
              >
                {pickingPhoto ? (
                  <ActivityIndicator color="#08110F" />
                ) : (
                  <Text style={styles.photoBtnText}>{profilePhoto ? t('profile.changePhoto') : t('profile.uploadPhoto')}</Text>
                )}
              </TouchableOpacity>
              {profilePhoto && (
                <TouchableOpacity
                  style={styles.photoGhostBtn}
                  onPress={handleRemovePhoto}
                  disabled={saving}
                  activeOpacity={0.85}
                >
                  <Text style={styles.photoGhostBtnText}>{t('profile.useDefault')}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <Text style={styles.label}>{t('profile.fullNameLabel')}</Text>
          <TextInput
            value={fullName}
            onChangeText={setFullName}
            placeholder={t('profile.fullNamePlaceholder')}
            placeholderTextColor="#556070"
            style={styles.input}
          />

          <Text style={styles.label}>{t('profile.dobLabel')}</Text>
          <TouchableOpacity
            style={styles.dateField}
            onPress={openDobPicker}
            activeOpacity={0.85}
          >
            <View style={styles.dateFieldTextWrap}>
              <Text style={[styles.dateFieldText, !dateOfBirth && styles.dateFieldPlaceholder]}>
                {formatDobForDisplay(dateOfBirth, dobLocale, t('profile.dobPlaceholder'))}
              </Text>
              <Text style={styles.dateFieldHint}>{t('profile.dobHint')}</Text>
            </View>
            <Text style={styles.dateFieldIcon}>▾</Text>
          </TouchableOpacity>

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

          {age !== null && (
            <View style={styles.ageCard}>
              <Text style={styles.ageLabel}>{t('profile.calculatedAge')}</Text>
              <Text style={styles.ageValue}>{age} {t('profile.years')}</Text>
            </View>
          )}

          <Text style={styles.label}>{t('profile.addressLabel')}</Text>
          <TextInput
            value={address}
            onChangeText={setAddress}
            placeholder={t('profile.addressPlaceholder')}
            placeholderTextColor="#556070"
            style={[styles.input, styles.textArea]}
            multiline
            textAlignVertical="top"
          />

          <Text style={styles.label}>{t('profile.emailLabel')}</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder={t('profile.emailPlaceholder')}
            placeholderTextColor="#556070"
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

          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#08110F" />
            ) : (
              <Text style={styles.saveBtnText}>{t('profile.saveProfile')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
    gap: 8,
  },
  backBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#202634',
    backgroundColor: '#111723',
  },
  backBtnText: {
    color: '#D1D5DB',
    fontSize: 13,
    fontWeight: '600',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: '#7A8597',
    fontSize: 14,
    lineHeight: 20,
  },
  profileHero: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 14,
  },
  profileHeroText: {
    flex: 1,
    gap: 2,
  },
  profileName: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  profileMeta: {
    color: '#7A8597',
    fontSize: 13,
  },
  formCard: {
    backgroundColor: '#11141B',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: '#1C2432',
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  helperCaption: {
    color: '#7A8597',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 14,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  photoActions: {
    flex: 1,
    gap: 10,
  },
  photoBtn: {
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#00E5A0',
    paddingHorizontal: 16,
  },
  photoBtnDisabled: {
    opacity: 0.7,
  },
  photoBtnText: {
    color: '#08110F',
    fontSize: 14,
    fontWeight: '700',
  },
  photoGhostBtn: {
    height: 42,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#273041',
    backgroundColor: '#0B1017',
    paddingHorizontal: 16,
  },
  photoGhostBtnText: {
    color: '#D1D5DB',
    fontSize: 13,
    fontWeight: '600',
  },
  label: {
    color: '#D1D5DB',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 14,
  },
  input: {
    minHeight: 54,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A3343',
    backgroundColor: '#0B1017',
    color: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
  },
  dateField: {
    minHeight: 58,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A3343',
    backgroundColor: '#0B1017',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateFieldTextWrap: {
    flex: 1,
    gap: 4,
  },
  dateFieldText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  dateFieldPlaceholder: {
    color: '#556070',
    fontWeight: '500',
  },
  dateFieldHint: {
    color: '#7A8597',
    fontSize: 12,
  },
  dateFieldIcon: {
    color: '#A8B0BF',
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 12,
  },
  iosDatePickerCard: {
    marginTop: 12,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#F4F6F9',
  },
  iosDateDoneBtn: {
    height: 46,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#00E5A0',
  },
  iosDateDoneBtnText: {
    color: '#08110F',
    fontSize: 14,
    fontWeight: '700',
  },
  ageCard: {
    marginTop: 12,
    borderRadius: 14,
    backgroundColor: '#0F1F18',
    borderWidth: 1,
    borderColor: '#00E5A033',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ageLabel: {
    color: '#8BA798',
    fontSize: 13,
    fontWeight: '600',
  },
  ageValue: {
    color: '#00E5A0',
    fontSize: 18,
    fontWeight: '700',
  },
  inputDisabled: {
    opacity: 0.65,
  },
  textArea: {
    minHeight: 96,
  },
  helperText: {
    color: '#7A8597',
    fontSize: 12,
    marginTop: 8,
    lineHeight: 18,
  },
  saveBtn: {
    marginTop: 22,
    height: 56,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#00E5A0',
  },
  saveBtnDisabled: {
    opacity: 0.65,
  },
  saveBtnText: {
    color: '#08110F',
    fontSize: 16,
    fontWeight: '700',
  },
});
