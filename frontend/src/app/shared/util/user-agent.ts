/**
 * Short description of a browser from its user agent, e.g. "Edge 131 · Windows". Browser and
 * system names are product names and not translated. Null when nothing is recognized.
 */
export function describeUserAgent(userAgent: string | null | undefined): string | null {
  if (!userAgent) {
    return null;
  }
  const browser = browserOf(userAgent);
  const system = systemOf(userAgent);
  const parts = [browser, system].filter((part): part is string => !!part);
  return parts.length ? parts.join(' · ') : null;
}

/** Order matters: Edge and Opera also call themselves Chrome, Chrome also calls itself Safari. */
const BROWSERS: [RegExp, string][] = [
  [/EdgA?\/(\d+)/, 'Edge'],
  [/OPR\/(\d+)/, 'Opera'],
  [/SamsungBrowser\/(\d+)/, 'Samsung Internet'],
  [/Firefox\/(\d+)/, 'Firefox'],
  [/FxiOS\/(\d+)/, 'Firefox'],
  [/CriOS\/(\d+)/, 'Chrome'],
  [/Chrome\/(\d+)/, 'Chrome'],
  [/Version\/(\d+)[\d.]* (?:Mobile\/\S+ )?Safari/, 'Safari'],
];

function browserOf(userAgent: string): string | null {
  for (const [pattern, name] of BROWSERS) {
    const match = userAgent.match(pattern);
    if (match) {
      return `${name} ${match[1]}`;
    }
  }
  return null;
}

function systemOf(userAgent: string): string | null {
  if (/iPhone|iPad|iPod/.test(userAgent)) {
    return /iPad/.test(userAgent) ? 'iPadOS' : 'iOS';
  }
  if (/Android/.test(userAgent)) {
    return 'Android';
  }
  if (/Windows/.test(userAgent)) {
    return 'Windows';
  }
  if (/Mac OS X|Macintosh/.test(userAgent)) {
    return 'macOS';
  }
  if (/CrOS/.test(userAgent)) {
    return 'ChromeOS';
  }
  if (/Linux/.test(userAgent)) {
    return 'Linux';
  }
  return null;
}
