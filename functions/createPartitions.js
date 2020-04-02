// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
const util = require('./util');

// AWS Glue Data Catalog database and table
const table = process.env.TABLE;
const database = process.env.DATABASE;

// creates partitions for the hour after the current hour
exports.handler = async (event, context, callback) => {
  var nextHour = new Date(Date.now() + 60 * 60 * 1000);
  var date = nextHour.toISOString().substring(0, 10);
  var hour = nextHour.getUTCHours().toString().padStart(2, '0');
  console.log('Creating Partition', { date, hour });

  var createPartitionStatement = `
    ALTER TABLE ${database}.${table}
    ADD IF NOT EXISTS 
    PARTITION (
        dt = '${date}',
        hour = '${hour}' );`;

  await util.runQuery(createPartitionStatement);
}
