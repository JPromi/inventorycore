/**
 * Reads barcodes from the camera with zxing-cpp (zxing-wasm), on every platform. Every frame
 * gets one of several passes in turn, so hard codes are found too:
 *
 * - the whole frame, also inverted (light on dark, e.g. lasered into black plastic) and rotated,
 * - the centre with a global threshold (works better than the local one on a small, even area),
 * - the centre enlarged, for small codes with tiny modules,
 * - the centre with stretched contrast and a global threshold, for faint markings.
 *
 * The passes were chosen by trying images of lasered codes (see e2e/laser-datamatrix.spec.ts):
 * enlarging only helps with the local binarizer, the global one suits the cut-out centre.
 *
 * Where the browser has a working BarcodeDetector (Chrome on Android, macOS), it takes every
 * other frame as a quick extra pass. The WebAssembly file is served by the app itself
 * (`/zxing/zxing_reader.wasm`, see angular.json) and only loaded when the camera starts.
 *
 * Supported: QR (also Micro/rMQR), Data Matrix, Aztec, PDF417, Code 128/39/93, EAN-8/13,
 * UPC-A/E, ITF, Codabar.
 */

import type { ReaderOptions } from 'zxing-wasm/reader';

import { t } from '../../core/i18n/i18n';

export interface CameraDevice {
  deviceId: string;
  label: string;
}

/** Formats as named by the BarcodeDetector API. */
const NATIVE_FORMATS = [
  'qr_code',
  'data_matrix',
  'aztec',
  'pdf417',
  'code_128',
  'code_39',
  'code_93',
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'itf',
  'codabar',
];

const WASM_FORMATS: ReaderOptions['formats'] = [
  'QRCode',
  'MicroQRCode',
  'RMQRCode',
  'DataMatrix',
  'Aztec',
  'PDF417',
  'Code128',
  'Code39',
  'Code93',
  'EAN13',
  'EAN8',
  'UPCA',
  'UPCE',
  'ITF',
  'Codabar',
];

const SCAN_INTERVAL_MS = 120;
/** Zoom steps of the zoom button, limited to what the camera can. */
const ZOOM_STEPS = [1, 2, 3, 4];

/** One way of looking at a frame; `share` of the shorter side around the centre, enlarged by `scale`. */
interface FramePass {
  share: number;
  scale: number;
  stretch: boolean;
  binarizer: 'LocalAverage' | 'GlobalHistogram';
}

const FULL: FramePass = { share: 1, scale: 1, stretch: false, binarizer: 'LocalAverage' };
const CENTRE: FramePass = { share: 0.35, scale: 1, stretch: false, binarizer: 'GlobalHistogram' };
const ZOOMED: FramePass = { share: 0.4, scale: 2, stretch: false, binarizer: 'LocalAverage' };
const CONTRAST: FramePass = { share: 0.55, scale: 1, stretch: true, binarizer: 'GlobalHistogram' };

type Pass = FramePass | 'native';

interface NativeDetector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

interface NativeDetectorClass {
  new (options: { formats: string[] }): NativeDetector;
  getSupportedFormats(): Promise<string[]>;
}

type ZxingReader = typeof import('zxing-wasm/reader');

let readerModule: Promise<ZxingReader> | null = null;

/** Loads zxing-wasm once, with the WebAssembly file from the app instead of a CDN. */
function loadReader(): Promise<ZxingReader> {
  readerModule ??= import('zxing-wasm/reader').then((module) => {
    module.prepareZXingModule({
      overrides: {
        locateFile: (path: string, prefix: string) =>
          path.endsWith('.wasm') ? new URL(`zxing/${path}`, document.baseURI).href : prefix + path,
      },
    });
    return module;
  });
  return readerModule;
}

export class CameraScanner {
  private stream: MediaStream | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  private readonly canvas = document.createElement('canvas');
  private passIndex = 0;
  private zoomValue = 1;

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly onCode: (code: string) => void,
  ) {}

  /** Camera access needs https (or localhost) and a browser with getUserMedia. */
  static get available(): boolean {
    return globalThis.isSecureContext === true && !!navigator.mediaDevices?.getUserMedia;
  }

  /** Cameras of the device; labels are only filled after the permission was granted once. */
  static async devices(): Promise<CameraDevice[]> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((device) => device.kind === 'videoinput')
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || t('scan.cameraDevice', { number: index + 1 }),
      }));
  }

  /** Starts the camera (the back camera by default) and scans until {@link stop} is called. */
  async start(deviceId?: string | null): Promise<void> {
    this.stop();
    this.stopped = false;
    this.zoomValue = 1;
    // small markings need pixels: ask for Full HD, the browser gives what the camera has
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        ...(deviceId
          ? { deviceId: { exact: deviceId } }
          : { facingMode: { ideal: 'environment' } }),
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    });
    if (this.stopped) {
      this.releaseStream();
      return;
    }
    await this.keepFocusing();
    this.video.srcObject = this.stream;
    this.video.setAttribute('playsinline', 'true');
    this.video.muted = true;
    await this.video.play();

    const [native] = await Promise.all([this.nativeDetector(), loadReader()]);
    if (!this.stopped) {
      this.scan(native);
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.releaseStream();
    this.video.srcObject = null;
  }

  /** Torch (flash light) where the camera supports it, mostly on Android. */
  get torchSupported(): boolean {
    return !!this.capabilities?.torch;
  }

  async setTorch(on: boolean): Promise<void> {
    await this.track?.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
  }

  /** Zoom steps the camera can do (empty without optical/digital zoom support). */
  get zoomSteps(): number[] {
    const range = this.capabilities?.zoom;
    if (!range || range.max <= range.min) {
      return [];
    }
    const steps = ZOOM_STEPS.filter((step) => step >= range.min && step <= range.max);
    return steps.length > 1 ? steps : [];
  }

  get zoom(): number {
    return this.zoomValue;
  }

  /** Brings small codes closer without moving the phone (where the camera can zoom). */
  async setZoom(value: number): Promise<void> {
    await this.track?.applyConstraints({ advanced: [{ zoom: value } as MediaTrackConstraintSet] });
    this.zoomValue = value;
  }

  /**
   * Photo from the running camera. Uses the full sensor resolution where the browser can
   * (ImageCapture, mostly Chrome on Android), otherwise the current video frame.
   */
  async takePhoto(): Promise<Blob> {
    const track = this.track;
    if (!track) {
      throw new Error('camera not running');
    }
    const ImageCaptureClass = (
      globalThis as unknown as {
        ImageCapture?: new (track: MediaStreamTrack) => { takePhoto(): Promise<Blob> };
      }
    ).ImageCapture;
    if (ImageCaptureClass) {
      try {
        return await new ImageCaptureClass(track).takePhoto();
      } catch {
        // some cameras do not support it: use the video frame
      }
    }
    const canvas = document.createElement('canvas');
    canvas.width = this.video.videoWidth;
    canvas.height = this.video.videoHeight;
    canvas.getContext('2d')?.drawImage(this.video, 0, 0);
    return new Promise((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('no image'))),
        'image/jpeg',
        0.92,
      ),
    );
  }

  /** Id of the camera that is actually in use (after starting with facingMode). */
  get activeDeviceId(): string | null {
    return this.track?.getSettings().deviceId ?? null;
  }

  private get track(): MediaStreamTrack | undefined {
    return this.stream?.getVideoTracks()[0];
  }

  private get capabilities():
    | (MediaTrackCapabilities & {
        torch?: boolean;
        zoom?: { min: number; max: number };
        focusMode?: string[];
      })
    | undefined {
    return this.track?.getCapabilities?.() as never;
  }

  /** Continuous autofocus where the camera offers it; some phones otherwise keep a far focus. */
  private async keepFocusing(): Promise<void> {
    if (!this.capabilities?.focusMode?.includes('continuous')) {
      return;
    }
    try {
      await this.track?.applyConstraints({
        advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
      });
    } catch {
      // the camera keeps its own focus
    }
  }

  private releaseStream(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }

  private async nativeDetector(): Promise<NativeDetector | null> {
    const Detector = (globalThis as unknown as { BarcodeDetector?: NativeDetectorClass })
      .BarcodeDetector;
    if (!Detector) {
      return null;
    }
    try {
      const supported = await Detector.getSupportedFormats();
      const formats = NATIVE_FORMATS.filter((format) => supported.includes(format));
      // some platforms expose the API without any working format
      return formats.length ? new Detector({ formats }) : null;
    } catch {
      return null;
    }
  }

  private scan(native: NativeDetector | null): void {
    const frames = [FULL, CENTRE, ZOOMED, CONTRAST];
    // the native detector (where it exists) is fast: it gets every other frame
    const passes: Pass[] = native ? frames.flatMap((pass) => ['native' as const, pass]) : frames;
    const tick = async () => {
      if (this.stopped) {
        return;
      }
      try {
        if (this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && this.video.videoWidth) {
          const pass = passes[this.passIndex++ % passes.length];
          const code = pass === 'native' ? await this.readNative(native!) : await this.readFrame(pass);
          if (code && !this.stopped) {
            this.onCode(code);
          }
        }
      } catch {
        // a single failed frame is not an error
      }
      if (!this.stopped) {
        this.timer = setTimeout(tick, SCAN_INTERVAL_MS);
      }
    };
    void tick();
  }

  private async readNative(detector: NativeDetector): Promise<string | null> {
    const codes = await detector.detect(this.video);
    return codes[0]?.rawValue || null;
  }

  private async readFrame(pass: FramePass): Promise<string | null> {
    const reader = await loadReader();
    const results = await reader.readBarcodes(this.frame(pass), {
      formats: WASM_FORMATS,
      tryHarder: true,
      // laser markings on dark plastic are light on dark
      tryInvert: true,
      tryRotate: true,
      tryDownscale: pass === FULL,
      binarizer: pass.binarizer,
      maxNumberOfSymbols: 1,
    });
    const result = results.find((entry) => entry.isValid && entry.text);
    return result?.text ?? null;
  }

  /** The whole frame, or a square around its centre (the aiming area), enlarged and stretched as the pass says. */
  private frame(pass: FramePass): ImageData {
    const { videoWidth, videoHeight } = this.video;
    if (pass === FULL) {
      const context = this.context(videoWidth, videoHeight);
      context.drawImage(this.video, 0, 0, videoWidth, videoHeight);
      return context.getImageData(0, 0, videoWidth, videoHeight);
    }
    const side = Math.round(Math.min(videoWidth, videoHeight) * pass.share);
    const size = Math.round(side * pass.scale);
    const context = this.context(size, size);
    context.imageSmoothingEnabled = true;
    context.drawImage(
      this.video,
      (videoWidth - side) / 2,
      (videoHeight - side) / 2,
      side,
      side,
      0,
      0,
      size,
      size,
    );
    const image = context.getImageData(0, 0, size, size);
    if (pass.stretch) {
      stretchContrast(image);
    }
    return image;
  }

  private context(width: number, height: number): CanvasRenderingContext2D {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    return this.canvas.getContext('2d', { willReadFrequently: true })!;
  }
}

/**
 * Grey image whose darkest and brightest 2 % become black and white, so a marking that differs
 * only slightly from its background gets the full contrast.
 */
export function stretchContrast(image: ImageData): void {
  const data = image.data;
  const pixels = data.length / 4;
  const grey = new Uint8ClampedArray(pixels);
  const histogram = new Uint32Array(256);
  for (let index = 0; index < pixels; index++) {
    const offset = index * 4;
    const value = (data[offset] * 77 + data[offset + 1] * 150 + data[offset + 2] * 29) >> 8;
    grey[index] = value;
    histogram[value]++;
  }
  const cut = pixels * 0.02;
  let low = 0;
  for (let sum = 0; low < 255 && sum + histogram[low] <= cut; low++) {
    sum += histogram[low];
  }
  let high = 255;
  for (let sum = 0; high > low && sum + histogram[high] <= cut; high--) {
    sum += histogram[high];
  }
  const range = Math.max(1, high - low);
  for (let index = 0; index < pixels; index++) {
    const value = ((grey[index] - low) * 255) / range;
    const offset = index * 4;
    data[offset] = data[offset + 1] = data[offset + 2] = value;
  }
}
