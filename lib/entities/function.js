'use strict';

module.exports = class Function {
    constructor(serverless, deploy, initial) {
        this.serverless = serverless;
        this.deploy = deploy;
        this.initialState = initial;
        this.newState = null;
        this.id = initial ? initial.id : undefined;
    }

    setNewState(newState) {
        this.newState = newState;
    }

    validateEnvironment(environment) {
        let result = true;
        if (!environment) {
            return result;
        }
        for (const [k, v] of Object.entries(environment)) {
            if (!RegExp('^[a-zA-Z][a-zA-Z0-9_]*$').test(k)) {
                this.serverless.cli.log(`Environment variable "${k}" name does not match with "[a-zA-Z][a-zA-Z0-9_]*"`);
                result = false;
            }
            if (typeof v !== 'string') {
                this.serverless.cli.log(`Environment variable "${k}" value is not string`);
                result = false;
                continue;
            }
            if (v.length > 4096) {
                this.serverless.cli.log(`Environment variable "${k}" value is too long`);
                result = false;
            }
        }
        return result;
    }
	
	buildEnv(params) {
		if (!('memory' in params)) {
			params.memory = this.serverless.service.provider.memorySize;
		}
		if (!('timeout' in params)) {
			params.timeout = this.serverless.service.provider.timeout;
		}
        if (params.serviceAccount == null) {
            params.serviceAccount = this.deploy.getServiceAccountId(this.serverless.service.provider.account);
        }
		if (!('environment' in this.serverless.service.provider)) {
			return;
		}
		if (!('environment' in params)) {
			params.environment = {};
		}
		params.environment = {...this.serverless.service.provider.environment, ...params.environment};
		for (const [name, val] of Object.entries(params.environment)) {
			params.environment[name] = val.toString().replace(/\$\{(.*)\}/, (match, path) => {
				return path.split('.').reduce((acc, val) => acc[val], this.serverless.service);				
			});
		}
        params.environment['func_name'] = this.newState.name;
	}

    async sync() {

        const provider = this.serverless.getProvider('yandex-cloud');
        if (!this.newState) {
            this.serverless.cli.log(`Unknown function "${this.initialState.name}" found`);
            return;
        }

		this.serverless.cli.log(`Sync function ${this.newState.name}`);
 
		const artifact = this.newState.params.package.artifact;
		
        const requestParams = {
            runtime: this.serverless.service.provider.runtime,
            code: artifact,
            id: this.initialState ? this.initialState.id : null,
            serviceAccount: this.deploy.getServiceAccountId(this.newState.params.account),
            ...this.newState.params,
        };
		
		this.buildEnv(requestParams);

        if (!this.validateEnvironment(requestParams.environment)) {
            return;
        }		
		
		if (this.deploy.options['skip-funcs']) {
			return ;
		}

        let provisionedInstances = 0;
        if ('provisionedInstances' in this.serverless.service.provider){
            provisionedInstances = this.serverless.service.provider.provisionedInstances;
        }
        if ('provisionedInstances' in requestParams) {
            provisionedInstances = requestParams.provisionedInstances;
            delete requestParams.provisionedInstances;
        }

		
        if (this.initialState) {
            try {
                await provider.getRest().removeScalingPolicy(this.initialState.id);
                const response = await provider.updateFunction(requestParams);
                this.lastTag = response.getResponse().id;
                this.serverless.cli.log(`Function updated ${this.newState.name}: ${requestParams.name} ${this.lastTag}`);
            } catch (e) {
				console.error(e);
                this.serverless.cli.log(`${e} Failed to update function ${this.newState.name}: ${requestParams.name}`);
            }
        }else{
            try {
                const response = await provider.createFunction(requestParams);
                this.id = requestParams.id;
                this.lastTag = response.getResponse().id;
                this.serverless.cli.log(`Function created ${this.newState.name}: ${requestParams.name} ${this.lastTag}`);
            } catch (e) {
                this.serverless.cli.log(`${e} Failed to create function "${this.newState.name}"`);
            }
        }

        if (provisionedInstances > 0) {
            try {
                await provider.getRest().setScalingPolicy(this.id, provisionedInstances);
                this.serverless.cli.log(`Set provisioned instances ${this.newState.name}: ${provisionedInstances}`);
            }catch(e){
                this.serverless.cli.log(`${e} Failed to setScalingPolicy for "${this.newState.name}"`);
            }
        }
    }
};
