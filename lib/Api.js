var assert = require('assert')
  , Hapi = require('hapi')
  , extend = require('extend')
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
      config: {
        handler: self.handleGetFrontend()
      }
    },
    {
      method: 'GET',
      path: self.prefix + '/backends/{key}',
      config: {
        handler: self.handleGetBackend()
      }
    },
    {
      method: 'GET',
      path: self.prefix + '/backends/{key}/members',
      config: {
        handler: self.handleGetBackendMembers()
      }
    },
    {
      method: 'GET',
      path: self.prefix + '/frontends',
      config: {
        handler: self.handleGetFrontends()
      }
    },
    {
      method: 'GET',
      path: self.prefix + '/backends',
      config: {
        handler: self.handleGetBackends()
      }
    },
    {
      method: 'PUT',
      path: self.prefix + '/frontends/{key}',
      config: {
        handler: self.handlePutFrontend(),
        payload: 'parse',
        validate: self.validatePutFrontend()
      }
    },
    {
      method: 'PUT',
      path: self.prefix + '/backends/{key}',
      config: {
        handler: self.handlePutBackend(),
        payload: 'parse',
        validate: self.validatePutBackend()
      }
    },
    {
      method: 'DELETE',
      path: self.prefix + '/frontends/{key}',
      config: {
        handler: self.handleDeleteFrontend()
      }
    },
    {
      method: 'DELETE',
      path: self.prefix + '/backends/{key}',
      config: {
        handler: self.handleDeleteBackend()
      }
    },
    {
      method: 'POST',
      path: self.prefix + '/backends/{key}',
      config: {
        handler: self.handlePostBackendSubscription(),
        payload: 'parse',
        validate: self.validatePostBackendSubscription()
      }
    },
    {
      method: 'GET',
      path: self.prefix + '/haproxy/config',
      config: {
        handler: self.handleGetHaproxyConfig()
      }
    }
  ];
};

Api.prototype.handleGetFrontend = function () {
  var self = this;
  return function(request, reply) {
    var key = this.params.key;
    var id = self.data.frontendId(key);
    var row = self.data.frontends.get(id);
    if (!row) return reply('frontend ' + key + ' not found').code(404);

    return reply(row.toJSON());
  };
};

Api.prototype.handleGetBackend = function () {
  var self = this;
  return function(request, reply) {
    var key = this.params.key;
    var id = self.data.backendId(key);
    var row = self.data.backends.get(id);
    if (!row) return reply('backend ' + key + ' not found').code(404);

    return reply(row.toJSON());
  };
};

Api.prototype.handleGetBackendMembers = function () {
  var self = this;
  return function(request, reply) {
    var key = this.params.key;
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
    var key = this.params.key;
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
      _type     : Hapi.types.String().optional(),
      key       : Hapi.types.String(),
      bind      : Hapi.types.String(),
      backend   : Hapi.types.String(),
      mode      : Hapi.types.String().valid(['http', 'tcp']).optional(),
      keepalive : Hapi.types.String().valid(['default','close','server-close']).optional(),
      rules     : Hapi.types.Array().optional(),
      natives   : Hapi.types.Array().optional()
    }
  };
};

Api.prototype.handlePutBackend = function () {
  var self = this;
  return function(request, reply) {
    var key = this.params.key;
    var id = self.data.backendId(key);
    var obj = request.payload;
    obj.key = key;
    if (obj.health && obj.health.httpVersion === 'HTTP/1.1' && !obj.host) {
      return reply(Hapi.error.badRequest('host is required with health check with httpVersion=HTTP/1.1'));
    }

    self.data.setBackend(obj);
    return reply(200);
  };
};

Api.prototype.validatePutBackend = function () {
  return {
    payload: {
      _type  : Hapi.types.String().optional(),
     key     : Hapi.types.String(),
     type    : Hapi.types.String().valid(['dynamic', 'static']),
     name    : Hapi.types.String().optional(),
     version : Hapi.types.String().optional(),
     balance : Hapi.types.String().optional(),
     host    : Hapi.types.String().optional(),
     mode    : Hapi.types.String().valid(['http', 'tcp']).optional(),
     members : Hapi.types.Array().optional(),
     natives : Hapi.types.Array().optional(),
     health  : Hapi.types.Object({
                method: Hapi.types.String().valid(['GET','POST']).optional(),
                uri: Hapi.types.String().optional(),
                httpVersion: Hapi.types.String().valid(['HTTP/1.0', 'HTTP/1.1']).optional(),
                interval: Hapi.types.Number().min(1).optional()
              }).optional()
    }
  };
};

Api.prototype.handleDeleteFrontend = function () {
  var self = this;
  return function(request, reply) {
    var key = this.params.key;
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
    var key = this.params.key;
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
     key     : Hapi.types.String().optional(),
     name    : Hapi.types.String().optional(),
     version : Hapi.types.String()
    }
  };
};

Api.prototype.handleGetHaproxyConfig = function () {
  var self = this;
  return function(request, reply) {
    return reply(self.haproxyManager.latestConfig).type('text/plain');
  };
};
