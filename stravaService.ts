/// <reference types="vite/client" />
import type { WorkoutSession, WorkoutPoint } from './types';

const CLIENT_ID_KEY = 'strava_client_id';
const CLIENT_SECRET_KEY = 'strava_client_secret';
const ACCESS_TOKEN_KEY = 'strava_access_token';
const REFRESH_TOKEN_KEY = 'strava_refresh_token';
const EXPIRES_AT_KEY = 'strava_expires_at';

export interface StravaConfig {
    clientId: string | null;
    clientSecret: string | null;
    isAuthorized: boolean;
}

export interface StravaUploadResponse {
    id: number;
    id_str: string;
    external_id: string;
    error: string | null;
    status: string;
    activity_id: number | null;
}

/**
 * Gets the current Strava configuration from localStorage.
 */
export function getStravaConfig(): StravaConfig {
    const clientId = localStorage.getItem(CLIENT_ID_KEY);
    const clientSecret = localStorage.getItem(CLIENT_SECRET_KEY);
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);

    return {
        clientId,
        clientSecret,
        isAuthorized: !!refreshToken,
    };
}

/**
 * Saves the Strava Client ID and Secret to localStorage.
 */
export function saveStravaConfig(clientId: string, clientSecret: string) {
    localStorage.setItem(CLIENT_ID_KEY, clientId);
    localStorage.setItem(CLIENT_SECRET_KEY, clientSecret);
}

/**
 * Clears all Strava data from localStorage.
 */
export function clearStravaConfig() {
    localStorage.removeItem(CLIENT_ID_KEY);
    localStorage.removeItem(CLIENT_SECRET_KEY);
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(EXPIRES_AT_KEY);
}

/**
 * Returns a valid access token, refreshing it if necessary.
 */
async function getValidAccessToken(): Promise<string> {
    const { clientId, clientSecret } = getStravaConfig();
    const expiresAt = localStorage.getItem(EXPIRES_AT_KEY);
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    const now = Math.floor(Date.now() / 1000);

    if (!clientId || !clientSecret || !refreshToken) {
        throw new Error('Configuração do Strava ausente ou não autorizada.');
    }

    const storedToken = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (storedToken && expiresAt && parseInt(expiresAt) > now + 600) {
        return storedToken;
    }

    // Refresh the token
    const response = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
        }),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Falha ao renovar token: ${errorData.message || response.statusText}`);
    }

    const data = await response.json();
    localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
    localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
    localStorage.setItem(EXPIRES_AT_KEY, data.expires_at.toString());

    return data.access_token;
}

/**
 * Exchanges an authorization code for initial tokens.
 */
export async function exchangeCodeForTokens(code: string): Promise<void> {
    const { clientId, clientSecret } = getStravaConfig();
    if (!clientId || !clientSecret) {
        throw new Error('Client ID ou Secret não configurados antes da autorização.');
    }

    const response = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            code: code,
            grant_type: 'authorization_code',
        }),
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Falha na autorização do Strava: ${errorData.message || response.statusText}`);
    }

    const data = await response.json();
    localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
    localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
    localStorage.setItem(EXPIRES_AT_KEY, data.expires_at.toString());
}

/**
 * Generates a GPX 1.1 formatted XML string from a workout session.
 */
function generateGpx(session: WorkoutSession): string {
    const { activity, points, startedAt } = session;
    const startTime = startedAt ? new Date(startedAt).toISOString() : new Date().toISOString();
    const typeLabel = activity === 'ride' ? 'Ride' : activity === 'run' ? 'Run' : 'Walk';

    let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="Even G2 Run" version="1.1" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <time>${startTime}</time>
  </metadata>
  <trk>
    <name>Even G2 Run - ${typeLabel} - ${new Date().toLocaleDateString()}</name>
    <type>${typeLabel}</type>
    <trkseg>`;

    points.forEach((p: WorkoutPoint) => {
        const time = new Date(p.timestamp).toISOString();
        gpx += `
      <trkpt lat="${p.lat}" lon="${p.lng}">
        <ele>${p.altitude || 0}</ele>
        <time>${time}</time>
      </trkpt>`;
    });

    gpx += `
    </trkseg>
  </trk>
</gpx>`;

    return gpx;
}

/**
 * Uploads a workout session to Strava as a GPX file.
 */
export async function uploadToStrava(session: WorkoutSession): Promise<StravaUploadResponse> {
    if (session.points.length < 2) {
        throw new Error('Pontos GPS insuficientes para sincronizar.');
    }

    const accessToken = await getValidAccessToken();
    const gpxContent = generateGpx(session);
    const fileName = `workout_${Date.now()}.gpx`;

    const file = new File([gpxContent], fileName, { type: 'application/gpx+xml' });

    const formData = new FormData();
    formData.append('file', file);
    formData.append('data_type', 'gpx');
    formData.append('activity_type', session.activity);

    const response = await fetch('https://www.strava.com/api/v3/uploads', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
        },
        body: formData,
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Upload falhou: ${errorData.error || response.statusText}`);
    }

    return await response.json();
}
