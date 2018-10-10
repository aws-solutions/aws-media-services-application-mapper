/*! Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
       SPDX-License-Identifier: Apache-2.0 */

define(["jquery", "app/model", "app/search", "app/ui/global_view", "app/ui/util", "app/ui/tile_view"],
    function($, model, fuse, global_view, ui_util, tile_view) {

        var tab_id = "nav-search-tab";

        var node_visibility_timer;

        var visibility_change_delay = 500;

        var show = function() {
            $("#" + tab_id).tab('show');
        };

        var border_blinker = function(blinks, node) {
            if (blinks > 0) {
                setTimeout(function() {
                    if (blinks % 2 == 0) {
                        global_view.get_network().selectNodes([node.id], false);
                    } else {
                        global_view.get_network().unselectAll();
                    }
                    border_blinker(blinks - 1, node);
                }, 500);
            }
        };

        var display_search_results = function(text, model_matches, tile_matches) {
            var showing_global = ($("#global-model-tab").attr("aria-selected") == "true");
            if (text != "") {
                // $("#nav-search-subtitle").html("Search for '<i>" + text + "</i>'");
                if (showing_global) {
                    $("#global-model-collapse").collapse('show');
                }
                var html = ` for '${text}' (${model_matches.length} match${model_matches.length != 1 ? "es" : ""})`;
                $("#global-model-search-text").html(html);
                if (model_matches.length > 0) {
                    // show the global model accordian
                    var html = `<ol>`;
                    var targets = [];
                    $.each(model_matches, (index, node) => {
                        var id = ui_util.makeid();
                        targets.push({
                            id: id,
                            node: node
                        });
                        html += "<li><b>" + node.title + ":</b> <a href='#' id='" + id + "'>" + node.name + "</a></li>";
                    });
                    html += "</ol>";
                    $("#global-model-search").html(html);
                    $.each(targets, (index, target) => {
                        var eventClosure = function() {
                            var node = model.nodes.get(target.node.id);
                            return function(event) {
                                // console.log(target);
                                var tab = $("#global-model-tab");
                                // console.log(tab.attr("aria-selected"));
                                if (tab.attr("aria-selected") == "false") {
                                    $("#global-model-tab").tab('show');
                                    setTimeout(function() {
                                        global_view.fit([target.node.id]);
                                        border_blinker(6, node);
                                    }, 1000);
                                } else {
                                    global_view.fit([target.node.id]);
                                    border_blinker(6, node);
                                }
                            };
                        }();
                        $("#" + target.id).on("click", eventClosure);
                    });
                } else {
                    // hide the global model accordian
                    // $("#global-model-collapse").collapse('hide');
                    var span = `<span class="mx-3">No matches found</span>`;
                    $("#global-model-search").html(span);
                }
                // show tile matches
                if (!showing_global) {
                    $("#channel-tile-collapse").collapse('show');
                }
                var html = ` for '${text}' (${tile_matches.length} match${tile_matches.length != 1 ? "es" : ""})`;
                $("#channel-tile-search-text").html(html);
                if (tile_matches.length > 0) {
                    // show the global model accordian
                    var html = `<ol>`;
                    var targets = [];
                    $.each(tile_matches, (index, name) => {
                        var id = ui_util.makeid();
                        targets.push({
                            id: id,
                            name: name
                        });
                        html += "<li><a href='#' id='" + id + "'>" + name + "</a></li>";
                    });
                    html += "</ol>";
                    $("#channel-tile-search").html(html);
                    $.each(targets, (index, target) => {
                        var eventClosure = function() {
                            return function(event) {
                                // console.log(target);
                                var tab = $("#channel-tiles-tab");
                                // console.log(tab.attr("aria-selected"));
                                if (tab.attr("aria-selected") == "false") {
                                    $("#channel-tiles-tab").tab('show');
                                }
                                tile_view.select_tile(target.name);
                            };
                        }();
                        $("#" + target.id).on("click", eventClosure);
                    });
                } else {
                    // hide the global model accordian
                    // $("#global-model-collapse").collapse('hide');
                    var span = `<span class="mx-3">No matches found</span>`;
                    $("#channel-tile-search").html(span);
                }
            } else {
                $("#nav-search-subtitle").html("");
                $("#global-model-search").html("");
                $("#global-model-search-text").html("");
                $("#channel-tile-search").html("");
                $("#channel-tile-search-text").html("");
            }
        }

        var update_node_visibility = function(only_matches) {
            only_matches = only_matches | ($("#only-show-matches-button").attr("aria-pressed") === "true");
            if (!only_matches) {
                // remove hidden property from all nodes
                console.log("setting hidden to false");
                $.each(model.nodes.get(), function(index, node) {
                    node.hidden = false;
                    model.nodes.update(node);
                });
            } else {
                var text = $("#search_input").val().trim();
                if (text !== "") {
                    var matches = fuse.search_nodes(text);
                    if (matches.length > 0) {
                        $.each(model.nodes.get(), function(index, node) {
                            var found = false;
                            $.each(matches, (index, match) => {
                                found = node.id === match.id;
                                if (found) {
                                    node.hidden = false;
                                    return false;
                                }
                            });
                            if (!found) {
                                node.hidden = true;
                            }
                            // console.log("node.id = " + node.id + " hidden = " + node.hidden);
                            model.nodes.update(node);
                        });
                    }
                }
            }
        };

        var update_tile_visibility = function(only_matches) {
            only_matches = only_matches | ($("#only-show-matches-button").attr("aria-pressed") === "true");
            if (!only_matches) {
                // remove hidden property from all tiles
                $("[data-channel-name]").show();
            } else {
                var text = $("#search_input").val().trim();
                if (text !== "") {
                    $("[data-channel-name]").hide();
                    var matches = fuse.search_tiles(text);
                    if (matches.length > 0) {
                        $.each(matches, (index, match) => {
                            var query = `[data-channel-name='${match}']`;
                            $(query).show();
                        });
                    }
                }
            }
        };

        var clear_search = function() {
            // enable the show matches button
            $("#only-show-matches-button").prop("disabled", false);
            $("#only-show-matches-button").attr("aria-disabled", "false");
            // enabked the search input and clear it
            $("#search_input").prop("readonly", false);
            $("#search_input").attr("aria-disabled", "false");
            $("#search_input").val("");
            $("#search_input").focus();
            $("#nav-search-subtitle").html("");
            $("#nav-search-text").html("");
            only_show_matches(false);
            display_search_results("", []);
            setTimeout(function() {
                update_node_visibility();
                update_tile_visibility()
            }, 500);
        };

        var set_node_filter = function(name, visible_node_ids) {
            // set the channel name in the search field
            $("#search_input").val(name);
            // make the search field read only
            $("#search_input").prop("readonly", true);
            $("#search_input").attr("aria-disabled", "true");
            // make the show matches button disabled
            $("#only-show-matches-button").prop("disabled", true);
            $("#only-show-matches-button").attr("aria-disabled", "true");
            $.each(model.nodes.get(), function(node_index, node) {
                var found = false;
                $.each(visible_node_ids, (id_index, id) => {
                    found = node.id === id;
                    if (found) {
                        node.hidden = false;
                        return false;
                    }
                });
                if (!found) {
                    node.hidden = true;
                }
                // console.log("node.id = " + node.id + " hidden = " + node.hidden);
                model.nodes.update(node);
            });
            setTimeout(function() {
                global_view.fit(visible_node_ids);
            }, 1000);
        };

        var only_show_matches = function(toggle) {
            if (toggle) {
                $("#only-show-matches-button").addClass("active");
                $("#only-show-matches-button").attr("aria-pressed", true);
            } else {
                $("#only-show-matches-button").removeClass("active");
                $("#only-show-matches-button").attr("aria-pressed", false);
            }
        }

        $("#search_input").on("input propertychange", () => {
            show();
            var text = $("#search_input").val();
            var model_matches = fuse.search_nodes(text);
            var tile_matches = fuse.search_tiles(text);
            display_search_results(text, model_matches, tile_matches);
            if ($("#only-show-matches-button").attr("aria-pressed") === "true") {
                if (undefined !== node_visibility_timer) {
                    clearTimeout(node_visibility_timer);
                }
                node_visibility_timer = setTimeout(update_node_visibility, visibility_change_delay);
            }
        });

        $("#search-reset-button").on("click", () => {
            clear_search();
            return false;
        });

        $("#only-show-matches-button").on("click", (event) => {
            // we get the click, and the previous value of the toggle
            var hidden = !($("#only-show-matches-button").attr("aria-pressed") === "true");
            only_show_matches(hidden);
            $("#search_input").focus();
            setTimeout(function() {
                update_node_visibility(hidden);
                update_tile_visibility(hidden);
            }, 100);
            return false;
        });

        return {
            "set_node_filter": set_node_filter,
            "clear_search": clear_search
        }

    });