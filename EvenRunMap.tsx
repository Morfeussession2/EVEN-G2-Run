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

const normalizeCoordinates = (
    points: Array<{ lat: number; lng: number }>,
    destinations: MockDestination[],
): string => {
    if (points.length === 0) return '';

    const [minLng, minLat, maxLng, maxLat] = buildBounds(points, destinations);
    const width = Math.max(0.0001, maxLng - minLng);
    const height = Math.max(0.0001, maxLat - minLat);

    return points
        .map((point) => {
            const x = ((point.lng - minLng) / width) * 100;
            const y = 100 - ((point.lat - minLat) / height) * 100;
            return `${x},${y}`;
        })
        .join(' ');
};

export function EvenRunMap({
    points = [],
    currentPoint = null,
    previewPoints = [],
    destinations = [],
    selectedDestinationId = null,
    onSelectDestination,
}: {
    points?: WorkoutPoint[];
    currentPoint?: WorkoutPoint | null;
    previewPoints?: WorkoutPoint[];
    destinations?: MockDestination[];
    selectedDestinationId?: string | null;
    onSelectDestination?: (destinationId: string) => void;
}) {
    const handleSelectDestination = onSelectDestination ?? (() => {});
    const routePoints = useMemo(
        () => (points.length > 0 ? points : previewPoints.length > 0 ? previewPoints : currentPoint ? [currentPoint] : []),
        [currentPoint, points, previewPoints],
    );

    const bounds = useMemo(() => buildBounds(routePoints, destinations), [destinations, routePoints]);
    const polyline = useMemo(
        () => normalizeCoordinates(routePoints, destinations),
        [destinations, routePoints],
    );
    const destinationMarkers = useMemo(
        () => normalizeCoordinates(destinations, destinations).split(' ').filter(Boolean),
        [destinations],
    );
    const iframeSrc = bounds
        ? `https://www.openstreetmap.org/export/embed.html?bbox=${bounds
            .map((value) => value.toFixed(6))
            .join('%2C')}&layer=mapnik`
        : null;

    if (!iframeSrc) {
        return (
            <div className="even-run-map even-run-map--waiting">
                <p>Aguardando localização GPS...</p>
            </div>
        );
    }

    return (
        <div className="even-run-map">
            <iframe
                title="OpenStreetMap activity preview"
                src={iframeSrc}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
            />
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                {polyline ? (
                    <polyline
                        points={polyline}
                        fill="none"
                        stroke="#0c7ee8"
                        strokeWidth="2.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                ) : null}
                {polyline ? (
                    <circle
                        cx={polyline.split(' ').slice(-1)[0]?.split(',')[0]}
                        cy={polyline.split(' ').slice(-1)[0]?.split(',')[1]}
                        r="2.8"
                        fill="#f7fbff"
                        stroke="#08111c"
                        strokeWidth="1"
                    />
                ) : (
                    <>
                        <line x1="45" y1="50" x2="55" y2="50" />
                        <line x1="50" y1="45" x2="50" y2="55" />
                    </>
                )}
                {destinationMarkers.map((marker, index) => {
                    const [cx, cy] = marker.split(',');
                    const destination = destinations[index];
                    if (!destination) return null;
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
