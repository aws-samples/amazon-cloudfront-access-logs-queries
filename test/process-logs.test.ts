import { AthenaClient, GetQueryExecutionCommand, GetQueryResultsCommand, StartQueryExecutionCommand } from '@aws-sdk/client-athena';
import { CloudFormationClient, DescribeStackResourcesCommand, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { BatchDeletePartitionCommand, GetPartitionsCommand, GlueClient } from '@aws-sdk/client-glue';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { DeleteObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import * as dotenv from 'dotenv';
import { promisify } from 'util';
import { gzip } from 'zlib';

const gzipAsync = promisify(gzip);

dotenv.config();

const cf = new CloudFormationClient();
const s3 = new S3Client();
const lambda = new LambdaClient();
const athena = new AthenaClient();
const glue = new GlueClient();

const STACK_NAME = 'cf-logs-integration-test';

describe('CloudFront Access Logs Pipeline', () => {
  let bucketName: string;
  let moveFn: string;
  let createFn: string;
  let transformFn: string;
  let database: string;

  beforeAll(async () => {
    console.log(`🔍 Getting stack resources for: ${STACK_NAME}`);
    const stackResources = await cf.send(new DescribeStackResourcesCommand({ StackName: STACK_NAME }));
    bucketName = stackResources.StackResources?.find(r => r.LogicalResourceId === 'CloudFrontAccessLogsBucket')?.PhysicalResourceId!;
    moveFn = stackResources.StackResources?.find(r => r.LogicalResourceId === 'MoveNewAccessLogsFn')?.PhysicalResourceId!;
    createFn = stackResources.StackResources?.find(r => r.LogicalResourceId === 'CreatePartFn')?.PhysicalResourceId!;
    transformFn = stackResources.StackResources?.find(r => r.LogicalResourceId === 'TransformPartFn')?.PhysicalResourceId!;

    const stacks = await cf.send(new DescribeStacksCommand({ StackName: STACK_NAME }));
    database = stacks.Stacks?.[0]?.Outputs?.find(o => o.OutputKey === 'DatabaseName')?.OutputValue || 'test_cf_access_logs_db';

    console.log(`📦 Bucket: ${bucketName}`);
    console.log(`🗄️ Database: ${database}`);
    console.log(`⚡ Functions: ${moveFn}, ${createFn}, ${transformFn}`);


    const tableNames = ['partitioned_gz', 'partitioned_parquet'];

    // Drop all partitions using Glue API
    console.log(`🗑️ Dropping all partitions from the tables ${tableNames}`);

    for (const tableName of tableNames) {
      try {
        const partitions = await glue.send(new GetPartitionsCommand({
          DatabaseName: database,
          TableName: tableName
        }));

        if (partitions.Partitions?.length) {
          console.log(`🗑️ Found ${partitions.Partitions.length} partitions in ${tableName}`);

          // Delete in batches of 25
          for (let i = 0; i < partitions.Partitions.length; i += 25) {
            const batch = partitions.Partitions.slice(i, i + 25);
            await glue.send(new BatchDeletePartitionCommand({
              DatabaseName: database,
              TableName: tableName,
              PartitionsToDelete: batch.map(p => ({ Values: p.Values }))
            }));
            console.log(`✅ Deleted batch of ${batch.length} partitions from ${tableName}`);
          }
        } else {
          console.log(`📋 No partitions found in ${tableName}`);
        }
      } catch (error) {
        console.log(`⚠️ Error processing ${tableName}: ${error}`);
      }
    }

    // Clear bucket data
    const existingObjects = await s3.send(new ListObjectsV2Command({
      Bucket: bucketName
    }));

    if (existingObjects.Contents?.length) {
      console.log(`🗑️ Deleting ${existingObjects.Contents.length} existing objects`);
      await Promise.all(
        existingObjects.Contents.map(obj =>
          s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: obj.Key! }))
        )
      );
    }
  });

  test('should process CloudFront logs end-to-end', async () => {
    const now = new Date();
    const dates = [];

    // Create test data for next hour (what createPartitions creates) and 3 hours before
    for (let i = 1; i >= -2; i--) {
      const date = new Date(now);
      // subtract i hours
      date.setUTCHours(date.getUTCHours() + i);
      const year = date.getUTCFullYear().toString();
      const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
      const day = date.getUTCDate().toString().padStart(2, '0');
      const hour = date.getUTCHours().toString().padStart(2, '0');
      dates.push({ dateStr: `${year}-${month}-${day}`, hour });
    }

    console.log(`📅 Testing with dates: ${dates.map(d => `${d.dateStr}, hour: ${d.hour}`).join(', ')}`);

    for (const { dateStr, hour } of dates) {
      const testKey = `new/E1234567890123.${dateStr}-${hour}.abcd1234.gz`;
      const logContent = `#Version: 1.0
#Fields: date time x-edge-location sc-bytes c-ip cs-method cs(Host) cs-uri-stem sc-status cs(Referer) cs(User-Agent) cs-uri-query cs(Cookie) x-edge-result-type x-edge-request-id x-host-header cs-protocol cs-bytes time-taken x-forwarded-for ssl-protocol ssl-cipher x-edge-response-result-type cs-protocol-version fle-status fle-encrypted-fields c-port time-to-first-byte x-edge-detailed-result-type sc-content-type sc-content-len sc-range-start sc-range-end
${dateStr}\t${hour}:42:10\tFRA56-P2\t579\t2a02:3102:5880:4800:3848:b58c:461c:980e\tGET\td3rvlakplraokq.cloudfront.net\t/\t301\t-\tMozilla/5.0%20(Macintosh;%20Intel%20Mac%20OS%20X%2010.15;%20rv:145.0)%20Gecko/20100101%20Firefox/145.0\t-\t-\tRedirect\t5agIMVMjhthaDAU3m1t7Buig-FZhHrHpxPTQaVzaylvp_unAm9A8GQ==\td3rvlakplraokq.cloudfront.net\thttp\t363\t0.002\t-\t-\t-\tRedirect\tHTTP/1.1\t-\t-\t59119\t0.002\tRedirect\ttext/html\t167\t-\t-`

      console.log(`📤 Uploading test file: ${testKey}`);
      const compressedContent = await gzipAsync(Buffer.from(logContent));
      await s3.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: testKey,
        Body: compressedContent
      }));
    }

    console.log('⏳ Waiting 10s for S3 event trigger...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    const rowsBeforeCreatePartitions = await getTableData(bucketName, database, "partitioned_parquet");
    // expect that there are no rows found yet
    expect(rowsBeforeCreatePartitions.length).toBe(0);

    // List all files in bucket
    const allObjects = await listObjects(bucketName);
    expect(allObjects.Contents?.some(obj => obj.Key?.startsWith('new/'))).toBe(false);
    expect(allObjects.Contents?.filter(obj => obj.Key?.includes('E1234567890123')).length).toBe(4);

    console.log('⚡ Invoking createPartitions function...');
    const createResult = await lambda.send(new InvokeCommand({
      FunctionName: createFn,
      Payload: '{}'
    }));
    console.log(`✅ createPartitions result: ${createResult.StatusCode}`);

    const rowsAfterCreatePartitions = await getTableData(bucketName, database, "partitioned_gz");
    // expect that there is now a row for the next hour
    expect(rowsAfterCreatePartitions.length).toBe(1);

    // invoke msck repair to load all others
    console.log('🔧 Running MSCK REPAIR TABLE to load remaining partitions...');
    await runAthenaQuery(`MSCK REPAIR TABLE ${database}.partitioned_gz`, bucketName);

    console.log('📊 Verifying all partitions loaded after MSCK REPAIR...');
    const rowsAfterMsckRepair = await getTableData(bucketName, database, "partitioned_gz");
    expect(rowsAfterMsckRepair.length).toBe(4);

    console.log('⚡ Invoking transformPartition function...');
    const transformResult = await lambda.send(new InvokeCommand({
      FunctionName: transformFn,
      Payload: '{}'
    }));

    const response = JSON.parse(new TextDecoder().decode(transformResult.Payload));
    console.log(`✅ transformPartition result: ${transformResult.StatusCode}, response:`, response);
    expect(response?.errorMessage).toBeUndefined();

    const objectsAfterTransformation = await listObjects(bucketName);

    // has one object which is the transformed partition with the parquet ending
    expect(objectsAfterTransformation.Contents?.filter(obj => obj.Key?.startsWith('partitioned-parquet/')).length).toBe(1);

    const parquetRowsAfterPartitionTransformation = await getTableData(bucketName, database, "partitioned_parquet");
    expect(parquetRowsAfterPartitionTransformation.length).toBe(1);

    console.log('📊 Verifying final combined table results...');
    const combinedRowsAfterPartitionTransformation = await getTableData(bucketName, database, "combined");

    expect(combinedRowsAfterPartitionTransformation.length).toBe(4);
    // one row is parquet, the others are gz in the file columns
    const parquetRows = combinedRowsAfterPartitionTransformation.filter(r => r.file.includes('/partitioned-parquet/')).length;
    const gzRows = combinedRowsAfterPartitionTransformation.filter(r => r.file.includes('/partitioned-gz/')).length;

    console.log(`✅ Found ${parquetRows} parquet rows and ${gzRows} gz rows`);
    
    // this will first appear after. the first 15 minutes of the hour
    const currentMinute = now.getUTCMinutes();
    if (currentMinute >= 15) {
      // only three rows are gz, as they are after the horizon of parquet files
      expect(parquetRows).toBe(1);
      expect(gzRows).toBe(3);
    } else {
      expect(parquetRows).toBe(0);
      expect(gzRows).toBe(4);
    }

    console.log('🎉 All tests completed successfully!');
  }, 180000);
});

async function runAthenaQuery(query: string, bucketName: string) {
  const queryResult = await athena.send(new StartQueryExecutionCommand({
    QueryString: query,
    ResultConfiguration: { OutputLocation: `s3://${bucketName}/athena-query-results` }
  }));

  let status: string;
  do {
    await new Promise(resolve => setTimeout(resolve, 2000));
    const execution = await athena.send(new GetQueryExecutionCommand({ QueryExecutionId: queryResult.QueryExecutionId }));
    status = execution.QueryExecution?.Status?.State!;
  } while (status === 'RUNNING' || status === 'QUEUED');

  if (status === 'FAILED') throw new Error('Query failed');
}

async function getTableData(bucketName: string, database: string, tableName: string) {
  const queryResult = await athena.send(new StartQueryExecutionCommand({
    QueryString: `SELECT * FROM ${database}.${tableName}`,
    ResultConfiguration: { OutputLocation: `s3://${bucketName}/athena-query-results` }
  }));

  let status: string;
  do {
    await new Promise(resolve => setTimeout(resolve, 2000));
    const execution = await athena.send(new GetQueryExecutionCommand({ QueryExecutionId: queryResult.QueryExecutionId }));
    status = execution.QueryExecution?.Status?.State!;
  } while (status === 'RUNNING' || status === 'QUEUED');

  if (status === 'FAILED') throw new Error('Query failed');

  const results = await athena.send(new GetQueryResultsCommand({ QueryExecutionId: queryResult.QueryExecutionId! }));
  const rows = results.ResultSet?.Rows?.map(row => row.Data?.map(col => col.VarCharValue)) || [];

  const returnedRows: (Record<string, any>)[] = [];

  if (rows.length > 0) {
    const headers = rows[0];
    if (!headers) return returnedRows;
    const data = rows.slice(1);
    console.log(`📊 Query Results for ${tableName} (${data.length} rows):`);

    data.forEach((row, i) => {
      const rowData = headers.reduce((acc: Record<string, any>, header, j) => {
        if (header) acc[header] = row?.[j];
        return acc;
      }, {});
      console.log(`Row ${i + 1}:`, rowData);
      returnedRows.push(rowData);
    });
  }
  return returnedRows;
}

async function listObjects(bucketName: string) {
  const allObjects = await s3.send(new ListObjectsV2Command({
    Bucket: bucketName
  }));
  console.log(`📋 All bucket objects (${allObjects.Contents?.length || 0}):`);
  allObjects.Contents?.forEach(obj => console.log(`  - ${obj.Key}`));
  return allObjects;
}
