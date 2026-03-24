import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { renderRoutePreviewPng } from './g2RouteRenderer';
import { EvenRunBridge } from './evenBridge';
import {
    activityLabel,
    activityShortLabel,
    buildMockDestinations,
    computeMetrics,
    formatDistance,
    formatDuration,
    formatPrimaryMetric,
    getMockOriginPoint,
    primaryMetricLabel,
    shouldAcceptPoint,
} from './metrics';
import { fetchStreetRoute } from './routeService';
import type {
    ActivityType,
    BridgeAction,
    GeoPermissionState,
    MockDestination,
    PastRun,
    WorkoutMetrics,
    WorkoutPoint,
    WorkoutSession,
} from './types';

const ROUTE_WIDTH = 200;
const ROUTE_HEIGHT = 100;

const makeSession = (activity: ActivityType = 'run'): WorkoutSession => ({
    activity,
    status: 'selecting_activity',
    points: [],
    laps: 0,
    startedAt: null,
    finishedAt: null,
    pausedAt: null,
    pausedTotalMs: 0,
});

export interface EvenRunViewModel {
    session: WorkoutSession;
    metrics: WorkoutMetrics;
    bridgeReady: boolean;
    debugLogs: string[];
    geoPermission: GeoPermissionState;
    geoStatusMessage: string;
    userOrigin: WorkoutPoint | null;
    currentPoint: WorkoutPoint | null;
    mockDestinations: MockDestination[];
    selectedDestinationId: string | null;
    previewRoutePoints: WorkoutPoint[];
    pastRuns: PastRun[];
    routeLoading: boolean;
    activityLabel: string;
    activityShortLabel: string;
    distanceLabel: string;
    durationLabel: string;
    primaryMetricLabel: string;
    primaryMetricValue: string;
    setActivity: (activity: ActivityType) => void;
    selectMockDestination: (destinationId: string) => void;
    startOrResume: () => void;
    pause: () => void;
    stop: () => void;
    reset: () => void;
    addLap: () => void;
}

export const useEvenRun = (): EvenRunViewModel => {
    const bridgeRef = useRef<EvenRunBridge | null>(null);
    const sessionRef = useRef<WorkoutSession>(makeSession());
    const geoWatchRef = useRef<number | null>(null);
    const userOriginRef = useRef<WorkoutPoint | null>(null);
    const lastSnapshotKeyRef = useRef('');
    const [session, setSession] = useState<WorkoutSession>(() => makeSession());
    const [bridgeReady, setBridgeReady] = useState(false);
    const [debugLogs, setDebugLogs] = useState<string[]>([]);
    const [selectedDestinationId, setSelectedDestinationId] = useState<string | null>(null);
    const [previewRoutePoints, setPreviewRoutePoints] = useState<WorkoutPoint[]>([]);
    const [pastRuns, setPastRuns] = useState<PastRun[]>([]);
    const [routeLoading, setRouteLoading] = useState(false);
    const [geoPermission, setGeoPermission] = useState<GeoPermissionState>('idle');
    const [userOrigin, setUserOrigin] = useState<WorkoutPoint | null>(null);
    const [tickNow, setTickNow] = useState(() => Date.now());

    const geoStatusMessage =
        geoPermission === 'granted' ? 'GPS ativo' :
        geoPermission === 'denied' ? 'GPS negado – verifique as permissões do navegador' :
        geoPermission === 'unsupported' ? 'GPS não suportado neste dispositivo' :
        geoPermission === 'error' ? 'Erro ao acessar o GPS' :
        'Aguardando GPS...';

    const appendLog = useCallback((message: string) => {
        const timestamp = new Date().toLocaleTimeString('pt-BR', { hour12: false });
        setDebugLogs((current) => [`${timestamp} ${message}`, ...current].slice(0, 80));
    }, []);

    const updateSession = useCallback((nextSession: WorkoutSession) => {
        sessionRef.current = nextSession;
        setSession(nextSession);
    }, []);

    const metrics = useMemo(() => computeMetrics(session, tickNow), [session, tickNow]);
    const mockDestinations = useMemo(() => userOrigin ? buildMockDestinations(userOrigin) : [], [userOrigin]);
    const currentPoint = session.points[session.points.length - 1] ?? userOrigin;

    const clearGeoWatch = useCallback(() => {
        if (geoWatchRef.current !== null) {
            navigator.geolocation.clearWatch(geoWatchRef.current);
            geoWatchRef.current = null;
        }
    }, []);

    const loadPreviewRoute = useCallback(async (
        destination: MockDestination,
        activity: ActivityType,
    ): Promise<WorkoutPoint[]> => {
        const origin = userOriginRef.current ?? getMockOriginPoint();
        setRouteLoading(true);
        try {
            const route = await fetchStreetRoute(activity, origin, destination);
            setPreviewRoutePoints(route);
            appendLog(`[Route] loaded ${route.length} points via streets`);
            return route;
        } finally {
            setRouteLoading(false);
        }
    }, [appendLog]);

    useEffect(() => {
        sessionRef.current = session;
    }, [session]);

    useEffect(() => {
        const timer = window.setInterval(() => {
            setTickNow(Date.now());
        }, 1000);
        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        userOriginRef.current = userOrigin;
    }, [userOrigin]);

    useEffect(() => {
        if (!navigator.geolocation) {
            setGeoPermission('unsupported');
            appendLog('[GPS] geolocation não suportado');
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const point: WorkoutPoint = {
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                    timestamp: pos.timestamp,
                    altitude: pos.coords.altitude,
                    speedMps: pos.coords.speed,
                };
                userOriginRef.current = point;
                setUserOrigin(point);
                setGeoPermission('granted');
                appendLog(`[GPS] origem: ${point.lat.toFixed(5)},${point.lng.toFixed(5)}`);
            },
            (err) => {
                const state: GeoPermissionState = err.code === err.PERMISSION_DENIED ? 'denied' : 'error';
                setGeoPermission(state);
                appendLog(`[GPS] erro: ${err.message}`);
            },
            { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
        );
    }, [appendLog]);

    const setActivity = useCallback((activity: ActivityType) => {
        const current = sessionRef.current;
        if (current.status === 'tracking' || current.status === 'paused') return;
        updateSession({ ...makeSession(activity), status: 'ready' });
        appendLog(`[Session] activity=${activity}`);
    }, [appendLog, updateSession]);

    const selectMockDestination = useCallback((destinationId: string) => {
        setSelectedDestinationId(destinationId);
        appendLog(`[Mock] destination=${destinationId}`);
    }, [appendLog]);

    const startGeoWatch = useCallback(() => {
        if (!navigator.geolocation) {
            appendLog('[GPS] geolocation não suportado');
            return;
        }
        clearGeoWatch();
        geoWatchRef.current = navigator.geolocation.watchPosition(
            (pos) => {
                const point: WorkoutPoint = {
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                    timestamp: pos.timestamp,
                    altitude: pos.coords.altitude,
                    speedMps: pos.coords.speed,
                };
                const current = sessionRef.current;
                if (current.status !== 'tracking') return;
                const lastPoint = current.points[current.points.length - 1];
                if (shouldAcceptPoint(lastPoint, point)) {
                    updateSession({ ...current, points: [...current.points, point] });
                }
            },
            (err) => appendLog(`[GPS] watch error: ${err.message}`),
            { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
        );
        appendLog('[GPS] watching position');
    }, [appendLog, clearGeoWatch, updateSession]);

    const startOrResume = useCallback(() => {
        const current = sessionRef.current;
        const now = Date.now();

        if (current.status === 'paused') {
            const pausedAt = current.pausedAt ?? now;
            updateSession({
                ...current,
                status: 'tracking',
                pausedAt: null,
                pausedTotalMs: current.pausedTotalMs + (now - pausedAt),
            });
            startGeoWatch();
            appendLog('[Session] resumed');
            return;
        }

        if (current.status === 'ready') {
            const origin = userOriginRef.current;
            updateSession({
                ...makeSession(current.activity),
                status: 'tracking',
                startedAt: now,
                points: origin ? [origin] : [],
            });
            startGeoWatch();
            appendLog('[Session] started');
        }
    }, [appendLog, startGeoWatch, updateSession]);

    const pause = useCallback(() => {
        const current = sessionRef.current;
        if (current.status !== 'tracking') return;
        clearGeoWatch();
        updateSession({
            ...current,
            status: 'paused',
            pausedAt: Date.now(),
        });
        appendLog('[Session] paused');
    }, [appendLog, clearGeoWatch, updateSession]);

    const addLap = useCallback(() => {
        const current = sessionRef.current;
        if (current.status !== 'tracking' && current.status !== 'paused') return;
        updateSession({
            ...current,
            laps: current.laps + 1,
        });
        appendLog(`[Session] lap ${current.laps + 1}`);
    }, [appendLog, updateSession]);

    const stop = useCallback(() => {
        const current = sessionRef.current;
        if (current.status !== 'tracking' && current.status !== 'paused') return;

        clearGeoWatch();

        const now = Date.now();
        const extraPause =
            current.status === 'paused' && current.pausedAt
                ? now - current.pausedAt
                : 0;

        const finishedSession: WorkoutSession = {
            ...current,
            status: 'finished',
            finishedAt: now,
            pausedAt: null,
            pausedTotalMs: current.pausedTotalMs + extraPause,
        };
        updateSession(finishedSession);
        appendLog('[Session] finished');

        if (finishedSession.points.length >= 2) {
            renderRoutePreviewPng(finishedSession.points, 400, 200).then((pngBytes) => {
                const blob = new Blob([pngBytes.buffer as ArrayBuffer], { type: 'image/png' });
                const reader = new FileReader();
                reader.onloadend = () => {
                    setPastRuns(prev => [{
                        id: Date.now().toString(),
                        session: finishedSession,
                        metrics: computeMetrics(finishedSession, now),
                        imageBase64: reader.result as string
                    }, ...prev]);
                };
                reader.readAsDataURL(blob);
            }).catch(() => appendLog('[History] preview generation failed'));
        }
    }, [appendLog, clearGeoWatch, updateSession]);

    const reset = useCallback(() => {
        clearGeoWatch();
        updateSession(makeSession(sessionRef.current.activity));
        appendLog('[Session] reset');
    }, [appendLog, clearGeoWatch, updateSession]);

    const handleBridgeAction = useCallback((action: BridgeAction) => {
        const current = sessionRef.current;

        if (current.status === 'selecting_activity') {
            if (action === 'double_click') return;
            if (action === 'primary') setActivity('ride');
            if (action === 'secondary') setActivity('run');
            if (action === 'tertiary') setActivity('walk');
            appendLog('[Flow] activity selected, ready');
            return;
        }

        if (action === 'double_click') {
            if (current.status === 'tracking') pause();
            else if (current.status === 'paused') startOrResume();
            return;
        }

        if (action === 'primary') {
            if (current.status === 'ready' || current.status === 'paused') startOrResume();
            else if (current.status === 'tracking') pause();
            else if (current.status === 'finished') reset();
            return;
        }

        if (action === 'secondary') {
            if (current.status !== 'finished' && current.status !== 'selecting_activity') addLap();
            else if (current.status === 'finished') {
                bridgeRef.current?.pushStats(
                    current.activity,
                    current.status,
                    computeMetrics(current, Date.now()),
                    current.laps,
                    geoStatusMessage
                ).catch(() => {});
            }
            return;
        }

        if (action === 'tertiary') {
            if (current.status !== 'finished' && current.status !== 'selecting_activity') stop();
            return;
        }
    }, [addLap, pause, reset, setActivity, startOrResume, stop, updateSession, geoStatusMessage, appendLog]);

    const actionHandlerRef = useRef(handleBridgeAction);
    actionHandlerRef.current = handleBridgeAction;

    useEffect(() => {
        const bridge = new EvenRunBridge();
        bridgeRef.current = bridge;
        appendLog('[Bridge] init requested');

        bridge
            .init((action) => actionHandlerRef.current(action), appendLog)
            .then((ready) => {
                setBridgeReady(ready);
                appendLog(`[Bridge] ready=${ready}`);
            })
            .catch((error: Error) => {
                setBridgeReady(false);
                appendLog(`[Bridge] failed=${error.message}`);
            });

        return () => {
            bridge.destroy();
        };
    }, [appendLog]);

    useEffect(() => {
        if (!userOrigin) return;
        const cafeDestination = mockDestinations.find(d => d.id === 'cafe');
        if (!cafeDestination) {
            setPreviewRoutePoints([]);
            setRouteLoading(false);
            return;
        }
        if (session.status === 'tracking' || session.status === 'paused') return;

        let cancelled = false;
        setRouteLoading(true);

        fetchStreetRoute(session.activity, userOrigin, cafeDestination)
            .then((route) => {
                if (cancelled) return;
                setPreviewRoutePoints(route);
                appendLog(`[Route] preview ready for Cafe`);
            })
            .catch((error) => {
                if (cancelled) return;
                setPreviewRoutePoints([]);
                appendLog(
                    `[Route] preview failed: ${error instanceof Error ? error.message : String(error)}`,
                );
            })
            .finally(() => {
                if (!cancelled) setRouteLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [appendLog, userOrigin, mockDestinations, session.activity, session.status]);

    useEffect(() => {
        if (!bridgeReady) return;
        bridgeRef.current?.syncActionLabels(session.status, session.activity).catch(() => {
            appendLog('[Bridge] syncActionLabels failed');
        });
    }, [appendLog, bridgeReady, session.activity, session.status]);

    useEffect(() => {
        if (!bridgeReady) return;
        bridgeRef.current?.pushStats(
            session.activity,
            session.status,
            metrics,
            session.laps,
            geoStatusMessage,
        ).catch(() => {
            appendLog('[Bridge] pushStats failed');
        });
    }, [appendLog, bridgeReady, geoStatusMessage, metrics, session.activity, session.laps, session.status]);

    useEffect(() => {
        if (session.status === 'ready' || session.points.length < 2 || !bridgeReady) {
            lastSnapshotKeyRef.current = '';
            return;
        }

        const lastPoint = session.points[session.points.length - 1];
        if (!lastPoint) return;

        // For tracking mode, we only update every ~15 points or status change to avoid flickering/battery drain
        // For paused/finished, we update almost immediately (with a small debounce)
        const isPauseOrFinish = session.status === 'paused' || session.status === 'finished';
        const pointsMod = session.status === 'tracking' ? Math.floor(session.points.length / 15) : session.points.length;
        
        const mapKey = [
            session.status,
            pointsMod,
            session.laps,
            lastPoint.lat.toFixed(4), // Slightly less precision to avoid micro-jitter updates
            lastPoint.lng.toFixed(4),
        ].join(':');

        if (mapKey === lastSnapshotKeyRef.current) return;

        const delay = isPauseOrFinish ? 180 : 2000; // longer delay for tracking
        const timeoutId = window.setTimeout(() => {
            renderRoutePreviewPng(session.points, ROUTE_WIDTH, ROUTE_HEIGHT)
                .then((imageData) => bridgeRef.current?.pushRouteImage(Array.from(imageData)))
                .then((pushed) => {
                    if (pushed) {
                        lastSnapshotKeyRef.current = mapKey;
                        return;
                    }
                    appendLog('[Bridge] snapshot skipped');
                })
                .catch((error) => {
                    appendLog(`[Bridge] pushRouteImage failed: ${error.message}`);
                });
        }, delay);

        return () => window.clearTimeout(timeoutId);
    }, [appendLog, bridgeReady, session.laps, session.points, session.status]);

    return {
        session,
        metrics,
        bridgeReady,
        debugLogs,
        geoPermission,
        geoStatusMessage,
        currentPoint,
        userOrigin,
        mockDestinations,
        selectedDestinationId,
        previewRoutePoints,
        pastRuns,
        routeLoading,
        activityLabel: activityLabel(session.activity),
        activityShortLabel: activityShortLabel(session.activity),
        distanceLabel: formatDistance(metrics.distanceMeters),
        durationLabel: formatDuration(metrics.elapsedMs),
        primaryMetricLabel: primaryMetricLabel(session.activity),
        primaryMetricValue: formatPrimaryMetric(session.activity, metrics),
        setActivity,
        selectMockDestination,
        startOrResume,
        pause,
        stop,
        reset,
        addLap,
    };
};
