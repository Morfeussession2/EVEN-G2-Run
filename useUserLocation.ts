import { useEffect, useRef, useState } from 'react';
import type { GeoPermissionState, WorkoutPoint } from './types';
import { getMockOriginPoint } from './metrics';
import type { EvenRunBridge } from './evenBridge';

export interface UseUserLocationResult {
    location: WorkoutPoint | null;
    loading: boolean;
    error: Error | null;
    permission: GeoPermissionState;
    statusMessage: string;
    recheck: () => void;
    triggerPermission: () => Promise<void>;
}

export interface UseWatchPositionOptions {
    enabled?: boolean; // true = iniciar watch contínuo, false = parar watch
    bridge?: EvenRunBridge | null;
}

/**
 * Hook para obter a localização real do usuário via navigator.geolocation.
 * Implementa fallback automático para coordenadas mock se permissão negada ou não disponível.
 * 
 * Suporta integração com o Even Hub Bridge para disparar o popup de permissão do sistema
 * caso o navigator.geolocation comum falhe ou seja ignorado pelo WebView.
 */
export const useUserLocation = (options?: UseWatchPositionOptions): UseUserLocationResult => {
    const { enabled = false, bridge = null } = options ?? {};
    
    const [location, setLocation] = useState<WorkoutPoint | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const [permission, setPermission] = useState<GeoPermissionState>('idle');
    const [statusMessage, setStatusMessage] = useState('Fetching location...');
    const mountedRef = useRef(true);
    const watchIdRef = useRef<number | null>(null);
    const [recheckTick, setRecheckTick] = useState(0);

    const recheck = () => {
        setRecheckTick(prev => prev + 1);
        setLoading(true);
        setPermission('idle');
        setStatusMessage('Re-checking location...');
    };

    const triggerBridgePermission = async () => {
        if (!bridge) return;
        console.log('🔌 [Bridge] Calling getSystemLocation to trigger system permission popup...');
        try {
            const bridgeResult = await bridge.getSystemLocation();
            if (bridgeResult && typeof bridgeResult === 'object') {
                // Android and iOS can have different field names
                const rawLat = bridgeResult.lat ?? bridgeResult.latitude;
                const rawLng = bridgeResult.lng ?? bridgeResult.longitude;
                
                const lat = typeof rawLat === 'string' ? parseFloat(rawLat) : rawLat;
                const lng = typeof rawLng === 'string' ? parseFloat(rawLng) : rawLng;

                if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
                    console.log('📡 [Bridge] Received coordinates from JS bridge:', lat, lng);
                    const point: WorkoutPoint = {
                        lat,
                        lng,
                        accuracy: Number(bridgeResult.accuracy) || 10,
                        timestamp: Date.now(),
                        altitude: bridgeResult.altitude ? Number(bridgeResult.altitude) : null,
                        speedMps: null,
                    };
                    if (mountedRef.current) {
                        setLocation(point);
                        setPermission('granted');
                        setStatusMessage('GPS active (via bridge)');
                        setLoading(false);
                        setError(null);
                    }
                } else {
                    console.log('📡 [Bridge] Bridge call success but no coordinates in payload:', bridgeResult);
                }
            }
        } catch (e) {
            console.warn('[Bridge] getSystemLocation call failed', e);
        }
    };

    useEffect(() => {
        mountedRef.current = true;

        if (!navigator.geolocation) {
            // Navegador não suporta geolocation
            const mockPoint = getMockOriginPoint();
            setLocation(mockPoint);
            setPermission('unsupported');
            setStatusMessage('Location not supported: using default location');
            setLoading(false);
            return;
        }

        // Se temos bridge, tentamos "acordar" a permissão do sistema logo de cara
        if (bridge) {
            triggerBridgePermission();
        }

        const handleSuccess = (position: GeolocationPosition) => {
            if (!mountedRef.current) return;

            const { latitude, longitude, accuracy, altitude } = position.coords;
            const now = Date.now();

            const point: WorkoutPoint = {
                lat: latitude,
                lng: longitude,
                accuracy: accuracy,
                timestamp: now,
                altitude: altitude ?? null,
                speedMps: null,
            };

            console.log(`📡 GPS UPDATE: lat=${latitude.toFixed(5)}, lng=${longitude.toFixed(5)}, acc=${accuracy.toFixed(0)}m`);
            setLocation(point);
            setPermission('granted');
            setStatusMessage('GPS active');
            setLoading(false);
            setError(null);
        };

        const handleError = (positionError: GeolocationPositionError) => {
            if (!mountedRef.current) return;

            let errorMsg = 'Erro desconhecido ao obter localização';
            let permState: GeoPermissionState = 'error';

            if (positionError.code === positionError.PERMISSION_DENIED) {
                errorMsg = 'Location permission denied';
                permState = 'denied';
                // Tentar bridge novamente se permissão negada pelo browser direto
                if (bridge) triggerBridgePermission();
            } else if (positionError.code === positionError.POSITION_UNAVAILABLE) {
                errorMsg = 'Location unavailable (weak GPS signal)';
                permState = 'denied';
            } else if (positionError.code === positionError.TIMEOUT) {
                errorMsg = 'Location request timed out';
                permState = 'error';
            }

            // Fallback para mock
            const mockPoint = getMockOriginPoint();
            setLocation(mockPoint);
            setPermission(permState);
            setStatusMessage(`${errorMsg}: using default location`);
            setLoading(false);
            setError(new Error(errorMsg));
        };

        // Primeiro, obter localização inicial via getCurrentPosition
        navigator.geolocation.getCurrentPosition(handleSuccess, handleError, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 5000,
        });

        return () => {
            mountedRef.current = false;
            // Parar watch se estiver ativo
            if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
                watchIdRef.current = null;
            }
        };
    }, [recheckTick, bridge]);

    // Efeito separado para gerenciar watchPosition baseado no prop 'enabled'
    useEffect(() => {
        if (!navigator.geolocation) return;

        if (enabled && watchIdRef.current === null && (permission === 'granted' || permission === 'idle')) {
            // Iniciar watch contínuo
            watchIdRef.current = navigator.geolocation.watchPosition(
                (position) => {
                    if (!mountedRef.current) return;

                    const { latitude, longitude, accuracy, altitude } = position.coords;
                    const now = Date.now();

                    const point: WorkoutPoint = {
                        lat: latitude,
                        lng: longitude,
                        accuracy: accuracy,
                        timestamp: now,
                        altitude: altitude ?? null,
                        speedMps: null,
                    };

                    setLocation(point);
                    setError(null);
                },
                (positionError) => {
                    if (!mountedRef.current) return;
                    // Em modo watch, log mas não quebra a sessão
                    console.warn('Erro no watchPosition:', positionError.message);
                },
                {
                    enableHighAccuracy: true,
                    timeout: 5000,
                    maximumAge: 1000, // Atualizar a cada segundo se disponível
                },
            );
        } else if (!enabled && watchIdRef.current !== null) {
            // Parar watch
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }

        return () => {
            // Cleanup ao desmontar
            if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
                watchIdRef.current = null;
            }
        };
    }, [enabled, permission]);

    return {
        location,
        loading,
        error,
        permission,
        statusMessage,
        recheck,
        triggerPermission: triggerBridgePermission,
    };
};
