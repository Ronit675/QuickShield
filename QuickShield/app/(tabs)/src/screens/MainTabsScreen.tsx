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

type TabKey = 'home' | 'history';

type TabDefinition = {
  key: TabKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const TABS: TabDefinition[] = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'history', label: 'History', icon: 'time' },
];

export default function MainTabsScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: activeTab === 'home' ? 0 : 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [activeTab, progress]);

  const baseTabHeight = width >= 768 ? 90 : 82;
  const contentBottomInset = baseTabHeight + Math.max(insets.bottom, 12) + 20;

  const homeOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  const historyOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const homeTranslateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -16],
  });

  const historyTranslateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [16, 0],
  });

  return (
    <View style={styles.container}>
      <View style={styles.sceneContainer}>
        <Animated.View
          pointerEvents={activeTab === 'home' ? 'auto' : 'none'}
          style={[
            styles.scene,
            {
              opacity: homeOpacity,
              transform: [{ translateX: homeTranslateX }],
              zIndex: activeTab === 'home' ? 2 : 1,
            },
          ]}
        >
          <HomeScreen isActive={activeTab === 'home'} bottomInset={contentBottomInset} />
        </Animated.View>

        <Animated.View
          pointerEvents={activeTab === 'history' ? 'auto' : 'none'}
          style={[
            styles.scene,
            {
              opacity: historyOpacity,
              transform: [{ translateX: historyTranslateX }],
              zIndex: activeTab === 'history' ? 2 : 1,
            },
          ]}
        >
          <HistoryScreen isActive={activeTab === 'history'} bottomInset={contentBottomInset} />
        </Animated.View>
      </View>

      <View pointerEvents="box-none" style={styles.tabBarWrap}>
        <View
          style={[
            styles.tabBar,
            {
              paddingBottom: Math.max(insets.bottom, 12),
              minHeight: width >= 768 ? 90 : 82,
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
    left: 16,
    right: 16,
    bottom: 12,
    alignItems: 'center',
    zIndex: 50,
    elevation: 50,
  },
  tabBar: {
    alignSelf: 'center',
    width: '100%',
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 12,
    borderRadius: 28,
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
    minHeight: 54,
    borderRadius: 20,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
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
