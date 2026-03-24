import { EvenRunMap } from './EvenRunMap';
import { useEvenRun } from './useEvenRun';
import type { ActivityType } from './types';

function InfoCard({ children }: { children: React.ReactNode }) {
    return <div className="card">{children}</div>;
}

function DetailBox({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="detail-box">
            <span>{label}</span>
            <strong>{value}</strong>
        </div>
    );
}

function ActivityButton({
    label,
    activity,
    active,
    onSelect,
}: {
    label: string;
    activity: ActivityType;
    active: boolean;
    onSelect: (activity: ActivityType) => void;
}) {
    return (
        <button
            type="button"
            className={active ? 'primary-button' : 'secondary-button'}
            onClick={() => onSelect(activity)}
        >
            {label}
        </button>
    );
}

export function EvenRunApp() {
    const {
        session,
        bridgeReady,
        debugLogs,
        geoStatusMessage,
        currentPoint,
        mockDestinations,
        selectedDestinationId,
        previewRoutePoints,
        pastRuns,
        routeLoading,
        simulationActive,
        activityShortLabel,
        distanceLabel,
        durationLabel,
        primaryMetricLabel,
        primaryMetricValue,
        setActivity,
        startMockSimulation,
        clearMockSimulation,
        startOrResume,
        pause,
        stop,
        reset,
        addLap,
    } = useEvenRun();

    return (
        <main className="together-shell">
            <header className="top-header">
                <h1>Even Run | Even G2</h1>
            </header>

            <section className="section">
                <h3 className="section-title">Conexão</h3>

                <InfoCard>
                    <div className="row">
                        <span>Status</span>
                        <strong>
                            {bridgeReady ? 'Óculos Conectado' : 'Aguardando...'}
                        </strong>
                    </div>
                </InfoCard>

                <InfoCard>
                    <div className="row">
                        <span>Modo</span>
                        <strong>{geoStatusMessage}</strong>
                    </div>
                </InfoCard>
            </section>

            {session.status === 'selecting_activity' ? (
                <section className="section">
                    <h3 className="section-title">Selecionar Atividade</h3>
                    <InfoCard>
                        <div className="button-group">
                            <ActivityButton
                                label="Ciclismo"
                                activity="ride"
                                active={false}
                                onSelect={() => { setActivity('ride'); }}
                            />
                            <ActivityButton
                                label="Corrida"
                                activity="run"
                                active={false}
                                onSelect={() => { setActivity('run'); }}
                            />
                            <ActivityButton
                                label="Caminhada"
                                activity="walk"
                                active={false}
                                onSelect={() => { setActivity('walk'); }}
                            />
                        </div>
                    </InfoCard>
                </section>
            ) : (
                <>
                    <section className="section">
                        <h3 className="section-title">Métricas da Sessão</h3>

                        <div className="details-grid">
                            <DetailBox label="Atividade" value={activityShortLabel} />
                            <DetailBox label="Status" value={session.status.toUpperCase()} />
                            <DetailBox label="Distância" value={distanceLabel} />
                            <DetailBox label="Tempo" value={durationLabel} />
                            <DetailBox label={primaryMetricLabel} value={primaryMetricValue} />
                            <DetailBox label="Voltas (Laps)" value={session.laps} />
                        </div>
                    </section>

                    <section className="section">
                        <h3 className="section-title">Mapa (Simulação Cafe)</h3>

                        <InfoCard>
                            <EvenRunMap
                                points={session.points}
                                currentPoint={currentPoint}
                                previewPoints={previewRoutePoints}
                                destinations={mockDestinations}
                                selectedDestinationId={selectedDestinationId}
                            />
                            <div className="button-group map-actions">
                                <button
                                    className="primary-button"
                                    type="button"
                                    onClick={startMockSimulation}
                                    disabled={simulationActive || routeLoading}
                                >
                                    {simulationActive
                                        ? 'Simulando...'
                                        : routeLoading
                                            ? 'Carregando rota...'
                                            : 'Forçar Início Rota Fake'}
                                </button>
                                <button className="secondary-button" type="button" onClick={clearMockSimulation}>
                                    Limpar Rota
                                </button>
                            </div>
                        </InfoCard>
                    </section>

                    {/* <section className="section">
                        <h3 className="section-title">Controles Manuais</h3>

                        <InfoCard>
                            <div className="button-group">
                                {session.status === 'finished' ? (
                                    <>
                                        <button className="primary-button" type="button" onClick={reset}>
                                            New
                                        </button>
                                        <button className="secondary-button" type="button">
                                            Resume (Review)
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button className="primary-button" type="button" onClick={startOrResume}>
                                            Start / Resume
                                        </button>
                                        <button className="secondary-button" type="button" onClick={pause}>
                                            Pause
                                        </button>
                                        <button className="secondary-button" type="button" onClick={addLap}>
                                            Add Lap
                                        </button>
                                        <button className="secondary-button" type="button" onClick={stop}>
                                            Stop
                                        </button>
                                    </>
                                )}
                            </div>
                        </InfoCard>
                    </section> */}
                </>
            )}

            {pastRuns.length > 0 && (
                <section className="section">
                    <h3 className="section-title">Histórico de Corridas</h3>
                    {pastRuns.map((run, idx) => (
                        <InfoCard key={run.id}>
                            <h4 style={{ marginBottom: '8px', color: '#000000ff' }}>Corrida {pastRuns.length - idx}</h4>
                            <img src={run.imageBase64} alt={`Mapa da corrida ${run.id}`} style={{ width: '100%', borderRadius: '8px' }} />
                            <div className="details-grid" style={{ marginTop: '12px' }}>
                                <DetailBox label="Distância" value={`${(run.metrics.distanceMeters / 1000).toFixed(2)} km`} />
                                <DetailBox label="Laps" value={run.session.laps} />
                            </div>
                        </InfoCard>
                    ))}
                </section>
            )}

            <section className="section">
                <h3 className="section-title">Diagnóstico</h3>
                <InfoCard>
                    <div className="log-box">
                        {debugLogs.length === 0 ? (
                            <p>Sem logs...</p>
                        ) : (
                            debugLogs.map((line, index) => (
                                <p key={`${index}-${line}`}>{line}</p>
                            ))
                        )}
                    </div>
                </InfoCard>
            </section>
        </main>
    );
}

export default EvenRunApp;
