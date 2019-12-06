"use strict";

const _ = require('lodash');
const sa = require('superagent');

const parse = res => JSON.parse(res.text);
const nonce = () => _.random(Math.pow(10, 6));

const API = {
  V1: process.env.NODE_ENV !== 'development' ? 'https://api.openagenda.com/v1' : 'https://dapi.openagenda.com/frontend_dev.php/v1',
  V2: process.env.NODE_ENV !== 'development' ? 'https://api.openagenda.com/v2' : 'https://dapi.openagenda.com/v2'
};

if (process.env.NODE_ENV === 'development') {
  process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;
}

module.exports = async keys => {
  let accessToken;

  return {
    v1: agent.bind(null, API.V1),
    v2: agent.bind(null, API.V2)
  }

  async function agent(base, method, res, { data, log, batched }) {
    return sa[method](base + res)
      .type('form')
      .accept('json')
      .field(Object.assign({
        access_token: await _getAccessToken(),
        nonce: nonce(),
        batched: batched || false
      }, data ? {
        data: JSON.stringify(data)
      } : {})).then((res) => res);
  }

  async function _getAccessToken() {
    if (accessToken) return accessToken;

    try {
      const result = await sa.post(`${API.V1}/requestAccessToken`)
        .type('form')
        .accept('json')
        .send({
          'grant-type': 'authorization_code',
          code: keys.secret
        }).then(parse);

      accessToken = result.access_token;

      setTimeout(() => {
        accessToken = null;
      }, parseInt(result.expires_in) * 1000);

    } catch (e) {
      console.log('could not get access token', e);
      throw e;
    }

    return accessToken;
  }
}
