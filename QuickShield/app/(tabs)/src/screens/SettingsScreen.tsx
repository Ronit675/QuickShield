import React from 'react';
import { Alert, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { useLanguage } from '../directory/Languagecontext';
import type { LanguageCode } from '../directory/translations';

const SETTINGS_LANGUAGES: LanguageCode[] = ['en', 'hi', 'kn'];

export default function SettingsScreen() {
  const { language, setLanguage, t, languageNames } = useLanguage();

  const handleLanguageSelect = (nextLanguage: LanguageCode) => {
    if (nextLanguage === language) {
      return;
    }

    setLanguage(nextLanguage);
    Alert.alert(t('settings.savedTitle'), t('settings.savedMessage'));
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0F" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{t('settings.title')}</Text>
        <Text style={styles.subtitle}>{t('settings.subtitle')}</Text>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('settings.languageLabel')}</Text>

          {SETTINGS_LANGUAGES.map((item) => {
            const selected = item === language;

            return (
              <TouchableOpacity
                key={item}
                style={[styles.languageRow, selected && styles.languageRowSelected]}
                activeOpacity={0.85}
                onPress={() => handleLanguageSelect(item)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <View>
                  <Text style={styles.languageName}>{languageNames[item]}</Text>
                  <Text style={styles.languageCode}>{item.toUpperCase()}</Text>
                </View>

                {selected ? (
                  <View style={styles.selectedPill}>
                    <MaterialIcons name="check" size={14} color="#0A0A0F" />
                    <Text style={styles.selectedText}>{t('settings.selected')}</Text>
                  </View>
                ) : (
                  <MaterialIcons name="radio-button-unchecked" size={20} color="#7A8597" />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  content: {
    paddingTop: 72,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 6,
  },
  subtitle: {
    color: '#94A3B8',
    fontSize: 14,
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#101722',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1E2B3D',
    padding: 16,
  },
  sectionTitle: {
    color: '#8BC4FF',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 10,
  },
  languageRow: {
    minHeight: 64,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#223043',
    backgroundColor: '#121922',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  languageRowSelected: {
    borderColor: '#00E5A0',
    backgroundColor: '#0F2921',
  },
  languageName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  languageCode: {
    color: '#8FAECC',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.6,
  },
  selectedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    backgroundColor: '#00E5A0',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  selectedText: {
    color: '#0A0A0F',
    fontSize: 12,
    fontWeight: '800',
  },
});
