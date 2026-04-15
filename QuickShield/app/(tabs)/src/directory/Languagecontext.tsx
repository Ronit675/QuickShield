import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { DEFAULT_LANGUAGE, LANGUAGE_NAMES, LANGUAGES, translations, type LanguageCode } from './translations';

type LanguageContextValue = {
  language: LanguageCode;
  setLanguage: (nextLanguage: LanguageCode) => void;
  t: (path: string, vars?: Record<string, string>) => string;
  availableLanguages: typeof LANGUAGES;
  languageNames: typeof LANGUAGE_NAMES;
  isLanguageReady: boolean;
};

const LANGUAGE_STORAGE_KEY = 'quickshield.app.language';

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>(DEFAULT_LANGUAGE);
  const [isLanguageReady, setIsLanguageReady] = useState(false);

  useEffect(() => {
    const hydrateLanguage = async () => {
      try {
        const storedLanguage = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
        const isSupported = storedLanguage === LANGUAGES.EN || storedLanguage === LANGUAGES.HI || storedLanguage === LANGUAGES.KN;

        if (isSupported) {
          setLanguageState(storedLanguage as LanguageCode);
        }
      } finally {
        setIsLanguageReady(true);
      }
    };

    void hydrateLanguage();
  }, []);

  const setLanguage = (nextLanguage: LanguageCode) => {
    setLanguageState(nextLanguage);
    void AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
  };

  const t = (path: string, vars?: Record<string, string>) => {
    const keys = path.split('.');
    let value: unknown = translations[language];

    for (const key of keys) {
      if (typeof value !== 'object' || value === null) {
        value = undefined;
        break;
      }

      value = (value as Record<string, unknown>)[key];
    }

    if (typeof value !== 'string') {
      return path;
    }

    if (!vars) {
      return value;
    }

    return Object.entries(vars).reduce((acc, [varKey, varValue]) => {
      return acc.replace(new RegExp(`{{\\s*${varKey}\\s*}}`, 'g'), varValue);
    }, value);
  };

  const contextValue = useMemo<LanguageContextValue>(() => ({
    language,
    setLanguage,
    t,
    availableLanguages: LANGUAGES,
    languageNames: LANGUAGE_NAMES,
    isLanguageReady,
  }), [isLanguageReady, language]);

  return (
    <LanguageContext.Provider value={contextValue}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }

  return context;
}
