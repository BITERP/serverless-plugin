'use strict';

const yc = require('yandex-cloud');
const REST = require('./rest');
const JWT = require('./jwt');


module.exports = class YandexTestConfig{
    constructor(serverless, options) {
        this.serverless = serverless;
        this.options = options;
        this.provider = this.serverless.getProvider('yandex-cloud');

        this.commands = {
            testConfig: {
                lifecycleEvents: [
                    "run"
                ]
            }
        }

        this.hooks = {
            'testConfig:run': async () => {
                try {
                    await this.printConfig();
                } catch (e) {
                    this.serverless.cli.log('{"error": "Failed to get config: ' + e + '"}');
                }
            },
        };
    }

    async initSession() {
        const opts = this.serverless.service;
        const iamToken = await (new JWT(opts.provider.auth.jwt)).getIamToken();
        const session = new yc.Session({iamToken});
        const config = {
            token: iamToken,
            'cloud-id': opts.provider.auth.cloud,
            'folder-id': opts.provider.auth.folder
        };
        
        this.session = session;
        this.config = config;
        this.rest = new REST(config);
    }

    async printConfig() {
        await this.initSession();
        this.config['gateways'] = await this.rest.apigwList();
        this.config['provider'] = this.serverless.service.provider;
        this.config['listboxes'] = await this.rest.lockboxList();
        this.config['accounts'] = await this.provider.getServiceAccounts();
        this.config['functions'] = await this.provider.getFunctions();

        console.log(JSON.stringify(this.config));
    }
};