/*! Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
       SPDX-License-Identifier: Apache-2.0 */

import * as model from "../model.js";
import * as event_alerts from "../events.js";
import * as cw_events from "../cloudwatch_events.js";
import * as tile_view from "./tile_view.js";
import * as diagrams from "./diagrams.js";
import * as alarms from "../alarms.js";
import * as confirmation from "./confirmation.js";

let last_displayed;

const consoleIcon = function () {
    return `<i class='fa fa-desktop'></i>`;
};

const trashIcon = function () {
    return `<i class='fa fa-trash'></i>`;
};

const alert_tabulator = new Tabulator("#nav-monitor-alerts-text", {
    placeholder: "No Recent Alerts",
    tooltips: true,
    selectable: false,
    height: 250,
    layout: "fitColumns",
    columns: [
        {
            title: "Event Source ARN",
            field: "resource_arn",
        },
        {
            title: "Event Source Name",
            field: "name",
        },
        {
            title: "Alert",
            field: "alert_type",
        },
        {
            title: "Message",
            field: "message",
            widthGrow: 3,
        },
        {
            title: "Pipeline",
            field: "pipeline",
            widthGrow: 0,
        },
        {
            title: "Time",
            field: "time",
        },
    ],
});

const alarm_tabulator = new Tabulator("#nav-monitor-alarms-text", {
    placeholder: "No Alarm Subscriptions",
    tooltips: true,
    selectable: true,
    selectableRangeMode: "click",
    selectablePersistence: true,
    height: 250,
    layout: "fitColumns",
    columns: [
        {
            title: "Subscriber ARN",
            field: "ARN",
        },
        {
            title: "Subscriber Name",
            field: "name",
        },
        {
            title: "Alarm Region",
            field: "Region",
        },
        {
            title: "Alarm Namespace",
            field: "Namespace",
        },
        {
            title: "Alarm Name",
            field: "AlarmName",
        },
        {
            title: "Alarm State",
            field: "StateValue",
        },
        {
            title: "Alarm State Updated",
            field: "StateUpdated",
        },
        {
            tooltip: "Navigate to Alarm",
            headerSort: false,
            formatter: consoleIcon,
            width: 42,
            hozAlign: "center",
            cellClick: function (e, cell) {
                navigate_to_alarm(cell.getRow()._row.data);
            },
        },
        {
            tooltip: "Unsubscribe Alarm",
            headerSort: false,
            formatter: trashIcon,
            width: 42,
            hozAlign: "center",
            cellClick: function (e, cell) {
                unsubscribe_alarm(cell.getRow()._row.data);
            },
        },
    ],
});

//custom header filter
const dateFilterEditor = function (cell, onRendered, success, cancel) {
    const container = $("<span></span>");
    //create and style input
    const start = $("<input type='text' placeholder='Start'/>");
    const end = $("<input type='text' placeholder='End'/>");

    container.append(start).append(end);

    const inputs = $("input", container);

    inputs
        .css({
            padding: "4px",
            width: "50%",
            "box-sizing": "border-box",
        })
        .val(cell.getValue());

    function buildDateString() {
        return {
            start: start.val(),
            end: end.val(),
        };
    }

    //submit new value on blur
    inputs.on("change blur", function () {
        success(buildDateString());
    });

    //submit new value on enter
    inputs.on("keydown", function (e) {
        if (e.keyCode == 13) {
            success(buildDateString());
        }

        if (e.keyCode == 27) {
            cancel();
        }
    });

    return container[0];
};

//custom filter function
function dateFilterFunction(headerValue, rowValue) {
    //headerValue - the value of the header filter element
    //rowValue - the value of the column in this row
    //rowData - the data for the row being filtered
    //filterParams - params object passed to the headerFilterFuncParams property

    const start = moment(headerValue.start);
    const end = moment(headerValue.end);
    if (rowValue) {
        const current_row_millis = new Date(rowValue);
        console.log("current_row_millis: ");
        console.log(current_row_millis);
        let start_millis = 0;
        let end_millis = 0;
        if (start.isValid()) {
            if (end.isValid()) {
                start_millis = new Date(start);
                end_millis = new Date(end);
                console.log("start and end are given");
                console.log(start_millis);
                console.log(end_millis);
                return (
                    current_row_millis >= start_millis &&
                    current_row_millis <= end_millis
                );
            } else {
                //only start was given
                start_millis = new Date(start);
                console.log("only start was given");
                console.log(start_millis);
                return current_row_millis >= start_millis;
            }
        } else {
            // no start but there is end
            if (end.isValid()) {
                end_millis = new Date(end);
                console.log("only end was given");
                console.log(end_millis);
                return current_row_millis <= end_millis;
            }
        }
    }
    return true; //must return a boolean, true if it passes the filter.
}

const events_tabulator = new Tabulator("#nav-monitor-events-text", {
    placeholder: "No Recent CloudWatch Events",
    selectable: true,
    height: 250,
    layout: "fitColumns",
    resizableRows: true,
    initialSort: [{ column: "timestamp", dir: "desc" }],
    columns: [
        {
            title: "Time",
            field: "timestamp",
            headerFilter: dateFilterEditor,
            headerFilterFunc: dateFilterFunction,
        },
        {
            title: "Event Type",
            field: "type",
            headerFilter: true,
        },
        {
            title: "Data",
            field: "data",
            formatter: "html",
            headerFilter: true,
            widthGrow: 2,
        },
        {
            tooltip: "Formatted Data View",
            headerSort: false,
            formatter: "tickCross",
            formatterParams: {
                tickElement:
                    "<i class='fa fa-info-circle' style='font-size:20px'></i>",
                crossElement:
                    "<i class='fa fa-info-circle' style='font-size:20px'></i>",
            },
            width: 50,
            hozAlign: "center",
            cellClick: function (e, cell) {
                show_formatted_cloudwatch_event_data(cell.getRow()._row.data);
            },
        },
    ],
});

const display_selected_node = async function (node_id) {
    const node = model.nodes.get(node_id);
    last_displayed = node_id;
    const data = [];
    $("#nav-alarms-selected-item").html(node.header);
    const link = (node.alerts_link || node.console_link)();
    const consoleAnchor = `<a href="${link}" target="_blank" title="Navigate to Resource">${consoleIcon()}</a>`;
    $("#nav-alerts-selected-item").html(
        node.header + "&nbsp;&nbsp;" + consoleAnchor
    );
    $("#nav-events-selected-item").html(node.header);

    // event alerts
    for (const event_value of event_alerts.get_cached_events().current) {
        if (event_value.resource_arn == node.id) {
            event_value.detail.name = node.name;
            event_value.detail.resource_arn = event_value.resource_arn;
            data.push(event_value.detail);
        }
    }
    alert_tabulator.replaceData(data);
    alarms.alarms_for_subscriber(node.id).then(function (subscriptions) {
        for (const subscription of subscriptions) {
            if (Number.isInteger(subscription.StateUpdated)) {
                subscription.StateUpdated = new Date(
                    subscription.StateUpdated * 1000
                ).toISOString();
            }
            subscription.ARN = node.id;
            subscription.name = node.name;
            subscription.id =
                node.id + ":" + subscription.Region + ":" + subscription.name;
        }
        alarm_tabulator.replaceData(subscriptions);
    });
    // cloudwatch events
    cw_events.get_cloudwatch_events(node.id).then(function (events) {
        for (const event of events) {
            event.timestamp = new Date(event.timestamp).toISOString();
        }
        events_tabulator.replaceData(events);
    });
};

function alarm_subscription_update_promises(
    local_member_value,
    local_node,
    local_alarm_data,
    local_promises
) {
    local_promises.push(
        new Promise(function (resolve) {
            const local_node_id = local_member_value.id;
            const local_node_name = local_node.name;
            alarms
                .alarms_for_subscriber(local_node_id)
                .then(function (subscriptions) {
                    for (const subscription of subscriptions) {
                        if (
                            Number.isInteger(
                                subscription.StateUpdated
                            )
                        ) {
                            subscription.StateUpdated =
                                new Date(
                                    subscription.StateUpdated *
                                    1000
                                ).toISOString();
                        }
                        subscription.ARN = local_node_id;
                        subscription.name = local_node_name;
                    }
                    local_alarm_data =
                        local_alarm_data.concat(subscriptions);
                    resolve();
                });
        })
    );
}

const display_selected_tile = function (name, members) {
    const alert_data = [];
    const alarm_data = [];
    const promises = [];
    $("#nav-alarms-selected-item").html("Tile: ".concat(name));
    $("#nav-alerts-selected-item").html("Tile: ".concat(name));
    for (const member_value of members) {
        const node = model.nodes.get(member_value.id);
        if (node) {
            for (const event_value of event_alerts.get_cached_events().current) {
                if (member_value.id == event_value.resource_arn) {
                    event_value.detail.name = node.name;
                    event_value.detail.resource_arn = event_value.resource_arn;
                    alert_data.push(event_value.detail);
                }
            }
            alarm_subscription_update_promises(member_value, node, alarm_data, promises);
        }
    }
    Promise.all(promises).then(function () {
        alarm_tabulator.replaceData(alarm_data);
        alert_tabulator.replaceData(alert_data);
        alarm_tabulator.redraw();
        alert_tabulator.redraw();
    });
};

const tile_view_click_listener = function (name, members) {
    if (tile_view.selected()) {
        last_displayed = {
            name: name,
            members: members,
        };
        display_selected_tile(name, members);
    }
};

const event_alert_listener = function () {
    refresh();
};

tile_view.add_selection_callback(tile_view_click_listener);

event_alerts.add_callback(event_alert_listener);

alarms.add_callback(event_alert_listener);

diagrams.add_selection_callback(function (diagram, event) {
    if (event.nodes.length > 0) {
        display_selected_node(event.nodes[0]);
    }
});

$("#monitor-subscribe-alarms-button").click(async function () {
    const alarms_menu = await import("./alarms_menu.js");
    alarms_menu.show_alarm_subscribe_dialog();
});

$("#monitor-unsubscribe-alarms-button").click(function () {
    const selected_alarms = alarm_tabulator.getSelectedData();
    const diagram = diagrams.shown();
    const selected_nodes = diagram.network.getSelectedNodes();
    confirmation.show(
        "Unsubscribe selected node" +
            (selected_nodes.length == 1 ? "" : "s") +
            " from " +
            selected_alarms.length +
            " alarm" +
            (selected_alarms.length == 1 ? "" : "s") +
            "?",
        function () {
            const promises = [];
            for (const alarm of selected_alarms) {
                promises.push(
                    alarms.unsubscribe_from_alarm(
                        alarm.Region,
                        alarm.AlarmName,
                        selected_nodes
                    )
                );
            }
            Promise.all(promises).then(function () {
                refresh();
            });
        }
    );
});

function unsubscribe_alarm(row) {
    console.log(row);
    const node = model.nodes.get(row.ARN);
    if (node) {
        // prompt if the node still exists
        confirmation.show(
            `Unsubscribe node ${node.name} from alarm ${row.AlarmName} in region ${row.Region}?`,
            function () {
                alarms
                    .unsubscribe_from_alarm(row.Region, row.AlarmName, [
                        row.ARN,
                    ])
                    .then(function () {
                        refresh();
                    });
            }
        );
    } else {
        // otherwise just delete it
        alarms
            .unsubscribe_from_alarm(row.Region, row.AlarmName, [row.ARN])
            .then(function () {
                refresh();
            });
    }
}

function navigate_to_alarm(row) {
    console.log(row);
    const url = `https://console.aws.amazon.com/cloudwatch/home?region=${row.Region}#alarmsV2:alarm/${row.AlarmName}?`;
    window.open(url, "_blank").focus();
}

function show_formatted_cloudwatch_event_data(row) {
    console.log(row);
    renderjson.set_show_to_level(1);
    const data = JSON.parse(row.data);
    const formatted_json = renderjson(data);
    $("#cloudwatch_event_data_json").html(formatted_json);
    $("#cloudwatch_event_data_view_modal").modal("show");
}

export function refresh() {
    if (typeof last_displayed == "string") {
        display_selected_node(last_displayed);
    } else if (typeof last_displayed == "object") {
        display_selected_tile(last_displayed.name, last_displayed.members);
    }
}
