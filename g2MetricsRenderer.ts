import { encodePngRGBA } from './pngEncoder';
import type { ActivityType } from './types';

// ── Public icon URLs (served from /Icons/ at runtime) ─────────────────────
const ICON_URLS: Record<ActivityType, string> = {
    ride: '/Icons/bike.png',
    run: '/Icons/run.png',
    walk: '/Icons/walk.png',
};

// ── Canvas dimensions ──────────────────────────────────────────────────────
// Labels-only banner (no icon)
const BANNER_WIDTH = 200; // SDK max supported width
const BANNER_HEIGHT = 24; // Reduced to prevent text overlap (SDK min: 20)

// Standalone icon rendered as its own image container
const ICON_SIZE = 24;

// ── Lazy bitmap cache ──────────────────────────────────────────────────────
const bitmapCache = new Map<string, Promise<ImageBitmap>>();

const loadBitmap = (url: string): Promise<ImageBitmap> => {
    if (!bitmapCache.has(url)) {
        bitmapCache.set(
            url,
            fetch(url)
                .then((r) => {
                    if (!r.ok) throw new Error(`Failed to load icon: ${url}`);
                    return r.blob();
                })
                .then((blob) => createImageBitmap(blob)),
        );
    }
    return bitmapCache.get(url)!;
};

// ── Canvas → grayscale Uint8Array helper ──────────────────────────────────
const canvasToGrayscale = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
): Uint8Array => {
    const rgba = ctx.getImageData(0, 0, width, height).data;
    const gray = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i += 1) {
        const o = i * 4;
        gray[i] = (rgba[o]! * 77 + rgba[o + 1]! * 151 + rgba[o + 2]! * 28) >>> 8;
    }
    return gray;
};

// ── Labels banner (text only, no icon) ────────────────────────────────────
/**
 * Renders a 288×42 PNG with three labels: "Time", "Distance", "Rhythm/Speed"
 * The icon is rendered separately via renderActivityIconPng.
 */
export const renderMetricsBannerPng = async (
    activity: ActivityType,
): Promise<Uint8Array> => {
    const canvas = document.createElement('canvas');
    canvas.width = BANNER_WIDTH;
    canvas.height = BANNER_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, BANNER_WIDTH, BANNER_HEIGHT);

    const midY = BANNER_HEIGHT / 2;
    ctx.fillStyle = '#00ff1544';
    ctx.font = '24px EvenTimeBigPixel_v1.0';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    const velLabel = activity === 'ride' ? 'Speed' : 'Rhythm';

    // Fixed x positions — tightly constrained to stay within 200px width
    ctx.fillText('Time', 0, midY);
    ctx.fillText('Distance', 80, midY);
    ctx.fillText('Pace', 175, midY);

    const gray = canvasToGrayscale(ctx, BANNER_WIDTH, BANNER_HEIGHT);
    return encodePngRGBA(BANNER_WIDTH, BANNER_HEIGHT, gray);
};

// ── Activity icon (separate PNG) ──────────────────────────────────────────
/**
 * Renders a 32×32 PNG of the activity icon (bike / run / walk).
 * Pushed to its own image container so it can be positioned freely.
 */
export const renderActivityIconPng = async (
    activity: ActivityType,
): Promise<Uint8Array> => {
    const canvas = document.createElement('canvas');
    canvas.width = ICON_SIZE;
    canvas.height = ICON_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, ICON_SIZE, ICON_SIZE);

    try {
        const bitmap = await loadBitmap(ICON_URLS[activity]);
        ctx.drawImage(bitmap, 0, 0, ICON_SIZE, ICON_SIZE);
    } catch {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ICON_SIZE / 2, ICON_SIZE / 2, ICON_SIZE / 2 - 4, 0, Math.PI * 2);
        ctx.stroke();
    }

    const gray = canvasToGrayscale(ctx, ICON_SIZE, ICON_SIZE);
    return encodePngRGBA(ICON_SIZE, ICON_SIZE, gray);
};
