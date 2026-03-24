import type { ActivityType, MockDestination, WorkoutPoint } from './types';

const OSRM_BASE_URL = 'https://router.project-osrm.org/route/v1';
const MAX_ROUTE_POINTS = 300;

type OsrmRouteResponse = {
    code?: string;
    routes?: Array<{
        geometry?: {
            coordinates?: number[][];
        };
    }>;
};

const getOsrmProfile = (activity: ActivityType): 'walking' | 'cycling' => {
    if (activity === 'ride') return 'cycling';
    return 'walking';
};

const sampleRoutePoints = (
    points: WorkoutPoint[],
    maxPoints = MAX_ROUTE_POINTS,
): WorkoutPoint[] => {
    if (points.length <= maxPoints) return points;

    const sampled: WorkoutPoint[] = [];
    const lastIndex = points.length - 1;
    for (let index = 0; index < maxPoints; index += 1) {
        const sourceIndex = Math.round((index / (maxPoints - 1)) * lastIndex);
        sampled.push(points[sourceIndex]!);
    }
    return sampled;
};

export const fetchStreetRoute = async (
    activity: ActivityType,
    origin: WorkoutPoint,
    destination: MockDestination,
): Promise<WorkoutPoint[]> => {
    const profile = getOsrmProfile(activity);
    const coordinates = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
    const url =
        `${OSRM_BASE_URL}/${profile}/${coordinates}` +
        '?overview=full&geometries=geojson&alternatives=false&steps=false';

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Routing failed: HTTP ${response.status}`);
    }

    const data = await response.json() as OsrmRouteResponse;
    if (data.code !== 'Ok') {
        throw new Error(`Routing failed: ${data.code ?? 'unknown error'}`);
    }

    const geometry = data.routes?.[0]?.geometry?.coordinates;
    if (!geometry || geometry.length < 2) {
        throw new Error('Routing failed: empty geometry');
    }

    const startedAt = Date.now();
    const routePoints = geometry.map(([lng, lat], index) => ({
        lat,
        lng,
        accuracy: 5,
        altitude: origin.altitude,
        speedMps: null,
        timestamp: startedAt + index * 1000,
    }));

    return sampleRoutePoints(routePoints);
};
