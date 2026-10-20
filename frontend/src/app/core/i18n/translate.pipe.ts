import { Pipe, PipeTransform } from '@angular/core';

import { I18nParams, t, tn } from './i18n';

/** `{{ 'common.save' | t }}`, `{{ 'assets.count' | t: { count: n } }}` */
@Pipe({ name: 't' })
export class TranslatePipe implements PipeTransform {
  transform(key: string, params?: I18nParams): string {
    return t(key, params);
  }
}

/** Singular/plural: `{{ 'assets.found' | tn: count }}` uses `assets.found.one` / `assets.found.other`. */
@Pipe({ name: 'tn' })
export class TranslateCountPipe implements PipeTransform {
  transform(key: string, count: number, params?: I18nParams): string {
    return tn(key, count, params);
  }
}
