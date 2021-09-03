const util = require('./util');

// AWS Glue Data Catalog database and tables
const sourceTable = process.env.SOURCE_TABLE;
const targetTable = process.env.TARGET_TABLE;
const database = process.env.DATABASE;

async function insertMissingGzData(database, sourceTable, targetTable, year, month, day) {

  const insertStatement = `
    -- Insert missing Gzip Data on ${year}-${month}-${day}
    INSERT INTO ${database}.${targetTable}
    WITH gz AS (
      SELECT *
      FROM ${database}.${sourceTable}
      WHERE year = '${year}' AND month = '${month}' AND day = '${day}'
    ), parquet AS (
      SELECT concat(year, '-', month, '-', day, 'T', hour) dth, request_id
      FROM ${database}.${targetTable}
      WHERE year = '${year}' AND month = '${month}' AND day = '${day}'
    )
    SELECT
      gz.*
    FROM gz LEFT JOIN parquet
    ON concat(gz.year, '-', gz.month, '-', gz.day, 'T', gz.hour) = parquet.dth
      AND gz.request_id = parquet.request_id
    WHERE parquet.request_id IS NULL`;

  await util.runQuery(insertStatement);
}

// get the partitions of yesterday or use `dt` in event
exports.handler = async (event, context, callback) => {
  if ( 'dt' in event ) {
    var yesterday = new Date(`${event.dt}T00:00:00Z`)
    if (isNaN(yesterday))
      throw new Error('invalid dt')
  } else {
    var yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
  }

  const year = yesterday.getUTCFullYear();
  const month = (yesterday.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = yesterday.getUTCDate().toString().padStart(2, '0');

  console.log('Insert Missing Data in Gzip Files on ', { year, month, day });

  await insertMissingGzData(database, sourceTable, targetTable, year, month, day);
}
