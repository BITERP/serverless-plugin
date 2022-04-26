'use strict';

const fs = require('fs');

const YC_INT = "x-yc-apigateway-integration";
const YC_AUTH = "x-yc-apigateway-authorizer";

module.exports = class ApiGW {
	
	constructor(serverless, deploy) {
		this.serverless = serverless;
		this.deploy = deploy;
		this.newState = null;
	}
	
	setNewState(newState) {
        this.newState = newState;
    }
	
	getFunctionInfo(funcName) {
		for(const func of Object.values(this.deploy.functionRegistry)){
			let name = ( func.newState ? func.newState.name : func.initialState.name )
			if (name == funcName){
				return {function_id: func.id, tag:func.lastTag ? func.lastTag : '$latest'};
			}
		}
		throw `Function not found for openapi: ${funcName}`;
	}
	
	replaceConfig(cfg, withSA=false) {
		if (!('service_account' in cfg)) {
			cfg.service_account_id = this.deploy.getServiceAccountId(this.serverless.service.provider.account);
		} else {
			const accname = this.serverless.service.provider[cfg['service_account']];
			cfg.service_account_id = this.deploy.getServiceAccountId(accname);
			delete cfg.service_account;
		}
		if ('function' in cfg) {
			Object.assign(cfg, this.getFunctionInfo(cfg['function']))
			delete cfg['function'];
		}
		if ('context' in cfg && 'call' in cfg.context) {
			Object.assign(cfg.context.call, this.getFunctionInfo(cfg.context.call['function']))
		}
		if ('log_stream' in cfg) {
			cfg.stream_name = this.serverless.service.provider[cfg['log_stream']];
			delete cfg['log_stream'];
		}
	}

	async sync() {
		const provider = this.serverless.getProvider('yandex-cloud');
		this.serverless.cli.log(`Sync api-gateway ${this.newState.name}`);
		
		const openapi = this.newState.params.openapi;
		
		openapi.servers[0].url = `https://${this.newState.params.id}.apigw.yandexcloud.net`;
		
		for(const [name, obj] of Object.entries(openapi.paths)) {
			for (const [meth, path] of Object.entries(obj)){
				if (!(YC_INT in path)) {
					continue;
				}
				const cfg = path[YC_INT];
				if (cfg['type']!='cloud_functions' && cfg['type'] != 'cloud_datastreams') {
					continue;
				}
				this.replaceConfig(cfg);
			}
		}
		if ('components' in openapi && 'securitySchemes' in openapi.components) {
			for (const [name, scheme] of Object.entries(openapi.components.securitySchemes)) {
				if (!(YC_AUTH in scheme)) {
					continue;
				}
				const cfg = scheme[YC_AUTH];
				this.replaceConfig(cfg);
			}
		}
		
		await provider.getRest().apigwUpdate(this.newState.params.id, openapi);

	}
	
};
