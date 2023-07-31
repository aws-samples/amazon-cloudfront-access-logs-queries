// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
import { AthenaClient, GetQueryExecutionCommand, StartQueryExecutionCommand } from '@aws-sdk/client-athena';
const athena = new AthenaClient();

// s3 URL of the query results (without trailing slash)
const athenaQueryResultsLocation = process.env.ATHENA_QUERY_RESULTS_LOCATION;

async function waitForQueryExecution(queryExecutionId) {
  while (true) {
    const data = await athena.send(new GetQueryExecutionCommand({
      QueryExecutionId: queryExecutionId
    }));
    const state = data.QueryExecution.Status.State;
    if (state === 'SUCCEEDED') {
      return;
    } else if (state === 'FAILED' || state === 'CANCELLED') {
      throw Error(`Query ${queryExecutionId} failed: ${data.QueryExecution.Status.StateChangeReason}`);
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}


export function runQuery(query) {
  const params = {
    QueryString: query,
    ResultConfiguration: {
      OutputLocation: athenaQueryResultsLocation
    }
  };
  return athena.send(new StartQueryExecutionCommand(params))
    .then(data => waitForQueryExecution(data.QueryExecutionId));
}
