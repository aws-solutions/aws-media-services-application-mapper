/*! Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
       SPDX-License-Identifier: Apache-2.0 */

import * as server from "../../server.js";
import * as connections from "../../connections.js";
import * as svg_node from "../../ui/svg_node.js";

export const update = function () {
    const local_svg_node = svg_node;
    const current = connections.get_current();
    const url = current[0];
    const api_key = current[1];
    const rgb = "#D5DBDB";
    const node_type = "S3 Bucket";
    const items = [];
    return new Promise(function (resolve, reject) {
        server
            .get(url + "/cached/s3", api_key)
            .then(function (cache_entries) {
                for (const cache_entry of cache_entries) {
                    const bucket = JSON.parse(cache_entry.data);
                    bucket.Arn = "arn:aws:s3:::" + bucket.Name;
                    const name = bucket.Name;
                    const id = bucket.Arn;
                    const node_data = {
                        cache_update: cache_entry.updated,
                        id: bucket.Arn,
                        region: cache_entry.region,
                        shape: "image",
                        image: {
                            unselected: null,
                            selected: null,
                        },
                        header: "<b>S3 Bucket:</b> " + name,
                        data: bucket,
                        title: node_type,
                        name: name,
                        size: 55,
                        render: {
                            normal_unselected: (function () {
                                const local_node_type = node_type;
                                const local_name = name;
                                const local_rgb = rgb;
                                const local_id = id;
                                return function () {
                                    return local_svg_node.unselected(
                                        local_node_type,
                                        local_name,
                                        local_rgb,
                                        local_id
                                    );
                                };
                            })(),
                            normal_selected: (function () {
                                const local_node_type = node_type;
                                const local_name = name;
                                const local_rgb = rgb;
                                const local_id = id;
                                return function () {
                                    return local_svg_node.selected(
                                        local_node_type,
                                        local_name,
                                        local_rgb,
                                        local_id
                                    );
                                };
                            })(),
                            alert_unselected: (function () {
                                const local_node_type = node_type;
                                const local_name = name;
                                const local_id = id;
                                return function () {
                                    return local_svg_node.unselected(
                                        local_node_type,
                                        local_name,
                                        "#ff0000",
                                        local_id
                                    );
                                };
                            })(),
                            alert_selected: (function () {
                                const local_node_type = node_type;
                                const local_name = name;
                                const local_id = id;
                                return function () {
                                    return local_svg_node.selected(
                                        local_node_type,
                                        local_name,
                                        "#ff0000",
                                        local_id
                                    );
                                };
                            })(),
                        },
                        console_link: (function () {
                            const bucket_name = bucket.Name;
                            return function () {
                                return `https://s3.console.aws.amazon.com/s3/buckets/${bucket_name}/?tab=overview`;
                            };
                        })(),
                        cloudwatch_link: (function () {
                            const bucket_name = bucket.Name;
                            return function () {
                                return `https://console.aws.amazon.com/cloudwatch/home#metricsV2:graph=~();search=${bucket_name};namespace=AWS/S3;dimensions=BucketName,StorageType`;
                            };
                        })(),
                    };
                    node_data.image.selected =
                        node_data.render.normal_selected();
                    node_data.image.unselected =
                        node_data.render.normal_unselected();
                    items.push(node_data);
                }
                resolve(items);
            })
            .catch(function (error) {
                console.error(error);
                reject(error);
            });
    });
};

export const module_name = "S3 Buckets";
