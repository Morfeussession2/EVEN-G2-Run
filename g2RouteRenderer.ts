import { encodePngRGBA } from './pngEncoder';
import type { WorkoutPoint } from './types';

type Point2D = { x: number; y: number };
type Viewport = { left: number; top: number; zoom: number };

const TILE_SIZE = 256;
const MIN_ZOOM = 12;
const MAX_ZOOM = 17;
const VIEWPORT_PADDING = 16;
const OSM_SUBDOMAINS = ['a', 'b', 'c'];
const TILE_CACHE: Map<string, HTMLImageElement> = new Map();

const latLngToWorld = (lat: number, lng: number, zoom: number): Point2D => {
    const scale = TILE_SIZE * (2 ** zoom);
    const x = ((lng + 180) / 360) * scale;

    const sinLat = Math.sin((lat * Math.PI) / 180);
    const y =
        (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;

    return { x, y };
};

const drawRoutePath = (ctx: CanvasRenderingContext2D, points: Point2D[]): void => {
    if (points.length < 2) return;

    ctx.strokeStyle = '#08131d';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
};

const drawMarkers = (
    ctx: CanvasRenderingContext2D,
    points: Point2D[]
): void => {
    const first = points[0];
    const last = points[points.length - 1];

    if (first) {
        ctx.fillStyle = '#cccccc';
        ctx.beginPath();
        ctx.arc(first.x, first.y, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    if (last) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(last.x, last.y, 4, 0, Math.PI * 2);
        ctx.fill();
    }
};

const chooseZoom = (
    points: WorkoutPoint[],
    width: number,
    height: number
): number => {
    if (points.length < 2) return 15;

    for (let zoom = MAX_ZOOM; zoom >= MIN_ZOOM; zoom--) {
        const projected = points.map(p => latLngToWorld(p.lat, p.lng, zoom));

        const xs = projected.map(p => p.x);
        const ys = projected.map(p => p.y);

        const spanX = Math.max(...xs) - Math.min(...xs);
        const spanY = Math.max(...ys) - Math.min(...ys);

        if (
            spanX <= width - VIEWPORT_PADDING * 2 &&
            spanY <= height - VIEWPORT_PADDING * 2
        ) {
            return zoom;
        }
    }

    return MIN_ZOOM;
};

const buildViewport = (
    points: WorkoutPoint[],
    width: number,
    height: number
): Viewport => {
    const zoom = chooseZoom(points, width, height);

    const projected = points.map(p =>
        latLngToWorld(p.lat, p.lng, zoom)
    );

    const xs = projected.map(p => p.x);
    const ys = projected.map(p => p.y);

    const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;

    return {
        left: centerX - width / 2,
        top: centerY - height / 2,
        zoom
    };
};

const getTileUrl = (zoom: number, x: number, y: number): string => {
    const sub = OSM_SUBDOMAINS[Math.abs(x + y) % OSM_SUBDOMAINS.length];
    return `https://${sub}.tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
};

const loadImage = (url: string): Promise<HTMLImageElement> => {
    const cached = TILE_CACHE.get(url);
    if (cached) return Promise.resolve(cached);

    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';

        const timeout = setTimeout(() => {
            reject(new Error(`Tile timeout: ${url}`));
        }, 5000);

        img.onload = () => {
            clearTimeout(timeout);
            TILE_CACHE.set(url, img);
            resolve(img);
        };

        img.onerror = () => {
            clearTimeout(timeout);
            reject(new Error(`Tile error: ${url}`));
        };

        img.src = url;
    });
};

const drawTiles = async (
    ctx: CanvasRenderingContext2D,
    viewport: Viewport,
    width: number,
    height: number
) => {
    const max = 2 ** viewport.zoom;

    const startX = Math.floor(viewport.left / TILE_SIZE);
    const endX = Math.floor((viewport.left + width) / TILE_SIZE);
    const startY = Math.floor(viewport.top / TILE_SIZE);
    const endY = Math.floor((viewport.top + height) / TILE_SIZE);

    const promises: Array<Promise<{ img: HTMLImageElement; x: number; y: number } | null>> = [];

    for (let y = startY; y <= endY; y++) {
        if (y < 0 || y >= max) continue;

        for (let x = startX; x <= endX; x++) {
            const wrappedX = ((x % max) + max) % max;
            const url = getTileUrl(viewport.zoom, wrappedX, y);

            promises.push(
                loadImage(url)
                    .then(img => ({ img, x, y }))
                    .catch(() => null)
            );
        }
    }

    const tiles = await Promise.all(promises);

    for (const tile of tiles) {
        if (!tile) continue;

        const dx = tile.x * TILE_SIZE - viewport.left;
        const dy = tile.y * TILE_SIZE - viewport.top;

        ctx.drawImage(tile.img, dx, dy, TILE_SIZE, TILE_SIZE);
    }
};

const projectRouteToViewport = (
    points: WorkoutPoint[],
    viewport: Viewport
): Point2D[] =>
    points.map(p => {
        const world = latLngToWorld(p.lat, p.lng, viewport.zoom);
        return {
            x: world.x - viewport.left,
            y: world.y - viewport.top
        };
    });

export const renderRoutePreviewPng = async (
    points: WorkoutPoint[],
    width: number,
    height: number
): Promise<Uint8Array> => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');

    try {
        const viewport = buildViewport(points, width, height);

        // ✅ fundo branco igual iframe OSM
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);

        // ✅ desenha tiles SEM qualquer modificação
        await drawTiles(ctx, viewport, width, height);

        const projected = projectRouteToViewport(points, viewport);

        drawRoutePath(ctx, projected);
        drawMarkers(ctx, projected);

    } catch {
        ctx.fillStyle = '#ffffff00';
        ctx.fillRect(0, 0, width, height);
    }

    // ✅ exporta imagem real (igual iframe)
    const imageData = ctx.getImageData(0, 0, width, height);

    return encodePngRGBA(width, height, new Uint8Array(imageData.data));
};