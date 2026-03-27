import { useMemo } from 'react';
import type { MockDestination, WorkoutPoint } from './types';

const buildBounds = (
    points: Array<{ lat: number; lng: number }>,
    destinations: MockDestination[],
): [number, number, number, number] => {
    if (points.length === 0 && destinations.length === 0) {
        return [-46.6433, -23.5605, -46.6233, -23.5405];
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

    // ✅ padding reduzido (melhor contraste visual)
    const latPadding = Math.max(0.0005, (maxLat - minLat) * 0.12);
    const lngPadding = Math.max(0.0005, (maxLng - minLng) * 0.12);

    return [
        minLng - lngPadding,
        minLat - latPadding,
        maxLng + lngPadding,
        maxLat + latPadding,
    ];
};

const normalizeCoordinates = (
    points: Array<{ lat: number; lng: number }>,
    bounds: [number, number, number, number],
): string => {
    if (points.length === 0) return '';

    const [minLng, minLat, maxLng, maxLat] = bounds;

    const width = Math.max(0.0001, maxLng - minLng);
    const height = Math.max(0.0001, maxLat - minLat);

    // ✅ mantém proporção correta
    const scale = Math.min(100 / width, 100 / height);

    const offsetX = (100 - width * scale) / 2;
    const offsetY = (100 - height * scale) / 2;

    return points
        .map((point) => {
            const x = offsetX + (point.lng - minLng) * scale;
            const y = offsetY + (maxLat - point.lat) * scale;
            return `${x},${y}`;
        })
        .join(' ');
};

export function EvenRunMap({
    points = [],
    currentPoint = null,
    previewPoints = [],
    onSelectDestination,
}: {
    points?: WorkoutPoint[];
    currentPoint?: WorkoutPoint | null;
    previewPoints?: WorkoutPoint[];
    onSelectDestination?: (destinationId: string) => void;
}) {
    const handleSelectDestination = onSelectDestination ?? (() => { });

    const routePoints = useMemo(() => {
        if (points && points.length > 0) return points;
        if (previewPoints && previewPoints.length > 0) return previewPoints;
        if (currentPoint) return [currentPoint];
        return [];
    }, [currentPoint, points, previewPoints]);

    const bounds = useMemo(() => buildBounds(routePoints, []), [routePoints]);

    const polyline = useMemo(
        () => normalizeCoordinates(routePoints, bounds),
        [routePoints, bounds],
    );

    const iframeSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${bounds
        .map((value) => value.toFixed(6))
        .join('%2C')}&layer=mapnik`;

    return (
        <div className="even-run-map">
            <iframe
                title="OpenStreetMap activity preview"
                src={iframeSrc}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
            />

            {/* ✅ SVG corrigido (SEM distorção) */}
            <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="xMidYMid meet"
                aria-hidden="true"
            >
                {polyline ? (
                    <polyline
                        points={polyline}
                        fill="none"
                        stroke="#ffffff" // melhor pra grayscale
                        strokeWidth="3.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                ) : null}

                {routePoints && routePoints.length > 0 ? (
                    (() => {
                        const [minLng, minLat, maxLng, maxLat] = bounds;
                        const width = Math.max(0.0001, maxLng - minLng);
                        const height = Math.max(0.0001, maxLat - minLat);

                        const scale = Math.min(100 / width, 100 / height);
                        const offsetX = (100 - width * scale) / 2;
                        const offsetY = (100 - height * scale) / 2;

                        const lastPoint =
                            routePoints[routePoints.length - 1];

                        const cx =
                            offsetX + (lastPoint.lng - minLng) * scale;

                        const cy =
                            offsetY + (maxLat - lastPoint.lat) * scale;

                        return (
                            <circle
                                cx={cx}
                                cy={cy}
                                r="3"
                                fill="#ffffff"
                                stroke="#000000"
                                strokeWidth="1"
                            />
                        );
                    })()
                ) : (
                    <>
                        <line x1="45" y1="50" x2="55" y2="50" stroke="#2ada07ff" strokeWidth="1" />
                        <line x1="50" y1="45" x2="50" y2="55" stroke="#2ada07ff" strokeWidth="1" />
                    </>
                )}
            </svg>
        </div>
    );
}