// Copyright 2026 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import { CopyObjectCommand, DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
const s3 = new S3Client();

// prefix to copy partitioned data to w/o leading but w/ trailing slash
const targetKeyPrefix = process.env.TARGET_KEY_PREFIX;

// regex for filenames by Amazon CloudFront access logs. Groups:
// - 1.	year
// - 2.	month
// - 3.	day 
// - 4.	hour
const datePattern = '[^\\d](\\d{4})-(\\d{2})-(\\d{2})-(\\d{2})[^\\d]';
const filenamePattern = '[^/]+$';

export const handler = async (event) => {
  const moves = event.Records.map(async record => {
    const bucket = record.s3.bucket.name;
    const sourceKey = record.s3.object.key;

    const sourceRegex = new RegExp(datePattern, 'g');
    const match = sourceRegex.exec(sourceKey);
    if (match == null) {
      console.log(`Object key ${sourceKey} does not look like an access log file, so it will not be moved.`);
      return;
    }

    const [, year, month, day, hour] = match;

    const filenameRegex = new RegExp(filenamePattern, 'g');
    const filename = filenameRegex.exec(sourceKey)[0];

    const targetKey = `${targetKeyPrefix}year=${year}/month=${month}/day=${day}/hour=${hour}/${filename}`;
    console.log(`Copying ${sourceKey} to ${targetKey}.`);

    const copyParams = {
      CopySource: bucket + '/' + sourceKey,
      Bucket: bucket,
      Key: targetKey
    };

    try {
      await s3.send(new CopyObjectCommand(copyParams));      
      const deleteParams = { Bucket: bucket, Key: sourceKey };
      await s3.send(new DeleteObjectCommand(deleteParams));
      console.log(`Moved ${sourceKey} to ${targetKey}.`);
    } catch (error) {
      console.error(`Error while moving ${sourceKey} to ${targetKey}: ${error}`);
      throw error;
    }
  });
  
  await Promise.all(moves);
};
