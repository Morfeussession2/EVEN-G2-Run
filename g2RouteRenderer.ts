import { encodePngRGBA } from './pngEncoder';
import type { WorkoutPoint } from './types';

type Point2D = { x: number; y: number };
type Viewport = { left: number; top: number; zoom: number };

const TILE_SIZE = 256;
const MIN_ZOOM = 12;
const MAX_ZOOM = 17;
const VIEWPORT_PADDING = 16;
const CARTO_SUBDOMAINS = ['a', 'b', 'c', 'd'];
const CARTO_STYLE = 'dark_nolabels';
const TILE_CACHE: Map<string, HTMLImageElement> = new Map();

const latLngToWorld = (lat: number, lng: number, zoom: number): Point2D => {
    const scale = TILE_SIZE * (2 ** zoom);
    const x = ((lng + 180) / 360) * scale;
    const sinLat = Math.sin((lat * Math.PI) / 180);
    const y =
        (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
    return { x, y };
};

const normalizePoints = (
    points: WorkoutPoint[],
    width: number,
    height: number,
): Point2D[] => {
    if (points.length === 0) return [];

    let minLat = points[0]!.lat;
    let maxLat = points[0]!.lat;
    let minLng = points[0]!.lng;
    let maxLng = points[0]!.lng;

    for (const point of points) {
        minLat = Math.min(minLat, point.lat);
        maxLat = Math.max(maxLat, point.lat);
        minLng = Math.min(minLng, point.lng);
        maxLng = Math.max(maxLng, point.lng);
    }

    const latSpan = Math.max(0.0002, maxLat - minLat);
    const lngSpan = Math.max(0.0002, maxLng - minLng);
    const drawWidth = width - VIEWPORT_PADDING * 2;
    const drawHeight = height - VIEWPORT_PADDING * 2;
    const scale = Math.min(drawWidth / lngSpan, drawHeight / latSpan);
    const usedWidth = lngSpan * scale;
    const usedHeight = latSpan * scale;
    const offsetX = (width - usedWidth) / 2;
    const offsetY = (height - usedHeight) / 2;

    return points.map((point) => ({
        x: offsetX + (point.lng - minLng) * scale,
        y: offsetY + (maxLat - point.lat) * scale,
    }));
};

const drawRoutePath = (ctx: CanvasRenderingContext2D, points: Point2D[]): void => {
    if (points.length < 2) return;

    // Traço preto externo (sombra)
    ctx.strokeStyle = '#08131d';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0]!.x, points[0]!.y);
    for (let index = 1; index < points.length; index += 1) {
        ctx.lineTo(points[index]!.x, points[index]!.y);
    }
    ctx.stroke();

    // Traço branco/claro interno (destaque)
    ctx.strokeStyle = '#eff8ff';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(points[0]!.x, points[0]!.y);
    for (let index = 1; index < points.length; index += 1) {
        ctx.lineTo(points[index]!.x, points[index]!.y);
    }
    ctx.stroke();
};

const drawMarkers = (
    ctx: CanvasRenderingContext2D,
    points: Point2D[],
    width: number,
    height: number,
): void => {
    const first = points[0];
    const last = points[points.length - 1];

    if (first) {
        ctx.fillStyle = '#bac7d1';
        ctx.beginPath();
        ctx.arc(first.x, first.y, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    if (last) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(last.x, last.y - 5);
        ctx.lineTo(last.x + 5, last.y);
        ctx.lineTo(last.x, last.y + 5);
        ctx.lineTo(last.x - 5, last.y);
        ctx.closePath();
        ctx.fill();
        return;
    }

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(width / 2 - 8, height / 2);
    ctx.lineTo(width / 2 + 8, height / 2);
    ctx.moveTo(width / 2, height / 2 - 8);
    ctx.lineTo(width / 2, height / 2 + 8);
    ctx.stroke();
};

const paintFallback = (
    ctx: CanvasRenderingContext2D,
    points: WorkoutPoint[],
    width: number,
    height: number,
): void => {
    ctx.fillStyle = '#02070d';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#27475f';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
    ctx.strokeStyle = '#173042';
    ctx.beginPath();
    ctx.moveTo(width / 2, 6);
    ctx.lineTo(width / 2, height - 6);
    ctx.moveTo(6, height / 2);
    ctx.lineTo(width - 6, height / 2);
    ctx.stroke();

    const projected = normalizePoints(points, width, height);
    drawRoutePath(ctx, projected);
    drawMarkers(ctx, projected, width, height);
};

const chooseZoom = (
    points: WorkoutPoint[],
    width: number,
    height: number,
): number => {
    if (points.length < 2) return 15;

    for (let zoom = MAX_ZOOM; zoom >= MIN_ZOOM; zoom -= 1) {
        const projected = points.map((point) => latLngToWorld(point.lat, point.lng, zoom));
        const xs = projected.map((point) => point.x);
        const ys = projected.map((point) => point.y);
        const spanX = Math.max(...xs) - Math.min(...xs);
        const spanY = Math.max(...ys) - Math.min(...ys);
        if (spanX <= width - VIEWPORT_PADDING * 2 && spanY <= height - VIEWPORT_PADDING * 2) {
            return zoom;
        }
    }

    return MIN_ZOOM;
};

const buildViewport = (
    points: WorkoutPoint[],
    width: number,
    height: number,
): Viewport => {
    const zoom = chooseZoom(points, width, height);
    const projected = points.map((point) => latLngToWorld(point.lat, point.lng, zoom));
    const xs = projected.map((point) => point.x);
    const ys = projected.map((point) => point.y);
    const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;

    return {
        left: centerX - width / 2,
        top: centerY - height / 2,
        zoom,
    };
};

const getTileUrl = (zoom: number, x: number, y: number): string => {
    const subdomain = CARTO_SUBDOMAINS[Math.abs(x + y) % CARTO_SUBDOMAINS.length];
    return `https://${subdomain}.basemaps.cartocdn.com/${CARTO_STYLE}/${zoom}/${x}/${y}.png`;
};

const loadImage = (url: string): Promise<HTMLImageElement> => {
    const cached = TILE_CACHE.get(url);
    if (cached) return Promise.resolve(cached);

    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            TILE_CACHE.set(url, img);
            resolve(img);
        };
        img.onerror = () => reject(new Error(`Failed to load tile: ${url}`));
        img.src = url;
    });
};

const drawTiles = async (
    ctx: CanvasRenderingContext2D,
    viewport: Viewport,
    width: number,
    height: number,
): Promise<void> => {
    const maxTileIndex = 2 ** viewport.zoom;
    const startTileX = Math.floor(viewport.left / TILE_SIZE);
    const endTileX = Math.floor((viewport.left + width) / TILE_SIZE);
    const startTileY = Math.floor(viewport.top / TILE_SIZE);
    const endTileY = Math.floor((viewport.top + height) / TILE_SIZE);

    const tileLoads: Array<Promise<{ img: HTMLImageElement; x: number; y: number }>> = [];

    for (let tileY = startTileY; tileY <= endTileY; tileY += 1) {
        if (tileY < 0 || tileY >= maxTileIndex) continue;
        for (let tileX = startTileX; tileX <= endTileX; tileX += 1) {
            const wrappedTileX = ((tileX % maxTileIndex) + maxTileIndex) % maxTileIndex;
            const url = getTileUrl(viewport.zoom, wrappedTileX, tileY);
            tileLoads.push(loadImage(url).then((img) => ({ img, x: tileX, y: tileY })));
        }
    }

    const tiles = await Promise.all(tileLoads);
    for (const tile of tiles) {
        const drawX = tile.x * TILE_SIZE - viewport.left;
        const drawY = tile.y * TILE_SIZE - viewport.top;
        ctx.drawImage(tile.img, drawX, drawY, TILE_SIZE, TILE_SIZE);
    }
};

const projectRouteToViewport = (
    points: WorkoutPoint[],
    viewport: Viewport,
): Point2D[] =>
    points.map((point) => {
        const world = latLngToWorld(point.lat, point.lng, viewport.zoom);
        return {
            x: world.x - viewport.left,
            y: world.y - viewport.top,
        };
    });

export const renderRoutePreviewPng = async (
    points: WorkoutPoint[],
    width: number,
    height: number,
): Promise<Uint8Array> => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');

    try {
        if (points.length < 2) {
            paintFallback(ctx, points, width, height);
        } else {
            const viewport = buildViewport(points, width, height);
            ctx.fillStyle = '#050a10';
            ctx.fillRect(0, 0, width, height);
            await drawTiles(ctx, viewport, width, height);

            ctx.fillStyle = 'rgba(1, 6, 12, 0.18)';
            ctx.fillRect(0, 0, width, height);
            ctx.strokeStyle = '#9fb3c2';
            ctx.lineWidth = 1;
            ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

            const projected = projectRouteToViewport(points, viewport);
            drawRoutePath(ctx, projected);
            drawMarkers(ctx, projected, width, height);
        }
    } catch {
        paintFallback(ctx, points, width, height);
    }

    const rgba = ctx.getImageData(0, 0, width, height).data;
    const gray = new Uint8Array(width * height);
    for (let index = 0; index < gray.length; index += 1) {
        const offset = index * 4;
        gray[index] = (rgba[offset] * 77 + rgba[offset + 1] * 151 + rgba[offset + 2] * 28) >>> 8;
    }

    return encodePngRGBA(width, height, gray);
};