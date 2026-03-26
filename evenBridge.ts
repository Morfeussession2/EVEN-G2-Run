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
    const value =
        event?.listEvent?.currentSelectItemIndex ??
        event?.jsonData?.listEvent?.currentSelectItemIndex ??
        event?.jsonData?.currentSelectItemIndex;

    if (value === undefined || value === null) return undefined;

    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
};

const resolveListName = (event: any): string | undefined =>
    event?.listEvent?.currentSelectItemName ??
    event?.jsonData?.listEvent?.currentSelectItemName ??
    event?.jsonData?.currentSelectItemName;

const resolveAction = (index: number | undefined, name?: string): BridgeAction | null => {
    if (name) {
        const normalized = name.toUpperCase();

        if (normalized.includes('CICLISMO')) return 'primary';
        if (normalized.includes('CORRIDA')) return 'secondary';
        if (normalized.includes('CAMINHADA')) return 'tertiary';

        if (normalized.includes('START') || normalized.includes('PAUSE') || normalized.includes('NEW')) return 'primary';
        if (normalized.includes('RESUME')) return 'secondary';
        if (normalized.includes('STOP')) return 'tertiary';
    }

    if (index === 0) return 'primary';
    if (index === 1) return 'secondary';
    if (index === 2) return 'tertiary';

    return null;
};

const getLabels = (status: SessionStatus): string[] => {
    if (status === 'selecting_activity') return ['CICLISMO', 'CORRIDA', 'CAMINHADA'];
    if (status === 'tracking') return ['PAUSE', 'STOP'];
    if (status === 'paused') return ['START', 'STOP'];
    if (status === 'finished') return ['NEW', 'RESUME'];
    return ['START', 'STOP'];
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
    return (
        event?.listEvent?.containerName === 'actionsList' ||
        event?.jsonData?.listEvent?.containerName === 'actionsList' ||
        event?.jsonData?.containerName === 'actionsList' ||
        event?.listEvent?.containerID === 3 ||
        event?.jsonData?.containerID === 3
    );
};

export class EvenRunBridge {
    private bridge: AnyBridge | null = null;
    private pageCreated = false;
    private debugLog: DebugLogger = () => {};
    private imageQueue: Promise<boolean> = Promise.resolve(true);
    private actionLabels: string[] = ['CICLISMO', 'CORRIDA', 'CAMINHADA'];
    private displayMode: DisplayMode | 'selecting_activity' = 'selecting_activity';
    private currentSelectedIndex: number = 0;

    private log(message: string): void {
        const line = `[EvenRunBridge] ${message}`;
        this.debugLog(line);
    }

    private getLayout() {
        const isSelecting = this.displayMode === 'selecting_activity';
        const showImage = this.displayMode === 'summary';
        const listDims = getListPositionAndSize(isSelecting);

        return {
            containerTotalNum: isSelecting ? 1 : (showImage ? 3 : 2),

            textObject: isSelecting ? [] : [
                new TextContainerProperty({
                    containerID: 2,
                    containerName: 'metricsText',
                    xPosition: 18,
                    yPosition: 14,
                    width: 540,
                    height: 40,
                    isEventCapture: 0,
                    content: 'DIST: --   TIME: --   RITM: --',
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
                        itemCount: this.actionLabels.length,
                        itemWidth: listDims.itemWidth,
                        itemName: [...this.actionLabels],
                        isItemSelectBorderEn: 1,
                    }),
                }),
            ],

            imageObject: showImage
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
            this.bridge = await waitForEvenAppBridge();

            const layout = this.getLayout();

            const createResult = await this.bridge.createStartUpPageContainer(
                new CreateStartUpPageContainer(layout),
            );

            if (createResult !== 0) {
                await this.bridge.rebuildPageContainer(
                    new RebuildPageContainer(layout),
                );
            }

            this.pageCreated = true;

            this.bridge.onEvenHubEvent((event: any) => {
                const eventType = parseEventType(event);

                if (DOUBLE_CLICK_EVENTS.has(eventType)) {
                    onAction('double_click');
                    return;
                }

                const isClick =
                    CLICK_EVENTS.has(eventType) ||
                    ((eventType === undefined || eventType === null) && isActionsListEvent(event));

                if (!isClick) return;

                const index = resolveListIndex(event) ?? this.currentSelectedIndex;
                const name = resolveListName(event);

                const action = resolveAction(index, name);

                if (action) {
                    onAction(action);
                }
            });

            return true;
        } catch {
            this.bridge = null;
            this.pageCreated = false;
            return false;
        }
    }

    async syncActionLabels(status: SessionStatus): Promise<void> {
        if (!this.bridge || !this.pageCreated) return;

        this.actionLabels = getLabels(status);

        this.displayMode =
            status === 'selecting_activity'
                ? 'selecting_activity'
                : status === 'paused' || status === 'finished'
                ? 'summary'
                : 'live';

        this.currentSelectedIndex = 0;

        await this.bridge.rebuildPageContainer(
            new RebuildPageContainer(this.getLayout()),
        );
    }

    async pushRouteImage(imageData: number[]): Promise<boolean> {
        if (!this.bridge || !this.pageCreated) return false;

        const result = await this.bridge.updateImageRawData(
            new ImageRawDataUpdate({
                containerID: 1,
                containerName: 'routeImg',
                imageData,
            }),
        );

        return result === 0 || result === true || result === 'success';
    }

    async pushStats(
        activity: ActivityType,
        _status: SessionStatus,
        metrics: WorkoutMetrics,
        _laps: number,
        _gpsStatus: string,
    ): Promise<void> {
        if (!this.bridge || !this.pageCreated) return;

        const content =
            `DIST: ${formatDistance(metrics.distanceMeters)}   ` +
            `TIME: ${formatDuration(metrics.elapsedMs)}   ` +
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
        this.bridge.shutDownPageContainer(0).catch(() => {});
    }
}