import { app, HttpHandler, HttpRequest, HttpResponse, InvocationContext } from '@azure/functions';
import * as df from 'durable-functions';
import { ActivityHandler, OrchestrationContext, OrchestrationHandler } from 'durable-functions';

const activityName = 'recordStockPriceHistory';

const recordStockPriceHistoryOrchestrator: OrchestrationHandler = function* (
  context: OrchestrationContext
) {
  const outputs = [];
  outputs.push(yield context.df.callActivity(activityName, 'Tokyo'));
  outputs.push(yield context.df.callActivity(activityName, 'Seattle'));
  outputs.push(yield context.df.callActivity(activityName, 'Cairo'));

  return outputs;
};
df.app.orchestration('record-stock-price-history', recordStockPriceHistoryOrchestrator);

const recordStockPriceHistory: ActivityHandler = (input: string): string => {
  return `Hello, ${input}`;
};
df.app.activity(activityName, { handler: recordStockPriceHistory });

const recordStockPriceHistoryHttpStart: HttpHandler = async (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponse> => {
  const client = df.getClient(context);
  const body: unknown = await request.text();
  const instanceId: string = await client.startNew(request.params.orchestratorName, {
    input: body,
  });

  context.log(`Started orchestration with ID = '${instanceId}'.`);

  return client.createCheckStatusResponse(request, instanceId);
};

app.http('recordStockPriceHistoryHttpStart', {
  route: 'orchestrators/{orchestratorName}',
  extraInputs: [df.input.durableClient()],
  handler: recordStockPriceHistoryHttpStart,
});
