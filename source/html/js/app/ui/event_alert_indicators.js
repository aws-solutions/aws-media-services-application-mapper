/*! Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
       SPDX-License-Identifier: Apache-2.0 */

import * as model from "../model.js";
import * as event_alerts from "../events.js";
import * as diagrams from "./diagrams.js";

/**
 * Retrieve all edges originating from the given arn.
 */

const getEdges = (arn) => {
    const edges = model.edges.get({
        filter: (item) => {
            // first arn in the edge id is the source
            return item.id.startsWith(`${arn}:`);
        },
    });
    return _.isArray(edges) ? edges : [edges];
};

/**
 * Retrieve all edges with the given arn and belonging to the given pipeline.
 */

const getEdgesByPipeline = (arn, pipeline, bidi = true) => {
    let options;
    if (bidi) {
        options = {
            filter: (item) => {
                // the arn as the source or target and the pipeline number at the end
                return (
                    (item.id.includes(`:${arn}:`) ||
                        item.id.startsWith(`${arn}:`)) &&
                    item.id.endsWith(`:${pipeline}`)
                );
            },
        };
    } else {
        options = {
            filter: (item) => {
                return (
                    item.id.startsWith(`${arn}:`) &&
                    item.id.endsWith(`:${pipeline}`)
                );
            },
        };
    }
    const edges = model.edges.get(options);
    return _.isArray(edges) ? edges : [edges];
};

/**
 * Update the node on all containing diagrams
 * @param {DataSet} node The DataSet node provided by the model.
 * @param {Boolean} alertState If true, alert setting call, or false for alert clearing
 * @param {String} dataSet Default to 'nodes. Only other possible option is 'edges'.
 */
const updateUIHandler = (node, alertState = true, dataSet = "nodes") => {
    let matches = [];
    if (dataSet === "nodes") {
        matches = diagrams.have_all([node.id]);
    } else if (dataSet === "edges") {
        // both nodes of an edge need to be on a diagram for the edge to be there
        matches = diagrams.have_all([node.from, node.to]);
    }

    for (const diagram of matches) {
        // update the diagrams state
        diagram[dataSet].update(node);
        diagram.alert(alertState);
    }
};

const updateAlertHandler = (node, active_alert = true, alert_details = {}) => {
    let selected = null;
    let unselected = null;
    let newState = "normal";

    if (node.degraded) {
        newState = "degraded";
        selected = node.render.degraded_selected();
        unselected = node.render.degraded_unselected();
    } else if (node.alerting) {
        newState = "alerting";
        selected = node.render.alert_selected();
        unselected = node.render.alert_unselected();
    } else {
        selected = node.render.normal_selected();
        unselected = node.render.normal_unselected();
    }

    if (
        selected != node.image.selected ||
        unselected != node.image.unselected
    ) {
        /** Update the node */
        node.image.selected = selected;
        node.image.unselected = unselected;
        model.nodes.update(node);
        updateUIHandler(node, active_alert);
    }

    const newEdgeOpts = {
        color: {
            color:
                active_alert === true && newState !== "normal" ? "red" : "black",
        },
        dashes: active_alert === true && newState !== "normal",
        hoverWidth: 1,
    };

    let edges;
    if (node.id.includes(":medialive:") && node.id.includes(":channel:")) {
        // get edges in both directions if possible
        edges = getEdgesByPipeline(node.id, parseInt(alert_details.pipeline));
    }
    else {
        // get outbound edges
        edges = getEdges(node.id);
    }

    /** Update the edges */
    edges.forEach((edge) => {
        if (
            edge.color.color !== newEdgeOpts.color.color ||
            edge.dashes !== newEdgeOpts.dashes
        ) {
            edge.color = newEdgeOpts.color;
            edge.dashes = newEdgeOpts.dashes;
            edge.hoverWidth = newEdgeOpts.hoverWidth;
            model.edges.update(edge);
            updateUIHandler(edge, active_alert, "edges");
        }
    });
};

function updateAlertHelper(node, item, is_running) {
    if (_.has(item, "detail") === false || _.has(item.detail, "pipeline") === false) {
        node.degraded = false;
        updateAlertHandler(node, !is_running, item.detail);
        return;
    }
    // create the attribute if its not there
    if (!_.isArray(node.running_pipelines)) {
        if (
            _.has(node.data, "ChannelClass") &&
            node.data.ChannelClass === "SINGLE_PIPELINE"
        ) {
            node.running_pipelines = new Array(1);
        } else if (
            _.has(node.data, "ChannelClass") &&
            node.data.ChannelClass === "STANDARD"
        ) {
            node.running_pipelines = new Array(2);
        } else if (_.has(node.data, "PipelinesRunningCount")) {
            const count = Number.parseInt(
                node.data.PipelinesRunningCount
            );
            node.running_pipelines = new Array(count);
        } else {
            node.running_pipelines = new Array(1);
        }
        node.running_pipelines.fill(1);
    }
    const index = Number.parseInt(item.detail.pipeline);
    node.running_pipelines[index] = is_running ? 1 : 0;
    node.degraded =
        _.sum(node.running_pipelines) > 0 &&
        _.sum(node.running_pipelines) <
        node.running_pipelines.length;
    updateAlertHandler(node, !is_running, item.detail);
}

const updateEventAlertState = (current_alerts, previous_alerts) => {
    /** iterate through current 'set' alerts */
    const alerting_nodes = new Set();

    // we only need one unique alert per arn/pipeline
    // filter out multiple alerts for either: same arn/pipeline or same arn (if no pipeline)

    const filter = (item) => {
        if (_.has(item, "detail") && _.has(item.detail, "pipeline")) {
            return `${item.resource_arn}:${item.detail.pipeline}`;
        } else {
            return `${item.resource_arn}`;
        }
    };

    const uniq_current_alerts = _.uniqBy(current_alerts, filter);
    const uniq_previous_alerts = _.uniqBy(previous_alerts, filter);

    // use the filtered lists
    current_alerts = uniq_current_alerts;
    previous_alerts = uniq_previous_alerts;

    for (const item of current_alerts) {
        const node = model.nodes.get(item.resource_arn);
        if (!node) {
            continue;
        }
        node.alerting = true;
        alerting_nodes.add(node.id);
        // track which pipelines are down on the model item
        updateAlertHelper(node, item, false);
    }

    // filter out multiple alerts for either: same arn/pipeline or same arn (if no pipeline)
    // cleared alerts are present in the previous list and not in the current list

    const uniq_cleared_alerts = _.differenceBy(
        previous_alerts,
        current_alerts,
        filter
    );

    console.log(`unique cleared alerts: ${uniq_cleared_alerts.length}`);

    for (const cleared of uniq_cleared_alerts) {
        const node = model.nodes.get(cleared.resource_arn);
        if (!node) {
            continue;
        }
        if (!alerting_nodes.has(node.id)) {
            node.alerting = false;
        }
        // track which pipelines are up on the model item
        updateAlertHelper(node, cleared, true);
    }
};

event_alerts.add_callback(updateEventAlertState);
