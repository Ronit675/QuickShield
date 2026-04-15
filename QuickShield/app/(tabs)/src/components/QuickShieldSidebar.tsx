import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';

import { useLanguage } from '../directory/Languagecontext';

type QuickShieldSidebarProps = {
  visible: boolean;
  displayName: string;
  contactLine: string;
  platformLabel: string;
  onClose: () => void;
  onProfilePress: () => void;
  onPlatformPress: () => void;
  onSettingsPress: () => void;
  onSignOutPress: () => void;
};

const ANIMATION_DURATION_MS = 260;

export default function QuickShieldSidebar({
  visible,
  displayName,
  contactLine,
  platformLabel,
  onClose,
  onProfilePress,
  onPlatformPress,
  onSettingsPress,
  onSignOutPress,
}: QuickShieldSidebarProps) {
  const { t } = useLanguage();
  const { width } = useWindowDimensions();
  const sidebarWidth = useMemo(() => width * 0.7, [width]);
  const [isMounted, setIsMounted] = useState(visible);
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(-sidebarWidth)).current;

  useEffect(() => {
    translateX.setValue(-sidebarWidth);
  }, [sidebarWidth, translateX]);

  useEffect(() => {
    if (visible) {
      setIsMounted(true);
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: ANIMATION_DURATION_MS,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(translateX, {
          toValue: 0,
          duration: ANIMATION_DURATION_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: ANIMATION_DURATION_MS,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(translateX, {
        toValue: -sidebarWidth,
        duration: ANIMATION_DURATION_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setIsMounted(false);
      }
    });
  }, [overlayOpacity, sidebarWidth, translateX, visible]);

  if (!isMounted) {
    return null;
  }

  const menuItems = [
    {
      key: 'profile',
      label: t('sidebar.myProfile'),
      hint: t('sidebar.myProfileHint'),
      icon: <Feather name="user" size={20} color="#8BC4FF" />,
      onPress: onProfilePress,
    },
    {
      key: 'platform',
      label: t('sidebar.connectPlatform', { platform: platformLabel }),
      hint: t('sidebar.connectPlatformHint'),
      icon: <MaterialCommunityIcons name="shield-link-variant-outline" size={22} color="#00E5A0" />,
      onPress: onPlatformPress,
    },
    {
      key: 'settings',
      label: t('sidebar.settings'),
      hint: t('sidebar.settingsHint'),
      icon: <Feather name="settings" size={20} color="#FFD166" />,
      onPress: onSettingsPress,
    },
    {
      key: 'signout',
      label: t('sidebar.signOut'),
      hint: t('sidebar.signOutHint'),
      icon: <Feather name="log-out" size={20} color="#FCA5A5" />,
      onPress: onSignOutPress,
    },
  ];

  return (
    <Modal transparent visible={isMounted} animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: overlayOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        <Animated.View
          style={[
            styles.sidebar,
            {
              width: sidebarWidth,
              transform: [{ translateX }],
            },
          ]}
        >
          <View style={styles.header}>
            <View style={styles.brandRow}>
              <View style={styles.logoWrap}>
                <View style={styles.logoCore}>
                  <Text style={styles.logoText}>QS</Text>
                </View>
              </View>

              <View style={styles.brandTextWrap}>
                <Text style={styles.appName}>QuickShield</Text>
                <Text style={styles.appTagline}>Income protection for riders</Text>
              </View>
            </View>
          </View>

          <View style={styles.profileCard}>
            <Text style={styles.profileName}>{displayName}</Text>
            <Text style={styles.profileMeta}>
              {platformLabel ? `Connected: ${platformLabel}` : contactLine}
            </Text>
          </View>

          <View style={styles.menuSection}>
            <View style={styles.menuItemsWrap}>
              {menuItems
                .filter((item) => item.key !== 'signout')
                .map((item) => (
                  <TouchableOpacity
                    key={item.key}
                    style={styles.menuItem}
                    onPress={item.onPress}
                    activeOpacity={0.88}
                  >
                    <View style={styles.menuIconWrap}>{item.icon}</View>
                    <View style={styles.menuCopy}>
                      <Text style={styles.menuLabel}>{item.label}</Text>
                      <Text style={styles.menuHint}>{item.hint}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
            </View>

            <TouchableOpacity
              style={[styles.menuItem, styles.signOutItem]}
              onPress={onSignOutPress}
              activeOpacity={0.88}
            >
              <View style={styles.menuIconWrap}>{menuItems[3].icon}</View>
              <View style={styles.menuCopy}>
                <Text style={styles.menuLabel}>{menuItems[3].label}</Text>
                <Text style={styles.menuHint}>{menuItems[3].hint}</Text>
              </View>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 6, 23, 0.58)',
  },
  sidebar: {
    flex: 1,
    backgroundColor: '#0D1118',
    borderTopRightRadius: 28,
    borderBottomRightRadius: 28,
    borderRightWidth: 1,
    borderColor: '#1D2735',
    paddingTop: 56,
    paddingHorizontal: 18,
    paddingBottom: 24,
    shadowColor: '#000000',
    shadowOpacity: 0.38,
    shadowRadius: 24,
    shadowOffset: { width: 8, height: 0 },
    elevation: 22,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 24,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  logoWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: '#132033',
    borderWidth: 1,
    borderColor: '#20405F',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoCore: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#00E5A0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    color: '#08110F',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  brandTextWrap: {
    flex: 1,
  },
  appName: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.8,
    marginBottom: 2,
  },
  appTagline: {
    color: '#7A8597',
    fontSize: 12,
    lineHeight: 18,
  },
  profileCard: {
    backgroundColor: '#101722',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#1E2B3D',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 20,
  },
  profileName: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  profileMeta: {
    color: '#8B9AAF',
    fontSize: 12,
    lineHeight: 18,
  },
  menuSection: {
    flex: 1,
    gap: 12,
  },
  menuItemsWrap: {
    gap: 12,
  },
  signOutItem: {
    marginTop: 'auto',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#121922',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1D2836',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  menuIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#0B1119',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuCopy: {
    flex: 1,
  },
  menuLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 3,
  },
  menuHint: {
    color: '#7A8597',
    fontSize: 12,
    lineHeight: 18,
  },
});
