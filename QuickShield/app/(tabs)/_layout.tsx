import React from 'react';
import { Stack } from 'expo-router';

import { AuthProvider } from './src/context/AuthContext';
import { LanguageProvider } from './src/directory/Languagecontext';

export default function TabLayout() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
          <Stack.Screen name="onboarding-platform" />
          <Stack.Screen name="onboarding-zone" />
          <Stack.Screen name="home" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="platform-connect" />
          <Stack.Screen name="create-policy" />
          <Stack.Screen name="settings" />
        </Stack>
      </LanguageProvider>
    </AuthProvider>
  );
}
