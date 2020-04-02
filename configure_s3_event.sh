#! /bin/bash 

#add event notification config
aws s3api put-bucket-notification-configuration \
--bucket $S3_BUCKET \
--cli-input-json s3_notification_config.json