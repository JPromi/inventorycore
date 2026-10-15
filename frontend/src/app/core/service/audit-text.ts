import { AuditDetail, AuditPermission } from './audit.service';

/*
 * German texts for the activity log. The server stores only field keys, raw values and event
 * codes, so the log can be shown in any language: another language only needs another file like
 * this one.
 */

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  description: 'Beschreibung',
  invId: 'Inventar-ID',
  serialNumber: 'Seriennummer',
  inventoryNumber: 'Inventarnummer',
  assetTypeUuid: 'Typ',
  locationUuid: 'Standort',
  parentLocationUuid: 'Übergeordneter Standort',
  parentAssetUuid: 'Übergeordnetes Asset',
  parentAssetNote: 'Verknüpfungsbeschreibung',
  inspectionPolicy: 'Prüferfassung',
  tags: 'Tags',
  images: 'Bilder',
  areaUuids: 'Bereiche',
  areaUuid: 'Bereich',
  address: 'Adresse',
  street: 'Straße',
  postalCode: 'PLZ',
  city: 'Ort',
  country: 'Land',
  latitude: 'Breitengrad',
  longitude: 'Längengrad',
  fieldDefinitions: 'Felder',
  fields: 'Prüffelder',
  color: 'Farbe',
  brandName: 'Markenname',
  brandColor: 'Markenfarbe',
  loginTitle: 'Login-Titel',
  loginMessage: 'Login-Text',
  imprintUrl: 'Impressum',
  privacyUrl: 'Datenschutz',
  websiteUrl: 'Website',
  supportUrl: 'Support',
  logoUrl: 'Logo',
  username: 'Benutzername',
  displayName: 'Anzeigename',
  email: 'E-Mail',
  role: 'Rolle',
  enabled: 'Aktiv',
  groupUuids: 'Gruppen',
  adminGroup: 'Admin-Gruppe',
  permissions: 'Berechtigungen',
  defaultArea: 'Standardbereich',
  mode: 'Art',
  intervalValue: 'Intervall',
  intervalUnit: 'Intervall-Einheit',
  assetTypeUuids: 'Typen',
  widthMm: 'Breite (mm)',
  heightMm: 'Höhe (mm)',
  defaultForArea: 'Standard im Bereich',
  elementsJson: 'Layout',
  optionsJson: 'Auswahlwerte',
  url: 'URL',
  ignoreCertificates: 'Zertifikate ignorieren',
  bindDn: 'Bind-DN',
  baseDn: 'Base-DN',
  userSearchBase: 'Benutzer-Suchbasis',
  userFilter: 'Benutzerfilter',
  usernameAttribute: 'Attribut Benutzername',
  displayNameAttribute: 'Attribut Anzeigename',
  emailAttribute: 'Attribut E-Mail',
  groupSearchBase: 'Gruppen-Suchbasis',
  groupFilter: 'Gruppenfilter',
  groupNameAttribute: 'Attribut Gruppenname',
  groupMemberAttribute: 'Attribut Mitglied',
  loginEnabled: 'Anmeldung erlaubt',
  disableMissingUsers: 'Fehlende Benutzer deaktivieren',
  buttonLabel: 'Button-Text',
  issuerUri: 'Issuer-URL',
  clientId: 'Client-ID',
  scopes: 'Scopes',
  usernameClaim: 'Claim Benutzername',
  displayNameClaim: 'Claim Anzeigename',
  emailClaim: 'Claim E-Mail',
  groupsClaim: 'Claim Gruppen',
  autoCreateUsers: 'Benutzer automatisch anlegen',
  syncGroups: 'Gruppen übernehmen',
  crossProviderLogin: 'Anmeldung über andere Anbieter',
  publicUrl: 'Öffentliche URL',
};

/** Enum values that appear as raw values. */
const VALUES: Record<string, string> = {
  true: 'Ja',
  false: 'Nein',
  INVENTORY: 'Inventur',
  CHECK: 'Einzelprüfung',
  DAYS: 'Tage',
  WEEKS: 'Wochen',
  MONTHS: 'Monate',
  YEARS: 'Jahre',
  ADMIN: 'Admin',
  USER: 'Benutzer',
};

const RESOURCES: Record<string, string> = { ASSET: 'Assets', LOCATION: 'Standorte', ASSET_TYPE: 'Typen' };
const RIGHTS: Record<string, string> = {
  ADMIN: 'Admin',
  VIEW: 'Ansehen',
  CREATE: 'Erstellen',
  EDIT: 'Bearbeiten',
  DELETE: 'Löschen',
  INSPECT: 'Prüfen',
};

const SCAN_OUTCOMES: Record<string, string> = {
  CHECKED: 'als da erfasst',
  ALREADY_CHECKED: 'war bereits erfasst',
  UNEXPECTED: 'fremder Gegenstand',
  UNKNOWN: 'unbekannter Code',
  IGNORED: 'ignoriert',
  OPENED: 'geöffnet (war bereits in der Prüfung)',
  ADDED: 'zur Prüfung hinzugefügt',
  ADDED_OTHER_TYPE: 'hinzugefügt, obwohl Typ oder Bereich nicht passen',
};

const RESULTS: Record<string, string> = {
  PRESENT: 'da',
  MISSING: 'fehlt',
  PASSED: 'in Ordnung',
  FAILED: 'Mangel',
  PENDING: 'zurückgesetzt (nicht geprüft)',
};

const CONDITIONS: Record<string, string> = { OK: 'in Ordnung', DEFECT: 'defekt', NONE: 'zurückgesetzt' };

const SIMPLE_EVENTS: Record<string, string> = {
  PASSWORD_CHANGED: 'Passwort geändert',
  BIND_PASSWORD_CHANGED: 'Bind-Passwort geändert',
  CLIENT_SECRET_CHANGED: 'Client-Secret geändert',
};

/** Text lines for one detail of a log entry. */
export function auditDetailLines(detail: AuditDetail): string[] {
  return detail.code ? eventLines(detail.code, detail.params ?? {}) : [changeLine(detail)];
}

function changeLine(detail: AuditDetail): string {
  const label = detail.custom ? detail.field ?? '' : fieldLabel(detail.field);
  if (detail.modified) {
    return label ? `${label}: geändert` : 'Geändert';
  }
  if (detail.added || detail.removed) {
    const parts: string[] = [];
    if (detail.added?.length) {
      parts.push('+ ' + detail.added.map(value).join(', '));
    }
    if (detail.removed?.length) {
      parts.push('− ' + detail.removed.map(value).join(', '));
    }
    return `${label}: ${parts.join('; ')}`;
  }
  return `${label}: ${value(detail.from)} → ${value(detail.to)}`;
}

function eventLines(code: string, params: Record<string, unknown>): string[] {
  const p = (key: string) => (params[key] === undefined || params[key] === null ? '' : String(params[key]));
  const inspection = `Prüfung „${p('inspection')}“`;
  switch (code) {
    case 'SCAN_PAGE':
      return [`Scan-Seite, Code: ${p('code')}`];
    case 'INSPECTION_SCAN':
      return [`${inspection}: ${SCAN_OUTCOMES[p('outcome')] ?? p('outcome')}`];
    case 'INSPECTION_RESULT':
      return [`${inspection}: ${RESULTS[p('status')] ?? p('status')}`];
    case 'INSPECTION_CONDITION':
      return [`${inspection}: Funktion ${CONDITIONS[p('condition')] ?? p('condition')}`];
    case 'INSPECTION_ITEM_ADDED':
      return [`Zur ${inspection} hinzugefügt`];
    case 'PHOTO_ADDED':
      return [p('target') === 'ASSET' ? `Foto in ${inspection} zu den Bildern hinzugefügt` : `Foto im Protokoll der ${inspection}`];
    case 'FIXED_DUE_DATE_SET':
      return [`Prüftermin „${p('inspectionType')}“: fester Termin ${formatDate(p('date'))}`];
    case 'FIXED_DUE_DATE_REMOVED':
      return [`Prüftermin „${p('inspectionType')}“: fester Termin entfernt, das Intervall gilt wieder`];
    case 'INSPECTION_STARTED':
      return startedLines(params, p);
    case 'INSPECTION_COMPLETED': {
      const counts =
        p('mode') === 'CHECK'
          ? `${p('passed')} in Ordnung, ${p('failed')} Mangel, ${p('pending')} nicht geprüft`
          : `${p('present')} da${p('defect') ? ` (davon ${p('defect')} defekt)` : ''}, ${p('missing')} fehlen, ${p('pending')} nicht geprüft, ${p('unexpected')} fremd`;
      return p('comment') ? [counts, `Kommentar: ${p('comment')}`] : [counts];
    }
    case 'INSPECTION_DELETED':
      return params['completed'] ? ['Abgeschlossenes Protokoll gelöscht'] : [];
    case 'OBJECTS_MOVED_TO_DEFAULT_AREA':
      return [`Objekte nur in diesem Bereich wurden nach „${p('defaultArea')}“ verschoben`];
    case 'LDAP_SYNC':
      return params['success']
        ? [
            `Benutzer: ${p('usersCreated')} angelegt, ${p('usersUpdated')} aktualisiert, ${p('usersDisabled')} deaktiviert, ${p('usersSkipped')} übersprungen`,
            `Gruppen: ${p('groupsCreated')} angelegt, ${p('groupsUpdated')} aktualisiert, ${params['groupsDeleted'] ?? 0} geloescht`,
          ]
        : [`Fehler: ${p('error')}`];
    case 'TEXT':
      // entries written before the log was language neutral
      return p('text').split('\n');
    default:
      return [SIMPLE_EVENTS[code] ?? `${code} ${Object.keys(params).length ? JSON.stringify(params) : ''}`.trim()];
  }
}

function startedLines(params: Record<string, unknown>, p: (key: string) => string): string[] {
  const lines = [`${p('inspectionType')} (${VALUES[p('mode')] ?? p('mode')}), ${p('expected')} Assets erwartet`];
  if (params['checkFunction']) {
    lines.push('Mit Funktionsprüfung');
  }
  if (p('location')) {
    lines.push(`Standort: ${p('location')}${params['includeSubLocations'] ? ' (mit Unterstandorten)' : ''}`);
  }
  const list = (key: string, label: string) => {
    const names = params[key];
    if (Array.isArray(names) && names.length) {
      lines.push(`${label}: ${names.join(', ')}`);
    }
  };
  list('tags', 'Tags');
  list('assetTypes', 'Typen');
  list('areas', 'Bereiche');
  if (params['onlyDue']) {
    lines.push('Nur fällige Assets');
  }
  return lines;
}

function fieldLabel(field: string | null | undefined): string {
  return field ? FIELD_LABELS[field] ?? field : '';
}

function value(raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') {
    return '—';
  }
  if (typeof raw === 'object') {
    return permissionText(raw as AuditPermission);
  }
  const text = String(raw);
  return VALUES[text] ?? text;
}

/** "Assets in EDV: Ansehen, Prüfen" */
function permissionText(permission: AuditPermission): string {
  const what = permission.resourceType ? RESOURCES[permission.resourceType] ?? permission.resourceType : 'Alles';
  const where = permission.area ?? 'allen Bereichen';
  const rights = permission.rights?.length ? permission.rights.map((right) => RIGHTS[right] ?? right).join(', ') : 'keine Rechte';
  return `${what} in ${where}: ${rights}`;
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return year && month && day ? `${day}.${month}.${year}` : iso;
}
