import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';

import { useAuth } from './src/context/AuthContext';

const loadingStyles = {
  flex: 1,
  justifyContent: 'center' as const,
  alignItems: 'center' as const,
  backgroundColor: '#0A0A0F',
};

export default function IndexRoute() {
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      router.replace('/welcome');
      return;
    }

    if (user.profileStatus === 'auth_only') {
      router.replace('/onboarding-platform');
      return;
    }

    if (user.profileStatus === 'platform_linked') {
      router.replace('/onboarding-zone');
      return;
    }

    router.replace('/home');
  }, [isLoading, user]);

  if (isLoading) {
    return (
      <View style={loadingStyles}>
        <ActivityIndicator color="#00E5A0" size="large" />
      </View>
    );
  }

  return (
    <View style={loadingStyles}>
      <ActivityIndicator color="#00E5A0" size="large" />
    </View>
  );
}
