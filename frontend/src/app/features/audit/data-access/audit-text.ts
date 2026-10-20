import { hasText, t, tn } from '../../../core/i18n/i18n';
import { LOCATION_TYPES } from '../../../shared/util/location-types';
import { describeUserAgent } from '../../../shared/util/user-agent';
import { AuditDetail, AuditPermission } from './audit.service';

/*
 * Texts for the activity log. The server stores only field keys, raw values and event codes, so
 * the log is shown in the language of the user interface (texts under `audit.*`).
 */

/** Enum values that appear as raw values. */
const VALUES: Record<string, string> = {
  ...Object.fromEntries(
    [
      'true',
      'false',
      'INVENTORY',
      'CHECK',
      'DAYS',
      'WEEKS',
      'MONTHS',
      'YEARS',
      'ADMIN',
      'USER',
    ].map((key) => [key, t(`audit.values.${key}`)]),
  ),
  ...Object.fromEntries(LOCATION_TYPES.map((type) => [type.value, type.label])),
};

const RESOURCES: Record<string, string> = {
  ASSET: t('terms.assets'),
  LOCATION: t('terms.locations'),
  ASSET_TYPE: t('terms.assetTypes'),
};
const RIGHTS: Record<string, string> = {
  ADMIN: t('services.permissions.flags.admin'),
  VIEW: t('services.permissions.flags.canView'),
  CREATE: t('services.permissions.flags.canCreate'),
  EDIT: t('services.permissions.flags.canEdit'),
  DELETE: t('services.permissions.flags.canDelete'),
  INSPECT: t('services.permissions.flags.canInspect'),
};

const SIMPLE_EVENTS = ['PASSWORD_CHANGED', 'BIND_PASSWORD_CHANGED', 'CLIENT_SECRET_CHANGED'];

/** Text lines for one detail of a log entry. */
export function auditDetailLines(detail: AuditDetail): string[] {
  return detail.code ? eventLines(detail.code, detail.params ?? {}) : [changeLine(detail)];
}

function changeLine(detail: AuditDetail): string {
  const field = detail.custom ? (detail.field ?? '') : fieldLabel(detail.field);
  if (detail.modified) {
    return field ? t('audit.change.fieldModified', { field }) : t('audit.change.modified');
  }
  if (detail.added || detail.removed) {
    const parts: string[] = [];
    if (detail.added?.length) {
      parts.push(t('audit.change.added', { values: detail.added.map(value).join(', ') }));
    }
    if (detail.removed?.length) {
      parts.push(t('audit.change.removed', { values: detail.removed.map(value).join(', ') }));
    }
    return t('audit.change.list', { field, changes: parts.join('; ') });
  }
  return t('audit.change.value', { field, from: value(detail.from), to: value(detail.to) });
}

/** Text of an enum value under `prefix`, or the value itself if there is none. */
function enumText(prefix: string, raw: string): string {
  return raw && hasText(`${prefix}.${raw}`) ? t(`${prefix}.${raw}`) : raw;
}

function eventLines(code: string, params: Record<string, unknown>): string[] {
  const p = (key: string) =>
    params[key] === undefined || params[key] === null ? '' : String(params[key]);
  const inspection = p('inspection');
  switch (code) {
    case 'SCAN_PAGE':
      return [t('audit.events.scanPage', { code: p('code') })];
    case 'INSPECTION_SCAN':
      return [
        t('audit.events.inspectionScan', {
          inspection,
          outcome: enumText('audit.scanOutcomes', p('outcome')),
        }),
      ];
    case 'INSPECTION_RESULT':
      return [
        t('audit.events.inspectionResult', {
          inspection,
          result: enumText('audit.results', p('status')),
        }),
      ];
    case 'INSPECTION_CONDITION':
      return [
        t('audit.events.inspectionCondition', {
          inspection,
          condition: enumText('audit.conditions', p('condition')),
        }),
      ];
    case 'INSPECTION_ITEM_ADDED':
      return [t('audit.events.itemAdded', { inspection })];
    case 'PHOTO_ADDED':
      return [
        t(p('target') === 'ASSET' ? 'audit.events.photoToAsset' : 'audit.events.photoToProtocol', {
          inspection,
        }),
      ];
    case 'FIXED_DUE_DATE_SET':
      return [
        t('audit.events.fixedDueDateSet', {
          inspectionType: p('inspectionType'),
          date: formatDate(p('date')),
        }),
      ];
    case 'FIXED_DUE_DATE_REMOVED':
      return [t('audit.events.fixedDueDateRemoved', { inspectionType: p('inspectionType') })];
    case 'INSPECTION_STARTED':
      return startedLines(params, p);
    case 'INSPECTION_COMPLETED': {
      const counts =
        p('mode') === 'CHECK'
          ? t('audit.events.completedCheck', {
              passed: p('passed'),
              failed: p('failed'),
              pending: p('pending'),
            })
          : t(
              p('defect')
                ? 'audit.events.completedInventoryDefect'
                : 'audit.events.completedInventory',
              {
                present: p('present'),
                defect: p('defect'),
                missing: p('missing'),
                pending: p('pending'),
                unexpected: p('unexpected'),
              },
            );
      return p('comment')
        ? [counts, t('audit.events.comment', { comment: p('comment') })]
        : [counts];
    }
    case 'INSPECTION_DELETED':
      return params['completed'] ? [t('audit.events.completedProtocolDeleted')] : [];
    case 'OBJECTS_MOVED_TO_DEFAULT_AREA':
      return [t('audit.events.objectsMovedToDefaultArea', { defaultArea: p('defaultArea') })];
    case 'LDAP_SYNC':
      return params['success']
        ? [
            t('audit.events.ldapUsers', {
              created: p('usersCreated'),
              updated: p('usersUpdated'),
              disabled: p('usersDisabled'),
              skipped: p('usersSkipped'),
            }),
            t('audit.events.ldapGroups', {
              created: p('groupsCreated'),
              updated: p('groupsUpdated'),
              deleted: p('groupsDeleted') || 0,
            }),
          ]
        : [t('audit.events.error', { error: p('error') })];
    case 'SIGN_IN':
    case 'SIGN_IN_FAILED':
    case 'SIGN_OUT':
      return signInLines(code, params);
    case 'TEXT':
      // entries written before the log was language neutral
      return p('text').split('\n');
    default:
      return [
        SIMPLE_EVENTS.includes(code)
          ? t(`audit.events.${code}`)
          : `${code} ${Object.keys(params).length ? JSON.stringify(params) : ''}`.trim(),
      ];
  }
}

function startedLines(params: Record<string, unknown>, p: (key: string) => string): string[] {
  const lines = [
    tn('audit.started.summary', Number(p('expected')) || 0, {
      inspectionType: p('inspectionType'),
      mode: VALUES[p('mode')] ?? p('mode'),
    }),
  ];
  if (params['checkFunction']) {
    lines.push(t('audit.started.checkFunction'));
  }
  if (p('location')) {
    lines.push(
      t(
        params['includeSubLocations']
          ? 'audit.started.locationWithSubLocations'
          : 'audit.started.location',
        { location: p('location') },
      ),
    );
  }
  const list = (key: string, textKey: string) => {
    const names = params[key];
    if (Array.isArray(names) && names.length) {
      lines.push(t(textKey, { names: names.join(', ') }));
    }
  };
  list('tags', 'audit.started.tags');
  list('assetTypes', 'audit.started.assetTypes');
  list('areas', 'audit.started.areas');
  if (params['onlyDue']) {
    lines.push(t('audit.started.onlyDue'));
  }
  return lines;
}

function fieldLabel(field: string | null | undefined): string {
  return field ? enumText('audit.fields', field) : '';
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

/** "Assets in Feuerwehrhaus Nord: Ansehen, Prüfen" */
function permissionText(permission: AuditPermission): string {
  const what = permission.resourceType
    ? (RESOURCES[permission.resourceType] ?? permission.resourceType)
    : t('audit.permission.everything');
  const where = permission.area ?? t('audit.permission.allAreas');
  const rights = permission.rights?.length
    ? permission.rights.map((right) => RIGHTS[right] ?? right).join(', ')
    : t('audit.permission.noRights');
  return t('audit.permission.text', { what, where, rights });
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return year && month && day ? `${day}.${month}.${year}` : iso;
}

/** How someone signed in (or tried to), from where and with which browser. */
export function signInLines(code: string, params: Record<string, unknown>): string[] {
  const text = (key: string) => (params[key] == null ? '' : String(params[key]));
  const lines: string[] = [];
  if (code === 'SIGN_IN_FAILED') {
    lines.push(signInReason(text('reason')));
  }
  if (params['method']) {
    lines.push(t('audit.signIn.method', { method: signInMethod(text('method')) }));
  }
  if (params['ip']) {
    lines.push(t('audit.signIn.ip', { ip: text('ip') }));
  }
  if (params['userAgent']) {
    lines.push(t('audit.signIn.device', { device: describeUserAgent(text('userAgent')) ?? text('userAgent') }));
  }
  return lines;
}

export function signInMethod(method: string): string {
  switch (method) {
    case 'LOCAL':
      return t('audit.signIn.methods.LOCAL');
    case 'LDAP':
      return t('audit.signIn.methods.LDAP');
    case 'OIDC':
      return t('audit.signIn.methods.OIDC');
    default:
      return method;
  }
}

/** Reasons from the password sign-in; OIDC rejections use the codes of the login page. */
export function signInReason(reason: string): string {
  switch (reason) {
    case 'BAD_CREDENTIALS':
      return t('audit.signIn.reasons.BAD_CREDENTIALS');
    case 'DISABLED':
      return t('audit.signIn.reasons.DISABLED');
    case 'LOCKED':
      return t('audit.signIn.reasons.LOCKED');
    case 'OIDC_LOCAL_USER':
      return t('audit.signIn.reasons.OIDC_LOCAL_USER');
    case 'OIDC_UNKNOWN_USER':
      return t('audit.signIn.reasons.OIDC_UNKNOWN_USER');
    case 'OIDC_PROVIDER_MISMATCH':
      return t('audit.signIn.reasons.OIDC_PROVIDER_MISMATCH');
    case 'OIDC_DISABLED_USER':
      return t('audit.signIn.reasons.OIDC_DISABLED_USER');
    case 'OIDC_NO_USERNAME':
      return t('audit.signIn.reasons.OIDC_NO_USERNAME');
    default:
      return t('audit.signIn.reasons.ERROR');
  }
}
