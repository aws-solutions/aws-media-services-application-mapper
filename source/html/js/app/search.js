/*! Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
       SPDX-License-Identifier: Apache-2.0 */

import * as model from "./model.js";
import * as channels from "./channels.js";
import * as diagrams from "./ui/diagrams.js";

// options for Fuse
const model_options = {
    shouldSort: true,
    threshold: 0.25,
    location: 0,
    distance: 1000,
    minMatchCharLength: 2,
    keys: [
        "id",
        "label",
        "title",
        "name",
        "data.Arn",
        "data.ARN",
        "data.Channel",
        "data.DomainName",
        "data.Id",
        "data.Name",
        "data.Url",
        "data.Sources.Url",
        "data.Origin.Items.DomainName",
        "data.Origin.Items.OriginPath",
        "data.Destinations.Settings.Url",
        "data.HlsIngest.IngestEndpoints.Url",
        // SSM and EC2 instances
        "data.Data.AWS:InstanceInformation.Content.ComputerName",
        "data.Data.AWS:InstanceInformation.Content.IpAddress",
        "data.PrivateDnsName",
        "data.PrivateIpAddress",
        "data.PublicDnsName",
        "data.PublicIpAddress",
        "stringtags",
    ],
};

let fuse_model;

let cached_tile_names;

const update = function () {
    fuse_model = new Fuse(model.nodes.get(), model_options);
    channels.channel_list().then(function (results) {
        cached_tile_names = results;
    });
};

const search_nodes = function (text) {
    return fuse_model.search(text);
};

const search_tiles = function (text) {
    const matches = [];
    for (const name of cached_tile_names) {
        if (name.toLowerCase().includes(text.toLowerCase())) {
            matches.push(name);
        }
    }
    return matches;
};

function search(text) {
    const local_lodash = _;
    return new Promise(function (outer_resolve) {
        const local_outer_resolve = outer_resolve;
        fuse_model = new Fuse(model.nodes.get(), model_options);
        const results = {
            text: text,
            model: [],
            tile_names: [],
            tile_contents: [],
            diagram_names: [],
            diagram_contents: [],
        };
        // search the model, find matching nodes
        const model_matches = fuse_model.search(text);
        const node_ids = _.map(model_matches, "item.id");
        results.model = _.map(model_matches, "item");
        // find diagrams with one or more of the nodes
        const contained_by = diagrams.have_any(node_ids);
        results.diagram_contents = contained_by;
        // find diagram name matches
        for (const name of Object.keys(diagrams.get_all())) {
            const includes = name.toLowerCase().includes(text.toLowerCase());
            includes && results.diagram_names.push(name);
        }
        // find tiles with any of these nodes
        channels.have_any(node_ids).then(function (matches) {
            results.tile_contents = matches;
        });
        // find tiles with the text or containing the model nodes
        const status = { processed: 0 };
        channels.channel_list().then(function (channel_names) {
            const local_channel_names = channel_names;
            for (const channel_name of local_channel_names) {
                const local_channel_name = channel_name;
                // check for a name partial match
                const includes = local_channel_name
                    .toLowerCase()
                    .includes(text.toLowerCase());
                if (includes) {
                    results.tile_names.push(local_channel_name);
                }
                // check the contents of the channel
                channels
                    .retrieve_channel(local_channel_name)
                    .then(function (contents) {
                        const channel_node_ids = local_lodash
                            .map(contents, "id")
                            .sort();
                        const intersect = local_lodash.intersection(
                            node_ids,
                            channel_node_ids
                        );
                        if (intersect.length > 0) {
                            results.tile_contents.push({
                                tile: local_channel_name,
                                found: intersect,
                            });
                        }
                        status.processed++;
                        if (status.processed == local_channel_names.length) {
                            local_outer_resolve(results);
                        }
                    });
            }
        });
    });
}

export { search_nodes, search_tiles, update, search };
