# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0
"""
This Lambda is responsible for receiving and storing CloudWatch events
originating from Media Services. This Lambda must be installed into
each region where Media Services are created.
"""

import datetime
import os
import json
import secrets
from urllib.parse import unquote

import boto3
from botocore.exceptions import ClientError
from botocore.config import Config
from jsonpath_ng import parse

# user-agent config
SOLUTION_ID = os.environ['SOLUTION_ID']
USER_AGENT_EXTRA = {"user_agent_extra": SOLUTION_ID}
MSAM_BOTO3_CONFIG = Config(**USER_AGENT_EXTRA)

DYNAMO_REGION_NAME=os.environ["EVENTS_TABLE_REGION"]
DYNAMO_RESOURCE = boto3.resource('dynamodb', region_name=DYNAMO_REGION_NAME, config=MSAM_BOTO3_CONFIG)
EVENTS_TABLE = DYNAMO_RESOURCE.Table(os.environ["EVENTS_TABLE_NAME"])
CLOUDWATCH_EVENTS_TABLE = DYNAMO_RESOURCE.Table(os.environ["CLOUDWATCH_EVENTS_TABLE_NAME"])
CONTENT_TABLE_NAME = os.environ["CONTENT_TABLE_NAME"]

def find_media_services_arn(event):
    """
    Find all forms of ARN fro media services
    """
    # catch all the various forms of ARN from the media services
    arn_expr = parse('$..arn|aRN|resource-arn|channel_arn|multiplex_arn|flowArn|PlaybackConfigurationArn|resourceArn')
    original_arns = [match.value for match in arn_expr.find(event)]
    arns = []
    # remove arn that is for userIdentity or inputSecurityGroup
    # note: can't remove an item from a list that's being iterated over so doing it this way
    for arn in original_arns:
        if not ("user" in arn or "role" in arn or "inputSecurityGroup" in arn):
            arns.append(arn)
    return arns

def handle_alerts(event):
    """
    Helper function to handle Alert event types
    """
    if "Alert" in event["detail-type"]:
        # medialive alerts
        if "MediaLive" in event["detail-type"]:
            event["alarm_id"] = event["detail"]["alarm_id"]
            event["alarm_state"] = event["detail"]["alarm_state"].lower()

        # mediaconnect alerts
        elif "MediaConnect" in event["detail-type"]:
            event["alarm_id"] = event["detail"]["error-id"]
            if event["detail"]["errored"]:
                event["alarm_state"] = "set"
            else:
                event["alarm_state"] = "cleared"
            event["detail"]["alert_type"] = event["detail"]["error-code"]
            del event["detail"]["error-code"]
            event["detail"]["message"] = event["detail"]["error-message"]
            del event["detail"]["error-message"]
        #print(event)
        EVENTS_TABLE.put_item(Item=event)
        print(event["detail-type"] + " stored.")

def handle_medialive_event(event):
    """
    Helper to handle MediaLive events
    """
    if "BatchUpdateSchedule" in event["type"]:
        print("Creating an ARN for BatchUpdateSchedule event.")
        event["resource_arn"] = "arn:aws:medialive:" + event['region'] + ":" + \
            event['account'] + ":channel:" + \
            event['detail']['requestParameters']['channelId']

def handle_mediapackage_event(event):
    """
    Helper to handle MediaPackage events
    """
    if "HarvestJob" in event["type"]:
        print("Asking MediaPackage for the ARN of endpoint in a HarvestJob event.")
        # to get the ARN, ask mediapackage to describe the origin endpoint
        # the ARN available through resources is the HarvestJob ARN, not the endpoint
        orig_id_expr = parse('$..origin_endpoint_id')
        orig_id = [match.value for match in orig_id_expr.find(event)]
        if orig_id:
            emp_client = boto3.client('mediapackage')
            response = emp_client.describe_origin_endpoint(
                Id=orig_id[0])
            event["resource_arn"] = response["Arn"]
        else:
            print("Skipping this event. Origin ID not present in the HarvestJob event." + event["type"])

def handle_mediastore_event(event):
    """
    Helper to handle MediaStore events
    """
    # for object state change the resource is the object, not the container
    # so the captured arn needs to be fixed
    temp_arn = event["resource_arn"].split('/')
    event["resource_arn"] = temp_arn[0] + "/" + temp_arn[1]

def lambda_handler(event, _):
    """
    Entry point for CloudWatch event receipt.
    """
    try:
        print(event)
        event["timestamp"] = int(datetime.datetime.strptime(
            event["time"], '%Y-%m-%dT%H:%M:%SZ').timestamp())
        event["expires"] = event["timestamp"] + int(os.environ["ITEM_TTL"])
        event["detail"]["time"] = event["time"]

        arns = find_media_services_arn(event)
        if arns:
            event["resource_arn"] = unquote(arns[0])
        # for certain events, the ARN is not labeled as an ARN but instead put in the resources list
        if not arns and event["resources"] and "vod" not in event["resources"][0]:
            event["resource_arn"] = event["resources"][0]
        # handle alerts
        handle_alerts(event)
        # set the rest of the information needed for storing as regular CWE
        # give timestamp a millisecond precision since it's sort key in CWE table
        event["timestamp"] = event["timestamp"] * 1000 + secrets.randbelow(999) + 1
        event["data"] = json.dumps(event["detail"])
        event["type"] = event["detail-type"]
        if "eventName" in event["detail"]:
            event["type"] = event["type"] + ": " + event["detail"]["eventName"]

        # handle specific cases depending on source
        if event["source"] == "aws.medialive":
            handle_medialive_event(event)
        elif event["source"] == "aws.mediapackage":
            handle_mediapackage_event(event)
        elif event["source"] == "aws.mediastore" and "MediaStore Object State Change" in event["type"]:
            handle_mediastore_event(event)
        # if item has no resource arn, don't save in DB
        if "resource_arn" in event:
            #print(event)
            print("Storing media service event.")
            CLOUDWATCH_EVENTS_TABLE.put_item(Item=event)
        else:
            print("Skipping this event. " + event["type"])
    except ClientError as error:
        print(error)
    return True
