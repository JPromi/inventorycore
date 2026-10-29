import {
  LucideLayoutDashboard,
  LucideMail,
  LucideBell,
  LucideScanBarcode,
  LucideBoxes,
  LucideMapPin,
  LucideClipboardCheck,
  LucideSettings,
  LucideTags,
  LucideCircleDot,
  LucideShapes,
  LucideQrCode,
  LucideClipboardList,
  LucideUsers,
  LucideLayers,
  LucidePalette,
  LucideUser,
  LucideShield,
  LucideNetwork,
  LucideKeyRound,
  LucideHistory,
  LucideRuler,
  LucideHardDrive,
  LucideListChecks,
  type LucideIcon,
} from '@lucide/angular';
import { t } from '../../core/i18n/i18n';

export type NavChild = {
  label: string;
  route?: string;
  icon?: LucideIcon;
};

export type NavItem = NavChild & {
  icon?: LucideIcon;
  disabled?: boolean;
  adminOnly?: boolean;
  /** only for users who may maintain the configuration (see PermissionService.canConfigure) */
  configOnly?: boolean;
  children?: NavChild[];
};

export const NOTIFICATION_NAV_ITEM: NavChild = {
  label: t('notifications.title'),
  route: '/notifications',
  icon: LucideBell,
};

export const PRIMARY_NAV_ITEMS: NavItem[] = [
  { label: t('nav.dashboard'), route: '/dashboard', icon: LucideLayoutDashboard },
  { label: t('nav.scan'), route: '/scan', icon: LucideScanBarcode },
  { label: t('nav.assets'), route: '/assets', icon: LucideBoxes },
  { label: t('nav.locations'), route: '/locations', icon: LucideMapPin },
  { label: t('nav.inspections'), route: '/inspections', icon: LucideClipboardCheck },
  { label: t('nav.tasks'), route: '/tasks', icon: LucideListChecks },
  {
    label: t('nav.config'),
    icon: LucideSettings,
    disabled: false,
    configOnly: true,
    children: [
      { label: t('nav.tags'), route: '/config/tags', icon: LucideTags },
      { label: t('nav.statuses'), route: '/config/statuses', icon: LucideCircleDot },
      { label: t('nav.types'), route: '/config/types', icon: LucideShapes },
      { label: t('nav.labels'), route: '/config/labels', icon: LucideQrCode },
      {
        label: t('nav.inspectionTemplates'),
        route: '/config/inspection-templates',
        icon: LucideClipboardList,
      },
    ],
  },
  {
    label: t('nav.administration'),
    icon: LucideUsers,
    disabled: false,
    adminOnly: true,
    children: [
      { label: t('notifications.adminTitle'), route: '/admin/notifications', icon: LucideMail },
      { label: t('nav.areas'), route: '/admin/areas', icon: LucideLayers },
      { label: t('nav.customization'), route: '/admin/customization', icon: LucidePalette },
      { label: t('nav.labelSettings'), route: '/admin/labels', icon: LucideRuler },
      { label: t('nav.users'), route: '/admin/users', icon: LucideUser },
      { label: t('nav.groups'), route: '/admin/groups', icon: LucideUsers },
      { label: t('nav.groupPermissions'), route: '/admin/group-permissions', icon: LucideShield },
      { label: t('nav.ldap'), route: '/admin/ldap', icon: LucideNetwork },
      { label: t('nav.oidc'), route: '/admin/oidc', icon: LucideKeyRound },
      { label: t('nav.storage'), route: '/admin/storage', icon: LucideHardDrive },
      { label: t('nav.logs'), route: '/admin/logs', icon: LucideHistory },
    ],
  },
];
