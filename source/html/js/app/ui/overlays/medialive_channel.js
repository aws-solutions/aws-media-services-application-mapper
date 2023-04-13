/*! Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
       SPDX-License-Identifier: Apache-2.0 */

import * as alert_events from "../../events.js";
import * as alarms from "../../alarms.js";
import * as tools from "./overlay_tools.js";

export const match_type = "MediaLive Channel";

const decorate_alarms = function (drawing, font_size, width, height, id) {
    let alarm_count = 0;
    const cached_alarms = alarms.get_subscribers_with_alarms();

    for (const item of cached_alarms.current) {
        if (item.ResourceArn == id) {
            alarm_count += item.AlarmCount;
        }
    }
    tools.set_alarm_text(alarm_count, drawing, font_size, width);
};

const decorate_events = function (drawing, font_size, width, height, id, data) {
    const isSinglePipeline = tools.has_single_pipeline(id, data);
    let pipeline_alerts = isSinglePipeline ? 0 : [0, 0];
    for (const item of alert_events.get_cached_events().current_medialive) {
        if (item.resource_arn == id) {
            if (isSinglePipeline) pipeline_alerts += 1;
            else pipeline_alerts[parseInt(item.detail.pipeline)] += 1;
        }
    }

    tools.set_event_text(pipeline_alerts, drawing, font_size, width);
};

export const decorate = function (drawing, font_size, width, height, id, data) {
    decorate_alarms(drawing, font_size, width, height, id);
    decorate_events(drawing, font_size, width, height, id, data);
};

export const informational = true;
