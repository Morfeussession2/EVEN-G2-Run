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
const MOCK_ROUTE_INTERVAL_MS = 450;

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
    currentPoint: WorkoutPoint | null;
    mockDestinations: MockDestination[];
    selectedDestinationId: string | null;
    previewRoutePoints: WorkoutPoint[];
    pastRuns: PastRun[];
    routeLoading: boolean;
    simulationActive: boolean;
    activityLabel: string;
    activityShortLabel: string;
    distanceLabel: string;
    durationLabel: string;
    primaryMetricLabel: string;
    primaryMetricValue: string;
    setActivity: (activity: ActivityType) => void;
    selectMockDestination: (destinationId: string) => void;
    startMockSimulation: () => void;
    clearMockSimulation: () => void;
    startOrResume: () => void;
    pause: () => void;
    stop: () => void;
    reset: () => void;
    addLap: () => void;
}

export const useEvenRun = (): EvenRunViewModel => {
    const bridgeRef = useRef<EvenRunBridge | null>(null);
    const sessionRef = useRef<WorkoutSession>(makeSession());
    const simulationTimerRef = useRef<number | null>(null);
    const lastSnapshotKeyRef = useRef('');
    const [session, setSession] = useState<WorkoutSession>(() => makeSession());
    const [bridgeReady, setBridgeReady] = useState(false);
    const [debugLogs, setDebugLogs] = useState<string[]>([]);
    const [selectedDestinationId, setSelectedDestinationId] = useState<string | null>(null);
    const [previewRoutePoints, setPreviewRoutePoints] = useState<WorkoutPoint[]>([]);
    const [pastRuns, setPastRuns] = useState<PastRun[]>([]);
    const [routeLoading, setRouteLoading] = useState(false);
    const [simulationActive, setSimulationActive] = useState(false);
    const [tickNow, setTickNow] = useState(() => Date.now());

    const geoPermission: GeoPermissionState = 'idle';
    const geoStatusMessage = 'Modo de teste ativo: rota mock sem GPS real.';
    const mockOrigin = useMemo(() => getMockOriginPoint(), []);

    const appendLog = useCallback((message: string) => {
        const timestamp = new Date().toLocaleTimeString('pt-BR', { hour12: false });
        setDebugLogs((current) => [`${timestamp} ${message}`, ...current].slice(0, 80));
    }, []);

    const updateSession = useCallback((nextSession: WorkoutSession) => {
        sessionRef.current = nextSession;
        setSession(nextSession);
    }, []);

    const metrics = useMemo(() => computeMetrics(session, tickNow), [session, tickNow]);
    const mockDestinations = useMemo(() => buildMockDestinations(mockOrigin), [mockOrigin]);
    
    const currentPoint = session.points[session.points.length - 1] ?? mockOrigin;

    const clearSimulationTimer = useCallback(() => {
        if (simulationTimerRef.current !== null) {
            window.clearInterval(simulationTimerRef.current);
            simulationTimerRef.current = null;
        }
    }, []);

    const loadPreviewRoute = useCallback(async (
        destination: MockDestination,
        activity: ActivityType,
    ): Promise<WorkoutPoint[]> => {
        setRouteLoading(true);
        try {
            const route = await fetchStreetRoute(activity, mockOrigin, destination);
            setPreviewRoutePoints(route);
            appendLog(`[Route] loaded ${route.length} points via streets`);
            return route;
        } finally {
            setRouteLoading(false);
        }
    }, [appendLog, mockOrigin]);

    useEffect(() => {
        sessionRef.current = session;
    }, [session]);

    useEffect(() => {
        const timer = window.setInterval(() => {
            setTickNow(Date.now());
        }, 1000);
        return () => window.clearInterval(timer);
    }, []);

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

    const clearMockSimulation = useCallback(() => {
        clearSimulationTimer();
        setSimulationActive(false);
        setPreviewRoutePoints([]);
        setRouteLoading(false);
        updateSession(makeSession(sessionRef.current.activity));
        appendLog('[Mock] simulation cleared');
    }, [appendLog, clearSimulationTimer, updateSession]);

    const startMockSimulation = useCallback(() => {
        const cafeDestination = mockDestinations.find(d => d.id === 'cafe');
        if (!cafeDestination) {
            appendLog('[Mock] cafe destination not found');
            return;
        }

        void (async () => {
            try {
                clearSimulationTimer();
                const route =
                    previewRoutePoints.length >= 2
                        ? previewRoutePoints
                        : await loadPreviewRoute(cafeDestination, sessionRef.current.activity);

                if (route.length < 2) {
                    appendLog('[Mock] route unavailable');
                    return;
                }

                const startedAt = Date.now();
                let index = 1;

                setSimulationActive(true);
                updateSession({
                    ...makeSession(sessionRef.current.activity),
                    status: 'tracking',
                    startedAt,
                    points: [route[0]!],
                });
                appendLog(`[Mock] simulating to ${cafeDestination.label}`);

                simulationTimerRef.current = window.setInterval(() => {
                    const current = sessionRef.current;

                    if (current.status === 'paused') return;

                    if (current.status !== 'tracking') {
                        clearSimulationTimer();
                        setSimulationActive(false);
                        return;
                    }

                    if (index >= route.length) {
                        clearSimulationTimer();
                        setSimulationActive(false);
                        updateSession({
                            ...current,
                            status: 'finished',
                            finishedAt: Date.now(),
                            pausedAt: null,
                        });
                        appendLog('[Mock] destination reached');
                        return;
                    }

                    updateSession({
                        ...current,
                        points: [...current.points, route[index]!],
                    });
                    index += 1;
                }, MOCK_ROUTE_INTERVAL_MS);
            } catch (error) {
                setSimulationActive(false);
                appendLog(
                    `[Route] failed: ${error instanceof Error ? error.message : String(error)}`,
                );
            }
        })();
    }, [appendLog, clearSimulationTimer, loadPreviewRoute, previewRoutePoints, mockDestinations, updateSession]);

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
            appendLog('[Session] resumed');
            return;
        }

        startMockSimulation();
    }, [appendLog, startMockSimulation, updateSession]);

    const pause = useCallback(() => {
        const current = sessionRef.current;
        if (current.status !== 'tracking') return;
        updateSession({
            ...current,
            status: 'paused',
            pausedAt: Date.now(),
        });
        appendLog('[Session] paused');
    }, [appendLog, updateSession]);

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

        clearSimulationTimer();
        setSimulationActive(false);

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
    }, [appendLog, clearSimulationTimer, updateSession]);

    const reset = useCallback(() => {
        clearSimulationTimer();
        setSimulationActive(false);
        updateSession(makeSession(sessionRef.current.activity));
        appendLog('[Session] reset');
    }, [appendLog, clearSimulationTimer, updateSession]);

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
        const cafeDestination = mockDestinations.find(d => d.id === 'cafe');
        if (!cafeDestination) {
            setPreviewRoutePoints([]);
            setRouteLoading(false);
            return;
        }
        if (simulationActive || session.status === 'tracking' || session.status === 'paused') return;

        let cancelled = false;
        setRouteLoading(true);

        fetchStreetRoute(session.activity, mockOrigin, cafeDestination)
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
    }, [appendLog, mockOrigin, mockDestinations, session.activity, session.status, simulationActive]);

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
        mockDestinations,
        selectedDestinationId,
        previewRoutePoints,
        pastRuns,
        routeLoading,
        simulationActive,
        activityLabel: activityLabel(session.activity),
        activityShortLabel: activityShortLabel(session.activity),
        distanceLabel: formatDistance(metrics.distanceMeters),
        durationLabel: formatDuration(metrics.elapsedMs),
        primaryMetricLabel: primaryMetricLabel(session.activity),
        primaryMetricValue: formatPrimaryMetric(session.activity, metrics),
        setActivity,
        selectMockDestination,
        startMockSimulation,
        clearMockSimulation,
        startOrResume,
        pause,
        stop,
        reset,
        addLap,
    };
};
