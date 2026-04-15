import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import HistoryScreen from './HistoryScreen';
import HomeScreen from './Homescreen';
import { useLanguage } from '../directory/Languagecontext';

type TabKey = 'home' | 'premium' | 'history';

type TabDefinition = {
  key: TabKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

export default function MainTabsScreen() {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const progress = useRef(new Animated.Value(0)).current;
  const TABS: TabDefinition[] = [
    { key: 'home', label: t('tabs.home'), icon: 'home' },
    { key: 'premium', label: t('tabs.premium'), icon: 'diamond' },
    { key: 'history', label: t('tabs.history'), icon: 'time' },
  ];
  const activeIndex = TABS.findIndex((tab) => tab.key === activeTab);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: activeIndex,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [activeIndex, progress]);

  const baseTabHeight = width >= 768 ? 84 : 74;
  const contentBottomInset = baseTabHeight + Math.max(insets.bottom, 12) + 20;

  const renderScene = (tabKey: TabKey) => {
    switch (tabKey) {
      case 'home':
        return (
          <HomeScreen
            isActive={activeTab === 'home'}
            bottomInset={contentBottomInset}
            variant="home"
            onOpenPremium={() => setActiveTab('premium')}
          />
        );
      case 'premium':
        return (
          <HomeScreen
            isActive={activeTab === 'premium'}
            bottomInset={contentBottomInset}
            variant="premium"
            onOpenPremium={() => setActiveTab('premium')}
          />
        );
      case 'history':
        return <HistoryScreen isActive={activeTab === 'history'} bottomInset={contentBottomInset} />;
      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.sceneContainer}>
        {TABS.map((tab, index) => {
          const opacity = progress.interpolate({
            inputRange: [index - 1, index, index + 1],
            outputRange: [0, 1, 0],
            extrapolate: 'clamp',
          });

          const translateX = progress.interpolate({
            inputRange: [index - 1, index, index + 1],
            outputRange: [-16, 0, 16],
            extrapolate: 'clamp',
          });

          return (
            <Animated.View
              key={tab.key}
              pointerEvents={activeTab === tab.key ? 'auto' : 'none'}
              style={[
                styles.scene,
                {
                  opacity,
                  transform: [{ translateX }],
                  zIndex: activeTab === tab.key ? 2 : 1,
                },
              ]}
            >
              {renderScene(tab.key)}
            </Animated.View>
          );
        })}
      </View>

      <View pointerEvents="box-none" style={styles.tabBarWrap}>
        <View
          style={[
            styles.tabBar,
            {
              paddingBottom: Math.max(insets.bottom, 12),
              minHeight: width >= 768 ? 84 : 74,
              maxWidth: width >= 768 ? 520 : undefined,
            },
          ]}
        >
          {TABS.map((tab) => {
            const focused = activeTab === tab.key;

            return (
              <TouchableOpacity
                key={tab.key}
                activeOpacity={0.9}
                onPress={() => setActiveTab(tab.key)}
                style={[styles.tabButton, focused && styles.tabButtonActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: focused }}
              >
                <Ionicons
                  name={focused ? tab.icon : `${tab.icon}-outline` as keyof typeof Ionicons.glyphMap}
                  size={22}
                  color={focused ? '#0A0A0F' : '#7A8597'}
                />
                <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
    position: 'relative',
  },
  sceneContainer: {
    flex: 1,
  },
  scene: {
    ...StyleSheet.absoluteFillObject,
  },
  tabBarWrap: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 10,
    alignItems: 'center',
    zIndex: 50,
    elevation: 50,
  },
  tabBar: {
    alignSelf: 'center',
    width: '100%',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 8,
    paddingTop: 8,
    borderRadius: 32,
    backgroundColor: '#121A27',
    borderWidth: 1.5,
    borderColor: '#2A3649',
    shadowColor: '#000000',
    shadowOpacity: 0.32,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 18,
  },
  tabButton: {
    flex: 1,
    minHeight: 56,
    borderRadius: 24,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 6,
  },
  tabButtonActive: {
    backgroundColor: '#00E5A0',
  },
  tabLabel: {
    color: '#7A8597',
    fontSize: 14,
    fontWeight: '700',
  },
  tabLabelActive: {
    color: '#0A0A0F',
  },
});
