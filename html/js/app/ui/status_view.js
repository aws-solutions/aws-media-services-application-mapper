/*! Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
       SPDX-License-Identifier: Apache-2.0 */

define(["jquery", "app/model", "app/statemachine"], function($, model, statemachine) {
    var current_tab = '';
    var progressTimer;

    var calculate_progress = function(fsm) {
        // get the total number of states for this FSM
        var states = Object.keys(fsm.states);
        // get our current position within the states
        var index = states.indexOf(fsm.state);
        // calculate the current state position as a percentage
        var percent = Number.parseInt(((index + 1) / states.length) * 100);
        return percent;
    };

    var show = function() {
        if (typeof progressTimer === "undefined") {
            progressTimer = setTimeout(update, 500);
        }
    };

    var update = function() {
        var id = "#nav-status";
        var tab = id + "-tab";
        if (current_tab !== tab) {
            $(tab).tab('show');
        }
        var configuration_percent = calculate_progress(statemachine.getConfigurationStateMachine());
        var model_data_percent = calculate_progress(statemachine.getModelDataStateMachine());
        var configuration_class = configuration_percent < 100 ? "progress-bar-striped progress-bar-animated bg-warning" : "bg-success";
        var model_data_class = model_data_percent < 100 ? "progress-bar-striped progress-bar-animated bg-warning" : "bg-success";
        var configuration_stats = configuration_percent < 100 ? configuration_percent + "%" : "Ready";
        var model_stats = `${model.nodes.length} Nodes, ${model.edges.length} Connections`;
        var html = `
        <table class="table table-sm borderless">
            <tbody>
                <tr>
                    <th scope="row">Configuration</th>
                    <td nowrap>
                        <div class="progress" style="width: 35%;">
                            <div class="progress-bar ${configuration_class}" role="progressbar" style="width: ${configuration_percent}%;" aria-valuenow="${configuration_percent}%" aria-valuemin="0" aria-valuemax="100">${configuration_stats}</div>
                        </div>
                    </td>
                </tr>
                <tr>
                    <th scope="row" style="width: 10%;">Model Contents</th>
                    <td nowrap>
                        <div class="progress" style="width: 35%;">
                            <div class="progress-bar ${model_data_class}" role="progressbar" style="width: ${model_data_percent}%;" aria-valuenow="${model_data_percent}%" aria-valuemin="0" aria-valuemax="100">${model_stats}</div>
                        </div>
                    </td>
                </tr>
            </tbody>
        </table>`;
        $(id).html(html);
        progressTimer = undefined;
    };

    model.nodes.on("add", function(event, properties, senderId) {
        show();
    });

    model.edges.on("add", function(event, properties, senderId) {
        show();
    });

    statemachine.getToolStateMachine().on("transition", function(data) {
        show();
    });

});