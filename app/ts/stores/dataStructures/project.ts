// Data structures for project saving and loading, as well as undo/redo snapshots.

import { Track } from './alignment';
import { Label } from './labeling';
import { TabID } from './types';

// These saved states are JSON.stringify()-able objects that can be saved directly to disk in JSON format.

export interface SavedMarker {
    id: string;
    trackId: string;
    localTimestamp: number;
}

export interface SavedMarkerCorrespondence {
    marker1ID: string;
    marker2ID: string;
}

export interface SavedTrack {
    id: string;
    minimized: boolean;
    source: string;
    aligned: boolean;
    referenceStart: number;
    referenceEnd: number;
}

export interface SavedAlignedTimeSeriesState {
    referenceStart: number;
    referenceEnd: number;
    rangeStart: number;
    pixelsPerSecond: number;
}

export interface SavedAlignmentState {
    markers: SavedMarker[];
    correspondences: SavedMarkerCorrespondence[];
    timeSeriesStates: { [name: string]: SavedAlignedTimeSeriesState };
}

export interface SavedLabelingState {
    labels: Label[];
    classes: string[];
    classColormap: { [name: string]: string };
}

export interface SavedUiState {
    // Current tab.
    currentTab: TabID;
    // Zooming level.
    referenceViewStart: number;
    referenceViewPPS: number;
}

export interface SavedMetadata {
    name: string;
    timeSaved: number;
}

export interface SavedProject {
    referenceTrack: SavedTrack;
    tracks: SavedTrack[];

    metadata: SavedMetadata;
    alignment: SavedAlignmentState;
    labeling: SavedLabelingState;
    ui: SavedUiState;
}

// A snapshot is a in-memory data structure that contain references to datasets.
// This is used for undo/redo.
// Never try to serialize them using JSON, because there might be circular references or unserializable objects.
export interface SavedAlignmentSnapshot {
    referenceTrack: Track;
    tracks: Track[];
    alignment: SavedAlignmentState;
}

export interface SavedLabelingSnapshot {
    labeling: SavedLabelingState;
}
