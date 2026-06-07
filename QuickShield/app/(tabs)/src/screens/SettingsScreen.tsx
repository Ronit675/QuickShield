import React, { useState } from 'react';
import {
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Switch,
  Modal,
  SafeAreaView,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { useLanguage } from '../directory/Languagecontext';
import type { LanguageCode } from '../directory/translations';
import { useAuth } from '../context/AuthContext';
import ProfileAvatar from '../components/ProfileAvatar';

const SETTINGS_LANGUAGES: LanguageCode[] = ['en', 'hi', 'kn'];

export default function SettingsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { language, setLanguage, t, languageNames } = useLanguage();
  const insets = useSafeAreaInsets();

  const [pushNotifications, setPushNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [biometrics, setBiometrics] = useState(true);
  const [langModalVisible, setLangModalVisible] = useState(false);

  const handleLanguageSelect = (nextLanguage: LanguageCode) => {
    setLangModalVisible(false);
    if (nextLanguage === language) {
      return;
    }
    setLanguage(nextLanguage);
    Alert.alert(t('settings.savedTitle'), t('settings.savedMessage'));
  };

  const handlePINPress = () => {
    Alert.alert('Security PIN', 'PIN settings will be available once bank validation protocols are fully verified.');
  };

  const handleSupportPress = (topic: string) => {
    Alert.alert(topic, `Redirecting to ${topic} help page...`);
  };

  return (
    <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFBFF" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-back" size={24} color="#736400" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('settings.title')}</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Account Settings Section */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Account Settings</Text>
          <View style={styles.boxContainer}>
            <TouchableOpacity
              style={styles.profileRow}
              activeOpacity={0.85}
              onPress={() => router.push('/profile')}
            >
              <View style={styles.profileLeft}>
                <View style={styles.avatarWrap}>
                  <ProfileAvatar uri={user?.profilePhoto} size={56} borderRadius={28} />
                  <View style={styles.editBadge}>
                    <Ionicons name="pencil" size={10} color="#5C5000" />
                  </View>
                </View>
                <View style={styles.profileInfo}>
                  <Text style={styles.profileName} numberOfLines={1}>
                    {user?.fullName || 'QuickShield Rider'}
                  </Text>
                  <Text style={styles.profileEmail} numberOfLines={1}>
                    {user?.email || user?.phone || 'rider@quickshield.com'}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward-outline" size={20} color="#696710" />
            </TouchableOpacity>
          </View>
        </View>

        {/* App Preferences Section */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>App Preferences</Text>
          <View style={styles.boxContainer}>
            {/* Push Notifications Row */}
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <View style={styles.rowIconWrap}>
                  <Ionicons name="notifications-outline" size={20} color="#736400" />
                </View>
                <Text style={styles.rowLabel}>Push Notifications</Text>
              </View>
              <Switch
                value={pushNotifications}
                onValueChange={setPushNotifications}
                trackColor={{ false: '#E4E4E7', true: '#736400' }}
                thumbColor="#FFFFFF"
                ios_backgroundColor="#E4E4E7"
              />
            </View>

            {/* Language Row */}
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.85}
              onPress={() => setLangModalVisible(true)}
            >
              <View style={styles.rowLeft}>
                <View style={styles.rowIconWrap}>
                  <Ionicons name="language-outline" size={20} color="#736400" />
                </View>
                <Text style={styles.rowLabel}>{t('settings.languageLabel')}</Text>
              </View>
              <View style={styles.rowRight}>
                <Text style={styles.rowValue}>{languageNames[language]}</Text>
                <Ionicons name="chevron-forward-outline" size={20} color="#696710" />
              </View>
            </TouchableOpacity>

            {/* Dark Mode Row */}
            <View style={[styles.row, styles.rowLast]}>
              <View style={styles.rowLeft}>
                <View style={styles.rowIconWrap}>
                  <Ionicons name="moon-outline" size={20} color="#736400" />
                </View>
                <Text style={styles.rowLabel}>Dark Mode</Text>
              </View>
              <Switch
                value={darkMode}
                onValueChange={setDarkMode}
                trackColor={{ false: '#E4E4E7', true: '#736400' }}
                thumbColor="#FFFFFF"
                ios_backgroundColor="#E4E4E7"
              />
            </View>
          </View>
        </View>

        {/* Security Section */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Security</Text>
          <View style={styles.boxContainer}>
            {/* PIN Row */}
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.85}
              onPress={handlePINPress}
            >
              <View style={styles.rowLeft}>
                <View style={styles.rowIconWrap}>
                  <Ionicons name="keypad-outline" size={20} color="#736400" />
                </View>
                <Text style={styles.rowLabel}>Change Login Pin</Text>
              </View>
              <Ionicons name="chevron-forward-outline" size={20} color="#696710" />
            </TouchableOpacity>

            {/* Biometrics Row */}
            <View style={[styles.row, styles.rowLast]}>
              <View style={styles.rowLeft}>
                <View style={styles.rowIconWrap}>
                  <Ionicons name="finger-print-outline" size={20} color="#736400" />
                </View>
                <Text style={styles.rowLabel}>Face ID / Fingerprint</Text>
              </View>
              <Switch
                value={biometrics}
                onValueChange={setBiometrics}
                trackColor={{ false: '#E4E4E7', true: '#736400' }}
                thumbColor="#FFFFFF"
                ios_backgroundColor="#E4E4E7"
              />
            </View>
          </View>
        </View>

        {/* Support Section */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Support</Text>
          <View style={styles.boxContainer}>
            {/* Help Center Row */}
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.85}
              onPress={() => handleSupportPress('Help Center')}
            >
              <View style={styles.rowLeft}>
                <View style={styles.rowIconWrap}>
                  <Ionicons name="help-circle-outline" size={20} color="#736400" />
                </View>
                <Text style={styles.rowLabel}>Help Center</Text>
              </View>
              <Ionicons name="open-outline" size={18} color="#696710" style={{ marginRight: 2 }} />
            </TouchableOpacity>

            {/* Terms of Service Row */}
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.85}
              onPress={() => handleSupportPress('Terms of Service')}
            >
              <View style={styles.rowLeft}>
                <View style={styles.rowIconWrap}>
                  <Ionicons name="document-text-outline" size={20} color="#736400" />
                </View>
                <Text style={styles.rowLabel}>Terms of Service</Text>
              </View>
              <Ionicons name="chevron-forward-outline" size={20} color="#696710" />
            </TouchableOpacity>

            {/* Privacy Policy Row */}
            <TouchableOpacity
              style={[styles.row, styles.rowLast]}
              activeOpacity={0.85}
              onPress={() => handleSupportPress('Privacy Policy')}
            >
              <View style={styles.rowLeft}>
                <View style={styles.rowIconWrap}>
                  <Ionicons name="shield-outline" size={20} color="#736400" />
                </View>
                <Text style={styles.rowLabel}>Privacy Policy</Text>
              </View>
              <Ionicons name="chevron-forward-outline" size={20} color="#696710" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Version String */}
        <View style={styles.versionContainer}>
          <Text style={styles.versionText}>Version 2.4.12 (Build 892)</Text>
        </View>
      </ScrollView>

      {/* Language Selection Modal */}
      <Modal
        visible={langModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLangModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setLangModalVisible(false)} />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Language</Text>
              <TouchableOpacity onPress={() => setLangModalVisible(false)}>
                <Ionicons name="close" size={24} color="#3B3A00" />
              </TouchableOpacity>
            </View>

            <View style={styles.langList}>
              {SETTINGS_LANGUAGES.map((item) => {
                const isSelected = item === language;
                return (
                  <TouchableOpacity
                    key={item}
                    style={[styles.langItem, isSelected && styles.langItemSelected]}
                    onPress={() => handleLanguageSelect(item)}
                    activeOpacity={0.8}
                  >
                    <View>
                      <Text style={[styles.langName, isSelected && styles.langNameSelected]}>
                        {languageNames[item]}
                      </Text>
                      <Text style={styles.langCode}>{item.toUpperCase()}</Text>
                    </View>
                    {isSelected ? (
                      <View style={styles.selectedCheck}>
                        <Ionicons name="checkmark-circle" size={22} color="#736400" />
                      </View>
                    ) : (
                      <View style={styles.uncheckCircle} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFBFF',
  },
  header: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: '#FFFBFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E4E4E7',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    padding: 6,
    borderRadius: 20,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#736400',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 24,
    gap: 24,
    paddingBottom: 48,
  },
  section: {
    gap: 10,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#696710',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    paddingHorizontal: 8,
  },
  boxContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    overflow: 'hidden',
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  profileLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    flex: 1,
  },
  avatarWrap: {
    position: 'relative',
  },
  editBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#FFDF00',
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInfo: {
    flex: 1,
    gap: 2,
  },
  profileName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#3B3A00',
  },
  profileEmail: {
    fontSize: 13,
    color: '#696710',
    opacity: 0.8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F4F4F5',
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  rowIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#FFFCCB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#3B3A00',
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#736400',
  },
  versionContainer: {
    marginTop: 16,
    alignItems: 'center',
  },
  versionText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 20,
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -4 },
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#3B3A00',
  },
  langList: {
    gap: 12,
    marginBottom: 16,
  },
  langItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    backgroundColor: '#FFFFFF',
  },
  langItemSelected: {
    borderColor: '#736400',
    backgroundColor: '#FEFCE8',
  },
  langName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#3B3A00',
    marginBottom: 2,
  },
  langNameSelected: {
    color: '#736400',
  },
  langCode: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  selectedCheck: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  uncheckCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#D4D4D8',
  },
});
