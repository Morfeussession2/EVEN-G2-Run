import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { WorkoutPoint } from './types';

export function EvenRunMap({
    points = [],
    currentPoint = null,
    previewPoints = [],
}: {
    points?: WorkoutPoint[];
    currentPoint?: WorkoutPoint | null;
    previewPoints?: WorkoutPoint[];
}) {
    const mapRef = useRef<L.Map | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const polylineRef = useRef<L.Polyline | null>(null);
    const markerRef = useRef<L.CircleMarker | null>(null);

    // 1. Initialize Map
    useEffect(() => {
        if (!containerRef.current || mapRef.current) return;

        const initialCenter: L.LatLngExpression = currentPoint 
            ? [currentPoint.lat, currentPoint.lng] 
            : points[0] 
                ? [points[0].lat, points[0].lng] 
                : [-23.5505, -46.6333];

        const map = L.map(containerRef.current, {
            center: initialCenter,
            zoom: 16,
            attributionControl: false,
            zoomControl: true,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

        mapRef.current = map;

        return () => {
            map.remove();
            mapRef.current = null;
        };
    }, []);

    // 2. Update Polyline
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        const activePoints = points.length > 0 ? points : previewPoints;
        const latLngs = activePoints.map(p => [p.lat, p.lng] as L.LatLngExpression);

        if (polylineRef.current) {
            polylineRef.current.setLatLngs(latLngs);
        } else if (latLngs.length > 1) {
            polylineRef.current = L.polyline(latLngs, {
                color: '#00ff15',
                weight: 5,
                opacity: 0.8
            }).addTo(map);
        }
    }, [points, previewPoints]);

    // 3. Update Current Position Marker & Recenter
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !currentPoint) return;

        const pos: L.LatLngExpression = [currentPoint.lat, currentPoint.lng];

        if (markerRef.current) {
            markerRef.current.setLatLng(pos);
        } else {
            markerRef.current = L.circleMarker(pos, {
                radius: 8,
                fillColor: '#00ff15',
                fillOpacity: 1,
                color: '#000',
                weight: 2
            }).addTo(map);
        }

        // Auto-recenter
        map.setView(pos, map.getZoom());
    }, [currentPoint]);

    return (
        <div 
            ref={containerRef} 
            className="even-run-map" 
            style={{ height: '100%', width: '100%', background: '#F7F7F7' }}
        />
    );
}

export default EvenRunMap;