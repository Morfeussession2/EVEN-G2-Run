import type { ActivityType, MockDestination, WorkoutMetrics, WorkoutPoint, WorkoutSession } from './types';

const EARTH_RADIUS_METERS = 6_371_000;
const MOCK_ORIGIN_LAT = -23.55052;
const MOCK_ORIGIN_LNG = -46.63331;

const toRadians = (value: number): number => (value * Math.PI) / 180;

export const activityLabel = (activity: ActivityType): string => {
    if (activity === 'run') return 'Corrida';
    if (activity === 'ride') return 'Ciclismo';
    return 'Caminhada';
};

export const activityShortLabel = (activity: ActivityType): string => {
    if (activity === 'run') return 'RUN';
    if (activity === 'ride') return 'BIKE';
    return 'WALK';
};

export const primaryMetricLabel = (activity: ActivityType): string =>
    activity === 'ride' ? 'Velocidade' : 'Ritmo';

export const haversineDistanceMeters = (a: WorkoutPoint, b: WorkoutPoint): number => {
    const dLat = toRadians(b.lat - a.lat);
    const dLng = toRadians(b.lng - a.lng);
    const lat1 = toRadians(a.lat);
    const lat2 = toRadians(b.lat);

    const sinLat = Math.sin(dLat / 2);
    const sinLng = Math.sin(dLng / 2);
    const term =
        sinLat * sinLat +
        Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;

    return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(term), Math.sqrt(1 - term));
};

export const shouldAcceptPoint = (
    previousPoint: WorkoutPoint | undefined,
    nextPoint: WorkoutPoint,
): boolean => {
    // SEMPRE aceitar o primeiro ponto, independente da accuracy
    if (!previousPoint) return true;

    const elapsedMs = nextPoint.timestamp - previousPoint.timestamp;
    if (elapsedMs <= 0) return false;

    const distanceMeters = haversineDistanceMeters(previousPoint, nextPoint);
    
    // Se accuracy é muito ruim (> 1000m), provavelmente é simulador - ignorar check de accuracy
    const isSimulator = nextPoint.accuracy > 1000;
    
    if (!isSimulator) {
        // Para dados reais: rejeitar se accuracy é péssima
        if (nextPoint.accuracy > 150) return false;
    }
    
    // Aceitar se se moveu 1m+ OU esperou 5s+ (sem movimento)
    if (distanceMeters < 1 && elapsedMs < 5_000) return false;

    return true;
};

export const computeDistanceMeters = (points: WorkoutPoint[]): number => {
    let total = 0;
    for (let index = 1; index < points.length; index += 1) {
        total += haversineDistanceMeters(points[index - 1]!, points[index]!);
    }
    return total;
};

export const getElapsedMs = (session: WorkoutSession, now = Date.now()): number => {
    if (!session.startedAt) return 0;
    if (session.status === 'finished') {
        const finishedAt = session.finishedAt ?? session.startedAt;
        return Math.max(0, finishedAt - session.startedAt - session.pausedTotalMs);
    }
    if (session.status === 'paused') {
        const pausedAt = session.pausedAt ?? now;
        return Math.max(0, pausedAt - session.startedAt - session.pausedTotalMs);
    }
    return Math.max(0, now - session.startedAt - session.pausedTotalMs);
};

export const computeMetrics = (session: WorkoutSession, now = Date.now()): WorkoutMetrics => {
    const distanceMeters = computeDistanceMeters(session.points);
    const elapsedMs = getElapsedMs(session, now);
    const elapsedHours = elapsedMs / 3_600_000;
    const avgSpeedKph =
        distanceMeters > 0 && elapsedHours > 0
            ? (distanceMeters / 1000) / elapsedHours
            : 0;
    const paceSecondsPerKm =
        distanceMeters > 0 && elapsedMs > 0
            ? Math.round((elapsedMs / 1000) / (distanceMeters / 1000))
            : null;

    return {
        distanceMeters,
        elapsedMs,
        avgSpeedKph,
        paceSecondsPerKm,
    };
};

export const formatDistance = (meters: number): string =>
    `${(meters / 1000).toFixed(meters >= 10_000 ? 1 : 2)} km`;

export const formatDuration = (elapsedMs: number): string => {
    const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

export const formatPrimaryMetric = (activity: ActivityType, metrics: WorkoutMetrics): string => {
    if (activity === 'ride') {
        return metrics.avgSpeedKph > 0 ? `${metrics.avgSpeedKph.toFixed(1)} km/h` : '--';
    }
    if (!metrics.paceSecondsPerKm) return '--';
    const minutes = Math.floor(metrics.paceSecondsPerKm / 60);
    const seconds = metrics.paceSecondsPerKm % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')} min/km`;
};

export const getMockOriginPoint = (): WorkoutPoint => ({
    lat: MOCK_ORIGIN_LAT,
    lng: MOCK_ORIGIN_LNG,
    accuracy: 6,
    timestamp: Date.now(),
    altitude: 760,
    speedMps: null,
});

export const buildMockDestinations = (origin: WorkoutPoint): MockDestination[] => {
    const baseLat = origin.lat;
    const baseLng = origin.lng;

    return [
        { id: 'park', label: 'Parque', lat: baseLat + 0.0048, lng: baseLng + 0.0024 },
        { id: 'cafe', label: 'Cafe', lat: baseLat - 0.0032, lng: baseLng + 0.0041 },
        { id: 'station', label: 'Estacao', lat: baseLat + 0.0016, lng: baseLng - 0.0046 },
    ];
};

export const interpolateRoutePoints = (
    origin: WorkoutPoint,
    destination: MockDestination,
    steps = 18,
): WorkoutPoint[] => {
    const points: WorkoutPoint[] = [];
    for (let index = 0; index <= steps; index += 1) {
        const progress = index / steps;
        points.push({
            lat: origin.lat + (destination.lat - origin.lat) * progress,
            lng: origin.lng + (destination.lng - origin.lng) * progress,
            accuracy: 6,
            altitude: origin.altitude,
            speedMps: null,
            timestamp: Date.now() + index * 1000,
        });
    }
    return points;
};
