import { EvenRunMap } from './EvenRunMap';
import { useEvenRun } from './useEvenRun';
import { StravaConfigModal } from './StravaConfigModal';
import { useState } from 'react';

export function EvenRunApp() {
    const {
        session,
        bridgeReady,
        debugLogs,
        geoPermission,
        geoStatusMessage,
        currentPoint,
        previewRoutePoints,
        pastRuns,
        distanceLabel,
        durationLabel,
        primaryMetricValue,
        stravaConfig,
        syncToStrava,
        isSyncing,
        syncStatus,
        setActivity,
        startOrResume,
        pause,
        stop,
        reset,
        addLap,
        recheckLocation,
        triggerPermission,
    } = useEvenRun();

    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isHistoryOpen, setIsHistoryOpen] = useState(true);
    const [showStravaModal, setShowStravaModal] = useState(false);

    const toggleMenu = () => setIsMenuOpen(!isMenuOpen);
    const toggleHistory = () => setIsHistoryOpen(!isHistoryOpen);

    const handleRecheck = async () => {
        recheckLocation();
        await triggerPermission();
    };

    return (
        <main className="together-shell">
            {/* HEADER */}
            <header className={`top-header ${isMenuOpen ? 'menu-open' : ''}`}>
                <button className="icon-button" style={{ fontSize: '20px' }}>
                    <svg width="24" height="24" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M16 30H14V18H16V30ZM6 28H4V26H6V28ZM8 26H6V24H8V26ZM10 24H8V22H10V24ZM12 22H10V20H12V22ZM14 18H2V16H14V18ZM30 16H18V14H30V16ZM18 2V14H16V2H18ZM21.667 12H19.667V10H21.667V12ZM23.667 10H21.667V8H23.667V10ZM25.667 8H23.667V6H25.667V8ZM28 6H26V4H28V6Z" fill="currentColor"></path>
                    </svg>
                </button>

                <span className="header-title-span">{isMenuOpen ? 'More' : 'EvenRun'}</span>

                <button className="icon-button" onClick={toggleMenu} style={{ fontSize: '24px', fontWeight: 'bold' }}>
                    {isMenuOpen ? (
                        <svg width="20" height="20" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <g clipPath="url(#clip0_10001_76614)">
                                <path d="M5 29H3V27H5V29ZM29 29H27V27H29V29ZM7 27H5V25H7V27ZM27 27H25V25H27V27ZM9 25H7V23H9V25ZM25 25H23V23H25V25ZM11 23H9V21H11V23ZM23 23H21V21H23V23ZM13 21H11V19H13V21ZM21 21H19V19H21V21ZM15 19H13V17H15V19ZM19 19H17V17H19V19ZM15 15H13V13H15V15ZM19 15H17V13H19V15ZM13 13H11V11H13V13ZM21 13H19V11H21V13ZM11 11H9V9H11V11ZM23 11H21V9H23V11ZM9 9H7V7H9V9ZM25 9H23V7H25V9ZM7 7H5V5H7V7ZM27 7H25V5H27V7ZM5 3V5H3V3H5ZM29 5H27V3H29V5Z" fill="currentColor"></path>
                            </g>
                            <defs>
                                <clipPath id="clip0_10001_76614">
                                    <rect width="32" height="32" fill="white"></rect>
                                </clipPath>
                            </defs>
                        </svg>
                    ) : '···'}
                </button>
            </header>

            {/* LOCATION PERMISSION WARNING */}
            {(geoPermission === 'denied' || geoPermission === 'unsupported') && (
                <div className="permission-warning-banner">
                    <div className="warning-icon">
                        <svg width="20" height="20" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M16 2L2 30H30L16 2ZM16 8L26 28H6L16 8ZM14 12V20H18V12H14ZM14 22V26H18V22H14Z" fill="currentColor" />
                        </svg>
                    </div>
                    <div className="warning-content">
                        <span className="warning-title">Location Permission Required</span>
                        <span className="warning-text">Please allow location access to track your run accurately. {geoPermission === 'unsupported' ? '(Unsupported by device)' : ''}</span>
                    </div>
                    <button className="recheck-button" onClick={handleRecheck}>
                        Check Again
                    </button>
                </div>
            )}

            {/* SLIDE-DOWN MENU */}
            {isMenuOpen && (
                <div className="menu-drawer-overlay" onClick={toggleMenu}>
                    <div className="menu-drawer-content" onClick={(e) => e.stopPropagation()}>
                        <section className="section">
                            <div className="section-header">
                                <svg width="20" height="20" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M25 28H21V26H25V28ZM21 26H3V24H21V26ZM29 26H25V24H29V26ZM25 24H21V22H25V24ZM18 19H14V17H18V19ZM14 17H3V15H14V17ZM29 17H18V15H29V17ZM18 15H14V13H18V15ZM11 10H7V8H11V10ZM7 8H3V6H7V8ZM29 8H11V6H29V8ZM11 6H7V4H11V6Z" fill="currentColor"></path>
                                </svg>
                                <span>Settings</span>
                            </div>

                            <div className="toggle-card">
                                <button className="toggle-card-content" onClick={() => { setShowStravaModal(true); toggleMenu(); }}>
                                    <div className="toggle-info">
                                        <div className="toggle-title">Strava</div>
                                        <div className="toggle-description">
                                            {stravaConfig.isAuthorized ? `Connected to Strava` : 'Disconnected'}
                                        </div>
                                    </div>
                                    <div className="toggle-button">
                                        <div role="switch" aria-checked={stravaConfig.isAuthorized}>
                                            <svg width="36" height="24" viewBox="0 0 36 24" fill="none">
                                                <path d="M30.75 3H33V4.5H34.5V6.75H36V17.25H34.5V19.5H33V21H30.75V22.5H5.25V21H3V19.5H1.5V17.25H0V6.75H1.5V4.5H3V3H5.25V1.5H30.75V3Z"
                                                    style={{ fill: stravaConfig.isAuthorized ? '#FC4C02' : '#232323', transition: 'fill 200ms' }} />
                                                <path d="M14.25 19.5H6.75V18H4.5V15.75H3V8.25H4.5V6H6.75V4.5H14.25V6H16.5V8.25H18V15.75H16.5V18H14.25V19.5Z"
                                                    fill="white"
                                                    style={{ transform: stravaConfig.isAuthorized ? 'translateX(15px)' : 'translateX(0)', transition: 'transform 200ms' }} />
                                            </svg>
                                        </div>
                                    </div>
                                </button>
                            </div>

                            {/* <div className="card">
                                <div className="row">
                                    <span>Glasses Status</span>
                                    <strong>{bridgeReady ? 'Connected' : 'Searching...'}</strong>
                                </div>
                            </div> */}
                        </section>

                        <section className="section">
                            <div className={`section-header ${isHistoryOpen ? 'is-open' : ''}`} onClick={toggleHistory}>
                                <svg width="20" height="20" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <g clipPath="url(#clip0_10001_76650)">
                                        <path d="M24 29H8V27H24V29ZM8 27H6V25H8V27ZM26 27H24V25H26V27ZM6 25H4V15H6V25ZM28 25H26V11H28V25ZM14 13H12V11H14V13ZM12 11H10V9H12V11ZM26 11H24V9H26V11ZM10 9H8V7H10V9ZM24 9H12V7H24V9ZM12 7H10V5H12V7ZM14 5H12V3H14V5Z" fill="currentColor"></path>
                                    </g>
                                    <defs>
                                        <clipPath id="clip0_10001_76650">
                                            <rect width="32" height="32" fill="white"></rect>
                                        </clipPath>
                                    </defs>
                                </svg>
                                <span>History</span>
                                <svg className="chevron-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </div>
                            {isHistoryOpen && (
                                <>
                                    {pastRuns.length === 0 ? (
                                        <p style={{ fontSize: '13px', color: '#7B7B7B', textAlign: 'center' }}>No runs recorded yet.</p>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                            {pastRuns.map((run) => (
                                                <div key={run.id} className="history-card">
                                                    <div className="history-main-content">
                                                        {run.imageBase64 && (
                                                            <div className="history-map-thumb">
                                                                <img src={run.imageBase64} alt="Route" />
                                                            </div>
                                                        )}
                                                        <div className="history-metrics-side">
                                                            <div className="history-metric-item">
                                                                <span className="h-m-label">Distance</span>
                                                                <span className="h-m-value">{(run.metrics.distanceMeters / 1000).toFixed(2)}km</span>
                                                            </div>
                                                            <div className="history-metric-item">
                                                                <span className="h-m-label">Time</span>
                                                                <span className="h-m-value">{run.metrics.elapsedMs ? new Date(run.metrics.elapsedMs).toISOString().substr(11, 8) : '00:00:00'}</span>
                                                            </div>
                                                            <div className="history-metric-item">
                                                                <span className="h-m-label">Pace</span>
                                                                <span className="h-m-value">
                                                                    {run.metrics.paceSecondsPerKm
                                                                        ? `${Math.floor(run.metrics.paceSecondsPerKm / 60)}:${String(Math.round(run.metrics.paceSecondsPerKm % 60)).padStart(2, '0')}/km`
                                                                        : '--:--'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="history-footer">
                                                        <span className="history-date">{new Date(Number(run.id)).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                                                        <button
                                                            className="strava-sync-row-btn"
                                                            onClick={() => syncToStrava()}
                                                            disabled={isSyncing}
                                                        >
                                                            {isSyncing ? 'Sincronizando...' : 'Sync to Strava'}
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </section>

                        <section className="section">
                            <div className="section-header">
                                <svg width="20" height="20" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <g clipPath="url(#clip0_10001_76305)">
                                        <path d="M17 3H19V7H21V6H23V5H25V6H26V7H27V9H26V11H25V13H29V15H30V17H29V19H25V21H26V23H27V25H26V26H25V27H23V26H21V25H19V29H17V30H15V29H13V25H11V26H9V27H7V26H6V25H5V23H6V21H7V19H3V17H2V15H3V13H7V11H6V9H5V7H6V6H7V5H9V6H11V7H13V3H15V2H17V3ZM13 12V13H12V19H13V20H19V19H20V13H19V12H13Z" fill="currentColor"></path>
                                    </g>
                                    <defs>
                                        <clipPath id="clip0_10001_76305">
                                            <rect width="32" height="32" fill="white"></rect>
                                        </clipPath>
                                    </defs>
                                </svg>
                                <span>Debug Logs</span>
                            </div>
                            <div className="log-box" style={{ background: '#f4f4f4', padding: '8px', borderRadius: '8px', maxHeight: '100px' }}>
                                {debugLogs.map((l, i) => <p key={i}>{l}</p>)}
                            </div>
                        </section>
                    </div>
                </div>
            )}

            {/* MAIN MAP AREA */}
            <div className="map-container">
                <EvenRunMap
                    points={session.points}
                    currentPoint={currentPoint}
                    previewPoints={previewRoutePoints}
                />
            </div>

            {/* METRICS BAR */}
            <div className="metrics-bar">
                <div className="metric-card">
                    <div className="metric-value">{distanceLabel}</div>
                    <div className="metric-label">Distance</div>
                    <div className="metric-sublabel">Total</div>
                </div>
                <div className="metric-card">
                    <div className="metric-value">{durationLabel}</div>
                    <div className="metric-label">Time</div>
                    <div className="metric-sublabel">Elapsed</div>
                </div>
                <div className="metric-card">
                    <div className="metric-value">{primaryMetricValue}</div>
                    <div className="metric-label">Pace</div>
                    <div className="metric-sublabel">Current</div>
                </div>
            </div>

            {/* CONTROLS (Commented out for testing as requested) */}
            {/* 
            <section className="section" style={{ padding: '0 16px 20px' }}>
                <div className="button-group">
                    {session.status === 'finished' ? (
                        <button className="primary-button" onClick={reset}>New Session</button>
                    ) : (
                        <>
                            <button className="primary-button" onClick={startOrResume}>Start / Resume</button>
                            <button className="secondary-button" onClick={pause}>Pause</button>
                            <button className="secondary-button" onClick={stop}>Stop</button>
                        </>
                    )}
                </div>
            </section>
            */}

            {/* SELECTION OVERLAY (Only shown when selecting activity) */}
            {session.status === 'selecting_activity' && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ textAlign: 'center' }}>
                        <h2 className="section-title" style={{ fontSize: '20px', marginBottom: '20px' }}>Select Activity</h2>
                        <div className="button-group">
                            <button className="secondary-button" onClick={() => setActivity('ride')}>Bike</button>
                            <button className="primary-button" onClick={() => setActivity('run')}>Run</button>
                            <button className="secondary-button" onClick={() => setActivity('walk')}>Walk</button>
                        </div>
                    </div>
                </div>
            )}

            {showStravaModal && <StravaConfigModal onClose={() => setShowStravaModal(false)} />}

            {/* SYNC STATUS TOAST */}
            {syncStatus && (
                <div style={{
                    position: 'fixed',
                    bottom: '100px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    backgroundColor: '#232323',
                    color: 'white',
                    padding: '8px 16px',
                    borderRadius: '20px',
                    fontSize: '12px',
                    zIndex: 1000,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                }}>
                    {syncStatus}
                </div>
            )}
        </main>
    );
}

export default EvenRunApp;
