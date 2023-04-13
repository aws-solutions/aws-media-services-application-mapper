/*! Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
       SPDX-License-Identifier: Apache-2.0 */

import * as ui_util from "./util.js";
import * as model from "../model.js";
import * as layout from "./layout.js";
import * as diagram_statemachine_factory from "./diagram_statemachine_factory.js";
import * as alert from "./alert.js";
import * as settings from "../settings.js";
import * as vis_options from "./vis_options.js";

class Diagram {
    constructor(name, view_id) {
        // recurring and one-time callbacks
        this.click_callbacks = [];
        this.click_callbacks_once = [];
        this.doubleclick_callbacks = [];
        this.doubleclick_callbacks_once = [];
        this.node_dataset_callbacks = [];
        this.node_dataset_callbacks_once = [];
        // DOM containers
        this.tab_container_id = "diagram-tab";
        this.diagram_container = $("#diagram-tab-content");
        // this is used as the display name (UI display)
        this.name = name;
        // this is used as any internal ID for the diagram/view, including layout, settings
        this.view_id = view_id;
        // make a unique id for our base elements
        this.base_id = ui_util.makeid();
        // create ids for our tab and diagram div
        this.tab_id = "tab_" + this.base_id;
        this.tab_icon_id = this.tab_id + "_icon";
        this.diagram_id = "diagram_" + this.base_id;
        // drag-select
        this.drag_canvas = null;
        this.drag_ctx = null;
        this.drag_rect = {};
        this.drag = false;
        this.drawingSurfaceImageData = null;
        // other state
        this.first_fit = false;
        // locking some functions (move, add, delete)
        this.locked = false;
        // This FSM manages the startup and state restoration
        this.statemachine = diagram_statemachine_factory.create(this);
        // development logging
        this.statemachine.on(
            "transition",
            (function () {
                return function (data) {
                    // log the state transitions of the FSMs
                    console.log(data);
                };
            })()
        );
        // build it, restore it
        this.statemachine.start();
    }

    remove() {
        // remove the tab and the div
        $("#" + this.tab_id).remove();
        $("#" + this.diagram_id).remove();
    }

    layout_vertical(save) {
        const my_diagram = this;
        settings.get("layout-method").then(function (response) {
            let method = response.method;
            let options = vis_options.vertical_layout;
            options.layout.hierarchical.sortMethod = method;
            my_diagram.network.once(
                "afterDrawing",
                (function () {
                    return function () {
                        console.log("layout finished");
                        my_diagram.network.setOptions(
                            vis_options.without_layout
                        );
                        my_diagram.layout_isolated(false);
                        my_diagram.network.fit();
                        if (save) {
                            layout.save_layout(my_diagram);
                        }
                    };
                })()
            );
            console.log("layout start");
            my_diagram.network.setOptions(options);
        });
    }

    layout_horizontal(save) {
        let my_diagram = this;
        settings.get("layout-method").then(function (response) {
            let method = response.method;
            let options = vis_options.horizontal_layout;
            options.layout.hierarchical.sortMethod = method;
            my_diagram.network.once(
                "afterDrawing",
                (function () {
                    return function () {
                        console.log("layout finished");
                        my_diagram.network.setOptions(
                            vis_options.without_layout
                        );
                        my_diagram.layout_isolated(false);
                        my_diagram.network.fit();
                        if (save) {
                            layout.save_layout(my_diagram);
                        }
                    };
                })()
            );
            console.log("layout start");
            my_diagram.network.setOptions(options);
        });
    }

    layout_isolated(save) {
        let isolated = new Map();
        let diagram = this;
        for (let node_id of this.nodes.getIds()) {
            let connected = diagram.network.getConnectedNodes(node_id);
            if (connected.length === 0) {
                let node = diagram.nodes.get(node_id);
                let group = isolated.get(node.title);
                if (!group) {
                    group = [node_id];
                } else {
                    group.push(node_id);
                }
                isolated.set(node.title, group);
            }
        }
        let dimensions = diagram.node_dimensions();
        let pad_x = Math.ceil(dimensions.max_width * 1.25);
        let pad_y = Math.ceil(dimensions.max_height * 1.25);
        for (let value of isolated.values()) {
            let node_ids = value;
            let bounds = diagram.bounds();
            // extra padding at the start
            let start_x = bounds.max_x + pad_x * 2;
            let current_x = start_x;
            let current_y = bounds.min_y + pad_y;
            let nodes_per_row = Math.ceil(Math.sqrt(node_ids.length));
            let current_row_nodes = 0;
            for (let id of node_ids) {
                diagram.network.moveNode(id, current_x, current_y);
                current_row_nodes += 1;
                if (current_row_nodes < nodes_per_row) {
                    current_x += pad_x;
                } else {
                    current_row_nodes = 0;
                    current_x = start_x;
                    current_y += pad_y;
                }
            }
        }
        if (save) {
            layout.save_layout(diagram);
        }
    }

    node_dimensions() {
        let max_width = 0;
        let max_height = 0;
        try {
            let node_id = _.head(this.nodes.getIds());
            let box = this.network.getBoundingBox(node_id);
            let height = Math.abs(box.bottom - box.top);
            let width = Math.abs(box.right - box.left);
            if (height > max_height) {
                max_height = height;
            }
            if (width > max_width) {
                max_width = width;
            }
        } catch (error) {
            // print only
            console.log(error);
            max_height = 0;
            max_width = 0;
        }
        return {
            max_width: max_width,
            max_height: max_height,
        };
    }

    bounds() {
        let min_x = Number.MAX_SAFE_INTEGER;
        let max_x = Number.MIN_SAFE_INTEGER;
        let min_y = Number.MAX_SAFE_INTEGER;
        let max_y = Number.MIN_SAFE_INTEGER;
        let positions = this.network.getPositions();
        for (let pos_value of Object.values(positions)) {
            if (pos_value.x > max_x) {
                max_x = pos_value.x;
            }
            if (pos_value.x < min_x) {
                min_x = pos_value.x;
            }
            if (pos_value.y > max_y) {
                max_y = pos_value.y;
            }
            if (pos_value.y < min_y) {
                min_y = pos_value.y;
            }
        }
        return {
            min_x: min_x,
            max_x: max_x,
            min_y: min_y,
            max_y: max_y,
        };
    }

    restore_nodes() {
        let diagram = this;
        return new Promise(function (resolve, reject) {
            layout
                .retrieve_layout(diagram)
                .then(function (layout_items) {
                    let node_ids = _.map(layout_items, "id");
                    let nodes = _.compact(model.nodes.get(node_ids));
                    diagram.nodes.update(nodes);
                    resolve(layout_items);
                })
                .catch(function (error) {
                    console.error(error);
                    reject(error);
                });
        });
    }

    restore_layout(diagram_contents) {
        let diagram = this;
        return new Promise(function (resolve, reject) {
            let inner_promise;
            if (!diagram_contents) {
                inner_promise = layout.retrieve_layout(diagram);
            } else {
                inner_promise = Promise.resolve(diagram_contents);
            }
            inner_promise
                .then(function (layout_items) {
                    for (let item of layout_items) {
                        let node = diagram.nodes.get(item.id);
                        if (node) {
                            diagram.network.moveNode(item.id, item.x, item.y);
                        }
                    }
                    resolve(layout_items);
                })
                .catch(function (error) {
                    console.error(error);
                    reject(error);
                });
        });
    }

    restore_edges() {
        for (let node_id of this.nodes.getIds()) {
            // find all edges connected to this node
            let matches = model.edges.get({
                filter: (function (local_node_id) {
                    return function (edge) {
                        return (
                            edge.to == local_node_id ||
                            edge.from == local_node_id
                        );
                    };
                })(node_id),
            });
            // add each edge if both nodes are present
            for (let edge of matches) {
                if (this.edges.get(edge.id) == null) {
                    // compact nulls, do we have both ends?
                    let ends = _.compact(this.nodes.get([edge.to, edge.from]));
                    if (ends.length == 2) {
                        // yes, add the edge between the endpoints
                        this.edges.update(edge);
                    }
                }
            }
        }
    }

    synchronize_edges(event, node_ids) {
        let diagram = this;
        for (let id of node_ids) {
            let filteredEdges = _.filter(
                model.edges.get(),
                (edge) => (edge.to == id || edge.from == id),
            );
            if (event == "add" || event == "update") {
                _.forEach(
                    filteredEdges,
                    edge => {
                        if (diagram.nodes.get(edge.from) || diagram.nodes.get(edge.to)) {
                            diagram.edges.update(edge);
                        }
                    },
                );
            } else if (event == "remove") {
                _.forEach(
                    filteredEdges,
                    edge => diagram.edges.remove(edge.id),
                );
            }
        }
    }

    synchronize_content(event, node_ids) {
        let diagram = this;
        if (event == "add") {
            layout.save_layout(diagram, node_ids);
        } else if (event == "remove") {
            layout.delete_layout(diagram, node_ids);
        }
    }

    hide_div() {
        $("#" + this.diagram_div).hide();
    }

    show_div() {
        $("#" + this.diagram_div).show();
    }

    show() {
        $("#" + this.tab_id).show();
        $("#" + this.tab_id).tab("show");
    }

    shown() {
        return $("#" + this.tab_id).attr("aria-selected") == "true";
    }

    fit_to_nodes(node_ids) {
        if (Array.isArray(node_ids)) {
            this.network.fit({
                nodes: node_ids,
                animation: true,
            });
        }
    }

    fit_to_nearest(x, y) {
        // get the vis canvas location of the doubletap
        let click_x = x;
        let click_y = y;
        let network = this.network;
        let closest = null;
        // get all the node locations
        let positions = network.getPositions();
        // find the node closest to the doubletap
        for (let p of Object.entries(positions)) {
            if (closest == null) {
                closest = {
                    id: p[0],
                    dx: Math.abs(click_x - p[1].x),
                    dy: Math.abs(click_y - p[1].y),
                };
            } else {
                let dx = Math.abs(click_x - p[1].x);
                let dy = Math.abs(click_y - p[1].y);
                // update the closest node if better one is found
                if (dx + dy < closest.dx + closest.dy) {
                    closest = {
                        id: p[0],
                        dx: dx,
                        dy: dy,
                    };
                }
            }
        }
        if (closest != null) {
            // zoom to the closest node to the doubletap
            network.fit({
                nodes: [closest.id],
                animation: true,
            });
        }
    }

    save_drawing_surface() {
        this.drawingSurfaceImageData = this.drag_ctx.getImageData(
            0,
            0,
            this.drag_canvas.width,
            this.drag_canvas.height
        );
    }

    restore_drawing_surface() {
        this.drag_ctx.putImageData(this.drawingSurfaceImageData, 0, 0);
    }

    select_nodes_from_highlight() {
        let nodesIdInDrawing = [];
        let xRange = this.get_start_to_end(
            this.drag_rect.startX,
            this.drag_rect.w
        );
        let yRange = this.get_start_to_end(
            this.drag_rect.startY,
            this.drag_rect.h
        );

        for (let curNode of this.nodes.get()) {
            let nodePosition = this.network.getPositions([curNode.id]);
            let nodeXY = this.network.canvasToDOM({
                x: nodePosition[curNode.id].x,
                y: nodePosition[curNode.id].y,
            });
            if (
                xRange.start <= nodeXY.x &&
                nodeXY.x <= xRange.end &&
                yRange.start <= nodeXY.y &&
                nodeXY.y <= yRange.end
            ) {
                nodesIdInDrawing.push(curNode.id);
            }
        }
        this.network.selectNodes(nodesIdInDrawing);
        alert.show(nodesIdInDrawing.length + " selected");
    }

    get_start_to_end(start, theLen) {
        return theLen > 0 ? {
            start: start,
            end: start + theLen,
        } : {
            start: start + theLen,
            end: start,
        };
    }

    add_singleclick_callback(callback, once = false) {
        if (once) {
            if (!this.click_callbacks_once.includes(callback)) {
                this.click_callbacks_once.push(callback);
            }
        } else {
            if (!this.click_callbacks.includes(callback)) {
                this.click_callbacks.push(callback);
            }
        }
    }

    add_doubleclick_callback(callback, once = false) {
        if (once) {
            if (!this.doubleclick_callbacks_once.includes(callback)) {
                this.doubleclick_callbacks_once.push(callback);
            }
        } else {
            if (!this.doubleclick_callbacks.includes(callback)) {
                this.doubleclick_callbacks.push(callback);
            }
        }
    }

    add_node_dataset_callback(callback, once = false) {
        if (once) {
            if (!this.node_dataset_callbacks_once.includes(callback)) {
                this.node_dataset_callbacks_once.push(callback);
            }
        } else {
            if (!this.node_dataset_callbacks.includes(callback)) {
                this.node_dataset_callbacks.push(callback);
            }
        }
    }

    blink(blinks, ids) {
        let interval_ms = 500;
        ids = Array.isArray(ids) ? ids : [ids];
        let diagram = this;
        if (blinks > 0) {
            setTimeout(function () {
                if (blinks % 2 == 0) {
                    diagram.network.selectNodes(ids, false);
                } else {
                    diagram.network.unselectAll();
                }
                diagram.blink(blinks - 1, ids);
            }, interval_ms);
        } else {
            diagram.network.unselectAll();
        }
    }

    alert(state) {
        if (state) {
            $("#" + this.tab_icon_id).text("warning");
        } else {
            $("#" + this.tab_icon_id).text("image_aspect_ratio");
        }
    }

    lock(state) {
        const key = `diagram_lock_${this.view_id}`;
        this.locked = Boolean(state).valueOf();
        return settings.put(key, { name: this.name, locked: this.locked });
    }

    isLocked() {
        const key = `diagram_lock_${this.view_id}`;
        return new Promise((resolve, reject) => {
            const my_diagram = this;
            settings
                .get(key)
                .then(function (value) {
                    if (value) {
                        my_diagram.locked = value.locked;
                    } else {
                        my_diagram.locked = false;
                    }
                    resolve(my_diagram.locked);
                })
                .catch((error) => {
                    reject(error);
                });
        });
    }
}

export function create(name, view_id) {
    return new Diagram(name, view_id);
}

// this shuts down the browser's context menu
document.body.oncontextmenu = function () {
    return false;
};
