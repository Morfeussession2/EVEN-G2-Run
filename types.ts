export type ActivityType = 'run' | 'ride' | 'walk';

export type SessionStatus = 'selecting_activity' | 'ready' | 'tracking' | 'paused' | 'finished';

export type GeoPermissionState = 'idle' | 'granted' | 'denied' | 'unsupported' | 'error';

export type BridgeAction = 'primary' | 'secondary' | 'tertiary' | 'double_click';

export interface WorkoutPoint {
    lat: number;
    lng: number;
    accuracy: number;
    timestamp: number;
    altitude: number | null;
    speedMps: number | null;
}

export interface WorkoutSession {
    activity: ActivityType;
    status: SessionStatus;
    points: WorkoutPoint[];
    laps: number;
    startedAt: number | null;
    finishedAt: number | null;
    pausedAt: number | null;
    pausedTotalMs: number;
}

export interface WorkoutMetrics {
    distanceMeters: number;
    elapsedMs: number;
    avgSpeedKph: number;
    paceSecondsPerKm: number | null;
}

export interface PastRun {
    id: string;
    session: WorkoutSession;
    metrics: WorkoutMetrics;
    imageBase64: string;
}

export interface MockDestination {
    id: string;
    label: string;
    lat: number;
    lng: number;
}
