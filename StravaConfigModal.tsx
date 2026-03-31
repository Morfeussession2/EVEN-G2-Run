import { useState } from 'react';
import { saveStravaConfig, getStravaConfig, clearStravaConfig } from './stravaService';

export function StravaConfigModal({ onClose }: { onClose: () => void }) {
    const config = getStravaConfig();
    const [clientId, setClientId] = useState(config.clientId || '');
    const [clientSecret, setClientSecret] = useState(config.clientSecret || '');

    const handleConnect = () => {
        if (!clientId || !clientSecret) {
            alert('Por favor, preencha o Client ID e o Client Secret.');
            return;
        }
        saveStravaConfig(clientId, clientSecret);
        const redirectUri = window.location.href.split('?')[0].split('#')[0];
        const scope = 'read,activity:write';
        const authUrl = `https://www.strava.com/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}`;
        window.location.href = authUrl;
    };

    const handleDisconnect = () => {
        if (confirm('Tem certeza que deseja desconectar do Strava?')) {
            clearStravaConfig();
            setClientId('');
            setClientSecret('');
            onClose();
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Strava API</h2>
                    <button className="close-btn" onClick={onClose}>&times;</button>
                </div>

                <p style={{ fontSize: '12px', color: '#666', marginBottom: '24px', lineHeight: '1.4' }}>
                    Any user must configure their own API keys obtained at
                    <a href="https://www.strava.com/settings/api" target="_blank" rel="noreferrer" style={{ color: '#FC4C02', textDecoration: 'none', marginLeft: '4px' }}>
                        strava.com/settings/api
                    </a>.
                </p>

                <div className="input-group">
                    <label className="input-label">Client ID</label>
                    <input
                        className="config-input"
                        type="text"
                        value={clientId}
                        onChange={(e) => setClientId(e.target.value)}
                        placeholder="Ex: 218242"
                    />
                </div>

                <div className="input-group">
                    <label className="input-label">Client Secret</label>
                    <input
                        className="config-input"
                        type="password"
                        value={clientSecret}
                        onChange={(e) => setClientSecret(e.target.value)}
                        placeholder="Seu Segredo da API"
                    />
                </div>

                <div className="button-group" style={{ marginTop: '12px' }}>
                    <button
                        className="strava-orange-button"
                        onClick={handleConnect}
                        style={{ width: '100%', fontSize: '13px', padding: '14px' }}
                    >
                        {config.isAuthorized ? 'Re-authorize Strava' : 'Connect with Strava'}
                    </button>

                    {config.isAuthorized && (
                        <button
                            onClick={handleDisconnect}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: '#ff4d4d',
                                fontSize: '11px',
                                textTransform: 'uppercase',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                marginTop: '8px'
                            }}
                        >
                            Disconnect Strava
                        </button>
                    )}
                </div>

                <div style={{ marginTop: '24px', textAlign: 'center' }}>
                    <span style={{
                        fontSize: '9px',
                        padding: '4px 10px',
                        borderRadius: '12px',
                        backgroundColor: config.isAuthorized ? 'rgba(0, 255, 21, 0.1)' : 'rgba(255, 77, 77, 0.1)',
                        color: config.isAuthorized ? '#008411' : '#ff4d4d',
                        textTransform: 'uppercase',
                        fontWeight: 'bold',
                        letterSpacing: '0.5px'
                    }}>
                        {config.isAuthorized ? 'Sync Active' : 'Sync Inactive'}
                    </span>
                </div>
            </div>
        </div>
    );
}
