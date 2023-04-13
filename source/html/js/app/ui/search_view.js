/*! Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
       SPDX-License-Identifier: Apache-2.0 */

import * as model from "../model.js";
import * as search from "../search.js";
import * as ui_util from "./util.js";
import * as tile_view from "./tile_view.js";
import * as diagrams from "./diagrams.js";

const tab_id = "nav-search-tab";

const blinks = 10;

const show = function () {
    $("#" + tab_id).tab("show");
};

function display_search_results(results) {
    display_results_search_text(results);
    display_results_model_matches(results);
    display_results_diagram_name_matches(results);
    display_results_diagram_contents_matches(results);
    display_results_tile_name_matches(results);
    display_results_tile_contents_matches(results);
}

function display_results_search_text(results) {
    console.log(results);
    $("#search-text-div").text(results.text);
}

function display_results_model_matches(results) {
    $("#inventory-match-count").text(results.model.length);
    let html = `<ol>`;
    for (const node of results.model) {
        const id = ui_util.makeid();
        const line = `<li><b>${node.title}:</b> <a href="#" title="Drag to a Diagram or Tile" data-node-id="${node.id}" draggable="true" id="${id}">${node.name}</a></li>`;
        html += line;
    }
    const close = `</ol>`;
    html += close;
    $("#global-model-search").html(html);
}

function display_results_diagram_name_matches(results) {
    const anchor_handler_data = [];
    $("#diagram-names-match-count").text(results.diagram_names.length);
    let html = `<ol>`;
    for (const name of results.diagram_names) {
        const id = ui_util.makeid();
        const line = `<li><a href="#" data-diagram-name="${name}" draggable="true" title="Click or Drag to a Diagram or Tile" id="${id}">${name}</a></li>`;
        html += line;
        anchor_handler_data.push({
            diagram: diagrams.get_by_name(name),
            anchor_id: id,
        });
    }
    const close = `</ol>`;
    html += close;
    $("#diagram-names-match").html(html);
    for (const item of anchor_handler_data) {
        const anchor_id = item.anchor_id;
        const eventClosure = (function (local_item, local_console) {
            const diagram = local_item.diagram;
            return function () {
                if (!diagram.shown()) {
                    diagram.network.once(
                        "afterDrawing",
                        (function () {
                            return function () {
                                local_console.log(diagram);
                                diagram.network.fit();
                            };
                        })()
                    );
                    diagram.show();
                } else {
                    diagram.network.fit();
                }
            };
        })(item, console);
        $("#" + anchor_id).on("click", eventClosure);
    }
}

function display_results_diagram_contents_matches(results) {
    const anchor_handler_data = [];
    $("#diagram-contents-match-count").text(results.diagram_contents.length);
    let html = `<ol>`;
    for (const entry of results.diagram_contents) {
        const name = entry.diagram;
        for (const node_id of entry.found) {
            const node = model.nodes.get(node_id);
            const id = ui_util.makeid();
            const line = `<li><b>${name}: </b>${node.title}: <a href="#" data-node-id="${node.id}" draggable="true" title="Click or Drag to a Diagram or Tile" id="${id}">${node.name}</a></li>`;
            html += line;
            anchor_handler_data.push({
                diagram: diagrams.get_by_name(name),
                node_id: node.id,
                anchor_id: id,
            });
        }
    }
    const close = `</ol>`;
    html += close;
    $("#diagram-contents-match").html(html);
    for (const item of anchor_handler_data) {
        const anchor_id = item.anchor_id;
        const eventClosure = (function (local_item, local_console) {
            const diagram = local_item.diagram;
            const node_id = local_item.node_id;
            return function () {
                if (!diagram.shown()) {
                    diagram.network.once(
                        "afterDrawing",
                        (function () {
                            return function () {
                                local_console.log(diagram);
                                local_console.log(node_id);
                                diagram.network.fit({
                                    nodes: [node_id],
                                    animation: true,
                                });
                                diagram.blink(blinks, node_id);
                            };
                        })()
                    );
                    diagram.show();
                } else {
                    diagram.network.fit({
                        nodes: [node_id],
                        animation: true,
                    });
                    diagram.blink(blinks, node_id);
                }
            };
        })(item, console);
        $("#" + anchor_id).on("click", eventClosure);
    }
}

function display_results_tile_name_matches(results) {
    const anchor_handler_data = [];
    $("#tile-names-match-count").text(results.tile_names.length);
    let html = `<ol>`;
    for (const name of results.tile_names) {
        const id = ui_util.makeid();
        const line = `<li><a href="#" title="Click or Drag to a Diagram or Tile" data-tile-name="${name}" draggable="true" id="${id}">${name}</a></li>`;
        html += line;
        anchor_handler_data.push({
            tile: name,
            anchor_id: id,
        });
    }
    const close = `</ol>`;
    html += close;
    $("#tile-names-match").html(html);
    for (const item of anchor_handler_data) {
        const anchor_id = item.anchor_id;
        const eventClosure = (function (local_item, local_jq, local_tile_view) {
            const name = local_item.tile;
            return function () {
                local_jq("#channel-tiles-tab").tab("show");
                local_tile_view.blink(name);
            };
        })(item, $, tile_view);
        $("#" + anchor_id).on("click", eventClosure);
    }
}

function display_results_tile_contents_matches(results) {
    const anchor_handler_data = [];
    $("#tile-contents-match-count").text(results.tile_contents.length);
    let html = `<ol>`;
    for (const entry of results.tile_contents) {
        const name = entry.tile;
        for (const node_id of entry.found) {
            const node = model.nodes.get(node_id);
            const id = ui_util.makeid();
            const line = `<li><b><a href="#" title="Click or Drag to a Diagram or Tile" data-tile-name="${name}" draggable="true" id="${id}">${name}</a>: </b>${node.title}: <a href="#" draggable="true" title="Drag to a Diagram or Tile" data-node-id="${node.id}">${node.name}</a></li>`;
            html += line;
            anchor_handler_data.push({
                tile: name,
                anchor_id: id,
            });
        }
    }
    const close = `</ol>`;
    html += close;
    $("#tile-contents-match").html(html);
    for (const item of anchor_handler_data) {
        const anchor_id = item.anchor_id;
        const eventClosure = (function (local_item, local_jq, local_tile_view) {
            return function () {
                local_jq("#channel-tiles-tab").tab("show");
                local_tile_view.blink(local_item.tile);
            };
        })(item, $, tile_view);
        $("#" + anchor_id).on("click", eventClosure);
    }
}

function search_now() {
    show();
    const text = $("#search_input").val();
    const useful = /\S+/;
    if (useful.test(text)) {
        search.search(text).then(function (results) {
            display_search_results(results);
            // build the results compartment
        });
    } else {
        console.log("whitespace only");
    }
}

// enter key handler
$("#search_input,#search_input_2").keypress(function (event) {
    const keycode = event.keyCode ? event.keyCode : event.which;
    if (keycode == "13") {
        if (event.target.id == "search_input") {
            $("#search_input_2").val($("#search_input").val());
        } else {
            $("#search_input").val($("#search_input_2").val());
        }
        search_now();
    }
});

$("#search-now-button,#search-now-button-2").click(function (event) {
    if (event.target.id == "search-now-button") {
        $("#search_input_2").val($("#search_input").val());
    } else {
        $("#search_input").val($("#search_input_2").val());
    }
    search_now();
    return false;
});
