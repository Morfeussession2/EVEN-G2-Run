import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { renderRoutePreviewPng } from './g2RouteRenderer';
import { renderMetricsBannerPng, renderActivityIconPng } from './g2MetricsRenderer';
import { EvenRunBridge } from './evenBridge';
import {
    activityLabel,
    activityShortLabel,
    computeMetrics,
    computeDistanceMeters,
    formatDistance,
    formatDuration,
    formatPrimaryMetric,
    getMockOriginPoint,
    primaryMetricLabel,
    shouldAcceptPoint,
} from './metrics';
import { uploadToStrava, exchangeCodeForTokens, getStravaConfig, StravaConfig } from './stravaService';
import { useUserLocation } from './useUserLocation';
import type {
    ActivityType,
    BridgeAction,
    GeoPermissionState,
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
    currentPoint: WorkoutPoint | null;
    previewRoutePoints: WorkoutPoint[];
    pastRuns: PastRun[];
    activityLabel: string;
    activityShortLabel: string;
    distanceLabel: string;
    durationLabel: string;
    primaryMetricLabel: string;
    primaryMetricValue: string;
    setActivity: (activity: ActivityType) => void;
    startOrResume: () => void;
    pause: () => void;
    stop: () => void;
    reset: () => void;
    addLap: () => void;
    recheckLocation: () => void;
    triggerPermission: () => Promise<void>;
    isSyncing: boolean;
    syncStatus: string | null;
    syncToStrava: () => Promise<void>;
    stravaConfig: StravaConfig;
}

export const useEvenRun = (): EvenRunViewModel => {
    const bridgeRef = useRef<EvenRunBridge | null>(null);
    const sessionRef = useRef<WorkoutSession>(makeSession());
    const lastSnapshotKeyRef = useRef('');
    const lastActionTimeRef = useRef(0); // Debounce para múltiplos cliques
    const [session, setSession] = useState<WorkoutSession>(() => makeSession());
    const [bridgeReady, setBridgeReady] = useState(false);
    const [debugLogs, setDebugLogs] = useState<string[]>([]);
    const previewRoutePoints: WorkoutPoint[] = [];
    const [pastRuns, setPastRuns] = useState<PastRun[]>([]);
    const [tickNow, setTickNow] = useState(() => Date.now());
    const [isSyncing, setIsSyncing] = useState(false);
    const [syncStatus, setSyncStatus] = useState<string | null>(null);
    const [stravaConfig, setStravaConfig] = useState<StravaConfig>(() => getStravaConfig());
    const userLocationRef = useRef<WorkoutPoint | null>(null);
    const gpsIntervalRef = useRef<number | null>(null);

    // Obter localização real do usuário (com fallback para mock)
    // Ativar watchPosition quando status for 'tracking'
    const isTracking = session.status === 'tracking';
    const { location: userLocation, permission, statusMessage, recheck, triggerPermission } = useUserLocation({
        enabled: isTracking,
        bridge: bridgeReady ? bridgeRef.current : null
    });
    
    // Sempre manter ref atualizada com a localização mais recente
    useEffect(() => {
        userLocationRef.current = userLocation;
    }, [userLocation]);
    
    // Usar localização real se disponível, senão mock
    const mockOrigin: WorkoutPoint = userLocation ?? getMockOriginPoint();
    const geoPermission: GeoPermissionState = permission;
    const geoStatusMessage: string = statusMessage;

    const appendLog = useCallback((message: string) => {
        const timestamp = new Date().toLocaleTimeString('pt-BR', { hour12: false });
        setDebugLogs((current) => [`${timestamp} ${message}`, ...current].slice(0, 80));
    }, []);

    const updateSession = useCallback((nextSession: WorkoutSession) => {
        sessionRef.current = nextSession;
        setSession(nextSession);
    }, []);

    const metrics = useMemo(() => computeMetrics(session, tickNow), [session, tickNow]);
    
    const currentPoint = session.points[session.points.length - 1] ?? mockOrigin;

    useEffect(() => {
        sessionRef.current = session;
        // Log de debug quando session muda
        if (session.status === 'tracking' || session.status === 'paused' || session.status === 'finished') {
            appendLog(`[Session] status=${session.status}, points=${session.points.length}, distance=${(computeDistanceMeters(session.points) / 1000).toFixed(2)}km`);
        }
    }, [session, appendLog]);

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

    const startOrResume = useCallback(() => {
        const current = sessionRef.current;
        const now = Date.now();

        // Se em tracking, PAUSAR
        if (current.status === 'tracking') {
            updateSession({
                ...current,
                status: 'paused',
                pausedAt: now,
            });
            appendLog('[Session] paused');
            return;
        }

        // Se em paused, RETOMAR
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

        // Se em ready, COMEÇAR tracking
        const initialPoints = userLocation ? [userLocation] : [mockOrigin];
        updateSession({
            ...makeSession(current.activity),
            status: 'tracking',
            startedAt: now,
            points: initialPoints,
        });
        appendLog(`[Session] started - GPS tracking ativo com ponto inicial`);
    }, [appendLog, updateSession, userLocation, mockOrigin]);

    const pushRouteToWearable = useCallback(async (points: WorkoutPoint[], label: string) => {
        if (!bridgeRef.current || points.length < 2) return;
        
        try {
            appendLog(`[Map] rendering route (${label})`);
            const pngBytes = await renderRoutePreviewPng(points, ROUTE_WIDTH, ROUTE_HEIGHT);
            
            const pushed = await bridgeRef.current.pushRouteImage(Array.from(pngBytes));
            if (pushed) {
                appendLog(`[Map] ✅ route sent to wearable (${label})`);
            } else {
                appendLog(`[Map] route push skipped`);
            }
        } catch (error) {
            if (error instanceof Error) {
                appendLog(`[Map] ❌ failed to render/push route: ${error.message}`);
            }
        }
    }, [appendLog, bridgeRef]);

    const pause = useCallback(() => {
        // Esta função não é mais usada - pause é feito via startOrResume
        const current = sessionRef.current;
        if (current.status !== 'tracking') return;
        updateSession({
            ...current,
            status: 'paused',
            pausedAt: Date.now(),
        });
        appendLog('[Session] paused');
    }, [appendLog, updateSession]);

    // Renderizar mapa quando pausar
    useEffect(() => {
        if (session.status === 'paused' && session.points.length >= 2) {
            pushRouteToWearable(session.points, 'paused');
        }
    }, [session.status, session.points, pushRouteToWearable]);

    // Renderizar mapa quando terminar
    useEffect(() => {
        if (session.status === 'finished' && session.points.length >= 2) {
            pushRouteToWearable(session.points, 'finished');
        }
    }, [session.status, session.points, pushRouteToWearable]);

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
    }, [appendLog, updateSession]);

    const reset = useCallback(() => {
        updateSession(makeSession(sessionRef.current.activity));
        appendLog('[Session] reset');
    }, [appendLog, updateSession]);

    // Capturar pontos GPS a cada EXATO 1 segundo durante tracking
    // Usa refs para evitar reiniciar intervalo quando userLocation muda
    useEffect(() => {
        if (session.status !== 'tracking') {
            if (gpsIntervalRef.current !== null) {
                window.clearInterval(gpsIntervalRef.current);
                gpsIntervalRef.current = null;
            }
            return;
        }

        // Iniciar novo intervalo apenas se ainda não existe
        if (gpsIntervalRef.current !== null) return;

        console.log('🚀 GPS INTERVAL STARTED - will run every 1 second');
        gpsIntervalRef.current = window.setInterval(() => {
            console.log('⏰ GPS INTERVAL TICK - checking location...');

            const currentSession = sessionRef.current;
            if (currentSession.status !== 'tracking') return;

            const currentLocation = userLocationRef.current;
            if (!currentLocation) {
                console.log('❌ No location available in ref');
                return;
            }

            console.log(`📍 Current location: lat=${currentLocation.lat.toFixed(5)}, lng=${currentLocation.lng.toFixed(5)}, acc=${currentLocation.accuracy.toFixed(0)}m`);

            const lastPoint = currentSession.points[currentSession.points.length - 1];
            const shouldAccept = shouldAcceptPoint(lastPoint, currentLocation);

            if (shouldAccept) {
                const newPoints = [...currentSession.points, currentLocation];
                const logMsg = `[GPS] ✅ ponto ${newPoints.length} aceito: lat=${currentLocation.lat.toFixed(5)}, lng=${currentLocation.lng.toFixed(5)}, acc=${currentLocation.accuracy.toFixed(0)}m`;
                appendLog(logMsg);
                console.log(`🗺️ ${logMsg}`);
                sessionRef.current = { ...currentSession, points: newPoints };
                setSession(sessionRef.current);
            } else {
                console.log(`❌ Point rejected: last_acc=${lastPoint?.accuracy.toFixed(0) ?? 'N/A'}m, new_acc=${currentLocation.accuracy.toFixed(0)}m`);
            }
        }, 1000);

        return () => {
            if (gpsIntervalRef.current !== null) {
                console.log('🛑 GPS INTERVAL STOPPED');
                window.clearInterval(gpsIntervalRef.current);
                gpsIntervalRef.current = null;
            }
        };
    }, [session.status, appendLog]);

    const handleBridgeAction = useCallback((action: BridgeAction) => {
        const current = sessionRef.current;
        const now = Date.now();
        
        // Debounce: ignorar ações que chegam muito rapidamente (< 200ms)
        if (now - lastActionTimeRef.current < 200) {
            return;
        }
        lastActionTimeRef.current = now;

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
            // PRIMARY button: START (ready) / PAUSE (tracking) / RESUME (paused) / RESET (finished)
            if (current.status === 'ready') {
                startOrResume();
                return;
            }
            if (current.status === 'tracking') {
                startOrResume();  // Will pause because it's in tracking state
                return;
            }
            if (current.status === 'paused') {
                startOrResume();  // Will resume because it's in paused state
                return;
            }
            if (current.status === 'finished') {
                reset();
                return;
            }
            return;
        }

        if (action === 'secondary') {
            // SECONDARY button: LAP (tracking/paused only)
            if (current.status === 'tracking' || current.status === 'paused') {
                stop();
            }
            return;
        }

        if (action === 'tertiary') {
            // TERTIARY button: STOP (tracking/paused only)
            if (current.status === 'tracking' || current.status === 'paused') {
                stop();
            }
            return;
        }
    }, [addLap, reset, setActivity, startOrResume, stop, updateSession, geoStatusMessage, appendLog]);

    const syncToStrava = useCallback(async () => {
        const current = sessionRef.current;
        if (current.status !== 'finished' || current.points.length < 2) {
            setSyncStatus('Treino não finalizado ou sem dados suficientes.');
            return;
        }

        setIsSyncing(true);
        setSyncStatus('Sincronizando com Strava...');
        appendLog('[Strava] Sync started');

        try {
            const response = await uploadToStrava(current);
            setSyncStatus('Sincronizado com sucesso!');
            appendLog(`[Strava] ✅ Upload success: ID=${response.id}`);
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Erro desconhecido';
            setSyncStatus(`Erro: ${msg}`);
            appendLog(`[Strava] ❌ Upload failed: ${msg}`);
        } finally {
            setIsSyncing(false);
        }
    }, [appendLog]);

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

    // Handle Strava OAuth callback
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const error = params.get('error');

        if (error) {
            appendLog(`[Strava] ❌ Acesso negado: ${error}`);
            setSyncStatus(`Acesso ao Strava negado: ${error}`);
            // Limpar a URL
            window.history.replaceState({}, document.title, window.location.href.split('?')[0]);
            return;
        }

        if (code) {
            const handleCallback = async () => {
                appendLog('[Strava] 🔄 Capturando código de autorização...');
                setSyncStatus('Finalizando conexão com Strava...');
                
                try {
                    await exchangeCodeForTokens(code);
                    setStravaConfig(getStravaConfig());
                    appendLog('[Strava] ✅ Autorização concluída com sucesso!');
                    setSyncStatus('Conectado ao Strava!');
                    
                    // Limpar a URL sem recarregar a página
                    setTimeout(() => {
                        window.history.replaceState({}, document.title, window.location.href.split('?')[0]);
                        setSyncStatus(null);
                    }, 2000);
                } catch (error) {
                    const msg = error instanceof Error ? error.message : 'Erro na troca de tokens';
                    appendLog(`[Strava] ❌ Erro: ${msg}`);
                    setSyncStatus(`Erro de autorização: ${msg}`);
                }
            };
            handleCallback();
        }
    }, [appendLog]);

    // Log mudanças de localização do usuário
    useEffect(() => {
        if (userLocation && permission === 'granted') {
            appendLog(`[Geo] saiu uma nova localização: lat=${userLocation.lat.toFixed(5)}, lng=${userLocation.lng.toFixed(5)}, act=${userLocation.accuracy.toFixed(0)}m`);
        }
    }, [userLocation, permission, appendLog]);

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

    // Push labels banner (Time/Distance/Rhythm text only)
    useEffect(() => {
        if (!bridgeReady || session.status === 'selecting_activity') return;

        renderMetricsBannerPng(session.activity)
            .then((bytes) => bridgeRef.current?.pushMetricsBanner(Array.from(bytes)))
            .catch(() => appendLog('[Bridge] pushMetricsBanner failed'));
    }, [appendLog, bridgeReady, session.activity, session.status]);

    // Push activity icon (separate container) whenever activity changes
    useEffect(() => {
        if (!bridgeReady || session.status === 'selecting_activity') return;

        renderActivityIconPng(session.activity)
            .then((bytes) => bridgeRef.current?.pushActivityIcon(Array.from(bytes)))
            .catch(() => appendLog('[Bridge] pushActivityIcon failed'));
    }, [appendLog, bridgeReady, session.activity, session.status]);

    useEffect(() => {
        // Só renderizar mapa quando pausado ou parado (finished)
        const isPauseOrFinish = session.status === 'paused' || session.status === 'finished';
        if (!isPauseOrFinish || !bridgeReady) {
            lastSnapshotKeyRef.current = '';
            return;
        }

        const lastPoint = session.points[session.points.length - 1] ?? currentPoint;
        if (!lastPoint) return;

        const mapKey = [
            session.status,
            session.points.length,
            session.laps,
            lastPoint.lat.toFixed(4),
            lastPoint.lng.toFixed(4),
        ].join(':');

        if (mapKey === lastSnapshotKeyRef.current) return;

        const timeoutId = window.setTimeout(() => {
            const pointsToRender = session.points.length > 0 ? session.points : [currentPoint];
            renderRoutePreviewPng(pointsToRender, ROUTE_WIDTH, ROUTE_HEIGHT)
                .then((imageArray) => bridgeRef.current?.pushRouteImage(Array.from(imageArray)))
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
        }, 180); // Delay pequeno para paused/finished

        return () => window.clearTimeout(timeoutId);
    }, [appendLog, bridgeReady, session.laps, session.points, session.status, currentPoint]);

    return {
        session,
        metrics,
        bridgeReady,
        debugLogs,
        geoPermission,
        geoStatusMessage,
        currentPoint,
        previewRoutePoints,
        pastRuns,
        activityLabel: activityLabel(session.activity),
        activityShortLabel: activityShortLabel(session.activity),
        distanceLabel: formatDistance(metrics.distanceMeters),
        durationLabel: formatDuration(metrics.elapsedMs),
        primaryMetricLabel: primaryMetricLabel(session.activity),
        primaryMetricValue: formatPrimaryMetric(session.activity, metrics),
        setActivity,
        startOrResume,
        pause,
        stop,
        reset,
        addLap,
        recheckLocation: recheck,
        triggerPermission,
        isSyncing,
        syncStatus,
        syncToStrava,
        stravaConfig,
    };
};
