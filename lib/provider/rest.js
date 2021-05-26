'use strict';

const fetch = require('node-fetch');

const ENDPOINTS = {
	"lockbox": "https://lockbox.api.cloud.yandex.net"
};

module.exports = class REST {
	
	constructor(config) {
		this.token = config.token;
		this.cloudId = config['cloud-id'];
		this.folderId = config['folder-id'];
	}
	
	async restCall(endpoint, request, postdata=null, method = null) {
		if (!method) {
			method = postdata ? "post" : "get";
		}
		const headers = {
			'Authorization': `Bearer ${this.token}`,
			'Content-Type': 'aplication/json'
			};
		const url = `${ENDPOINTS[endpoint]}/${request}`;
		return new Promise((resolve, reject) => {
			let status = 0;
			fetch(url, {
				method,
				headers,
				body: postdata ? JSON.stringify(postdata) : null
			})
			.then(res => {
				status = res.status;
				return res.json();
				})
			.then(json => {
				if (status != 200){
					reject(`Error ${status}(${json.code}): ${json.message}`);
				}
				resolve(json);
				});
		});
	}
	
	async lockboxList(){
		return await this.restCall("lockbox", `lockbox/v1/secrets?folderId=${this.folderId}`);
	}
	
	async lockboxCreate(req) {
		const entries = req.keys.map(key => {
			return {key, textValue:"undefined"};
		});
		const post = {
			folderId: this.folderId,
			name: req.name,
			versionPayloadEntries: entries
		};
		return await this.restCall("lockbox", "lockbox/v1/secrets", post);
	}

	async lockboxAddKeys(secretId, keys) {
		const entries = keys.map(key => {
			return {key, textValue:"undefined"};
		});
		return await this.restCall("lockbox", `lockbox/v1/secrets/${secretId}:addVersion`, {payloadEntries: entries});
	}

};