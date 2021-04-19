// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
const util = require('./util');

// AWS Glue Data Catalog database and tables
const sourceTable = process.env.SOURCE_TABLE;
const targetTable = process.env.TARGET_TABLE;
const database = process.env.DATABASE;

// get the partition of 2hours ago
exports.handler = async (event, context, callback) => {
  const partitionHour = new Date(Date.now() - 120 * 60 * 1000);
  const year = partitionHour.getUTCFullYear();
  const month = (partitionHour.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = partitionHour.getUTCDate().toString().padStart(2, '0');
  const hour = partitionHour.getUTCHours().toString().padStart(2, '0');

  console.log('Transforming Partition', { year, month, day, hour });

  const ctasStatement = `
    INSERT INTO ${database}.${targetTable}
    SELECT *
    FROM ${database}.${sourceTable}
    WHERE year = '${year}'
        AND month = '${month}'
        AND day = '${day}'
        AND hour = '${hour}';`;

  await util.runQuery(ctasStatement);
}
