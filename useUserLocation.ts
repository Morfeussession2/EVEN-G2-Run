import { useEffect, useRef, useState } from 'react';
import type { GeoPermissionState, WorkoutPoint } from './types';
import { getMockOriginPoint } from './metrics';

export interface UseUserLocationResult {
    location: WorkoutPoint | null;
    loading: boolean;
    error: Error | null;
    permission: GeoPermissionState;
    statusMessage: string;
}

export interface UseWatchPositionOptions {
    enabled?: boolean; // true = iniciar watch contínuo, false = parar watch
}

/**
 * Hook para obter a localização real do usuário via navigator.geolocation.
 * Implementa fallback automático para coordenadas mock se permissão negada ou não disponível.
 * 
 * Quando enabled=true, rastreia posição contínuamente (watchPosition).
 * Quando enabled=false, para o rastreamento.
 * 
 * Estados de retorno:
 * - loading: true enquanto aguarda resposta inicial do geolocation
 * - location: WorkoutPoint com coordenadas reais ou mock (nunca null após mount)
 * - permission: reflete estado da permissão
 * - statusMessage: descrição legível do status
 * - error: erro durante geolocation (se houver)
 */
export const useUserLocation = (options?: UseWatchPositionOptions): UseUserLocationResult => {
    const { enabled = false } = options ?? {};
    
    const [location, setLocation] = useState<WorkoutPoint | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const [permission, setPermission] = useState<GeoPermissionState>('idle');
    const [statusMessage, setStatusMessage] = useState('Obtendo localização...');
    const mountedRef = useRef(true);
    const watchIdRef = useRef<number | null>(null);

    useEffect(() => {
        mountedRef.current = true;

        if (!navigator.geolocation) {
            // Navegador não suporta geolocation
            const mockPoint = getMockOriginPoint();
            setLocation(mockPoint);
            setPermission('unsupported');
            setStatusMessage('Geolocation não suportado: usando localização padrão (Café, SP)');
            setLoading(false);
            return;
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
            setStatusMessage('Localização real ativada - rastreando posição');
            setLoading(false);
            setError(null);
        };

        const handleError = (positionError: GeolocationPositionError) => {
            if (!mountedRef.current) return;

            let errorMsg = 'Erro desconhecido ao obter localização';
            let permState: GeoPermissionState = 'error';

            if (positionError.code === positionError.PERMISSION_DENIED) {
                errorMsg = 'Permissão de localização negada';
                permState = 'denied';
            } else if (positionError.code === positionError.POSITION_UNAVAILABLE) {
                errorMsg = 'Localização indisponível (sinal GPS fraco ou bloqueado)';
                permState = 'denied';
            } else if (positionError.code === positionError.TIMEOUT) {
                errorMsg = 'Timeout ao obter localização';
                permState = 'error';
            }

            // Fallback para mock
            const mockPoint = getMockOriginPoint();
            setLocation(mockPoint);
            setPermission(permState);
            setStatusMessage(`${errorMsg}: usando localização padrão (Café, SP)`);
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
    }, []);

    // Efeito separado para gerenciar watchPosition baseado no prop 'enabled'
    useEffect(() => {
        if (!navigator.geolocation) return;

        if (enabled && watchIdRef.current === null && permission === 'granted') {
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
    };
};
