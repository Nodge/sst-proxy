import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import { handle, streamHandle, LambdaEvent } from 'hono/aws-lambda';
import type { StatusCode } from 'hono/utils/http-status';

type Bindings = {
    event: LambdaEvent;
};

const app = new Hono<{ Bindings: Bindings }>();

app.all('*', async c => {
    const path = c.req.path;
    const [, hostname, ...pathParts] = path.split('/');

    if (!hostname || !isValidHostname(hostname)) {
        return c.text('Bad Request', 400);
    }

    const headers = filterAwsHeaders(c.req.header());
    headers.host = hostname;

    const url = new URL(c.req.url.toString());
    url.hostname = hostname;
    url.pathname = '/' + pathParts.join('/');

    const proxyReq = new Request(url, {
        method: c.req.method,
        headers,
        body: await c.req.arrayBuffer(),
        keepalive: true,
    });

    const res = await fetch(proxyReq);
    const body = res.body;
    if (!body) {
        throw new Error(`Empty response from ${url} | Status: ${res.status}`);
    }

    c.status(res.status as StatusCode);

    for (const [name, value] of Object.entries(res.headers)) {
        c.header(name, value.toString());
    }

    return stream(c, async stream => {
        await stream.pipe(body);
    });
});

export const handler = process.env.SST_LIVE ? handle(app) : streamHandle(app);

const blacklistHeaders = ['x-amz-', 'x-amzn-', 'cloudfront-', 'x-forwarded-', 'via'];

function filterAwsHeaders(headers: Record<string, string>) {
    return Object.fromEntries(
        Object.entries(headers).filter(([key]) => {
            for (const prefix of blacklistHeaders) {
                if (key.startsWith(prefix)) return false;
            }
            return true;
        })
    );
}

function isValidHostname(hostname: string) {
    return /^([a-zA-Z0-9-_]+\.)+[a-zA-Z]{2,}$/.test(hostname);
}
