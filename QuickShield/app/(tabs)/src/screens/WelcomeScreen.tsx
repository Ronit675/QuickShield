import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  ImageBackground,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useLanguage } from '../directory/Languagecontext';

const RIDER_IMAGE = {
  uri: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBj2-LOz4LE---6X-WNI1yaush322b2x8FkbyRRA0bp73QTGIjgPoNBuvFhrzsB2aSJV-b1dTfi_zTJVwuzYdTHsti9dVb7czf2x9YeapvMDEAYvJBwp17VZjOXSg-OvF040q00cyFYS3vVtcBOfEif68vo4x4NKUPczNRtLEShDc1frEGJeB0gomNxe8NU6advHEDxwH3vLU9lTkW9SQ9xlSX7xR-WzbonIfhfifpNHmXv4Ewom6JMY_owv1gk121qWnT35-ncfmMj',
};

const features = [
  { icon: 'flash-outline', title: 'instantPayouts', description: 'instantPayoutsHint' },
  { icon: 'radar', title: 'weatherTracking', description: 'weatherTrackingHint' },
  { icon: 'tune-variant', title: 'customCoverage', description: 'customCoverageHint' },
  { icon: 'swap-horizontal', title: 'easyTransfer', description: 'easyTransferHint' },
  { icon: 'history', title: 'hoursMonitoring', description: 'hoursMonitoringHint' },
] as const;

export default function WelcomeScreen() {
  const { t } = useLanguage();
  const marqueeOffset = useRef(new Animated.Value(0)).current;
  const [featureSetWidth, setFeatureSetWidth] = useState(0);

  useEffect(() => {
    if (!featureSetWidth) return;

    marqueeOffset.setValue(0);
    const marqueeAnimation = Animated.loop(
      Animated.timing(marqueeOffset, {
        toValue: -featureSetWidth,
        duration: 18000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    marqueeAnimation.start();

    return () => marqueeAnimation.stop();
  }, [featureSetWidth, marqueeOffset]);

  const renderFeatures = () => features.map((feature) => (
    <View key={feature.title} style={styles.feature}>
      <MaterialCommunityIcons name={feature.icon} size={28} color="#736400" />
      <View style={styles.featureCopy}>
        <Text style={styles.featureTitle}>{t(`welcomeScreen.${feature.title}`)}</Text>
        <Text style={styles.featureDescription}>{t(`welcomeScreen.${feature.description}`)}</Text>
      </View>
    </View>
  ));

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <View style={styles.header}>
        <MaterialCommunityIcons name="shield-outline" size={27} color="#736400" />
        <Text style={styles.brand}>QuickShield</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.imageFrame}>
          <View style={styles.imageBackdrop} />
          <ImageBackground source={RIDER_IMAGE} imageStyle={styles.image} style={styles.riderImage}>
            <View style={styles.protectionBadge}>
              <MaterialCommunityIcons name="check-circle" size={16} color="#736400" />
              <Text style={styles.protectionBadgeText}>{t('welcomeScreen.activeProtection')}</Text>
            </View>
          </ImageBackground>
        </View>

        <View style={styles.narrative}>
          <Text style={styles.eyebrow}>{t('welcomeScreen.eyebrow')}</Text>
          <Text style={styles.title}>{t('welcomeScreen.title')}</Text>
          <Text style={styles.description}>{t('welcomeScreen.description')}</Text>
        </View>

        <TouchableOpacity
          style={styles.getStartedButton}
          onPress={() => router.replace('/login')}
          activeOpacity={0.85}
        >
          <Text style={styles.getStartedText}>{t('welcomeScreen.getStarted')}</Text>
          <MaterialCommunityIcons name="arrow-right" size={22} color="#FFFFFF" />
        </TouchableOpacity>

        <View style={styles.featuresSection}>
          <Animated.View
            style={[
              styles.featuresTrack,
              { transform: [{ translateX: marqueeOffset }] },
            ]}
          >
            <View
              style={styles.features}
              onLayout={(event) => setFeatureSetWidth(event.nativeEvent.layout.width)}
            >
              {renderFeatures()}
            </View>
            <View style={styles.features} aria-hidden>
              {renderFeatures()}
            </View>
          </Animated.View>
        </View>

        <Text style={styles.footer}>{t('welcomeScreen.footer')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    height: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E7E5E4',
    backgroundColor: '#FFFFFF',
  },
  brand: {
    color: '#736400',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  content: {
    width: '100%',
    maxWidth: 540,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingTop: 30,
    paddingBottom: 24,
  },
  imageFrame: {
    height: 310,
    marginHorizontal: 4,
    marginBottom: 36,
  },
  imageBackdrop: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    backgroundColor: 'rgba(115, 100, 0, 0.11)',
    transform: [{ rotate: '3deg' }, { scale: 1.035 }],
  },
  riderImage: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 15,
    backgroundColor: '#ECE942',
  },
  image: {
    borderRadius: 15,
  },
  protectionBadge: {
    position: 'absolute',
    top: 14,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 9,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
  },
  protectionBadgeText: {
    color: '#696710',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  narrative: {
    alignItems: 'flex-start',
    gap: 12,
  },
  eyebrow: {
    color: '#736400',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(115, 100, 0, 0.10)',
  },
  title: {
    color: '#3B3A00',
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -1,
    lineHeight: 42,
  },
  description: {
    color: '#696710',
    fontSize: 16,
    lineHeight: 25,
  },
  getStartedButton: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 14,
    backgroundColor: '#736400',
    marginTop: 26,
    shadowColor: '#736400',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 12,
    elevation: 5,
  },
  getStartedText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  featuresSection: {
    borderTopWidth: 1,
    borderTopColor: '#F0EFEB',
    marginTop: 36,
    paddingTop: 23,
    overflow: 'hidden',
  },
  featuresTrack: {
    flexDirection: 'row',
  },
  features: {
    flexDirection: 'row',
    flexShrink: 0,
    gap: 28,
    paddingRight: 28,
  },
  feature: {
    width: 190,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureCopy: {
    flex: 1,
    gap: 3,
  },
  featureTitle: {
    color: '#3B3A00',
    fontSize: 13,
    fontWeight: '800',
  },
  featureDescription: {
    color: '#696710',
    fontSize: 11,
    lineHeight: 15,
  },
  footer: {
    color: '#A8A29E',
    fontSize: 10,
    lineHeight: 15,
    textAlign: 'center',
    marginTop: 42,
  },
});
