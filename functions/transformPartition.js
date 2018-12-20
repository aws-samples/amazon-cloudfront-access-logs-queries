// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
const util = require('./util');

// AWS Glue Data Catalog database and tables
const sourceTable = process.env.SOURCE_TABLE;
const targetTable = process.env.TARGET_TABLE;
const database = process.env.DATABASE;

// s3 URL to write CTAS results to (including trailing slash)
const athenaCtasResultsLocation = process.env.ATHENA_CTAS_RESULTS_LOCATION;

// get the partition of 2hours ago
exports.handler = async (event, context, callback) => {
  var partitionHour = new Date(Date.now() - 120 * 60 * 1000);
  var year = partitionHour.getUTCFullYear();
  var month = (partitionHour.getUTCMonth() + 1).toString().padStart(2, '0');
  var day = partitionHour.getUTCDate().toString().padStart(2, '0');
  var hour = partitionHour.getUTCHours().toString().padStart(2, '0');

  console.log('Transforming Partition', { year, month, day, hour });

  var intermediateTable = `ctas_${year}_${month}_${day}_${hour}`;

  var ctasStatement = `
    CREATE TABLE ${database}.${intermediateTable}
    WITH ( format='PARQUET',
        external_location='${athenaCtasResultsLocation}year=${year}/month=${month}/day=${day}/hour=${hour}',
        parquet_compression = 'SNAPPY')
    AS SELECT *
    FROM ${database}.${sourceTable}
    WHERE year = '${year}'
        AND month = '${month}'
        AND day = '${day}'
        AND hour = '${hour}';`;

  var dropTableStatement = `DROP TABLE ${database}.${intermediateTable};`;

  var createNewPartitionStatement = `
    ALTER TABLE ${database}.${targetTable}
    ADD IF NOT EXISTS 
    PARTITION (
        year = '${year}',
        month = '${month}',
        day = '${day}',
        hour = '${hour}' );`;

  await util.runQuery(ctasStatement).then(
    () => Promise.all([
      util.runQuery(dropTableStatement),
      util.runQuery(createNewPartitionStatement)
    ])
  );
}
