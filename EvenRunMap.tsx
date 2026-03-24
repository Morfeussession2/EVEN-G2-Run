import { useMemo } from 'react';
import type { MockDestination, WorkoutPoint } from './types';

const buildBounds = (
    points: Array<{ lat: number; lng: number }>,
    destinations: MockDestination[],
): [number, number, number, number] | null => {
    if (points.length === 0 && destinations.length === 0) {
        return null;
    }

    const seedLat = points[0]?.lat ?? destinations[0]!.lat;
    const seedLng = points[0]?.lng ?? destinations[0]!.lng;
    let minLat = seedLat;
    let maxLat = seedLat;
    let minLng = seedLng;
    let maxLng = seedLng;

    for (const point of points) {
        minLat = Math.min(minLat, point.lat);
        maxLat = Math.max(maxLat, point.lat);
        minLng = Math.min(minLng, point.lng);
        maxLng = Math.max(maxLng, point.lng);
    }
    for (const destination of destinations) {
        minLat = Math.min(minLat, destination.lat);
        maxLat = Math.max(maxLat, destination.lat);
        minLng = Math.min(minLng, destination.lng);
        maxLng = Math.max(maxLng, destination.lng);
    }

    const latPadding = Math.max(0.002, (maxLat - minLat) * 0.25);
    const lngPadding = Math.max(0.002, (maxLng - minLng) * 0.25);
    return [
        minLng - lngPadding,
        minLat - latPadding,
        maxLng + lngPadding,
        maxLat + latPadding,
    ];
};

// Normalizes coordinates relative to an explicit bounding box (0–100 SVG space)
const normalizeToSvg = (
    points: Array<{ lat: number; lng: number }>,
    bounds: [number, number, number, number],
): string => {
    const [minLng, minLat, maxLng, maxLat] = bounds;
    const width = Math.max(0.0001, maxLng - minLng);
    const height = Math.max(0.0001, maxLat - minLat);
    return points
        .map((point) => {
            const x = ((point.lng - minLng) / width) * 100;
            const y = 100 - ((point.lat - minLat) / height) * 100;
            return `${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(' ');
};

export function EvenRunMap({
    points = [],
    currentPoint = null,
    stableOrigin = null,
    previewPoints = [],
    destinations = [],
    selectedDestinationId = null,
    onSelectDestination,
}: {
    points?: WorkoutPoint[];
    currentPoint?: WorkoutPoint | null;
    stableOrigin?: WorkoutPoint | null;
    previewPoints?: WorkoutPoint[];
    destinations?: MockDestination[];
    selectedDestinationId?: string | null;
    onSelectDestination?: (destinationId: string) => void;
}) {
    const handleSelectDestination = onSelectDestination ?? (() => {});

    // Stable bounds: derived only from the initial GPS fix + destinations.
    // Using currentPoint here would cause the iframe to reload on every GPS update.
    const stableBounds = useMemo(
        () => buildBounds(stableOrigin ? [stableOrigin] : [], destinations),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        // intentionally only recomputing when stableOrigin first becomes non-null
        // or destinations change at session start — not on every tracking tick
        [stableOrigin, destinations],
    );

    const iframeSrc = stableBounds
        ? `https://www.openstreetmap.org/export/embed.html?bbox=${stableBounds
            .map((value) => value.toFixed(6))
            .join('%2C')}&layer=mapnik`
        : null;

    // Current position dot normalized to stable bounds
    const currentDot = useMemo(
        () => (stableBounds && currentPoint ? normalizeToSvg([currentPoint], stableBounds).split(',') : null),
        [currentPoint, stableBounds],
    );

    // Active route: real tracked points take priority, then preview
    const activeRoute = points.length >= 2 ? points : previewPoints.length >= 2 ? previewPoints : [];

    // All SVG coordinates normalized to the stable iframe bounds
    const polylineSvg = useMemo(
        () => (stableBounds && activeRoute.length >= 2 ? normalizeToSvg(activeRoute, stableBounds) : ''),
        [activeRoute, stableBounds],
    );

    const destinationSvgPoints = useMemo(
        () =>
            stableBounds
                ? destinations.map((d) => normalizeToSvg([d], stableBounds).split(','))
                : [],
        [destinations, stableBounds],
    );

    if (!iframeSrc) {
        return (
            <div className="even-run-map even-run-map--waiting">
                <p>Aguardando localização GPS...</p>
            </div>
        );
    }

    const lastSvgPoint = polylineSvg ? polylineSvg.split(' ').at(-1)?.split(',') : null;
    // Use last route point when available, otherwise fall back to current position dot
    const positionDot = lastSvgPoint ?? currentDot;

    return (
        <div className="even-run-map">
            <iframe
                title="OpenStreetMap activity preview"
                src={iframeSrc}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
            />
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                {polylineSvg ? (
                    <polyline
                        points={polylineSvg}
                        fill="none"
                        stroke="#0c7ee8"
                        strokeWidth="2.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                ) : null}
                {lastSvgPoint ? (
                    <circle
                        cx={lastSvgPoint[0]}
                        cy={lastSvgPoint[1]}
                        r="2.8"
                        fill="#f7fbff"
                        stroke="#08111c"
                        strokeWidth="1"
                    />
                ) : null}
                {positionDot && !lastSvgPoint ? (
                    <circle
                        cx={positionDot[0]}
                        cy={positionDot[1]}
                        r="3.5"
                        fill="#0c7ee8"
                        stroke="#f7fbff"
                        strokeWidth="1.5"
                    />
                ) : null}
                {destinationSvgPoints.map(([cx, cy], index) => {
                    const destination = destinations[index];
                    if (!destination || !cx || !cy) return null;
                    const active = destination.id === selectedDestinationId;
                    return (
                        <g
                            key={destination.id}
                            className="map-destination"
                            onClick={() => handleSelectDestination(destination.id)}
                        >
                            <circle
                                cx={cx}
                                cy={cy}
                                r={active ? 3.2 : 2.5}
                                fill={active ? '#e7e07a' : '#ffffff'}
                                stroke="#08111c"
                                strokeWidth="1"
                            />
                            <text x={cx} y={`${Number(cy) - 5}`} textAnchor="middle">
                                {destination.label}
                            </text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}
