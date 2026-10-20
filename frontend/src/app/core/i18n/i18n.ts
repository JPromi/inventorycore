/**
 * Texts of the user interface. They are loaded from `public/i18n/<language>.json` before the app
 * starts (see main.ts), so `t()` works everywhere, also in constants evaluated at import time
 * (navigation, form configurations). Keys are dotted paths into the JSON, e.g. `common.save`;
 * placeholders are written as `{name}`.
 *
 * See docs/CONVENTIONS.md, "Language and Texts".
 */
export type I18nParams = Record<string, string | number | null | undefined>;

type Dictionary = { [key: string]: string | Dictionary };

export const DEFAULT_LANGUAGE = 'de';

let dictionary: Dictionary = {};
let language = DEFAULT_LANGUAGE;
const reported = new Set<string>();

/** Loads the texts of a language; the app falls back to the keys if the file cannot be loaded. */
export async function loadTranslations(lang = DEFAULT_LANGUAGE): Promise<void> {
  try {
    const response = await fetch(`i18n/${lang}.json`, { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    setTranslations(await response.json(), lang);
  } catch (error) {
    console.error(`Texte für „${lang}“ konnten nicht geladen werden.`, error);
  }
}

/** Replaces the loaded texts (also used by unit tests). */
export function setTranslations(texts: Dictionary, lang = DEFAULT_LANGUAGE): void {
  dictionary = texts;
  language = lang;
  document.documentElement.lang = lang;
}

export function currentLanguage(): string {
  return language;
}

/** The text of a key with its `{placeholders}` filled in; the key itself if it is missing. */
export function t(key: string, params?: I18nParams): string {
  const value = lookup(key);
  if (value === null) {
    if (!reported.has(key)) {
      reported.add(key);
      console.warn(`Fehlender Text: ${key}`);
    }
    return key;
  }
  return params ? interpolate(value, params) : value;
}

/** Singular/plural: uses `<key>.one` for a count of 1, otherwise `<key>.other`; `{count}` is available. */
export function tn(key: string, count: number, params?: I18nParams): string {
  return t(`${key}.${count === 1 ? 'one' : 'other'}`, { count, ...params });
}

/** Whether a key exists, e.g. for optional texts per enum value. */
export function hasText(key: string): boolean {
  return lookup(key) !== null;
}

function lookup(key: string): string | null {
  let node: string | Dictionary | undefined = dictionary;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) {
      return null;
    }
    node = node[part];
  }
  return typeof node === 'string' ? node : null;
}

function interpolate(text: string, params: I18nParams): string {
  return text.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === null || value === undefined ? match : String(value);
  });
}
