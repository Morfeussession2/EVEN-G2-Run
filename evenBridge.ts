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

import { formatDistance, formatDuration, formatPrimaryMetric } from './metrics';
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

        if (normalized.includes('BIKE')) return 'primary';
        if (normalized.includes('RUN')) return 'secondary';
        if (normalized.includes('WALK')) return 'tertiary';

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
    if (status === 'selecting_activity') return ['BIKE', 'RUN', 'WALK'];
    if (status === 'tracking') return ['PAUSE', 'STOP'];
    if (status === 'paused') return ['START', 'STOP'];
    if (status === 'finished') return ['NEW', 'RESUME'];
    return ['START', 'STOP'];
};

const getListPositionAndSize = (isSelecting: boolean) => {
    if (isSelecting) {
        return {
            xPosition: 245,
            yPosition: 100,
            width: 75,
            height: 120,
            itemWidth: 75,
        };
    }

    return {
        xPosition: 18,
        yPosition: 150,
        width: 100,
        height: 120,
        itemWidth: 100,
    };
};

const isActionsListEvent = (event: any): boolean => {
    return (
        event?.listEvent?.containerName === 'actionsList' ||
        event?.jsonData?.listEvent?.containerName === 'actionsList' ||
        event?.jsonData?.containerName === 'actionsList' ||
        event?.listEvent?.containerID === 1 ||
        event?.jsonData?.containerID === 1
    );
};

export class EvenRunBridge {
    private bridge: AnyBridge | null = null;
    private pageCreated = false;
    private debugLog: DebugLogger = () => { };
    private imageUpdateQueue: Promise<boolean> = Promise.resolve(true);

    private actionLabels: string[] = ['BIKE', 'RUN', 'WALK'];
    private displayMode: DisplayMode | 'selecting_activity' = 'selecting_activity';
    private currentSelectedIndex: number = 0;

    private log(message: string): void {
        const line = `[EvenRunBridge] ${message}`;
        this.debugLog(line);
    }

    private getLayout() {
        const isSelecting = this.displayMode === 'selecting_activity';
        const showMap = this.displayMode === 'summary';
        const listDims = getListPositionAndSize(isSelecting);

        // Container allocation:
        //  selecting: 1 (list only)
        //  live:      4 (labelsImg + activityIcon + metricsText + list)
        //  summary:   5 (labelsImg + activityIcon + routeMap + metricsText + list)
        const containerTotalNum = isSelecting ? 1 : (showMap ? 5 : 4);

        return {
            containerTotalNum,

            textObject: isSelecting ? [] : [
                new TextContainerProperty({
                    containerID: 2,
                    containerName: 'metricsText',
                    xPosition: 150,
                    yPosition: 30,   // sits below 42 px labels banner
                    width: 288,
                    height: 36,
                    isEventCapture: 0,
                    content: '--     --     --',
                }),
            ],

            listObject: [
                new ListContainerProperty({
                    containerID: 1,
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

            imageObject: [
                // Container 3: labels banner (200×42) — always when not selecting
                ...(!isSelecting ? [
                    new ImageContainerProperty({
                        containerID: 3,
                        containerName: 'labelsImg',
                        xPosition: 180, // Aligned with metricsText
                        yPosition: 6,
                        width: 200,
                        height: 24, // Reduced to kill "sobra preta" over the digits
                    }),
                ] : []),

                // Container 4: activity icon (32×32) — positioned freely
                ...(!isSelecting ? [
                    new ImageContainerProperty({
                        containerID: 4,
                        containerName: 'activityIcon',
                        xPosition: 500,
                        yPosition: 8,
                        width: 24,
                        height: 24,
                    }),
                ] : []),

                // Container 5: route map (200×100) — only in summary
                ...(showMap ? [
                    new ImageContainerProperty({
                        containerID: 5,
                        containerName: 'routeImg',
                        xPosition: 338,
                        yPosition: 150,
                        width: 200,
                        height: 100,
                    }),
                ] : []),
            ],
        };
    }

    async init(onAction: (action: BridgeAction) => void, onDebugLog?: DebugLogger): Promise<boolean> {
        this.debugLog = onDebugLog ?? (() => { });
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

    async syncActionLabels(status: SessionStatus, _activity: ActivityType): Promise<void> {
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

    private async enqueueImageUpdate(
        containerID: number,
        containerName: string,
        imageData: number[],
        source: string,
    ): Promise<unknown> {
        const run = async (): Promise<unknown> => {
            if (!this.bridge) return false;
            const result = await this.bridge.updateImageRawData(
                new ImageRawDataUpdate({
                    containerID,
                    containerName,
                    imageData,
                }),
            );
            this.log(`${source} updateImageRawData container=${containerName} result=${String(result)}`);
            return result;
        };

        const next = this.imageUpdateQueue.then(run, run);
        this.imageUpdateQueue = next.then(
            () => true,
            () => true,
        );
        return next;
    }

    async pushRouteImage(imageData: number[]): Promise<boolean> {
        if (!this.bridge || !this.pageCreated) return false;
        const result = await this.enqueueImageUpdate(5, 'routeImg', imageData, 'pushRouteImage');
        return (result as any) === 0 || (result as any) === true || (result as any) === 'success';
    }

    async pushMetricsBanner(imageData: number[]): Promise<boolean> {
        if (!this.bridge || !this.pageCreated) return false;
        const result = await this.enqueueImageUpdate(3, 'labelsImg', imageData, 'pushMetricsBanner');
        return (result as any) === 0 || (result as any) === true || (result as any) === 'success';
    }

    async pushActivityIcon(imageData: number[]): Promise<boolean> {
        if (!this.bridge || !this.pageCreated) return false;
        const result = await this.enqueueImageUpdate(4, 'activityIcon', imageData, 'pushActivityIcon');
        return (result as any) === 0 || (result as any) === true || (result as any) === 'success';
    }

    async pushStats(
        activity: ActivityType,
        _status: SessionStatus,
        metrics: WorkoutMetrics,
        _laps: number,
        _gpsStatus: string,
    ): Promise<void> {
        if (!this.bridge || !this.pageCreated) return;

        // Values row aligned to the three columns: TIME | DIST | VEL
        const timeVal = formatDuration(metrics.elapsedMs);
        const distVal = formatDistance(metrics.distanceMeters);
        const velVal = formatPrimaryMetric(activity, metrics);
        const content = `${timeVal}    ${distVal}    ${velVal}`;

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
        this.bridge.shutDownPageContainer(0).catch(() => { });
    }
}