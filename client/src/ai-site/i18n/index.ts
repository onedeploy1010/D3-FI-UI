import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./locales/en.json";
import zh from "./locales/zh.json";
import zhTW from "./locales/zh-TW.json";
import ja from "./locales/ja.json";
import ko from "./locales/ko.json";
import th from "./locales/th.json";
import vi from "./locales/vi.json";
import ru from "./locales/ru.json";
import fr from "./locales/fr.json";
import de from "./locales/de.json";
import es from "./locales/es.json";

const resources = {
  en: { translation: en },
  "zh-CN": { translation: zh },
  zh: { translation: zh },
  "zh-TW": { translation: zhTW },
  ja: { translation: ja },
  ko: { translation: ko },
  th: { translation: th },
  vi: { translation: vi },
  ru: { translation: ru },
  fr: { translation: fr },
  de: { translation: de },
  es: { translation: es },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: {
      "zh-TW": ["zh-CN", "en"],
      "zh-CN": ["en"],
      zh: ["en"],
      ja: ["en"],
      ko: ["en"],
      th: ["en"],
      vi: ["en"],
      ru: ["en"],
      fr: ["en"],
      de: ["en"],
      es: ["en"],
      default: ["en"],
    },
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "d3_app_lang",
      caches: ["localStorage"],
    },
  });

export default i18n;
