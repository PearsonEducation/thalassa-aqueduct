var assert = require('assert')
  , Hapi = require('hapi')
  , extend = require('extend')
  , Joi = require('joi')
  , Boom = require('boom')
  ;

var Api = module.exports = function Api (opts) {
  if (typeof opts !== 'object') opts = {};

  assert(opts.data, 'opts.data required');
  assert(opts.haproxyManager, 'opts.haproxyManager required');
  this.data = opts.data;
  this.haproxyManager = opts.haproxyManager;
  this.prefix = opts.prefix || '';

};

Api.prototype.routes = function() {
  var self = this;

  return [
    {
      method: 'GET',
      path: self.prefix + '/frontends/{key}',
      handler: self.handleGetFrontend()
    },
    {
      method: 'GET',
      path: self.prefix + '/backends/{key}',
      handler: self.handleGetBackend()
    },
    {
      method: 'GET',
      path: self.prefix + '/backends/{key}/members',
      handler: self.handleGetBackendMembers()
    },
    {
      method: 'GET',
      path: self.prefix + '/frontends',
      handler: self.handleGetFrontends()
    },
    {
      method: 'GET',
      path: self.prefix + '/backends',
      handler: self.handleGetBackends()
    },
    {
      method: 'PUT',
      path: self.prefix + '/frontends/{key}',
      handler: self.handlePutFrontend(),
      config: {
        validate: self.validatePutFrontend()
      }
    },
    {
      method: 'PUT',
      path: self.prefix + '/backends/{key}',
      handler: self.handlePutBackend(),
      config: {
        validate: self.validatePutBackend()
      }
    },
    {
      method: 'DELETE',
      path: self.prefix + '/frontends/{key}',
      handler: self.handleDeleteFrontend()
    },
    {
      method: 'DELETE',
      path: self.prefix + '/backends/{key}',
      handler: self.handleDeleteBackend()
    },
    {
      method: 'POST',
      path: self.prefix + '/backends/{key}',
      handler: self.handlePostBackendSubscription(),
      config: {
        validate: self.validatePostBackendSubscription()
      }
    },
    {
      method: 'GET',
      path: self.prefix + '/haproxy/config',
      handler: self.handleGetHaproxyConfig()
    }
  ];
};

Api.prototype.handleGetFrontend = function () {
  var self = this;
  return function(request, reply) {
    var key = request.params.key;
    var id = self.data.frontendId(key);
    var row = self.data.frontends.get(id);
    if (!row) return reply('frontend ' + key + ' not found').code(404);

    return reply(row.toJSON());
  };
};

Api.prototype.handleGetBackend = function () {
  var self = this;
  return function(request, reply) {
    var key = request.params.key;
    var id = self.data.backendId(key);
    var row = self.data.backends.get(id);
    if (!row) return reply('backend ' + key + ' not found').code(404);

    return reply(row.toJSON());
  };
};

Api.prototype.handleGetBackendMembers = function () {
  var self = this;
  return function(request, reply) {
    var key = request.params.key;
    var id = self.data.backendId(key);
    var row = self.data.backends.get(id);
    if (!row) return reply('backend ' + key + ' not found').code(404);

    return reply(row.toJSON().members);
  };
};

Api.prototype.handleGetFrontends = function () {
  var self = this;
  return function(request, reply) {
    return reply(self.data.frontends.toJSON());
  };
};

Api.prototype.handleGetBackends = function () {
  var self = this;
  return function(request, reply) {
    return reply(self.data.backends.toJSON());
  };
};

Api.prototype.handlePutFrontend = function () {
  var self = this;
  return function(request, reply) {
    var key = request.params.key;
    var id = self.data.frontendId(key);
    var obj = request.payload;
    obj.key = key;
    self.data.setFrontend(obj);
    return reply(200);
  };
};

Api.prototype.validatePutFrontend = function () {
  return {
    payload: {
      _type     : Joi.string(),
      key       : Joi.string().required(),
      bind      : Joi.string().required(),
      backend   : Joi.string().required(),
      mode      : Joi.string().valid(['http', 'tcp']),
      keepalive : Joi.string().valid(['default','close','server-close']),
      rules     : Joi.array(),
      natives   : Joi.array()
    }
  };
};

Api.prototype.handlePutBackend = function () {
  var self = this;
  return function(request, reply) {
    var key = request.params.key;
    var id = self.data.backendId(key);
    var obj = request.payload;
    obj.key = key;
    if (obj.health && obj.health.httpVersion === 'HTTP/1.1' && !obj.host) {
      return reply(Boom.badRequest('host is required with health check with httpVersion=HTTP/1.1'));
    }

    self.data.setBackend(obj);
    return reply(200);
  };
};

Api.prototype.validatePutBackend = function () {
  return {
    payload: {
      _type  : Joi.string(),
     key     : Joi.string().required(),
     type    : Joi.string().valid(['dynamic', 'static']).required(),
     name    : Joi.string(),
     version : Joi.string(),
     balance : Joi.string(),
     host    : Joi.string(),
     mode    : Joi.string().valid(['http', 'tcp']),
     members : Joi.array(),
     natives : Joi.array(),
     health  : Joi.object().keys({
                method: Joi.string().valid(['GET','POST']),
                uri: Joi.string(),
                httpVersion: Joi.string().valid(['HTTP/1.0', 'HTTP/1.1']),
                interval: Joi.number().min(1)
              })
    }
  };
};

Api.prototype.handleDeleteFrontend = function () {
  var self = this;
  return function(request, reply) {
    var key = request.params.key;
    var id = self.data.frontendId(key);
    var row = self.data.frontends.get(id);
    if (!row) return reply('frontend ' + key + ' not found').code(404);
    self.data.frontends.rm(id);
    return reply(200);
  };
};

Api.prototype.handleDeleteBackend = function () {
  var self = this;
  return function(request, reply) {
    var key = request.params.key;
    var id = self.data.backendId(key);
    var row = self.data.backends.get(id);
    if (!row) return reply('backend ' + key + ' not found').code(404);
    self.data.backends.rm(id);
    return reply(200);
  };
};

Api.prototype.handlePostBackendSubscription = function () {
  var self = this;
  return function(request, reply) {
    var key = this.params.key;
    var id = self.data.backendId(key);
    var row = self.data.backends.get(id);
    if (!row) return reply('backend ' + key + ' not found').code(404);

    var backend = extend(true, {}, row.toJSON());
    var obj = request.payload;
    backend.version = obj.version;
    if (obj.name) backend.name = obj.name;

    self.data.setBackend(backend);
    return reply(200);
  };
};

Api.prototype.validatePostBackendSubscription = function () {
  return {
    payload: {
     key     : Joi.string(),
     name    : Joi.string(),
     version : Joi.string().required()
    }
  };
};

Api.prototype.handleGetHaproxyConfig = function () {
  var self = this;
  return function(request, reply) {
    return reply(self.haproxyManager.latestConfig).type('text/plain');
  };
};
