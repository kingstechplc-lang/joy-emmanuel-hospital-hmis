// =====================================================================
// i18n — lightweight translation system
// =====================================================================
import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { en } from "@/lib/i18n/translations/en";
import { tw } from "@/lib/i18n/translations/tw";

export type Language = "en" | "tw";

const translations: Record<Language, Record<string, string>> = { en, tw };
const STORAGE_KEY = "jem-hmis-lang";

function translate(key: string, lang: Language): string {
  return translations[lang]?.[key] || translations.en[key] || key;
}

interface I18nContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue>({
  lang: "en",
  setLang: () => {},
  t: (key: string) => key,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>("en");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Language;
      if (saved && (saved === "en" || saved === "tw")) {
        setLangState(saved);
      }
    } catch {}
  }, []);

  const setLang = useCallback((newLang: Language) => {
    setLangState(newLang);
    try { localStorage.setItem(STORAGE_KEY, newLang); } catch {}
  }, []);

  const t = useCallback((key: string) => translate(key, lang), [lang]);

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

export const LANGUAGES: Array<{ code: Language; label: string; flag: string }> = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "tw", label: "Twi", flag: "🇬🇭" },
];
