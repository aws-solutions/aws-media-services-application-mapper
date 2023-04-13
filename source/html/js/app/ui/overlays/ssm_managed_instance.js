/*! Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
       SPDX-License-Identifier: Apache-2.0 */

import * as alarms from "../../alarms.js";
import * as tools from "./overlay_tools.js";
import * as model from "../../model.js";

export const match_type = "SSM Managed Instance";

const decorate_alarms = function (drawing, font_size, width, height, id) {
    let alarm_count = 0;
    for (const item of alarms.get_subscribers_with_alarms().current) {
        if (item.ResourceArn == id) {
            alarm_count += item.AlarmCount;
        }
    }
    tools.set_alarm_text(alarm_count, drawing, font_size, width);
};

const decorate_information = function (drawing, font_size, width, height, id) {
    const node = model.nodes.get(id);
    if (node) {
        if (node.data.Data["AWS:InstanceInformation"].Content[0].ComputerName) {
            const computer_name =
                node.data.Data["AWS:InstanceInformation"].Content[0]
                    .ComputerName;
            tools.set_info_text(
                computer_name,
                drawing,
                font_size,
                width,
                "Name"
            );
        }
    }
};

export const decorate = function (drawing, font_size, width, height, id) {
    decorate_alarms(drawing, font_size, width, height, id);
    decorate_information(drawing, font_size, width, height, id);
};

export const informational = true;
