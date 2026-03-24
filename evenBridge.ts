import {
    CreateStartUpPageContainer,
    ImageContainerProperty,
    ImageRawDataUpdate,
    ListContainerProperty,
    ListItemContainerProperty,
    OsEventTypeList,
    RebuildPageContainer,
    TextContainerProperty,
    TextContainerUpgrade,
    waitForEvenAppBridge,
} from '@evenrealities/even_hub_sdk';
import { formatDistance, formatDuration, formatPrimaryMetric, primaryMetricLabel } from './metrics';
import type { ActivityType, BridgeAction, SessionStatus, WorkoutMetrics } from './types';

type AnyBridge = Awaited<ReturnType<typeof waitForEvenAppBridge>>;
type DebugLogger = (message: string) => void;
type DisplayMode = 'live' | 'summary';

const CLICK_EVENTS = new Set<any>([
    OsEventTypeList.CLICK_EVENT,
    'CLICK_EVENT',
    'CLICK',
    0,
]);

const DOUBLE_CLICK_EVENTS = new Set<any>([
    OsEventTypeList.DOUBLE_CLICK_EVENT,
    'DOUBLE_CLICK_EVENT',
    'DOUBLE_CLICK',
    3,
]);

const parseEventType = (event: any): string | number | undefined =>
    event?.sysEvent?.eventType ??
    event?.listEvent?.eventType ??
    event?.jsonData?.sysEvent?.eventType ??
    event?.jsonData?.listEvent?.eventType;

const resolveListIndex = (event: any): number | undefined => {
    const fromList = event?.listEvent?.currentSelectItemIndex;
    const fromJsonList = event?.jsonData?.listEvent?.currentSelectItemIndex;
    const fromRoot = event?.jsonData?.currentSelectItemIndex;
    const value = fromList ?? fromJsonList ?? fromRoot;
    if (value === undefined || value === null) return undefined;
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
};

const resolveListName = (event: any): string | undefined => {
    return (
        event?.listEvent?.currentSelectItemName ??
        event?.jsonData?.listEvent?.currentSelectItemName ??
        event?.jsonData?.currentSelectItemName
    );
};

const resolveAction = (index: number | undefined, name?: string): BridgeAction | null => {
    if (name) {
        const normalized = name.toUpperCase();
        if (normalized.includes('CICLO') || normalized.includes('CICLISMO')) return 'primary';
        if (normalized.includes('CORRIDA')) return 'secondary';
        if (normalized.includes('CAMINHADA')) return 'tertiary';
        if (normalized.includes('START') || normalized.includes('PAUSE') || normalized.includes('NEW')) return 'primary';
        if (normalized.includes('LAP') || normalized.includes('RESUME')) return 'secondary';
        if (normalized.includes('STOP') || (normalized.includes('REVIEW') && !normalized.includes('NEW'))) return 'tertiary';
    }
    
    if (index === 0) return 'primary';
    if (index === 1) return 'secondary';
    if (index === 2) return 'tertiary';
    return null;
};

const getLabels = (status: SessionStatus): [string, string, string] => {
    if (status === 'selecting_activity') return ['CICLISMO', 'CORRIDA', 'CAMINHADA'];
    if (status === 'tracking') return ['PAUSE', 'LAP', 'STOP'];
    if (status === 'paused') return ['START', 'LAP', 'STOP'];
    if (status === 'finished') return ['NEW', 'RESUME', ''];
    return ['START', 'LAP', 'STOP'];
};

const getListPositionAndSize = (isSelecting: boolean) => {
    if (isSelecting) {
        return {
            xPosition: 190,
            yPosition: 100,
            width: 160,
            height: 120,
            itemWidth: 160,
        };
    }
    return {
        xPosition: 18,
        yPosition: 170,
        width: 190,
        height: 92,
        itemWidth: 190,
    };
};

const isActionsListEvent = (event: any): boolean => {
    const byListName =
        event?.listEvent?.containerName === 'actionsList' ||
        event?.jsonData?.listEvent?.containerName === 'actionsList';
    const byContainerName = event?.jsonData?.containerName === 'actionsList';
    const byContainerId =
        event?.listEvent?.containerID === 3 ||
        event?.jsonData?.listEvent?.containerID === 3 ||
        event?.jsonData?.containerID === 3;
    return Boolean(byListName || byContainerName || byContainerId);
};

export class EvenRunBridge {
    private bridge: AnyBridge | null = null;
    private pageCreated = false;
    private debugLog: DebugLogger = () => {};
    private imageQueue: Promise<boolean> = Promise.resolve(true);
    private actionLabels: [string, string, string] = ['CICLISMO', 'CORRIDA', 'CAMINHADA'];
    private displayMode: DisplayMode | 'selecting_activity' = 'selecting_activity';
    private currentSelectedIndex: number = 0;
    private lastRebuildTime: number = 0;
    private isRebuilding: boolean = false;

    private log(message: string): void {
        const line = `[EvenRunBridge] ${message}`;
        this.debugLog(line);
        if (/failed|timeout/i.test(message)) {
            console.error(line);
        }
    }

    private getLayout() {
        const isSelecting = this.displayMode === 'selecting_activity';
        const showSnapshot = this.displayMode === 'summary';
        const listDims = getListPositionAndSize(isSelecting);
        return {
            containerTotalNum: isSelecting ? 1 : (showSnapshot ? 3 : 2),
            textObject: isSelecting ? [] : [
                new TextContainerProperty({
                    containerID: 2,
                    containerName: 'metricsText',
                    xPosition: 18,
                    yPosition: 14,
                    width: 540,
                    height: 40,
                    isEventCapture: 0,
                    content: 'DIST: --   TIME: --   LAPS: 0   RITM: --',
                }),
            ],
            listObject: [
                new ListContainerProperty({
                    containerID: 3,
                    containerName: 'actionsList',
                    xPosition: listDims.xPosition,
                    yPosition: listDims.yPosition,
                    width: listDims.width,
                    height: listDims.height,
                    isEventCapture: 1,
                    itemContainer: new ListItemContainerProperty({
                        itemCount: 3,
                        itemWidth: listDims.itemWidth,
                        itemName: [...this.actionLabels],
                        isItemSelectBorderEn: 1,
                    }),
                }),
            ],
            imageObject: showSnapshot
                ? [
                    new ImageContainerProperty({
                        containerID: 1,
                        containerName: 'routeImg',
                        xPosition: 338,
                        yPosition: 162,
                        width: 200,
                        height: 100,
                    }),
                ]
                : [],
        };
    }

    async init(onAction: (action: BridgeAction) => void, onDebugLog?: DebugLogger): Promise<boolean> {
        this.debugLog = onDebugLog ?? (() => {});
        this.pageCreated = false;

        try {
            const bridgePromise = waitForEvenAppBridge();
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error('waitForEvenAppBridge timeout (8s)')), 8000);
            });
            this.bridge = await Promise.race([bridgePromise, timeoutPromise]);
            this.log('waitForEvenAppBridge resolved');

            const layout = this.getLayout();
            const createResult = await this.bridge.createStartUpPageContainer(
                new CreateStartUpPageContainer(layout),
            );
            this.log(`createStartUpPageContainer result=${String(createResult)}`);

            if (createResult !== 0) {
                const rebuilt = await this.bridge.rebuildPageContainer(
                    new RebuildPageContainer(layout),
                );
                this.log(`rebuildPageContainer result=${String(rebuilt)}`);
                if (!rebuilt) return false;
            }

            this.pageCreated = true;
            this.bridge.onEvenHubEvent((event: any) => {
                if (this.isRebuilding) {
                    this.log('Ignored event during layout rebuild');
                    return;
                }
                
                const eventType = parseEventType(event);
                const listIndex = resolveListIndex(event);
                const listName = resolveListName(event);
                
                if (listIndex !== undefined) {
                    this.currentSelectedIndex = listIndex;
                } else if (!listName) {
                    // Manual tracking for UP/DOWN events if simulator lacks index and name
                    const typeStr = String(eventType).toUpperCase();
                    if (eventType === 1 || typeStr.includes('UP') || typeStr.includes('BACK')) {
                        this.currentSelectedIndex = Math.max(0, this.currentSelectedIndex - 1);
                    } else if (eventType === 2 || typeStr.includes('DOWN') || typeStr.includes('FORWARD')) {
                        this.currentSelectedIndex = Math.min(this.actionLabels.length - 1, this.currentSelectedIndex + 1);
                    }
                }

                if (DOUBLE_CLICK_EVENTS.has(eventType)) {
                    if (Date.now() - this.lastRebuildTime < 500) return;
                    onAction('double_click');
                    return;
                }
                
                const isUndefinedListEvent = (eventType === undefined || eventType === null) && isActionsListEvent(event);
                if (!CLICK_EVENTS.has(eventType) && !isUndefinedListEvent) {
                    // Ignore non-click events
                    return;
                }

                if (Date.now() - this.lastRebuildTime < 500) {
                    this.log('Ignored phantom click shortly after rebuild');
                    return;
                }

                const actionIndex = listIndex ?? this.currentSelectedIndex;
                const finalAction = resolveAction(actionIndex, listName) ?? (listName ? null : 'primary');
                
                this.log(`Extracted list click: index=${actionIndex}, name=${String(listName)}, finalAction=${String(finalAction)}`);
                if (finalAction) {
                    onAction(finalAction);
                }
            });

            return true;
        } catch (error) {
            this.log(`init failed: ${(error as Error).message}`);
            this.bridge = null;
            this.pageCreated = false;
            return false;
        }
    }

    async syncActionLabels(status: SessionStatus, _activity?: any): Promise<void> {
        if (!this.bridge || !this.pageCreated) return;
        const nextLabels = getLabels(status);
        const nextMode: DisplayMode | 'selecting_activity' =
            status === 'selecting_activity' ? 'selecting_activity' :
            (status === 'paused' || status === 'finished' ? 'summary' : 'live');
        const labelsChanged = this.actionLabels.join('|') !== nextLabels.join('|');
        const modeChanged = this.displayMode !== nextMode;
        if (!labelsChanged && !modeChanged) return;

        this.actionLabels = nextLabels;
        this.displayMode = nextMode;
        this.currentSelectedIndex = 0; // Reset index on layout rebuild
        
        this.isRebuilding = true;
        this.lastRebuildTime = Date.now();
        let rebuilt = false;
        try {
            rebuilt = await this.bridge.rebuildPageContainer(
                new RebuildPageContainer(this.getLayout()),
            );
        } finally {
            this.lastRebuildTime = Date.now();
            this.isRebuilding = false;
        }

        if (!rebuilt) {
            this.log('syncActionLabels failed');
            return;
        }
        this.pageCreated = true;
    }

    async pushRouteImage(imageData: number[]): Promise<boolean> {
        if (!this.bridge || !this.pageCreated || this.displayMode !== 'summary') return false;

        const run = async (): Promise<unknown> => {
            if (!this.bridge) return false;
            return this.bridge.updateImageRawData(
                new ImageRawDataUpdate({
                    containerID: 1,
                    containerName: 'routeImg',
                    imageData,
                }),
            );
        };

        const next = this.imageQueue.then(run, run);
        this.imageQueue = next.then(
            () => true,
            () => true,
        );
        const result = await next;
        return result === 0 || result === true || result === 'success';
    }

    async pushStats(
        activity: ActivityType,
        _status: SessionStatus,
        metrics: WorkoutMetrics,
        laps: number,
        _gpsStatus: string,
    ): Promise<void> {
        if (!this.bridge || !this.pageCreated) return;

        const content =
            `DIST: ${formatDistance(metrics.distanceMeters)}   ` +
            `TIME: ${formatDuration(metrics.elapsedMs)}   ` +
            `LAPS: ${laps}   ` +
            `${primaryMetricLabel(activity) === 'Velocidade' ? 'VEL:' : 'RITM:'} ${formatPrimaryMetric(activity, metrics)}`;

        await this.bridge.textContainerUpgrade(
            new TextContainerUpgrade({
                containerID: 2,
                containerName: 'metricsText',
                content,
            }),
        );
    }

    destroy(): void {
        if (!this.bridge) return;
        this.bridge.shutDownPageContainer(0).catch((error: Error) => {
            this.log(`shutDownPageContainer failed: ${error.message}`);
        });
    }
}
