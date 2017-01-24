import { Label, LabelConfirmationState } from '../../stores/dataStructures/labeling';
import * as stores from '../../stores/stores';
import { startDragging } from '../../stores/utils';
import { SVGGlyphiconButton } from '../svgcontrols/buttons';
import * as d3 from 'd3';
import { observer } from 'mobx-react';
import * as React from 'react';


// LabelPlot: Renders a single label.


export enum LabelKind { Detailed, Overview }


export interface LabelPlotProps {
    // The label to render.
    label: Label;
    // Zooming factor.
    pixelsPerSecond: number;
    // Height of the rendered label.
    height: number;
    isLeastConfidentSuggestion: boolean;
    classColormap: { [name: string]: string };
    labelKind: LabelKind;
}


@observer
export class LabelPlot extends React.Component<LabelPlotProps, {}> {

    constructor(props: LabelPlotProps, context: any) {
        super(props, context);
        this.onMouseEnterLabel = this.onMouseEnterLabel.bind(this);
        this.onMouseLeaveLabel = this.onMouseLeaveLabel.bind(this);
    }

    private onDragLabel(event: React.MouseEvent<Element>, mode: string): void {
        if (event.shiftKey || event.button === 2) { return; }

        event.stopPropagation();
        const eventTarget = event.target;
        const label = this.props.label;
        const t0 = this.props.label.timestampStart;
        const t1 = this.props.label.timestampEnd;
        let isSelected = false;

        startDragging(
            moveEvent => {
                const tNew = stores.alignmentLabelingUiStore.referenceViewTimeCursor;
                if (mode === 'start') {
                    if (!isSelected) {
                        stores.labelingUiStore.selectLabel(label);
                        isSelected = true;
                    }
                    const newTimestampStart = Math.min(t1, tNew);
                    const newTimestampEnd = Math.max(t1, tNew);
                    let newState = label.state;
                    if (label.state === LabelConfirmationState.UNCONFIRMED) {
                        newState = LabelConfirmationState.CONFIRMED_START;
                    } else if (label.state === LabelConfirmationState.CONFIRMED_END) {
                        newState = LabelConfirmationState.CONFIRMED_BOTH;
                    }
                    stores.labelingUiStore.updateLabel(label, {
                        timestampStart: newTimestampStart,
                        timestampEnd: newTimestampEnd,
                        state: newState
                    });
                }
                if (mode === 'end') {
                    if (!isSelected) {
                        stores.labelingUiStore.selectLabel(label);
                        isSelected = true;
                    }
                    const newTimestampStart = Math.min(t0, tNew);
                    const newTimestampEnd = Math.max(t0, tNew);
                    let newState = label.state;
                    if (label.state === LabelConfirmationState.UNCONFIRMED) {
                        newState = LabelConfirmationState.CONFIRMED_END;
                    } else if (label.state === LabelConfirmationState.CONFIRMED_START) {
                        newState = LabelConfirmationState.CONFIRMED_BOTH;
                    }
                    stores.labelingUiStore.updateLabel(label, {
                        timestampStart: newTimestampStart,
                        timestampEnd: newTimestampEnd,
                        state: newState
                    });
                }
                if (mode === 'both') {
                    // label.timestampStart = t0 + tNew - tDown;
                    // label.timestampEnd = t1 + tNew - tDown;
                    // labelingUiStore.updateLabel(label);
                }
            },
            upEvent => {
                if (mode === 'both' && upEvent.target === eventTarget && !isSelected) {
                    stores.labelingUiStore.selectLabel(label);
                    isSelected = true;
                }
            }
        );
    }

    private onMouseEnterLabel(event: React.MouseEvent<Element>): void {
        stores.labelingUiStore.hoverLabel(this.props.label);
    }

    private onMouseLeaveLabel(event: React.MouseEvent<Element>): void {
        stores.labelingUiStore.hoverLabel(null);
    }

    private isLabelConfirmed(): boolean {
        return this.props.label.state === LabelConfirmationState.MANUAL ||
            this.props.label.state === LabelConfirmationState.CONFIRMED_BOTH;
    }

    private getSuggestionConfidenceOrOne(): number {
        const suggestionConfidence =
            this.props.label.suggestionConfidence !== undefined &&
                this.props.label.suggestionConfidence ?
                this.props.label.suggestionConfidence : null;
        if (suggestionConfidence && this.props.label.state !== LabelConfirmationState.CONFIRMED_BOTH) {
            return suggestionConfidence;
        } else {
            return 1;
        }
    }

    private renderLabelOverview(): JSX.Element {
        const label = this.props.label;
        const x1 = label.timestampStart * this.props.pixelsPerSecond;
        const x2 = label.timestampEnd * this.props.pixelsPerSecond;
        let topBand = null;
        if (this.isLabelConfirmed()) {
            topBand = (
                <rect
                    className='top'
                    x={x1}
                    y={0}
                    width={x2 - x1}
                    height={5}
                    style={{ fill: this.props.classColormap[label.className] }}
                    />
            );
        }
        return (
            <g>
                {topBand}
                <rect
                    x={x1}
                    y={5}
                    width={x2 - x1}
                    height={this.props.height - 5}
                    style={{
                        fill: this.props.classColormap[label.className],
                        opacity: 0.1 + this.getSuggestionConfidenceOrOne() * 0.3
                    }}
                    />
            </g>
        );
    }

    private renderLabelDetailed(): JSX.Element {
        const label = this.props.label;
        const x1 = label.timestampStart * this.props.pixelsPerSecond;
        const x2 = label.timestampEnd * this.props.pixelsPerSecond;
        const additionalClasses = [];

        const selected = stores.labelingUiStore.isLabelSelected(this.props.label);
        if (selected) {
            additionalClasses.push('selected');
        }
        let uiElements = null;
        const hovered = stores.labelingUiStore.isLabelHovered(this.props.label);
        if (hovered) {
            additionalClasses.push('hovered');
            uiElements = (
                <g className='label-controls' transform={`translate(${x1}, 0)`}>
                    <SVGGlyphiconButton
                        x={Math.max(0, x2 - x1 - 24)} y={0} width={24} height={24} text='remove'
                        onMouseDown={(e) => {
                            e.stopPropagation();
                            stores.labelingUiStore.removeLabel(this.props.label);
                        } }
                        />
                </g>
            );
        }

        let topBand = null;
        if (this.isLabelConfirmed()) {
            topBand = (
                <rect
                    className='top'
                    x={x1}
                    y={-20}
                    width={x2 - x1}
                    height={20}
                    style={{ fill: this.props.classColormap[label.className] }}
                    />
            );
        }

        const borderColor = hovered || selected ?
            d3.rgb(this.props.classColormap[label.className]).darker(1) :
            this.props.classColormap[label.className];
        const lineY0 = topBand ? -20 : 0;

        let highlightMarker = null;
        if (this.props.isLeastConfidentSuggestion) {
            highlightMarker = (<text x={x1 + 3} y={14} style={{ fill: 'black', fontSize: 12 }}>?</text>);
        }

        return (
            <g className={`label-container ${additionalClasses.join(' ')}`}
                onMouseEnter={this.onMouseEnterLabel}
                onMouseLeave={this.onMouseLeaveLabel}
                >
                {topBand}
                <rect
                    className='range'
                    x={x1}
                    y={0}
                    width={x2 - x1}
                    height={this.props.height}
                    style={{
                        fill: this.props.classColormap[label.className],
                        opacity: 0.1 + this.getSuggestionConfidenceOrOne() * 0.3
                    }}
                    />
                <line
                    className='border'
                    x1={x1} x2={x1} y1={lineY0} y2={this.props.height}
                    style={{ stroke: borderColor }}
                    />
                <line
                    className='border'
                    x1={x2} x2={x2} y1={lineY0} y2={this.props.height}
                    style={{ stroke: borderColor }}
                    />
                {highlightMarker}
                <rect
                    className='middle-handler'
                    x={x1}
                    y={0}
                    width={x2 - x1}
                    height={this.props.height}
                    onMouseDown={event => this.onDragLabel(event, 'both')}
                    />
                <rect
                    className='handler'
                    x={x1 - 3} width={6} y={0} height={this.props.height}
                    onMouseDown={event => this.onDragLabel(event, 'start')}
                    />
                <rect
                    className='handler'
                    x={x2 - 3} width={6} y={0} height={this.props.height}
                    onMouseDown={event => this.onDragLabel(event, 'end')}
                    />
                {uiElements}
            </g>
        );
    }


    public render(): JSX.Element {
        if (this.props.label.state === LabelConfirmationState.REJECTED) {
            return <g></g>;
        } else {
            switch (this.props.labelKind) {
                case LabelKind.Detailed: return this.renderLabelDetailed();
                case LabelKind.Overview: return this.renderLabelOverview();
                default: throw 'missing case';
            }
        }
    }
}