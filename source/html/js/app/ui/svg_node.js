/*! Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
       SPDX-License-Identifier: Apache-2.0 */

import * as ui_util from "./util.js";
import * as overlays from "./overlays/overlays.js";

const max_line_length = 25;
const font_family = "Arial";
const work_div_id = ui_util.makeid();
const work_div_style =
    "overflow:hidden;top:-100%;left:-100%;position:absolute;opacity:0;";
const work_div_html = `<div id="${work_div_id}" style="${work_div_style}"></div>`;
const border_rgb = "#a6a6a6";
const selected_border_rgb = "#262626";
const degraded_rgb = "#ffff33";

const wordWrap = (str, max) =>
    str.length > max ? [`${str.substring(0, max - 1)} [...]`] : [str];

const create = (
    type_name,
    node_name,
    node_rgb,
    is_selected,
    id,
    data,
    generic_type_name
) => {
    const inc_y = 35;
    const radius = 20;
    const width = 400;
    const height = 200;
    const font_size = 25;
    const w_border = is_selected ? Math.ceil(width * 0.05) : Math.ceil(width * 0.025);
    let pos_y = 10;

    $("#" + work_div_id).empty();

    const drawing = SVG(work_div_id).size(width, height);
    drawing
        .rect(width, height)
        .radius(radius)
        .fill(is_selected ? selected_border_rgb : border_rgb);
    drawing
        .rect(width - w_border, height - w_border)
        .radius(radius)
        .fill(node_rgb)
        .dmove(w_border / 2, w_border / 2);

    const typeLabel = drawing.text(type_name + ":").y(pos_y);
    typeLabel.font({ family: font_family, size: font_size, weight: "bold" });
    typeLabel.cx(width / 2);

    pos_y += inc_y;

    const lines = wordWrap(node_name, max_line_length);

    for (const value of lines) {
        const nameLabel = drawing.text(value).y(pos_y);
        nameLabel.font({ family: font_family, size: font_size });
        nameLabel.cx(width / 2);
        pos_y += inc_y;
    }

    // give matching overlays a chance to supplement 'drawing'
    let found = false;
    for (const overlay of overlays.all) {
        if (overlay.match_type == (generic_type_name || type_name)) {
            overlay.decorate(drawing, font_size, width, height, id, data);
            found = true;
        }
    }

    // use the default overlay if needed
    if (!found) {
        const overlay = overlays.default_overlay;
        overlay.decorate(drawing, font_size, width, height, id, data);
    }

    // export the SVG and turn it into an encoded inline image
    const code = drawing.svg();
    // remove randomly generated ids from the SVG code
    const regex = /id="\w+"\s*/g;
    const modified = code.replace(regex, "");
    return "data:image/svg+xml;base64," + window.btoa(modified);
};

// add the hidden SVG rendering div to the end of the body
$("body").append(work_div_html);

export const selected = (
    type_name,
    node_name,
    node_rgb,
    id,
    data,
    generic_type_name
) => {
    return create(
        type_name,
        node_name,
        node_rgb,
        true,
        id,
        data,
        generic_type_name
    );
};

export const unselected = (
    type_name,
    node_name,
    node_rgb,
    id,
    data,
    generic_type_name
) => {
    return create(
        type_name,
        node_name,
        node_rgb,
        false,
        id,
        data,
        generic_type_name
    );
};

export const getDegradedRgb = () => degraded_rgb;
