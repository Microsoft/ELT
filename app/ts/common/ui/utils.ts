import * as d3 from 'd3';
import * as fs from 'fs';
import * as path_module from 'path';

import {autocorrelogram} from '../algorithms/Autocorrelation';
import {Dataset, loadSensorTimeSeriesFromFile, loadVideoTimeSeriesFromFile, SensorTimeSeries, TimeSeriesKind} from '../dataset';
import {Label, LabelConfirmationState} from '../labeling';



export function startDragging(
    move?: (e: MouseEvent) => void,
    up?: (e: MouseEvent) => void,
    useCapture: boolean = false): void {

    const handler_move = (event: MouseEvent) => {
        event.preventDefault();
        if (move) { move(event); }
    };
    const handler_up = (event: MouseEvent) => {
        window.removeEventListener('mousemove', handler_move, useCapture);
        window.removeEventListener('mouseup', handler_up, useCapture);
        if (up) { up(event); }
    };

    window.addEventListener('mousemove', handler_move, useCapture);
    window.addEventListener('mouseup', handler_up, useCapture);
}

const unique_id_state = new WeakMap<Object, string>();
let unique_id_counter: number = 1;
export function getUniqueIDForObject(obj: Object): string {
    if (!unique_id_state.has(obj)) {
        const id = 'objuid' + unique_id_counter.toString();
        unique_id_counter += 1;
        unique_id_state.set(obj, id);
        return id;
    }
    return unique_id_state.get(obj);
}


export function isSameArray<T>(arr1?: T[], arr2?: T[]): boolean {
    return arr1 === arr2 || arr1 !== null && arr2 !== null && arr1.length === arr2.length && arr1.every((d, i) => d === arr2[i]);
}


export function makePathDFromPoints(points: number[][]): string {
    return 'M' + points.map(([x, y]) => x + ',' + y).join('L');
}

export function updateLabelConfirmationState(label: Label, endpoint: string): LabelConfirmationState {
    let newState = label.state;
    if (endpoint === 'start') {
        if (label.state === LabelConfirmationState.UNCONFIRMED) {
            newState = LabelConfirmationState.CONFIRMED_START;
        } else if (label.state === LabelConfirmationState.CONFIRMED_END) {
            newState = LabelConfirmationState.CONFIRMED_BOTH;
        }
    }
    if (endpoint === 'end') {
        if (label.state === LabelConfirmationState.UNCONFIRMED) {
            newState = LabelConfirmationState.CONFIRMED_END;
        } else if (label.state === LabelConfirmationState.CONFIRMED_START) {
            newState = LabelConfirmationState.CONFIRMED_BOTH;
        }
    }
    if (endpoint === 'both') {
        newState = LabelConfirmationState.CONFIRMED_BOTH;
    }
    return newState;
}



export class PerItemEventListeners<ItemType> {
    private _listeners: WeakMap<ItemType, Set<Function>>;

    constructor() {
        this._listeners = new WeakMap<ItemType, Set<Function>>();
    }

    public add(item: ItemType, listener: Function): void {
        let listeners: Set<Function>;
        if (this._listeners.has(item)) {
            listeners = this._listeners.get(item);
        } else {
            listeners = new Set<Function>();
            this._listeners.set(item, listeners);
        }
        listeners.add(listener);
    }

    public remove(item: ItemType, listener: Function): void {
        if (this._listeners.has(item)) {
            this._listeners.get(item).delete(listener);
        }
    }

    public emit(item: ItemType, ...args: any[]): void {
        if (this._listeners.has(item)) {
            this._listeners.get(item).forEach((x) => x(...args));
        }
    }
}

export class TransitionController {
    private _timer: number;
    private _onProgress: (t: number, finish?: boolean) => void;
    private _duration: number;

    private _timeStart: number;

    private onTick(): void {
        const t = (new Date().getTime() - this._timeStart) / this._duration;
        if (t > 1) {
            this.terminate();
        } else {
            if (this._onProgress) { this._onProgress(t, false); }
        }
    }

    public terminate(): void {
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = null;
            if (this._onProgress) { this._onProgress(1, true); }
        }
    }

    constructor(duration: number, easing: string, on_progress?: (t: number, finish?: boolean) => void) {
        this._timeStart = new Date().getTime();
        this._onProgress = on_progress;
        this._duration = duration;
        this._timer = setInterval(this.onTick.bind(this), 10);
    }
}




export class ArrayThrottler<ItemType, StationaryType> {
    private _minInterval: number;
    private _callback: (items: ItemType[], stationary: StationaryType) => void;
    private _stationary: StationaryType;
    private _queue: ItemType[];
    private _stationaryDirty: boolean;
    private _tLast: number;

    constructor(minInterval: number, callback: (items: ItemType[], stationary: StationaryType) => void) {
        this._minInterval = minInterval;
        this._callback = callback;
        this._queue = [];
        this._tLast = null;
        this._stationary = null;
        this._stationaryDirty = false;
    }

    public add(item: ItemType): void {
        this.addItems([item]);
    }

    public addItems(items: ItemType[]): void {
        if (items.length < 10) {
            items.forEach((x) => this._queue.push(x));
        } else {
            this._queue = this._queue.concat(items);
        }
        this.start();
    }

    public setStationary(s: StationaryType): void {
        this._stationary = s;
        this._stationaryDirty = true;
        this.start();
    }

    private start(): void {
        if (this._queue.length > 0 || this._stationaryDirty) {
            const t = new Date().getTime();
            if (this._tLast === null || t - this._tLast > this._minInterval) {
                this._tLast = t;
                this._callback(this._queue, this._stationary);
                this._queue = [];
                this._stationaryDirty = false;
            } else {
                setTimeout(this.start.bind(this), this._minInterval - (t - this._tLast));
            }
        }
    }
}




export interface DatasetMetadata {
    name: string;
    sensors: {
        name: string;
        path: string;
        timestampStart?: number;
        timestampEnd?: number;
        alignmentFix?: [number, number];
    }[];
    videos: {
        name: string;
        path: string;
        timestampStart?: number;
        timestampEnd?: number;
        alignmentFix?: [number, number];
    }[];
}

export function loadDataFromMetadata(metadataPath: string, callback: (dataset: Dataset) => void): void {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8').toString()) as DatasetMetadata;
    const dataset = new Dataset();

    let nTasks = 0;
    let nTasksCompleted = 0;

    let fixDuration = null;
    for (const video of metadata.videos) {
        if (video.alignmentFix) {
            const [t1, t2] = video.alignmentFix;
            if (!fixDuration) { fixDuration = t2 - t1; }
            const ymx = fixDuration / (t2 - t1) * (video.timestampEnd - video.timestampStart);
            const x = -ymx * (t1 - video.timestampStart) / (video.timestampEnd - video.timestampStart);
            const y = x + ymx;
            video.timestampStart = x;
            video.timestampEnd = y;
        }
    }
    for (const sensor of metadata.sensors) {
        if (sensor.alignmentFix) {
            const [t1, t2] = sensor.alignmentFix;
            if (!fixDuration) { fixDuration = t2 - t1; }
            const ymx = fixDuration / (t2 - t1) * (sensor.timestampEnd - sensor.timestampStart);
            const x = -ymx * (t1 - sensor.timestampStart) / (sensor.timestampEnd - sensor.timestampStart);
            const y = x + ymx;
            sensor.timestampStart = x;
            sensor.timestampEnd = y;
        }
    }

    metadata.sensors.forEach((s) => {
        const sensor = loadSensorTimeSeriesFromFile(path_module.join(path_module.dirname(metadataPath), s.path));
        sensor.name = s.name;
        if (s.timestampStart !== undefined) { sensor.timestampStart = s.timestampStart; }
        if (s.timestampEnd !== undefined) { sensor.timestampEnd = s.timestampEnd; }
        dataset.addSensor(sensor);
    });

    const checkCallback = () => {
        if (nTasksCompleted === nTasks) {
            // Resolve name and start/end for the dataset.
            dataset.name = metadata.name;

            dataset.timestampStart = d3.max(dataset.timeSeries, (x) => x.timestampStart);
            dataset.timestampEnd = d3.min(dataset.timeSeries, (x) => x.timestampEnd);
            // Call the callback.
            callback(dataset);
        }
    };

    metadata.videos.forEach((s) => {
        nTasks += 1;
        loadVideoTimeSeriesFromFile(path_module.join(path_module.dirname(metadataPath), s.path), (video) => {
            video.name = s.name;
            if (s.timestampStart !== undefined) { video.timestampStart = s.timestampStart; }
            if (s.timestampEnd !== undefined) { video.timestampEnd = s.timestampEnd; }
            dataset.addVideo(video);
            nTasksCompleted += 1;
            checkCallback();
        });
    });

    checkCallback();
}

const autocorrelogramCache = new WeakMap<SensorTimeSeries, SensorTimeSeries>();

export function computeSensorTimeSeriesAutocorrelogram(timeSeries: SensorTimeSeries): SensorTimeSeries {
    if (autocorrelogramCache.has(timeSeries)) { return autocorrelogramCache.get(timeSeries); }

    const sampleRate = (timeSeries.dimensions[0].length - 1) / (timeSeries.timestampEnd - timeSeries.timestampStart);
    const windowSize = Math.ceil(sampleRate * 4);
    const sliceSize = Math.ceil(windowSize / 4);
    const dimension = new Float32Array(timeSeries.dimensions[0].length);
    for (let i = 0; i < timeSeries.dimensions[0].length; i++) {
        dimension[i] = 0;
        for (let j = 0; j < timeSeries.dimensions.length; j++) {
            if (timeSeries.dimensions[j][i] === timeSeries.dimensions[j][i]) {
                dimension[i] += timeSeries.dimensions[j][i];
            }
        }
    }
    const result = autocorrelogram(dimension, windowSize, sliceSize);
    const sliceCount = result.length / windowSize;
    const dimensions: Float32Array[] = [];
    const samplesScale = d3.scaleLinear() // sample index <> sample timestamp
        .domain([0, dimension.length - 1])
        .range([timeSeries.timestampStart, timeSeries.timestampEnd]);
    const sliceScale = d3.scaleLinear() // slice index <> slice timestamp
        .domain([0, sliceCount - 1])
        .range([samplesScale(0 + windowSize / 2), samplesScale(sliceSize * (sliceCount - 1) + windowSize / 2)]);
    for (let i = 0; i < windowSize; i++) {
        const t = dimensions[i] = new Float32Array(sliceCount);
        for (let j = 0; j < sliceCount; j++) {
            t[j] = result[j * windowSize + i];
            if (t[j] !== t[j]) { t[j] = 0; }
        }
    }
    const r = {
        name: timeSeries.name + '.autocorrelogram',
        kind: timeSeries.kind,
        timestampStart: sliceScale.range()[0],
        timestampEnd: sliceScale.range()[1],
        dimensions: dimensions,
        sampleRate: (sliceScale.range()[1] - sliceScale.range()[0]) / (dimension.length - 1),
        scales: [[-1, 1]]
    };
    autocorrelogramCache.set(timeSeries, r);
    return r;
}

export function computeDatasetAutocorrelogram(dataset: Dataset): Dataset {
    const datasetOut = new Dataset();
    datasetOut.name = dataset.name;
    datasetOut.timestampStart = dataset.timestampStart;
    datasetOut.timestampEnd = dataset.timestampEnd;
    for (const series of dataset.timeSeries) {
        if (series.kind === TimeSeriesKind.VIDEO) {
            datasetOut.timeSeries.push(series);
        } else {
            datasetOut.timeSeries.push(computeSensorTimeSeriesAutocorrelogram(series as SensorTimeSeries));
        }
    }
    return datasetOut;
}
