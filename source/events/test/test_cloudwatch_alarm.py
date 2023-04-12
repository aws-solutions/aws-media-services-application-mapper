"""
This module is provides unit tests for the cloudwatch_alarm.py module.
"""

# pylint: disable=C0415,W0201

import os
import unittest
from unittest.mock import patch, MagicMock
from botocore.exceptions import ClientError

ARN = "arn:msam:user-defined-node:global:111122223333:10AA8D40-2B6F-44FA-AA67-6B909F8B1DB9"
CLIENT_ERROR = ClientError({"Error": {"Code": "400", "Message": "SomeClientError"}}, "ClientError")

os.environ["SOLUTION_ID"] = "SO0166"
os.environ["ALARMS_TABLE_NAME"] = "alarms_table"
os.environ["EVENTS_TABLE_REGION"] = "us-east-1"

@patch('boto3.client')
@patch('boto3.resource')
class TestCloudWatchAlarm(unittest.TestCase):
    """
    This class extends TestCase with testing functions
    """
    def test_subscribers_to_alarm(self, patched_resource,
                                     patched_client):
        """
        Test the subscribers_to_alarm function
        """
        import cloudwatch_alarm
        with patch.object(cloudwatch_alarm.ALARMS_TABLE, 'query', side_effect=[{"Items":[{"ResourceArn": ARN}], "LastEvaluatedKey": "token"},
            {"Items":[{"ResourceArn": ARN}]}]):
            cloudwatch_alarm.subscribers_to_alarm("RegionAlarmName")
            self.assertEqual(cloudwatch_alarm.ALARMS_TABLE.query.call_count, 2)
        
        with patch.object(cloudwatch_alarm.ALARMS_TABLE, 'query', side_effect=CLIENT_ERROR):
            cloudwatch_alarm.subscribers_to_alarm("RegionAlarmName")
            self.assertRaises(ClientError)


    def test_lambda_handler(self, patched_resource,
                                     patched_client):
        """
        Test the lambda_handler function
        """
        import cloudwatch_alarm
        mocked_event = {"region": "us-east-1", "detail": {"alarmName": "alarmName"}}
        patched_resource.return_value.Alarm.return_value.alarm_value = "set"
        with patch.object(cloudwatch_alarm, 'subscribers_to_alarm', return_value=[ARN]):
            with patch.object(cloudwatch_alarm.ALARMS_TABLE, 'update_item', return_value={}):
                cloudwatch_alarm.lambda_handler(mocked_event, MagicMock())
                cloudwatch_alarm.boto3.resource.return_value.Alarm.assert_called_once_with('alarmName')
                cloudwatch_alarm.ALARMS_TABLE.update_item.assert_called_once()
                self.assertTrue(cloudwatch_alarm.ALARMS_TABLE.update_item.call_args.kwargs['UpdateExpression'] == 'SET StateValue = :state, Updated = :updated, StateUpdated = :stateupdated')
                self.assertTrue(cloudwatch_alarm.ALARMS_TABLE.update_item.call_args.kwargs['Key'] == {'RegionAlarmName': 'us-east-1:alarmName', 'ResourceArn': ARN})
        patched_resource.return_value.Alarm.side_effect = CLIENT_ERROR
        cloudwatch_alarm.lambda_handler(mocked_event, MagicMock())
        self.assertRaises(ClientError)
