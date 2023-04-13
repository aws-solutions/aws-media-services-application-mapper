/*! Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
       SPDX-License-Identifier: Apache-2.0 */

import * as server from "./server.js";
import * as connections from "./connections.js";

const promise_get_closure = (endpoint, api_key) => {
    return function (resolve, reject) {
        server
            .get(endpoint, api_key)
            .then(function (response) {
                resolve(response);
            })
            .catch(function (error) {
                console.error(error);
                reject(error);
            });
    };
};

const get_resource_notes = function (arn) {
    const current_connection = connections.get_current();
    const url = current_connection[0];
    const api_key = current_connection[1];
    const current_endpoint = `${url}/notes/${encodeURIComponent(arn)}`;
    return new Promise(promise_get_closure(current_endpoint, api_key));
};

const get_all_resource_notes = function () {
    const current_connection = connections.get_current();
    const url = current_connection[0];
    const api_key = current_connection[1];
    const current_endpoint = `${url}/notes`;
    return new Promise(promise_get_closure(current_endpoint, api_key));
};

const update_resource_notes = function (arn, notes) {
    const current_connection = connections.get_current();
    const url = current_connection[0];
    const api_key = current_connection[1];
    const current_endpoint = `${url}/notes/${encodeURIComponent(arn)}`;
    return new Promise(function (resolve, reject) {
        server
            .post(current_endpoint, api_key, notes)
            .then(function (response) {
                resolve(response);
            })
            .catch(function (error) {
                console.error(error);
                reject(error);
            });
    });
};

const promise_delete_closure = (endpoint, api_key) => {
    return function (resolve, reject) {
        server
            .delete_method(endpoint, api_key)
            .then(function (response) {
                resolve(response);
            })
            .catch(function (error) {
                console.error(error);
                reject(error);
            });
    };
};

const delete_resource_notes = function (arn) {
    const current_connection = connections.get_current();
    const url = current_connection[0];
    const api_key = current_connection[1];
    const current_endpoint = `${url}/notes/${encodeURIComponent(arn)}`;
    return new Promise(promise_delete_closure(current_endpoint, api_key));
};

const delete_all_resource_notes = function () {
    const current_connection = connections.get_current();
    const url = current_connection[0];
    const api_key = current_connection[1];
    const current_endpoint = `${url}/notes`;
    return new Promise(promise_delete_closure(current_endpoint, api_key));
};

export {
    get_resource_notes,
    get_all_resource_notes,
    update_resource_notes,
    delete_resource_notes,
    delete_all_resource_notes
};
