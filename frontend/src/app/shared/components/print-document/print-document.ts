import { DOCUMENT } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  Inject,
  Input,
  OnDestroy,
  ViewChild,
  ViewEncapsulation,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucidePrinter, LucideX } from '@lucide/angular';

import { t } from '../../../core/i18n/i18n';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { CustomizationService } from '../../../core/service/customization.service';
import { SearchSelect, SelectOption } from '../search-select/search-select';

/** One "label: value" entry in the document header (who, when, what). */
export interface PrintMeta {
  label: string;
  value: string | null | undefined;
}

export type PaperSize = 'A4' | 'A3' | 'A5' | 'letter';
export type PaperOrientation = 'portrait' | 'landscape';
export type PaperMargin = 'normal' | 'narrow';

export interface PrintSettings {
  size: PaperSize;
  orientation: PaperOrientation;
  margin: PaperMargin;
  signatures: boolean;
}

const STORAGE_KEY = 'inventorycore.print-settings';
const DEFAULT_SETTINGS: PrintSettings = {
  size: 'A4',
  orientation: 'portrait',
  margin: 'normal',
  signatures: true,
};
/** width × height in mm (portrait) */
const PAPER: Record<PaperSize, [number, number]> = {
  A4: [210, 297],
  A3: [297, 420],
  A5: [148, 210],
  letter: [215.9, 279.4],
};
/** top right bottom left in mm; page header and footer sit inside */
const MARGINS: Record<PaperMargin, [number, number, number, number]> = {
  normal: [12, 15, 10, 15],
  narrow: [7, 8, 6, 8],
};
const PAGE_STYLE_ID = 'print-document-page';
const ACTIVE_CLASS = 'printing-document';
const HEADING = /^H[1-6]$/;
/** containers that may continue on the next page; everything else moves as a whole */
const SPLITTABLE = new Set(['DIV', 'SECTION', 'ARTICLE', 'MAIN', 'UL', 'OL', 'TABLE', 'TBODY']);

/**
 * Printable document with a shared layout: logo, document kind, big title, meta data,
 * optional signature lines, and a page header/footer with page numbers.
 * The body is projected, so every page decides its own content:
 *
 * <app-print-document #doc kind="Prüfbericht" [title]="..." [meta]="...">
 *   <label printOptions class="toggle">...</label>   <!-- extra settings in the dialog -->
 *   ...content...
 * </app-print-document>
 *
 * `doc.open()` shows the print settings, the browser's print dialog follows.
 *
 * The pages are laid out here instead of relying on `@page` margins: browsers let the user
 * override those ("Ränder: Keine"), which removed the margins and page numbers. The content
 * is copied page by page into sheets of the paper size; tables continue with their header,
 * headings move along with what follows, `break-inside: avoid` blocks stay together.
 */
@Component({
  selector: 'app-print-document',
  imports: [FormsModule, SearchSelect, TranslatePipe, LucidePrinter, LucideX],
  templateUrl: './print-document.html',
  styleUrl: './print-document.scss',
  // the pages are built in code; all selectors are scoped by .print-document / .print-settings
  encapsulation: ViewEncapsulation.None,
})
export class PrintDocument implements AfterViewInit, OnDestroy {
  @Input({ required: true }) title = '';
  /** Kind of document, e.g. "Prüfbericht"; shown above the title and in the page header. */
  @Input() kind = '';
  @Input() meta: PrintMeta[] = [];
  /** Captions for signature lines at the end, e.g. ['Geprüft von', 'Verantwortlich']. */
  @Input() signatures: string[] = [];

  @ViewChild('sheet', { static: true }) private sheet!: ElementRef<HTMLElement>;
  @ViewChild('source', { static: true }) private source!: ElementRef<HTMLElement>;
  @ViewChild('pages', { static: true }) private pages!: ElementRef<HTMLElement>;

  protected settings: PrintSettings = { ...DEFAULT_SETTINGS };
  protected dialogOpen = false;
  protected preparing = false;
  protected readonly sizes: SelectOption[] = [
    { value: 'A4', label: 'A4', hint: '210 × 297 mm' },
    { value: 'A3', label: 'A3', hint: '297 × 420 mm' },
    { value: 'A5', label: 'A5', hint: '148 × 210 mm' },
    { value: 'letter', label: t('components.printDocument.sizes.letter'), hint: '216 × 279 mm' },
  ];
  protected readonly orientations: SelectOption[] = [
    { value: 'portrait', label: t('components.printDocument.orientations.portrait') },
    { value: 'landscape', label: t('components.printDocument.orientations.landscape') },
  ];
  protected readonly margins: SelectOption[] = [
    { value: 'normal', label: t('components.printDocument.marginOptions.normal'), hint: '15 mm' },
    { value: 'narrow', label: t('components.printDocument.marginOptions.narrow'), hint: '8 mm' },
  ];

  constructor(
    @Inject(DOCUMENT) private readonly document: Document,
    protected readonly customization: CustomizationService,
  ) {
    try {
      this.settings = {
        ...DEFAULT_SETTINGS,
        ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'),
      };
    } catch {
      // storage blocked: defaults
    }
  }

  /** The sheet lives directly in <body>, so printing can hide the whole app around it. */
  ngAfterViewInit(): void {
    this.document.body.appendChild(this.sheet.nativeElement);
  }

  ngOnDestroy(): void {
    this.cleanup();
    this.sheet.nativeElement.remove();
  }

  protected get visibleMeta(): PrintMeta[] {
    return this.meta.filter((entry) => entry.value);
  }

  open(): void {
    this.dialogOpen = true;
  }

  protected close(): void {
    this.dialogOpen = false;
  }

  /** Escape in an open dropdown only closes the dropdown (it prevents the default). */
  @HostListener('document:keydown.escape', ['$event'])
  protected onEscape(event: Event): void {
    if (!event.defaultPrevented) {
      this.close();
    }
  }

  protected async print(): Promise<void> {
    if (this.preparing) {
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // only a convenience
    }
    this.preparing = true;
    const sheet = this.sheet.nativeElement;
    const [width, height] = this.paperSize();
    // logo and photos must be loaded, otherwise they have no height while measuring
    await this.imagesLoaded(this.source.nativeElement);
    sheet.classList.add('paginating');
    this.paginate(width, height);
    await this.imagesLoaded(this.pages.nativeElement);
    sheet.classList.remove('paginating');
    sheet.classList.add('active');
    this.document.body.classList.add(ACTIVE_CLASS);
    const style = this.document.createElement('style');
    style.id = PAGE_STYLE_ID;
    style.textContent = `@page { size: ${width}mm ${height}mm; margin: 0; }`;
    this.document.head.appendChild(style);
    const title = this.document.title;
    // used by "Als PDF speichern" as file name
    this.document.title = [this.kind, this.title].filter(Boolean).join(' – ');
    this.dialogOpen = false;
    this.preparing = false;
    window.addEventListener(
      'afterprint',
      () => {
        this.document.title = title;
        this.cleanup();
      },
      { once: true },
    );
    window.print();
  }

  private paperSize(): [number, number] {
    const [width, height] = PAPER[this.settings.size];
    return this.settings.orientation === 'landscape' ? [height, width] : [width, height];
  }

  /** Copies the source content into page sheets, breaking where a page is full. */
  private paginate(width: number, height: number): void {
    const target = this.pages.nativeElement;
    target.replaceChildren();
    const printedAt = new Date().toLocaleString('de-AT', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    const footers: HTMLElement[] = [];
    let content!: HTMLElement;
    let placedOnPage = 0;
    /** source containers being split, with their copy on the current page (outermost first) */
    const open: { source: Element; copy: Element }[] = [];
    const container = (level: number): Element => (level >= 0 ? open[level].copy : content);
    const fits = () => content.scrollHeight <= content.clientHeight + 1;

    const newPage = () => {
      const page = this.element('div', 'print-page');
      Object.assign(page.style, {
        width: `${width}mm`,
        // a hair smaller than the paper, so rounding never pushes out an empty page
        height: `${height - 0.5}mm`,
        padding: MARGINS[this.settings.margin].map((mm) => `${mm}mm`).join(' '),
      });
      if (footers.length) {
        page.append(
          this.element('div', 'print-page-header', [
            this.customization.brandName,
            [this.kind, this.title].filter(Boolean).join(' · '),
          ]),
        );
      }
      content = this.element('div', 'print-page-content');
      const footer = this.element('div', 'print-page-footer', [
        t('components.printDocument.printedAt', { date: printedAt }),
        '',
      ]);
      footers.push(footer);
      page.append(content, footer);
      target.append(page);
      placedOnPage = 0;
    };

    /** Shallow copy of a container; tables take their header along. */
    const shell = (source: Element): Element => {
      const copy = source.cloneNode(false) as Element;
      const head = source instanceof HTMLTableElement ? source.tHead : null;
      if (head) copy.append(head.cloneNode(true));
      return copy;
    };

    const hasContent = (element: Element) =>
      Array.from(element.childNodes).some((node) =>
        node instanceof Element
          ? !HEADING.test(node.tagName) && node.tagName !== 'THEAD'
          : node.nodeType === Node.TEXT_NODE && !!node.textContent?.trim(),
      );

    const breakPage = () => {
      // headings at the end of the page and containers without content yet move to the next page
      const carried = new Map<number, Element>();
      for (let level = open.length - 1; ; level--) {
        const current = container(level);
        const last = current.lastElementChild;
        if (last && HEADING.test(last.tagName)) {
          last.remove();
          carried.set(level, last);
        }
        if (level < 0 || hasContent(current)) break;
        current.remove();
      }
      newPage();
      let parent: Element = content;
      const heading = carried.get(-1);
      if (heading) parent.append(heading);
      open.forEach((level, index) => {
        level.copy = shell(level.source);
        parent.append(level.copy);
        const carriedHeading = carried.get(index);
        if (carriedHeading) level.copy.append(carriedHeading);
        parent = level.copy;
      });
    };

    const splittable = (node: Node): node is Element =>
      node instanceof Element &&
      SPLITTABLE.has(node.tagName) &&
      node.childElementCount > 0 &&
      getComputedStyle(node).breakInside !== 'avoid';

    const place = (node: Node): void => {
      if (node.nodeType === Node.COMMENT_NODE) return;
      const parent = container(open.length - 1);
      const copy = node.cloneNode(true);
      parent.append(copy);
      if (fits()) {
        placedOnPage++;
        return;
      }
      parent.removeChild(copy);
      if (splittable(node)) {
        const split = shell(node);
        parent.append(split);
        open.push({ source: node, copy: split });
        // the table header is already in the shell
        Array.from(node.childNodes)
          .filter((child) => child.nodeName !== 'THEAD')
          .forEach(place);
        open.pop();
        return;
      }
      if (!placedOnPage) {
        // larger than a whole page: print what fits rather than looping forever
        parent.append(copy);
        placedOnPage++;
        return;
      }
      breakPage();
      container(open.length - 1).append(copy);
      placedOnPage++;
    };

    newPage();
    Array.from(this.source.nativeElement.childNodes).forEach(place);
    footers.forEach(
      (footer, index) =>
        (footer.lastElementChild!.textContent = t('components.printDocument.pageOf', {
          page: index + 1,
          pages: footers.length,
        })),
    );
  }

  private element(tag: string, className: string, texts: string[] = []): HTMLElement {
    const element = this.document.createElement(tag);
    element.className = className;
    for (const text of texts) {
      const span = this.document.createElement('span');
      span.textContent = text;
      element.append(span);
    }
    return element;
  }

  private imagesLoaded(root: HTMLElement): Promise<unknown> {
    return Promise.all(
      Array.from(root.querySelectorAll('img')).map((image) =>
        image.decode().catch(() => undefined),
      ),
    );
  }

  private cleanup(): void {
    this.sheet.nativeElement.classList.remove('active', 'paginating');
    this.pages.nativeElement.replaceChildren();
    this.document.body.classList.remove(ACTIVE_CLASS);
    this.document.getElementById(PAGE_STYLE_ID)?.remove();
  }
}
