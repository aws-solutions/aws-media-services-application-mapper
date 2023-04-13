# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
"""
This file contains helper functions for building the connection cache.
"""

import json
import os
import re
import time
from urllib.parse import urlparse

from botocore.exceptions import ClientError
from fuzzywuzzy import fuzz
from jsonpath_ng import parse

from chalicelib import cache
from chalicelib import content

# TTL provided via CloudFormation
CACHE_ITEM_TTL = int(os.environ["CACHE_ITEM_TTL"])


def connection_item(arn, from_arn, to_arn, service, config):
    """
    Structure a cache item.
    """
    now = int(time.time())
    item = {
        "arn": arn,
        "from": from_arn,
        "to": to_arn,
        "region": "global",
        "service": service,
        "updated": now,
        "expires": now + CACHE_ITEM_TTL,
        "data": json.dumps(config, default=str)
    }
    return item


def connection_to_ddb_item(from_arn, to_arn, service, config):
    """
    Structure a discovered connection into a cache item.
    """
    arn = f"{from_arn}:{to_arn}"
    return connection_item(arn, from_arn, to_arn, service, config)


def connection_to_ddb_item_pl(from_arn, to_arn, service, config):
    """
    Structure a discovered connection into a cache item including its pipeline.
    """
    pipeline = "0"
    if config["pipeline"]:
        pipeline = config["pipeline"]
    arn = f"{from_arn}:{to_arn}:{pipeline}"
    return connection_item(arn, from_arn, to_arn, service, config)


def fetch_running_pipelines_count(data):
    """
    This function is responsible for determine the number
    of running pipelines from a MediaLive configuration
    """
    pipelines_count = 0
    # this will take care of medialive
    if 'ChannelClass' in data:
        if data["ChannelClass"] == "STANDARD":
            pipelines_count = 2
        else:
            pipelines_count = 1
    else:
        # this will take care of multiplex
        if "Destinations" in data:
            pipelines_count = len(data["Destinations"])
    return pipelines_count


def update_connection_ddb_items():
    """
    Update all connections in the cache.
    """
    try:
        content.put_ddb_items(
            medialive_channel_mediapackage_channel_ddb_items())
        content.put_ddb_items(
            medialive_channel_mediastore_container_ddb_items())
        content.put_ddb_items(mediastore_container_medialive_input_ddb_items())
        content.put_ddb_items(medialive_input_medialive_channel_ddb_items())
        content.put_ddb_items(
            mediapackage_channel_mediapackage_endpoint_ddb_items())
        content.put_ddb_items(s3_bucket_cloudfront_distribution_ddb_items())
        content.put_ddb_items(s3_bucket_medialive_input_ddb_items())
        content.put_ddb_items(
            cloudfront_distribution_medialive_input_ddb_items())
        content.put_ddb_items(
            mediapackage_endpoint_cloudfront_distribution_by_tag_ddb_items())
        content.put_ddb_items(
            mediapackage_endpoint_cloudfront_distribution_by_origin_url_ddb_items(
            ))
        content.put_ddb_items(
            mediapackage_endpoint_speke_keyserver_ddb_items())
        content.put_ddb_items(mediaconnect_flow_medialive_input_ddb_items())
        content.put_ddb_items(mediaconnect_flow_mediaconnect_flow_ddb_items())
        content.put_ddb_items(
            mediapackage_endpoint_mediatailor_configuration_ddb_items())
        content.put_ddb_items(s3_bucket_mediatailor_configuration_ddb_items())
        content.put_ddb_items(
            mediastore_container_mediatailor_configuration_ddb_items())
        content.put_ddb_items(medialive_channel_multiplex_ddb_items())
        content.put_ddb_items(multiplex_mediaconnect_flow_ddb_items())
        content.put_ddb_items(
            mediastore_container_cloudfront_distribution_ddb_items())
        content.put_ddb_items(medialive_channel_s3_bucket_ddb_items())
        content.put_ddb_items(link_device_medialive_input_ddb_items())
        content.put_ddb_items(medialive_channel_medialive_input_ddb_items())
        content.put_ddb_items(medialive_channel_mediaconnect_flow_ddb_items())
    except ClientError as error:
        print(error)

def parse_data_list(list_to_parse):
    """
    All of the cached list are formatted as [{"data": <data JSON in string format>}]
    This helper will pre-parse the string data field using json.loads function for each item in list
    """
    return [json.loads(obj['data']) for obj in list_to_parse]

def mediastore_container_medialive_input_ddb_items():
    """
    Identify and format MediaStore container to MediaLive input connections for cache storage.
    """
    items = []
    try:
        # get medialive inputs
        medialive_in_cached = cache.cached_by_service("medialive-input")
        medialive_in_cached_datalist = parse_data_list(medialive_in_cached)
        # get mediastore containers
        mediastore_con_cached = cache.cached_by_service("mediastore-container")
        mediastore_con_cached_datalist = parse_data_list(mediastore_con_cached)
        # check the inputs that pull from mediastore containers
        for ml_input_data in medialive_in_cached_datalist:
            for source in ml_input_data["Sources"]:
                ml_url = source["Url"]
                parsed_source = urlparse(ml_url)
                if "mediastore" not in parsed_source.netloc:
                    continue
                for container_data in mediastore_con_cached_datalist:
                    parsed_endpoint = urlparse(container_data["Endpoint"])
                    if parsed_source.netloc == parsed_endpoint.netloc:
                        # create a 'connection' out of matches
                        config = {
                            "from": container_data["ARN"],
                            "to": ml_input_data["Arn"],
                            "scheme": parsed_source.scheme
                        }
                        print(config)
                        items.append(
                            connection_to_ddb_item(
                                container_data["ARN"],
                                ml_input_data["Arn"],
                                "mediastore-container-medialive-input",
                                config))
    except ClientError as error:
        print(error)
    return items


def ml_to_mp_via_channel_id(ml_channel_data, destination, mediapackage_ch_cached, ml_service_name):
    """
    Helper function to connect MediaLive to MediaPackage via Channel ID
    """
    items = []
    for mp_setting in destination["MediaPackageSettings"]:
        for mp_channel in mediapackage_ch_cached:
            mp_channel_data = json.loads(mp_channel["data"])
            if mp_channel_data['Id'] != mp_setting['ChannelId']:
                continue
            pipelines_count = fetch_running_pipelines_count(ml_channel_data)
            for pipeline in range(pipelines_count):
                # create a 'connection' out of matches
                config = {
                    "from": ml_channel_data["Arn"],
                    "to": mp_channel_data["Arn"],
                    "pipeline": pipeline
                }
                print(config)
                items.append(
                    connection_to_ddb_item_pl(
                        ml_channel_data["Arn"],
                        mp_channel_data["Arn"],
                        ml_service_name, config))
    return items


def ml_to_mp_via_url(ml_channel_data, destination, mediapackage_ch_cached, ml_service_name):
    """
    Helper function to connect MediaLive to MediaPackage via URL endpoints
    """
    items = []
    for setting in destination["Settings"]:
        ml_url = setting["Url"]
        ml_url_v2 = None
        # convert a mediapackage v1 ingest url to a v2 url before
        # checking
        parsed = urlparse(ml_url)
        if parsed.path.startswith("/in/v1/"):
            pieces = parsed.path.split("/")
            if len(pieces) == 5:
                ml_url_v2 = f"{parsed.scheme}://{parsed.netloc}/in/v2/{pieces[3]}/{pieces[3]}/channel"
        for mp_channel, ingest_endpoint in ((mp_channel, ingest_endpoint) for mp_channel in mediapackage_ch_cached for ingest_endpoint in json.loads(mp_channel["data"])["HlsIngest"]["IngestEndpoints"]):
            mp_channel_data = json.loads(mp_channel["data"])
            if ml_url == ingest_endpoint["Url"] or ml_url_v2 == ingest_endpoint["Url"]:
                # create a 'connection' out of matches
                config = {
                    "from":
                    ml_channel_data["Arn"],
                    "to":
                    mp_channel_data["Arn"],
                    "pipeline":
                    destination["Settings"].index(setting)
                }
                print(config)
                items.append(
                    connection_to_ddb_item_pl(
                        ml_channel_data["Arn"],
                        mp_channel_data["Arn"],
                        ml_service_name, config))
    return items

def medialive_channel_mediapackage_channel_ddb_items():
    """
    Identify and format MediaLive to MediaPackage channel connections for cache storage.
    """
    items = []
    ml_service_name = "medialive-channel-mediapackage-channel"
    try:
        # get medialive channels
        medialive_ch_cached = cache.cached_by_service("medialive-channel")
        # get mediapackage channels
        mediapackage_ch_cached = cache.cached_by_service(
            "mediapackage-channel")
        # compare each medialive output url to a mediapackage ingest url
        for ml_channel, destination in ((ml_channel, destination) for ml_channel in medialive_ch_cached for destination in json.loads(ml_channel["data"])["Destinations"]):
            ml_channel_data = json.loads(ml_channel["data"])
            # if setting is empty, we have to connect medialive with mediapackage via channel ID
            if destination["MediaPackageSettings"]:
                items += ml_to_mp_via_channel_id(ml_channel_data, destination, mediapackage_ch_cached, ml_service_name)
                break
            # otherwise we check via URL endpoints
            items += ml_to_mp_via_url(ml_channel_data, destination, mediapackage_ch_cached, ml_service_name)
    except ClientError as error:
        print(error)
    return items


def medialive_channel_mediastore_container_ddb_items():
    """
    Identify and format MediaLive channel to MediaStore container connections for cache storage.
    """
    items = []
    try:
        # get medialive channels
        medialive_ch_cached = cache.cached_by_service("medialive-channel")
        medialive_ch_cached_datalist = parse_data_list(medialive_ch_cached)
        # get mediastore containers
        mediastore_con_cached = cache.cached_by_service("mediastore-container")
        mediastore_con_cached_datalist = parse_data_list(mediastore_con_cached)
        # compare each medialive output url to a mediastore container endpoint
        # url
        for ml_channel_data, url in ((datum, setting["Url"]) for datum in medialive_ch_cached_datalist for destination in datum["Destinations"] for setting in destination["Settings"]):
            parsed_destination = urlparse(url)
            if "mediastore" in parsed_destination.netloc:
                for container_data in mediastore_con_cached_datalist:
                    parsed_endpoint = urlparse(container_data["Endpoint"])
                    if parsed_destination.netloc == parsed_endpoint.netloc:
                        # create a 'connection' out of matches
                        config = {
                            "from": ml_channel_data["Arn"],
                            "to": container_data["ARN"],
                            "scheme": parsed_destination.scheme
                        }
                        print(config)
                        items.append(
                            connection_to_ddb_item(
                                ml_channel_data["Arn"],
                                container_data["ARN"],
                                "medialive-channel-mediastore-container",
                                config))
    except ClientError as error:
        print(error)
    return items


def medialive_channel_multiplex_ddb_items():
    """
    Identify and format MediaLive channel to EML Multiplex connections for cache storage.
    """
    items = []
    ml_service_name = "medialive-channel-multiplex"
    try:
        # get medialive channels
        medialive_ch_cached = cache.cached_by_service("medialive-channel")
        medialive_ch_cached_datalist = parse_data_list(medialive_ch_cached)
        # get multiplexes
        medialive_mp_cached = cache.cached_by_service("medialive-multiplex")
        medialive_mp_cached_datalist = parse_data_list(medialive_mp_cached)
        for ml_channel_data, destination in ((datum, destination) for datum in medialive_ch_cached_datalist for destination in datum["Destinations"]):
            if "MultiplexSettings" not in destination:
                continue
            multiplex_id = destination["MultiplexSettings"]["MultiplexId"]
            program_name = destination["MultiplexSettings"]["ProgramName"]
            for ml_multiplex_data in medialive_mp_cached_datalist:
                if multiplex_id == ml_multiplex_data["Id"]:
                    pipelines_count = fetch_running_pipelines_count(
                        ml_channel_data)
                    for pipeline in range(pipelines_count):
                        # create a 'connection' out of matches
                        config = {
                            "from": ml_channel_data["Arn"],
                            "to": ml_multiplex_data["Arn"],
                            "program": program_name,
                            "pipeline": pipeline
                        }
                        print(config)
                        items.append(
                            connection_to_ddb_item_pl(
                                ml_channel_data["Arn"],
                                ml_multiplex_data["Arn"],
                                ml_service_name, config))
    except ClientError as error:
        print(error)
    return items


def medialive_input_medialive_channel_ddb_items():
    """
    Identify and format MediaLive input to MediaLive channel connections for cache storage.
    """
    items = []
    ml_service_name = "medialive-input-medialive-channel"
    try:
        # get medialive channels
        medialive_ch_cached = cache.cached_by_service("medialive-channel")
        medialive_ch_cached_datalist = parse_data_list(medialive_ch_cached)
        # get medialive inputs
        medialive_in_cached = cache.cached_by_service("medialive-input")
        medialive_in_cached_datalist = parse_data_list(medialive_in_cached)
        # find matching ids in the attached inputs to attached channels
        for ml_channel_data in medialive_ch_cached_datalist:
            ml_channel_id = ml_channel_data["Id"]
            for ml_input_data in medialive_in_cached_datalist:
                for attached_id in ml_input_data["AttachedChannels"]:
                    if ml_channel_id != attached_id:
                        continue
                    pipelines_count = fetch_running_pipelines_count(
                        ml_channel_data)
                    for pipeline in range(pipelines_count):
                        config = {
                            "from": ml_input_data["Arn"],
                            "to": ml_channel_data["Arn"],
                            "type": ml_input_data["Type"],
                            "pipeline": pipeline
                        }
                        print(config)
                        items.append(
                            connection_to_ddb_item_pl(
                                ml_input_data["Arn"],
                                ml_channel_data["Arn"], ml_service_name,
                                config))
    except ClientError as error:
        print(error)
    return items


def mediapackage_channel_mediapackage_endpoint_ddb_items():
    """
    Identify and format MediaPackage channel to MediaPackage endpoint connections for cache storage.
    """
    items = []
    package_key = re.compile("^(.+)Package$")
    try:
        # get mediapackage channels
        mediapackage_ch_cached = cache.cached_by_service("mediapackage-channel")
        mediapackage_ch_cached_datalist = parse_data_list(mediapackage_ch_cached)
        # get mediapackage endpoints
        mediapackage_ep_cached = cache.cached_by_service("mediapackage-origin-endpoint")
        mediapackage_ep_cached_datalist = parse_data_list(mediapackage_ep_cached)
        # find matching ids in the attached inputs to attached channels
        for mp_channel_data in mediapackage_ch_cached_datalist:
            mp_channel_id = mp_channel_data["Id"]
            for mp_endpoint_data in mediapackage_ep_cached_datalist:
                mp_endpoint_channel_id = mp_endpoint_data["ChannelId"]
                if mp_channel_id != mp_endpoint_channel_id:
                    continue
                package_type = ""
                for key in mp_endpoint_data.keys():
                    matcher = package_key.match(key)
                    if matcher:
                        package_type = matcher.group(1).upper()
                config = {
                    "from": mp_channel_data["Arn"],
                    "to": mp_endpoint_data["Arn"],
                    "package": package_type
                }
                print(config)
                items.append(
                    connection_to_ddb_item(
                        mp_channel_data["Arn"], mp_endpoint_data["Arn"],
                        "mediapackage-channel-mediapackage-origin-endpoint",
                        config))
    except ClientError as error:
        print(error)
    return items


def multiplex_mediaconnect_flow_ddb_items():
    """
    Identify and format Multiplex to MediaConnect flow connections for cache storage.
    """
    source_arn_expr = parse('$..Source.EntitlementArn')
    destination_arn_expr = parse(
        '$..Destinations[*].MediaConnectSettings.EntitlementArn')
    items = []
    try:
        # get multiplexes
        multiplex_cached = cache.cached_by_service("medialive-multiplex")
        # get mediaconnect flows
        mediaconnect_flows_cached = cache.cached_by_service(
            "mediaconnect-flow")
        for multiplex in multiplex_cached:
            multiplex_data = json.loads(multiplex["data"])
            # retrieve the multiplex's exported entitlements
            entitlement_arns = [
                match.value
                for match in destination_arn_expr.find(multiplex_data)
            ]
            # print(entitlement_arns)
            # search each flow for the same entitlement arns as sources
            for flow in mediaconnect_flows_cached:
                flow_data = json.loads(flow["data"])
                source_arns = [
                    match.value for match in source_arn_expr.find(flow_data)
                ]
                # print(source_arns)
                for arn in source_arns:
                    if arn in entitlement_arns:
                        # create a 'connection' out of matches
                        config = {
                            "from": multiplex_data["Arn"],
                            "to": flow_data["FlowArn"],
                            "entitlement": arn
                        }
                        print(config)
                        items.append(
                            connection_to_ddb_item(
                                multiplex_data["Arn"], flow_data["FlowArn"],
                                "multiplex-mediaconnect-flow", config))
    except ClientError as error:
        print(error)
    return items


def s3_bucket_cloudfront_distribution_ddb_items():
    """
    Identify and format S3 Bucket to CloudFront Distribution connections for cache storage.
    """
    items = []
    s3_origin = re.compile(r"(\S+)\.s3([^\.])*\.amazonaws\.com")
    try:
        # get S3 buckets
        s3_buckets_cached = cache.cached_by_service("s3")
        # get CloudFront distributions
        cloudfront_dist_cached = cache.cached_by_service(
            "cloudfront-distribution")
        for s3_bucket in s3_buckets_cached:
            s3_bucket_data = json.loads(s3_bucket["data"])
            for cloudfront_distro in cloudfront_dist_cached:
                cloudfront_distro_data = json.loads(cloudfront_distro["data"])
                for origin_item in cloudfront_distro_data["Origins"]["Items"]:
                    matcher = s3_origin.match(origin_item["DomainName"])
                    if not matcher:
                        continue
                    bucket_name = matcher.group(1)
                    if bucket_name == s3_bucket_data["Name"]:
                        config = {
                            "from": s3_bucket["arn"],
                            "to": cloudfront_distro["arn"],
                            "label": "S3"
                        }
                        print(config)
                        items.append(
                            connection_to_ddb_item(
                                s3_bucket["arn"], cloudfront_distro["arn"],
                                "s3-bucket-cloudfront-distribution",
                                config))
    except ClientError as error:
        print(error)
    return items

def check_if_url_is_s3_url(url):
    """
    Helper to regex match and parse url against s3 url format
    """
    s3_url_expressions = [
        re.compile(r"http.?\:\/\/(\S+)\.s3\-website.+"),
        re.compile(r"http.?\:\/\/s3\-\S+\.amazonaws\.com\/([^\/]+)\/.+"),
        re.compile(r"http.?\:\/\/(\S+)\.s3\.amazonaws\.com\/.+"),
        re.compile(r"http.?\:\/\/(\S+)\.s3\-(\S+)\.amazonaws\.com"),
        re.compile(r"s3\:\/\/([^\/]+)"),
        re.compile(r"s3ssl\:\/\/([^\/]+)")
    ]
    for expr in s3_url_expressions:
        match = expr.match(url)
        if match:
            # yes
            return match.group(1), urlparse(url).scheme
    return None, None

def s3_bucket_medialive_input_ddb_items():
    """
    Identify and format S3 Bucket to MediaLive Input connections for cache storage.
    """
    items = []
    try:
        # get S3 buckets
        s3_buckets_cached = cache.cached_by_service("s3")
        # get MediaLive inputs
        medialive_in_cached = cache.cached_by_service("medialive-input")
        # iterate over all inputs
        for ml_input in medialive_in_cached:
            ml_input_data = json.loads(ml_input["data"])
            for source in ml_input_data["Sources"]:
                # is this a bucket url?
                bucket_name, scheme = check_if_url_is_s3_url(source["Url"])
                if not bucket_name:
                    continue
                # find the bucket
                for s3_bucket in s3_buckets_cached:
                    s3_bucket_data = json.loads(s3_bucket["data"])
                    if bucket_name == s3_bucket_data["Name"]:
                        config = {
                            "from": s3_bucket["arn"],
                            "to": ml_input["arn"],
                            "scheme": scheme
                        }
                        print(config)
                        items.append(
                            connection_to_ddb_item(
                                s3_bucket["arn"], ml_input["arn"],
                                "s3-bucket-medialive-input", config))
    except ClientError as error:
        print(error)
    return items


def cloudfront_distribution_medialive_input_ddb_items():
    """
    Identify and format CloudFront Distribution to MediaLive Input connections for cache storage.
    """
    items = []
    cloudfront_url = re.compile(r"http.?\:\/\/(\S+\.cloudfront\.net)\/.*")
    try:
        # get CloudFront distros
        cloudfront_distros_cached = cache.cached_by_service(
            "cloudfront-distribution")
        # get MediaLive inputs
        medialive_in_cached = cache.cached_by_service("medialive-input")
        # iterate over all inputs
        for ml_input, source in ((ml_input, source) for ml_input in medialive_in_cached for source in json.loads(ml_input["data"])["Sources"]):
            domain_name = None
            scheme = None
            # is this a cloudfront url?
            match = cloudfront_url.match(source["Url"])
            if not match:
                continue
            # yes
            domain_name = match.group(1)
            scheme = urlparse(source["Url"]).scheme
            # find the distribution
            for distro in cloudfront_distros_cached:
                distro_data = json.loads(distro["data"])
                if domain_name == distro_data["DomainName"]:
                    config = {
                        "from": distro["arn"],
                        "to": ml_input["arn"],
                        "scheme": scheme
                    }
                    print(config)
                    items.append(
                        connection_to_ddb_item(
                            distro["arn"], ml_input["arn"],
                            "cloudfront-distribution-medialive-input",
                            config))
    except ClientError as error:
        print(error)
    return items


def find_object_by_key_from_list(object_list, key, value_to_find):
    """
    Iterate through a list of objects and find value from specified key
    """
    found_object = None
    for obj in object_list:
        if value_to_find == obj[key]:
            found_object = obj
            break
    return found_object


def mediapackage_endpoint_cloudfront_distribution_by_tag_ddb_items():
    """
    Identify and format MediaPackage origin endpoints to CloudFront Distributions by tags for cache storage.
    """
    items = []
    try:
        # get CloudFront distros
        cloudfront_distros_cached = cache.cached_by_service("cloudfront-distribution")
        # get MediaPackage channels
        mediapackage_ch_cached = cache.cached_by_service("mediapackage-channel")
        # get MediaPackage origin endpoints
        mediapackage_ep_cached = cache.cached_by_service("mediapackage-origin-endpoint")
        # iterate over all distributions

        for distro, key, value in ((distro, key, value) for distro in cloudfront_distros_cached for (key, value) in json.loads(distro["data"])["Tags"].items()):
            if not ((key in [
                    "MP-Endpoint-ARN", "mediapackage:cloudfront_assoc"
            ]) and ":channels/" in value):
                continue
            channel_arn = value
            # find the channel
            channel = find_object_by_key_from_list(mediapackage_ch_cached, 'arn', channel_arn)
            if not channel:
                continue
            channel_id = json.loads(channel["data"])["Id"]
            # add a connection to each endpoint
            for endpoint in mediapackage_ep_cached:
                endpoint_data = json.loads(endpoint["data"])
                if endpoint_data["ChannelId"] != channel_id:
                    continue
                scheme = "https"
                # URL is in diff loc for CMAF
                scheme = urlparse(endpoint_data["CmafPackage"]["HlsManifests"][0]["Url"]).scheme if "CmafPackage" in endpoint_data else urlparse(endpoint_data["Url"]).scheme
                config = {
                    "from": endpoint["arn"],
                    "to": distro["arn"],
                    "scheme": scheme,
                    "connected_by": "tag",
                    "tag": key
                }
                print(config)
                items.append(
                    connection_to_ddb_item(
                        endpoint["arn"], distro["arn"],
                        "mediapackage-origin-endpoint-cloudfront-distribution",
                        config))
    except ClientError as error:
        print(error)
    return items


def mediapackage_endpoint_cloudfront_distribution_by_origin_url_ddb_items():
    """
    Identify and format MediaPackage origin endpoints to CloudFront Distributions by URL for cache storage.
    """
    min_ratio = 80
    items = []
    try:
        # get CloudFront distros
        cloudfront_distros_cached = cache.cached_by_service(
            "cloudfront-distribution")
        # get MediaPackage origin endpoints
        mediapackage_ep_cached = cache.cached_by_service(
            "mediapackage-origin-endpoint")
        # iterate over all distributions
        for distro in cloudfront_distros_cached:
            distro_data = json.loads(distro["data"])
            for item in distro_data["Origins"]["Items"]:
                origin_partial_url = f'{item["DomainName"]}/{item["OriginPath"]}'
                for mp_endpoint in mediapackage_ep_cached:
                    mp_endpoint_data = json.loads(mp_endpoint["data"])
                    ratio = fuzz.ratio(origin_partial_url,
                                       mp_endpoint_data["Url"])
                    if ratio >= min_ratio:
                        config = {
                            "from": mp_endpoint["arn"],
                            "to": distro["arn"],
                            "scheme": urlparse(mp_endpoint_data["Url"]).scheme,
                            "connected_by": "url",
                            "match": f"{ratio}%"
                        }
                        print(config)
                        items.append(
                            connection_to_ddb_item(
                                mp_endpoint["arn"], distro["arn"],
                                "mediapackage-origin-endpoint-cloudfront-distribution",
                                config))
    except ClientError as error:
        print(error)
    return items


def mediapackage_endpoint_speke_keyserver_ddb_items():
    """
    Identify and format MediaPackage origin endpoints to SPEKE keyservers for cache storage.
    """
    items = []
    # create an expression to find speke server urls
    jsonpath_expr = parse('$..SpekeKeyProvider.Url')
    try:
        # get SPEKE keyservers
        speke_keyservers_cached = cache.cached_by_service("speke-keyserver")
        # get MediaPackage origin endpoints
        mediapackage_ep_cached = cache.cached_by_service(
            "mediapackage-origin-endpoint")
        # iterate over all distributions
        for keyserver in speke_keyservers_cached:
            keyserver_data = json.loads(keyserver["data"])
            keyserver_endpoint = keyserver_data["endpoint"]
            for mp_endpoint in mediapackage_ep_cached:
                mp_endpoint_data = json.loads(mp_endpoint["data"])
                for server_url in [
                        match.value
                        for match in jsonpath_expr.find(mp_endpoint_data)
                ]:
                    if server_url == keyserver_endpoint:
                        config = {
                            "from": mp_endpoint["arn"],
                            "to": keyserver["arn"],
                            "scheme": keyserver_data["scheme"]
                        }
                        print(config)
                        items.append(
                            connection_to_ddb_item(
                                mp_endpoint["arn"], keyserver["arn"],
                                "mediapackage-origin-endpoint-speke-keyserver",
                                config))
    except ClientError as error:
        print(error)
    return items


def mediaconnect_flow_medialive_input_ddb_items():
    """
    Identify and format MediaConnect Flow to MediaLive Input connections for cache storage.
    """
    items = []
    connection_type = "mediaconnect-flow-medialive-input"
    try:
        # get MediaConnect flows
        mediaconnect_flows_cached = cache.cached_by_service("mediaconnect-flow")
        # process each flow
        for flow, flow_output in ((flow, flow_output) for flow in mediaconnect_flows_cached for flow_output in json.loads(flow["data"])["Outputs"]):
            flow_data = json.loads(flow["data"])
            # check for MediaLiveInputArn first
            ml_input_arn = flow_output.get("MediaLiveInputArn", None)
            if ml_input_arn:
                config = {
                    "from": flow_data["FlowArn"],
                    "to": flow_output["MediaLiveInputArn"],
                    "scheme": "MEDIACONNECT"
                }
                print(config)
                items.append(
                    connection_to_ddb_item(
                        flow_data["FlowArn"],
                        flow_output["MediaLiveInputArn"],
                        connection_type, config))
                break
            # for each output, look for the matching MediaLive input
            medialive_in_cached = cache.cached_by_service("medialive-input")
            # iterate over all medialive inputs
            for ml_input, destination in ((ml_input, destination) for ml_input in medialive_in_cached for destination in json.loads(ml_input["data"])["Destinations"]):
                ml_input_data = json.loads(ml_input["data"])
                # there are 2 ip addresses in ml_input
                try:
                    if destination["Ip"] == flow_output["Destination"]:
                        config = {
                            "from": flow["arn"],
                            "to": ml_input["arn"],
                            "scheme": ml_input_data["Type"]
                        }
                        print(config)
                        items.append(
                            connection_to_ddb_item(
                                flow["arn"], ml_input["arn"],
                                connection_type, config))
                        break
                except Exception as error:
                    print(error)
    except ClientError as error:
        print(error)
    return items


def handle_mediaconnect_ingress_vpc_interface(outer_flow_data, outer_flow_vpc):
    """
    Helper to Handle Ingress Vpc Interfaces for MediaConnect
    """
    if "VpcInterfaces" in outer_flow_data:
        if outer_flow_data["Source"]["Transport"]["Protocol"] == "cdi":
            subnet = outer_flow_data["VpcSubnet"][outer_flow_data["Source"]["VpcInterfaceName"]]
            # source is ip, port, and subnet all concatenated into one string
            outer_flow_vpc["source"] = outer_flow_data["Source"]["IngestIp"]\
                + str(outer_flow_data["Source"]["IngestPort"])\
                + subnet
        # if JPEGXS, keep track of two mediainput configurations
        elif outer_flow_data["Source"]["Transport"]["Protocol"] == "st2110-jpegxs":
            # handle the two input configurations
            # save as source 1 and source 2?
            source_1 = outer_flow_data["Source"]["MediaStreamSourceConfigurations"][0]["InputConfigurations"][0]
            source_2 = outer_flow_data["Source"]["MediaStreamSourceConfigurations"][0]["InputConfigurations"][1]
            subnet_1 = outer_flow_data["VpcSubnet"][source_1["Interface"]["Name"]]
            subnet_2 = outer_flow_data["VpcSubnet"][source_2["Interface"]["Name"]]
            # source is ip, port, and subnet all concatenated into one string
            outer_flow_vpc["source_1"] = source_1["InputIp"] + str(source_1["InputPort"]) + subnet_1
            outer_flow_vpc["source_2"] = source_2["InputIp"] + str(source_2["InputPort"]) + subnet_2
        else:
            print("WARNING: Unhandled MediaConnect VPC protocol type")


def handle_mediaconnect_egress_vpc_interface(outer_flow_data, outer_flow_vpc, outer_flow_egress_ip, flow_output, inner_flow_data):
    """
    Helper to Handle Egress Vpc Interfaces for MediaConnect
    """
    # if the outer flow is in a VPC, check each inner flow that's also in a VPC
    # outer flow and the inner flow's output's protocol must also match
    # before even checking if ip/port/subnet matches
    match = False
    if outer_flow_vpc and ("VpcInterfaces" in inner_flow_data)\
        and (outer_flow_data["Source"]["Transport"]["Protocol"] == flow_output["Transport"]["Protocol"]):
        print("outer protocol " + outer_flow_data["Source"]["Transport"]["Protocol"])
        print("output protocol" + flow_output["Transport"]["Protocol"])
        if flow_output["Transport"]["Protocol"] == "cdi":
            # compare this output's ip/port/vpc info with that of the outer flow
            vpc_name = flow_output["VpcInterfaceAttachment"]["VpcInterfaceName"]
            subnet = inner_flow_data["VpcSubnet"][vpc_name]
            ip_port_subnet = flow_output["Destination"] + str(flow_output["Port"]) + subnet
            # print(ip_port_subnet)
            if outer_flow_vpc["source"] == ip_port_subnet:
                match = True
        elif flow_output["Transport"]["Protocol"] == "st2110-jpegxs":
            # get the two output destinations and
            dest_1 = flow_output["MediaStreamOutputConfigurations"][0]["DestinationConfigurations"][0]
            dest_2 = flow_output["MediaStreamOutputConfigurations"][0]["DestinationConfigurations"][1]
            dest_1_subnet = inner_flow_data["VpcSubnet"][dest_1["Interface"]["Name"]]
            dest_2_subnet = inner_flow_data["VpcSubnet"][dest_2["Interface"]["Name"]]
            ip_port_subnet_1 = dest_1["DestinationIp"] + str(dest_1["DestinationPort"]) + dest_1_subnet
            ip_port_subnet_2 = dest_2["DestinationIp"] + str(dest_2["DestinationPort"]) + dest_2_subnet
            if (outer_flow_vpc["source_1"] == ip_port_subnet_1 or outer_flow_vpc["source_1"] == ip_port_subnet_2)\
                and ( outer_flow_vpc["source_2"] == ip_port_subnet_1 or outer_flow_vpc["source_2"] == ip_port_subnet_2):
                match = True
    # if not in VPC, process each flow against each of the same set of flows for regular IP push (standard)
    elif flow_output["Destination"] == outer_flow_egress_ip:
        match = True
    return match


def mediaconnect_flow_mediaconnect_flow_ddb_items():
    """
    Identify and format MediaConnect Flow to another MediaConnect Flow for cache storage.
    """
    items = []
    connection_type = "mediaconnect-flow-mediaconnect-flow"
    try:
        # get MediaConnect flows
        mediaconnect_flows_cached = cache.cached_by_service("mediaconnect-flow")
        for outer_flow in mediaconnect_flows_cached:
            outer_flow_data = json.loads(outer_flow["data"])
            outer_flow_egress_ip = outer_flow_data["EgressIp"]
            outer_flow_vpc = {}
            # process each flow for entitlement
            try:
                if outer_flow_data["Source"]["EntitlementArn"]:
                    config = {
                        "from": outer_flow_data["Source"]["EntitlementArn"],
                        "to": outer_flow_data["FlowArn"],
                        "scheme": "ENTITLEMENT"
                    }
                    items.append(
                        connection_to_ddb_item(
                            outer_flow_data["Source"]["EntitlementArn"],
                            outer_flow_data["FlowArn"], connection_type,
                            config))
            # More Info: https://bandit.readthedocs.io/en/latest/plugins/b110_try_except_pass.html
            except Exception: #nosec
                pass

            handle_mediaconnect_ingress_vpc_interface(outer_flow_data, outer_flow_vpc)

            # check this egress ip against all the output IPs of each of the flows
            for inner_flow, flow_output in ((inner_flow, flow_output) for inner_flow in mediaconnect_flows_cached for flow_output in json.loads(inner_flow["data"])["Outputs"]):
                inner_flow_data = json.loads(inner_flow["data"])
                match = False
                try:
                    match = handle_mediaconnect_egress_vpc_interface(outer_flow_data, outer_flow_vpc, outer_flow_egress_ip, flow_output, inner_flow_data)
                    if match:
                        config = {
                            "from":
                            inner_flow_data["FlowArn"],
                            "to":
                            outer_flow_data["FlowArn"],
                            "scheme":
                            flow_output["Transport"]["Protocol"].upper()
                        }
                        items.append(
                            connection_to_ddb_item(
                                inner_flow_data["FlowArn"],
                                outer_flow_data["FlowArn"],
                                connection_type, config))
                # More Info: https://bandit.readthedocs.io/en/latest/plugins/b110_try_except_pass.html
                except Exception: #nosec
                    pass
    except ClientError as error:
        print(error)
    return items


def mediapackage_endpoint_mediatailor_configuration_ddb_items():
    """
    Identify and format MediaPackage endpoints to a MediaTailor configuration for cache storage.
    """
    items = []
    connection_type = "mediapackage-origin-endpoint-mediatailor-configuration"
    try:
        mediapackage_ep_cached = cache.cached_by_service(
            "mediapackage-origin-endpoint")
        mediatailor_configs_cached = cache.cached_by_service(
            "mediatailor-configuration")
        # get the URL from data and compare to the VideoContentSourceUrl of MediaTailor
        for mp_endpoint in mediapackage_ep_cached:
            mp_endpoint_data = json.loads(mp_endpoint["data"])
            mp_endpoint_channel_id = mp_endpoint_data["Url"]
            for mt_config in mediatailor_configs_cached:
                mt_config_data = json.loads(mt_config["data"])
                mt_config_video_source = mt_config_data[
                    "VideoContentSourceUrl"]
                if mt_config_video_source in mp_endpoint_channel_id:
                    config = {
                        "from": mp_endpoint_data["Arn"],
                        "to": mt_config_data["PlaybackConfigurationArn"],
                        "scheme": urlparse(mt_config_video_source).scheme
                    }
                    print(config)
                    items.append(
                        connection_to_ddb_item(
                            mp_endpoint_data["Arn"],
                            mt_config_data["PlaybackConfigurationArn"],
                            connection_type, config))
    except ClientError as error:
        print(error)
    return items


def mediastore_container_mediatailor_configuration_ddb_items():
    """
    Identify and format MediaStore containers to a MediaTailor configuration for cache storage.
    """
    items = []
    try:
        # get mediatailor configs
        mediatailor_configs_cached = cache.cached_by_service(
            "mediatailor-configuration")
        # get mediastore containers
        mediastore_con_cached = cache.cached_by_service("mediastore-container")
        # iterate over mediatailor configs
        for mt_config in mediatailor_configs_cached:
            mt_config_data = json.loads(mt_config["data"])
            mt_config_video_source = mt_config_data["VideoContentSourceUrl"]
            parsed_source = urlparse(mt_config_video_source)
            if "mediastore" in parsed_source.netloc:
                for ms_container in mediastore_con_cached:
                    container_data = json.loads(ms_container["data"])
                    parsed_endpoint = urlparse(container_data["Endpoint"])
                    if parsed_source.netloc == parsed_endpoint.netloc:
                        # create a 'connection' out of matches
                        config = {
                            "from": container_data["ARN"],
                            "to": mt_config_data["PlaybackConfigurationArn"],
                            "scheme": parsed_source.scheme
                        }
                        print(config)
                        items.append(
                            connection_to_ddb_item(
                                container_data["ARN"],
                                mt_config_data["PlaybackConfigurationArn"],
                                "mediastore-container-mediatailor-configuration",
                                config))
    except ClientError as error:
        print(error)
    return items


def s3_bucket_mediatailor_configuration_ddb_items():
    """
    Identify and format S3 buckets to a MediaTailor configuration for cache storage.
    """
    items = []
    try:
        # get S3 buckets
        s3_buckets_cached = cache.cached_by_service("s3")
        # get MediaTailor configurations
        mediatailor_configs_cached = cache.cached_by_service("mediatailor-configuration")
        # iterate over configs
        for mt_config in mediatailor_configs_cached:
            mt_config_data = json.loads(mt_config["data"])
            mt_config_video_source = mt_config_data["VideoContentSourceUrl"]
            # is this a bucket url?
            bucket_name, scheme = check_if_url_is_s3_url(mt_config_video_source)
            if bucket_name:
                # find the bucket
                for s3_bucket in s3_buckets_cached:
                    s3_bucket_data = json.loads(s3_bucket["data"])
                    if bucket_name == s3_bucket_data["Name"]:
                        config = {
                            "from": s3_bucket["arn"],
                            "to": mt_config_data["PlaybackConfigurationArn"],
                            "scheme": scheme
                        }
                        print(config)
                        items.append(
                            connection_to_ddb_item(
                                s3_bucket["arn"],
                                mt_config_data["PlaybackConfigurationArn"],
                                "s3-bucket-mediatailor-configuration", config))
    except ClientError as error:
        print(error)
    return items


def mediastore_container_cloudfront_distribution_ddb_items():
    """
    Identify and format MediaStore Container to CloudFront Distribution connections for cache storage.
    """
    items = []
    try:
        # get CloudFront distros
        cloudfront_distros_cached = cache.cached_by_service("cloudfront-distribution")
        # get cached MediaStore containers
        mediastore_con_cached = cache.cached_by_service("mediastore-container")
        # iterate over all distributions
        for distro in cloudfront_distros_cached:
            distro_data = json.loads(distro["data"])
            for origin in distro_data["Origins"]["Items"]:
                origin_domain_name = origin["DomainName"]
                if "mediastore" not in origin_domain_name:
                    continue
                for ms_container in mediastore_con_cached:
                    ms_container_data = json.loads(ms_container["data"])
                    if origin_domain_name in ms_container_data["Endpoint"]:
                        config = {
                            "from":
                            ms_container["arn"],
                            "to":
                            distro["arn"],
                            "scheme":
                            urlparse(ms_container_data["Endpoint"]).scheme
                        }
                        print(config)
                        items.append(
                            connection_to_ddb_item(
                                ms_container["arn"], distro["arn"],
                                "mediastore-container-cloudfront-distribution",
                                config))
    except ClientError as error:
        print(error)
    return items


def medialive_channel_s3_bucket_ddb_items():
    """
    Identify and format MediaLive channel to S3 bucket connections for cache storage.
    """
    items = []
    try:
        # get medialive channels
        medialive_ch_cached = cache.cached_by_service("medialive-channel")
        # get s3 buckets
        s3_buckets_cached = cache.cached_by_service("s3")
        # compare each medialive output url to an s3 bucket location
        # protocols allowed for writing to s3 buckets are s3 and s3ssl
        for ml_channel, url in ((datum, setting["Url"]) for datum in medialive_ch_cached for destination in json.loads(datum["data"])["Destinations"] for setting in destination["Settings"]):
            parsed_destination = urlparse(url)
            if parsed_destination.scheme in ('s3', 's3ssl'):
                for s3_bucket in s3_buckets_cached:
                    s3_bucket_data = json.loads(s3_bucket["data"])
                    if parsed_destination.netloc == s3_bucket_data[
                            'Name']:
                        # create a 'connection' out of matches
                        config = {
                            "from": ml_channel["arn"],
                            "to": s3_bucket["arn"],
                            "scheme": parsed_destination.scheme
                        }
                        print(config)
                        items.append(
                            connection_to_ddb_item(
                                ml_channel["arn"], s3_bucket["arn"],
                                "medialive-channel-s3-bucket", config))
    except ClientError as error:
        print(error)
    return items


def link_device_medialive_input_ddb_items():
    """
    Identify and format Elemental Link device to MediaLive input for cache storage.
    """
    items = []
    try:
        # get medialive inputs
        medialive_input_cached = cache.cached_by_service("medialive-input")
        # get link devices
        link_devices_cached = cache.cached_by_service("link-device")
        # find matching ids in the attached inputs to attached channels
        for ml_input in medialive_input_cached:
            ml_input_data = json.loads(ml_input["data"])
            for input_device in ml_input_data["InputDevices"]:
                for link_device in link_devices_cached:
                    link_device_data = json.loads(link_device["data"])
                    if input_device["Id"] == link_device_data["Id"]:
                        config = {
                            "from":
                            link_device["arn"],
                            "to":
                            ml_input["arn"],
                            "scheme":
                            "ARQ",
                            "info":
                            "https://en.wikipedia.org/wiki/Automatic_repeat_request"
                        }
                        print(config)
                        items.append(
                            connection_to_ddb_item(
                                link_device["arn"], ml_input["arn"],
                                "link-device-medialive-input", config))
    except ClientError as error:
        print(error)
    return items


def medialive_channel_medialive_input_ddb_items():
    """
    Identify and format MediaLive channel outputs to MediaLive input for cache storage.
    """
    items = []
    try:
        # get medialive channels
        medialive_ch_cached = cache.cached_by_service("medialive-channel")
        # get medialive inputs
        medialive_input_cached = cache.cached_by_service("medialive-input")

        # only look for RTP destinations because EML does not suport UDP inputs
        for ml_channel, url in ((datum, setting["Url"]) for datum in medialive_ch_cached for destination in json.loads(datum["data"])["Destinations"] for setting in destination["Settings"]):
            parsed_destination = urlparse(url)
            if parsed_destination.scheme != 'rtp':
                continue
            dest_ip_port = parsed_destination.netloc
            for ml_input in medialive_input_cached:
                ml_input_data = json.loads(ml_input["data"])
                if ml_input_data["Type"] != "RTP_PUSH":
                    continue
                for parsed_input_destination in (urlparse(input_destination["Url"]) for input_destination in ml_input_data["Destinations"] if urlparse(input_destination["Url"]) == dest_ip_port):
                    #add this connection
                    config = {
                        "from":
                        ml_channel["arn"],
                        "to":
                        ml_input["arn"],
                        "scheme": parsed_input_destination.scheme.upper()
                    }
                    print(config)
                    items.append(
                        connection_to_ddb_item(
                            ml_channel["arn"], ml_input["arn"],
                            "medialive-channel-medialive-input", config))
    except ClientError as error:
        print(error)
    return items


def medialive_channel_mediaconnect_flow_ddb_items():
    """
    Identify and format MediaLive channel outputs to MediaConnect flow for cache storage.
    """
    items = []
    try:
        # get medialive channels
        medialive_ch_cached = cache.cached_by_service("medialive-channel")
        # get mediaconnect flows
        mediaconnect_flows_cached = cache.cached_by_service("mediaconnect-flow")
        # only look for RTP destinations because EMX does not support UDP source
        for ml_channel, url in ((datum, setting["Url"]) for datum in medialive_ch_cached for destination in json.loads(datum["data"])["Destinations"] for setting in destination["Settings"]):
            parsed_destination = urlparse(url)
            if parsed_destination.scheme != 'rtp':
                continue
            dest_ip_port = parsed_destination.netloc
            for flow in mediaconnect_flows_cached:
                flow_data = json.loads(flow["data"])
                # for each flow, process each source
                for flow_source in flow_data["Sources"]:
                    if ("Transport" in flow_source) and (
                            "rtp"
                            in flow_source["Transport"]["Protocol"]
                    ) and (dest_ip_port
                            == flow_source["IngestIp"] + ":" +
                            str(flow_source["IngestPort"])):
                        #add this connection
                        config = {
                            "from":
                            ml_channel["arn"],
                            "to":
                            flow["arn"],
                            "scheme":
                            flow_source["Transport"]
                            ["Protocol"].upper()
                        }
                        print(config)
                        items.append(
                            connection_to_ddb_item(
                                ml_channel["arn"], flow["arn"],
                                "medialive-channel-mediaconnect-flow",
                                config))
    except ClientError as error:
        print(error)
    return items
