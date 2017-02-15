// The main labeling view.

import { LabelConfirmationState, SignalsViewMode } from '../../stores/dataStructures/labeling';
import { LayoutParameters } from '../../stores/dataStructures/LayoutParameters';
import { KeyCode } from '../../stores/dataStructures/types';
import * as stores from '../../stores/stores';
import { getUniqueIDForObject, startDragging } from '../../stores/utils';
import { TrackView } from '../common/TrackView';
import { LabelType, LabelView } from './LabelView';
import * as d3 from 'd3';
import { observer } from 'mobx-react';
import * as React from 'react';

export interface LabelingViewProps {
    // Viewport size.
    viewWidth: number;
    viewHeight: number;
}


interface LabelingViewState {
    hint_t0?: number;
    hint_t1?: number;
}

@observer
export class LabelingView extends React.Component<LabelingViewProps, LabelingViewState> {
    public refs: {
        [key: string]: Element,
        interactionRect: Element
    };

    constructor(props: LabelingViewProps, context: any) {
        super(props, context);
        this.state = { hint_t0: null, hint_t1: null };
        this.onKeyDown = this.onKeyDown.bind(this);
    }

    private onKeyDown(event: KeyboardEvent): void {
        if (event.srcElement === document.body) {
            if (event.keyCode === KeyCode.BACKSPACE || event.keyCode === KeyCode.DELETE) {
                if (stores.labelingUiStore.selectedLabels) {
                    stores.labelingUiStore.selectedLabels.forEach(label => {
                        stores.labelingStore.removeLabel(label);
                    });
                }
            }
        }
        if (event.ctrlKey && event.keyCode === 'Z'.charCodeAt(0)) { // Ctrl-Z
            stores.projectStore.labelingUndo();
        }
        if (event.ctrlKey && event.keyCode === 'Y'.charCodeAt(0)) { // Ctrl-Y
            stores.projectStore.labelingRedo();
        }
    }

    private getRelativePosition(event: { clientX: number; clientY: number }): number[] {
        const x: number = event.clientX - this.refs.interactionRect.getBoundingClientRect().left;
        const y: number = event.clientY - this.refs.interactionRect.getBoundingClientRect().top;
        return [x, y];
    }

    private onMouseMove(event: React.MouseEvent<Element>): void {
        const x = this.getRelativePosition(event)[0];
        const t = this.getTimeFromX(x);
        stores.projectUiStore.setReferenceTrackTimeCursor(t);
    }

    private getTimeFromX(x: number): number {
        return stores.projectUiStore.referenceTrackPanZoom.getTimeFromX(x);
    }

   
    private onMouseDownCreateLabel(event: React.MouseEvent<Element>): void {
        const t0 = this.getTimeFromX(this.getRelativePosition(event)[0]);
        let t1 = null;
        if (stores.labelingUiStore.currentClass === null) {
            alert('Please select a class before creating labels.');
            return;
        }

        const isInteractionRect = event.target === this.refs.interactionRect;
        if (isInteractionRect) {
            stores.labelingUiStore.clearLabelSelection();
        }

        startDragging(
            moveEvent => {
                t1 = this.getTimeFromX(this.getRelativePosition(moveEvent)[0]);
                this.setState({
                    hint_t0: Math.min(t0, t1),
                    hint_t1: Math.max(t0, t1)
                });
            },
            upEvent => {
                this.setState({
                    hint_t0: null,
                    hint_t1: null
                });
                if (t0 !== t1 && t1) {
                    if (stores.labelingUiStore.currentClass) {
                        const newLabel = {
                            timestampStart: Math.min(t0, t1),
                            timestampEnd: Math.max(t0, t1),
                            className: stores.labelingUiStore.currentClass,
                            state: LabelConfirmationState.MANUAL
                        };
                        stores.labelingStore.addLabel(newLabel);
                        stores.labelingUiStore.selectLabel(newLabel);
                    }
                } else {
                    if (isInteractionRect && (upEvent as MouseEvent).shiftKey) {
                        const labels = stores.labelingStore.getLabelsInRange(
                            {
                                timestampStart: stores.projectUiStore.referenceTrackTimeRange.timestampStart,
                                timestampEnd: t0
                            });
                        if (labels.length > 0) {
                            // Get the one with largest timestampEnd.
                            labels.sort((a, b) => a.timestampEnd - b.timestampEnd);
                            const lastLabel = labels[labels.length - 1];
                            if (lastLabel.timestampEnd < t0) {  // add if t0 is after the last label.
                                const newLabel = {
                                    timestampStart: lastLabel.timestampEnd,
                                    timestampEnd: t0,
                                    className: stores.labelingUiStore.currentClass,
                                    state: LabelConfirmationState.UNCONFIRMED
                                };
                                stores.labelingStore.addLabel(newLabel);
                                stores.labelingUiStore.selectLabel(newLabel);
                            }
                        }
                    }
                }
            }
        );
    }

    private onMouseWheel(event: React.WheelEvent<Element>): void {
        // Decide the zooming factor.
        stores.projectUiStore.zoomReferenceTrack(event.deltaY / 1000, 'cursor');
    }

    public render(): JSX.Element {
        // Compute sensor area dimensions.

        // Layout parameters.
        const timeAxisHeight = 20;
        const labelBandHeight = 20;

        // Offset parameters.
        // --- time axis ---------
        // [ label status        ]
        const timeAxisY0 = 2;
        const timeAxisY1 = timeAxisY0 + timeAxisHeight;
        // [ labels ]
        const labelAreaY0 = timeAxisY1 + labelBandHeight;
        const labelAreaY1 = this.props.viewHeight;
        // [ timeseries ]
        const sensorAreaY0 = labelAreaY0;
        const sensorAreaY1 = labelAreaY1;

        // Time cursor and hint's Y span.
        const timeCursorY0 = timeAxisY1;
        const timeCursorY1 = labelAreaY1;

        const start = stores.projectUiStore.referenceTrackPanZoom.rangeStart;
        const pps = stores.projectUiStore.referenceTrackPanZoom.pixelsPerSecond;
        // The time scale.
        const scale = d3.scaleLinear()
            .domain([start, start + this.props.viewWidth / pps])
            .range([0, this.props.viewWidth]);

        // Hint range.
        let gHint = null;
        if (this.state.hint_t0 && this.state.hint_t1) {
            gHint = (
                <g className='time-hint'>
                    <rect
                        x={scale(this.state.hint_t0)}
                        y={timeCursorY0}
                        width={scale(this.state.hint_t1) - scale(this.state.hint_t0)}
                        height={timeCursorY1 - timeCursorY0}
                    />
                </g>
            );
        }

        let suggestionProgress = null;
        if (stores.labelingUiStore.isSuggesting) {
            suggestionProgress = (
                <g>
                    <rect
                        x={scale(stores.labelingUiStore.suggestionTimestampStart)}
                        y={timeAxisY1 - 3}
                        width={scale(stores.labelingUiStore.suggestionTimestampCompleted) - scale(stores.labelingUiStore.suggestionTimestampStart)}
                        height={3}
                        style={{ fill: '#AAA' }}
                    />
                </g>
            );
        }

        const labels = stores.labelingUiStore.getLabelsInRange(stores.projectUiStore.referenceTrackPanZoom.getTimeRangeToX(this.props.viewWidth));
        const labelsView = (
                <g transform={`translate(${-stores.projectUiStore.referenceTrackPanZoom.pixelsPerSecond * stores.projectUiStore.referenceTrackPanZoom.rangeStart},0)`}>
                    {labels.map(label =>
                        <LabelView
                            key={`label-${getUniqueIDForObject(label)}`}
                            label={label}
                            pixelsPerSecond={stores.projectUiStore.referenceTrackPanZoom.pixelsPerSecond}
                            height={labelAreaY1 - labelAreaY0}
                            classColormap={stores.labelingStore.classColormap}
                            labelType={LabelType.Detailed}
                        />
                    )}
                </g>
            );
 
        const signalsViewMode = stores.labelingUiStore.signalsViewMode;
        const maxOverlapFactor = signalsViewMode === SignalsViewMode.TIMESERIES ? 0.4 : 0;
        const tracksViewHeight = sensorAreaY1 - sensorAreaY0;
        let trackViewTrackHeight = tracksViewHeight;
        let tracksViewTrackSpacing = 0;
        if (stores.projectStore.tracks.length > 1) {
            const n = stores.projectStore.tracks.length;
            trackViewTrackHeight = tracksViewHeight / (n - n * maxOverlapFactor + maxOverlapFactor);
            tracksViewTrackSpacing = trackViewTrackHeight * (1 - maxOverlapFactor);
        }


        return (
            <g className='labeling-detailed-view'>
                <g
                    onMouseMove={event => this.onMouseMove(event)}
                    onWheel={event => this.onMouseWheel(event)}
                    onMouseDown={event => this.onMouseDownCreateLabel(event)}
                >

                    <rect ref='interactionRect'
                        x={0} y={sensorAreaY0} width={this.props.viewWidth} height={sensorAreaY1 - sensorAreaY0}
                        style={{ fill: 'none', stroke: 'none', pointerEvents: 'all', cursor: 'crosshair' }}
                    />

                    {
                        stores.projectStore.tracks.map((track, index) => (
                            <g key={track.id}
                                transform={`translate(0, ${sensorAreaY0 + tracksViewTrackSpacing * index})`}>
                                <TrackView
                                    track={track}
                                    zoomTransform={stores.projectUiStore.referenceTrackPanZoom}
                                    viewHeight={trackViewTrackHeight}
                                    viewWidth={this.props.viewWidth}
                                    colorScale={LayoutParameters.seriesColorScale}
                                    useMipmap={true}
                                    signalsViewMode={signalsViewMode}
                                />
                            </g>
                        ))
                    }

                    {suggestionProgress}

                    <rect
                        x={0}
                        y={timeAxisY1}
                        width={this.props.viewWidth}
                        height={labelBandHeight}
                        style={{ stroke: 'none', fill: '#EEE', cursor: 'crosshair' }}
                    />

                    <g className='labels' transform={`translate(0, ${labelAreaY0})`}>
                        {labelsView}
                    </g>

                    {gHint}
                </g>
            </g>
        );
    }
}
