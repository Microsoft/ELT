import { TransitionController } from '../stores/utils';
import { globalDispatcher } from '../dispatcher/globalDispatcher';
import { NodeEvent } from './NodeEvent';
import { alignmentLabelingStore } from './stores';
import * as d3 from 'd3';
import { EventEmitter } from 'events';
import { observer } from 'mobx-react';
import { action, computed, observable } from 'mobx';

export function startTransition(
    duration: number,
    easing: string,
    onProgress?: (t: number, finish?: boolean) => void): TransitionController {

    return new TransitionController(duration, easing, onProgress);
}

// AlignmentLabelingUiStore: UI States for common part of alignment and labeling: the global zooming level. 
export class AlignmentLabelingUiStore {

    // Zooming view parameters.
    @observable public viewWidth: number;
    @observable public referenceViewStart: number;
    @observable public referenceViewPPS: number;

    // // Keep the time range of the reference track.
    // @computed private get _referenceTimestampStart() {
    //     return alignmentLabelingStore.referenceTrack.alignedTimeSeries ?
    //         d3.min(alignmentLabelingStore.referenceTrack.alignedTimeSeries, (x) => x.referenceStart)
    //         : 0;
    // }
    // @computed private get _referenceTimestampEnd() {
    //     return alignmentLabelingStore.referenceTrack.alignedTimeSeries ?
    //         d3.max(alignmentLabelingStore.referenceTrack.alignedTimeSeries, (x) => x.referenceEnd)
    //         : 100;
    // }

    // Global cursor.
    @observable public referenceViewTimeCursor: number;

    // Current transition.
    private _referenceViewTransition: TransitionController;

    constructor() {
        // Initial setup.
        this.viewWidth = 800;
        this.referenceViewStart = 0;
        this.referenceViewPPS = 0.1;
        this._referenceViewTransition = null;
        this.referenceViewTimeCursor = null;

        // Listen to the track changed event from the alignmentLabelingStore.
        alignmentLabelingStore.tracksChanged.on(this.onTracksChanged.bind(this));

    }

    // On tracks changed, update zooming parameters so that the views don't overflow.
    public onTracksChanged(): void {
        if (alignmentLabelingStore.referenceTrack) {
            [this.referenceViewStart, this.referenceViewPPS] = this.constrainDetailedViewZoomingParameters(this.referenceViewStart, this.referenceViewPPS);
        }
    }

    // Exposed properties.
    // Detailed view zooming and translation.
    // FIXME: should these be computed?
    public get referenceViewDuration(): number { return this.viewWidth / this.referenceViewPPS; }
    public get referenceViewEnd(): number { return this.referenceViewStart + this.viewWidth / this.referenceViewPPS; }

    // // FIXME: can't computed just be public??
    // public get referenceTimestampStart(): number { return this._referenceTimestampStart; }
    // public get referenceTimestampEnd(): number { return this._referenceTimestampEnd; }

    // Set the zooming parameters.
    public setReferenceViewZooming(referenceViewStart: number, referenceViewPPS: number): void {
        [referenceViewStart, referenceViewPPS] = this.constrainDetailedViewZoomingParameters(referenceViewStart, referenceViewPPS);
        this.referenceViewStart = referenceViewStart;
        this.referenceViewPPS = referenceViewPPS;
    }

    @action
    public setViewWidth(width: number): void {
        [this.referenceViewStart, this.referenceViewPPS] =
            this.constrainDetailedViewZoomingParameters(this.referenceViewStart, this.referenceViewPPS);
    }

    // FIXME duplicate function names input parameter names
    @action
    public setReferenceViewZoomingAction(referenceViewStartAction: number, referenceViewPPSAction: number = null, animate: boolean = false): void {
        if (referenceViewStartAction === null) { referenceViewStartAction = this.referenceViewStart; }
        if (referenceViewPPSAction === null) { referenceViewPPSAction = this.referenceViewPPS; }
        const [referenceViewStart, referenceViewPPS] =
            this.constrainDetailedViewZoomingParameters(referenceViewStartAction, referenceViewPPSAction);
        // Change current class to label's class.
        if (this.referenceViewStart !== referenceViewStart || this.referenceViewPPS !== referenceViewPPS) {
            if (!animate) {
                if (this._referenceViewTransition) {
                    this._referenceViewTransition.terminate();
                    this._referenceViewTransition = null;
                }
                this.referenceViewStart = referenceViewStart;
                this.referenceViewPPS = referenceViewPPS;
            } else {
                if (this._referenceViewTransition) {
                    this._referenceViewTransition.terminate();
                    this._referenceViewTransition = null;
                }
                const start0 = this.referenceViewStart;
                const zoom0 = this.referenceViewPPS;
                const start1 = referenceViewStart;
                const zoom1 = referenceViewPPS;
                this._referenceViewTransition = startTransition(100, 'linear', (t: number) => {
                    this.referenceViewStart = start0 + (start1 - start0) * t;
                    if (zoom1) {
                        this.referenceViewPPS = 1 / (1 / zoom0 + (1 / zoom1 - 1 / zoom0) * t);
                    }
                });
            }
        }
    }

    @action
    public referenceViewPanAndZoom(zoom: number, percentage: number, zoomCenter: 'cursor' | 'center' = 'cursor'): void {
        if (zoom !== 0) {
            const k = Math.exp(-zoom);
            // Two rules to compute new zooming.
            // 1. Time cursor should be preserved: (time_cursor - old_start) * old_pps = (time_cursor - new_start) * new_pps
            // 2. Zoom factor should be applied: new_start = k * old_start
            const oldPPS = this.referenceViewPPS;
            const oldStart = this.referenceViewStart;
            let timeCursor = this.referenceViewStart + this.referenceViewDuration / 2;
            if (zoomCenter === 'cursor') { timeCursor = this.referenceViewTimeCursor; }
            const newPPS = oldPPS * k;
            const newStart = oldStart / k + timeCursor * (1 - 1 / k);
            this.setReferenceViewZoomingAction(newStart, newPPS, false);
        }
        if (percentage !== 0) {
            const originalStart = this.referenceViewStart;
            const timeWidth = this.referenceViewDuration;
            this.setReferenceViewZoomingAction(originalStart + timeWidth * percentage, null, true);

        }
        if (percentage !== 0) {
            const originalStart = this.referenceViewStart;
            const timeWidth = this.referenceViewDuration;
            this.setReferenceViewZoomingAction(originalStart + timeWidth * percentage, null, true);
        }
    }

    @action
    public setReferenceViewTimeCursor(timeCursor: number): void {
        // Change current class to label's class.
        if (this.referenceViewTimeCursor !== timeCursor) {
            this.referenceViewTimeCursor = timeCursor;
        }
    }


    // Return updated zooming parameters so that they don't exceed the reference track range.
    private constrainDetailedViewZoomingParameters(referenceViewStart: number, referenceViewPPS: number): [number, number] {
        if (referenceViewStart === null) { referenceViewStart = this.referenceViewStart; }
        if (referenceViewPPS === null) { referenceViewPPS = this.referenceViewPPS; }
        // Check if we go outside of the view, if yes, tune the parameters.
        referenceViewPPS = Math.max(this.viewWidth / (alignmentLabelingStore.referenceTimestampEnd - alignmentLabelingStore.referenceTimestampStart), referenceViewPPS);
        referenceViewStart = Math.max(alignmentLabelingStore.referenceTimestampStart, Math.min(alignmentLabelingStore.referenceTimestampEnd - this.viewWidth / referenceViewPPS, referenceViewStart));
        return [referenceViewStart, referenceViewPPS];
    }
    
}
