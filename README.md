# Analyzing your Amazon CloudFront access logs at scale

This is a sample implementation for the concepts described in the AWS blog post [_Analyze your Amazon CloudFront access logs at scale_](https://aws.amazon.com/blogs/big-data/analyze-your-amazon-cloudfront-access-logs-at-scale/) using
[AWS CloudFormation](https://aws.amazon.com/cloudformation/),
[Amazon Athena](https://aws.amazon.com/athena/),
[AWS Glue](https://aws.amazon.com/glue/),
[AWS Lambda](https://aws.amazon.com/lambda/), and
[Amazon Simple Storage Service](https://aws.amazon.com/s3/) (S3).

This application is available in the AWS Serverless Application Repository. You can deploy it to your account from there:

[![cloudformation-launch-button](https://s3.amazonaws.com/cloudformation-examples/cloudformation-launch-stack.png)](https://serverlessrepo.aws.amazon.com/#/applications/arn:aws:serverlessrepo:us-east-1:387304072572:applications~amazon-cloudfront-access-logs-queries)

## Overview

The application has two main parts:

- An S3 bucket that serves as a log bucket for Amazon ALB access logs. As soon as Amazon ALB delivers a new access logs file, an event triggers the AWS Lambda function `moveAccessLogs`. This moves the file to an [Apache Hive style](https://cwiki.apache.org/confluence/display/Hive/LanguageManual+DDL#LanguageManualDDL-AlterPartition) prefix.

    ![infrastructure-overview](images/moveAccessLogs.png)

- An hourly scheduled AWS Lambda function `createPartition` that runs an [ALTER TABLE...ADD PARTITION](https://docs.aws.amazon.com/athena/latest/ug/alter-table-add-partition.html) query on the athena table to create hourly partitions.

## FAQs

### Q: How can I get started?

1. Create athena database and table using ![athena.ddl](./athena.ddl)
2. Generate Cloudformation template using ![template.yaml](./template.yaml)
3. Deploye Cloudformation template.
3. Add s3 even notification using ![configure_s3_event.sh](./configure_s3_event.sh)

## License Summary

This sample code is made available under a modified MIT license. See the [LICENSE](https://github.com/aws-samples/amazon-cloudfront-access-logs-queries/blob/master/LICENSE) file.
