import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useLanguage } from '../directory/Languagecontext';
import ProfileAvatar from './ProfileAvatar';

type QuickShieldSidebarProps = {
  visible: boolean;
  displayName: string;
  contactLine: string;
  platformLabel: string;
  profilePhoto?: string | null;
  onClose: () => void;
  onProfilePress: () => void;
  onPlatformPress: () => void;
  onWeatherPress: () => void;
  onSettingsPress: () => void;
  onSignOutPress: () => void;
  onWalletPress?: () => void;
  onHelpPress?: () => void;
};

const ANIMATION_DURATION_MS = 260;

export default function QuickShieldSidebar({
  visible,
  displayName,
  contactLine,
  platformLabel,
  profilePhoto,
  onClose,
  onProfilePress,
  onPlatformPress,
  onWeatherPress,
  onSettingsPress,
  onSignOutPress,
  onWalletPress,
  onHelpPress,
}: QuickShieldSidebarProps) {
  const { t } = useLanguage();
  const { width } = useWindowDimensions();
  const sidebarWidth = useMemo(() => width * 0.75, [width]);
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
      key: 'home',
      label: t('sidebar.home'),
      icon: 'home',
      active: true,
      onPress: onClose,
    },
    {
      key: 'wallet',
      label: t('sidebar.wallet'),
      icon: 'wallet-outline',
      onPress: () => {
        onClose();
        onWalletPress?.();
      },
    },
    {
      key: 'weather',
      label: t('sidebar.weather'),
      icon: 'sunny-outline',
      onPress: () => {
        onClose();
        onWeatherPress();
      },
    },
    {
      key: 'platform',
      label: t('sidebar.connectPlatform', { platform: platformLabel || 'Platform' }),
      icon: 'link-outline',
      onPress: () => {
        onClose();
        onPlatformPress();
      },
    },
    {
      key: 'profile',
      label: t('sidebar.myProfile'),
      icon: 'person-outline',
      onPress: () => {
        onClose();
        onProfilePress();
      },
    },
    {
      key: 'divider',
      label: '',
      icon: '',
      onPress: () => {},
    },
    {
      key: 'settings',
      label: t('sidebar.settings'),
      icon: 'settings-outline',
      onPress: () => {
        onClose();
        onSettingsPress();
      },
    },
    {
      key: 'help',
      label: t('sidebar.helpSupport'),
      icon: 'help-circle-outline',
      onPress: () => {
        onClose();
        if (onHelpPress) {
          onHelpPress();
        } else {
          Alert.alert('Help & Support', 'For support, please contact us at support@quickshield.com');
        }
      },
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
          {/* Top Section: User Profile */}
          <View style={styles.profileSection}>
            <View style={styles.avatarContainer}>
              <ProfileAvatar uri={profilePhoto} size={64} borderRadius={32} />
            </View>
            <View style={styles.profileTextWrap}>
              <Text style={styles.profileGreeting} numberOfLines={1}>
                Hello, {displayName || 'Rider'}!
              </Text>
              <Text style={styles.profileEmail} numberOfLines={1}>
                {contactLine || 'rider@quickshield.com'}
              </Text>
            </View>
          </View>

          {/* Menu items Section */}
          <ScrollView
            style={styles.menuScroll}
            contentContainerStyle={styles.menuContent}
            showsVerticalScrollIndicator={false}
          >
            {menuItems.map((item, index) => {
              if (item.key === 'divider') {
                return <View key={`divider-${index}`} style={styles.divider} />;
              }

              const isActive = item.active;
              return (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.menuItem, isActive && styles.menuItemActive]}
                  onPress={item.onPress}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={item.icon as any}
                    size={22}
                    color={isActive ? '#A16207' : '#696710'}
                  />
                  <Text style={[styles.menuLabel, isActive && styles.menuLabelActive]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Bottom Section */}
          <View style={styles.bottomSection}>
            <TouchableOpacity
              style={styles.signOutButton}
              onPress={() => {
                onClose();
                onSignOutPress();
              }}
              activeOpacity={0.85}
            >
              <Ionicons name="log-out-outline" size={20} color="#FFFFFF" />
              <Text style={styles.signOutText}>{t('sidebar.signOut')}</Text>
            </TouchableOpacity>
            <View style={styles.versionContainer}>
              <Text style={styles.versionText}>QUICKSHIELD v2.4.0-PRO</Text>
            </View>
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
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  sidebar: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    height: '100%',
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 15,
    shadowOffset: { width: 4, height: 0 },
    elevation: 16,
  },
  profileSection: {
    paddingHorizontal: 24,
    paddingTop: 64,
    paddingBottom: 28,
    backgroundColor: '#FFDF00',
  },
  avatarContainer: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    marginBottom: 16,
  },
  profileTextWrap: {
    gap: 4,
  },
  profileGreeting: {
    fontSize: 22,
    fontWeight: '900',
    color: '#5C5000',
  },
  profileEmail: {
    fontSize: 14,
    color: '#5C5000',
    opacity: 0.8,
  },
  menuScroll: {
    flex: 1,
  },
  menuContent: {
    paddingHorizontal: 16,
    paddingVertical: 24,
    gap: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 16,
  },
  menuItemActive: {
    backgroundColor: '#FEFCE8',
  },
  menuLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#696710',
  },
  menuLabelActive: {
    fontWeight: '700',
    color: '#A16207',
  },
  divider: {
    height: 1,
    backgroundColor: '#F4F4F5',
    marginVertical: 12,
  },
  bottomSection: {
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderTopWidth: 1,
    borderTopColor: '#F4F4F5',
    backgroundColor: '#FFFFFF',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#BE2D06',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
    shadowColor: '#BE2D06',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  signOutText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  versionContainer: {
    marginTop: 16,
    alignItems: 'center',
  },
  versionText: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '500',
    letterSpacing: 1.2,
  },
});
