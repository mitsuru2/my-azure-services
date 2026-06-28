import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { name: product, version } = require('../../../package.json');

export async function health(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log(`Http function processed request for url "${request.url}"`);

  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product, version, status: 'healthy' }),
  };
}

app.http('health', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  handler: health,
});
