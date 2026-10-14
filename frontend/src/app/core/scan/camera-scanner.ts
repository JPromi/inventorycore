/**
 * Reads barcodes from the camera. Uses the browser's built-in BarcodeDetector where it exists
 * (Chrome on Android, macOS, ChromeOS) and falls back to ZXing everywhere else (Windows, Firefox,
 * Safari). ZXing is only loaded when it is needed.
 *
 * Supported: QR, DataMatrix, Aztec, PDF417, Code 128/39/93, EAN-8/13, UPC-A/E, ITF, Codabar.
 */

export interface CameraDevice {
  deviceId: string;
  label: string;
}

/** Formats as named by the BarcodeDetector API. */
const NATIVE_FORMATS = [
  'qr_code', 'data_matrix', 'aztec', 'pdf417', 'code_128', 'code_39', 'code_93',
  'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'codabar',
];

const SCAN_INTERVAL_MS = 150;

interface NativeDetector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

interface NativeDetectorClass {
  new (options: { formats: string[] }): NativeDetector;
  getSupportedFormats(): Promise<string[]>;
}

export class CameraScanner {
  private stream: MediaStream | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private zxingControls: { stop(): void } | null = null;
  private stopped = true;

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
      .map((device, index) => ({ deviceId: device.deviceId, label: device.label || `Kamera ${index + 1}` }));
  }

  /** Starts the camera (the back camera by default) and scans until {@link stop} is called. */
  async start(deviceId?: string | null): Promise<void> {
    this.stop();
    this.stopped = false;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } }),
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
    if (this.stopped) {
      this.releaseStream();
      return;
    }
    this.video.srcObject = this.stream;
    this.video.setAttribute('playsinline', 'true');
    this.video.muted = true;
    await this.video.play();

    const native = await this.nativeDetector();
    if (native) {
      this.scanNative(native);
    } else {
      await this.scanZxing();
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.zxingControls?.stop();
    this.zxingControls = null;
    this.releaseStream();
    this.video.srcObject = null;
  }

  /** Torch (flash light) where the camera supports it, mostly on Android. */
  get torchSupported(): boolean {
    const track = this.stream?.getVideoTracks()[0];
    const capabilities = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
    return !!capabilities?.torch;
  }

  async setTorch(on: boolean): Promise<void> {
    const track = this.stream?.getVideoTracks()[0];
    await track?.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
  }

  /** Id of the camera that is actually in use (after starting with facingMode). */
  get activeDeviceId(): string | null {
    return this.stream?.getVideoTracks()[0]?.getSettings().deviceId ?? null;
  }

  private releaseStream(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }

  private async nativeDetector(): Promise<NativeDetector | null> {
    const Detector = (globalThis as unknown as { BarcodeDetector?: NativeDetectorClass }).BarcodeDetector;
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

  private scanNative(detector: NativeDetector): void {
    const tick = async () => {
      if (this.stopped) {
        return;
      }
      try {
        if (this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          const codes = await detector.detect(this.video);
          if (codes[0]?.rawValue && !this.stopped) {
            this.onCode(codes[0].rawValue);
          }
        }
      } catch {
        // a single failed frame is not an error
      }
      if (!this.stopped) {
        this.timer = setTimeout(tick, SCAN_INTERVAL_MS);
      }
    };
    tick();
  }

  private async scanZxing(): Promise<void> {
    const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
      import('@zxing/browser'),
      import('@zxing/library'),
    ]);
    if (this.stopped || !this.stream) {
      return;
    }
    const hints = new Map<number, unknown>([
      [
        DecodeHintType.POSSIBLE_FORMATS,
        [
          BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX, BarcodeFormat.AZTEC, BarcodeFormat.PDF_417,
          BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.CODE_93, BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.ITF, BarcodeFormat.CODABAR,
        ],
      ],
      [DecodeHintType.TRY_HARDER, true],
    ]);
    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: SCAN_INTERVAL_MS });
    this.zxingControls = await reader.decodeFromStream(this.stream, this.video, (result) => {
      if (result && !this.stopped) {
        this.onCode(result.getText());
      }
    });
  }
}
