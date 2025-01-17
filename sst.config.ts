/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
    app(input) {
        return {
            name: 'sst-proxy',
            removal: 'remove',
            protect: ['production'].includes(input?.stage),
            home: 'aws',
            providers: {
                aws: {
                    region: 'eu-north-1',
                },
                cloudflare: true,
            },
        };
    },
    async run() {
        const hono = new sst.aws.Function('Hono', {
            architecture: 'arm64',
            runtime: 'nodejs22.x',
            handler: 'src/main.handler',
            memory: '256 MB',
            url: true,
            streaming: true,
            logging: {
                retention: '1 day',
            },
        });

        const domainNames: Record<string, string> = {
            $default: `proxy.${$app.stage}.dev.nodge.me`,
            production: 'proxy.nodge.me',
        };

        const domainName = domainNames[$app.stage] || domainNames.$default;
        const dns = sst.cloudflare.dns();

        new sst.aws.Router('MainRouter', {
            domain: {
                name: domainName,
                dns,
            },
            routes: {
                '/*': hono.url,
            },
        });
    },
});
