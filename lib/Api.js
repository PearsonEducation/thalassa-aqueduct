var assert = require('assert');

var Api = module.exports = function (opts) {
  if (typeof opts !== 'object') opts = {};

  assert(opts.data, 'opts.data required');
  this.data = opts.data;
  this.prefix = opts.prefix || '';

};

Api.prototype.routes = function() {
  var self = this;

  return [
    {
      method: 'GET',
      path: self.prefix + '/frontends/{name}',
      config: {
        handler: self.handleGetFrontend()
      }
    },
    {
      method: 'GET',
      path: self.prefix + '/backends/{name}',
      config: {
        handler: self.handleGetBackend()
      }
    },
    {
      method: 'PUT',
      path: self.prefix + '/frontends/{name}',
      config: {
        handler: self.handlePutFrontend(),
        payload: 'parse',
      }
    },
    {
      method: 'PUT',
      path: self.prefix + '/backends/{name}',
      config: {
        handler: self.handlePutBackend(),
        payload: 'parse'
      }
    },
    {
      method: 'DELETE',
      path: self.prefix + '/frontends/{name}',
      config: {
        handler: self.handleDeleteFrontend()
      }
    },
    {
      method: 'DELETE',
      path: self.prefix + '/backends/{name}',
      config: {
        handler: self.handleDeleteBackend()
      }
    }
  ];
};

Api.prototype.handleGetFrontend = function () {
  var self = this;
  return function(request, reply) {
    var name = this.params.name;
    var id = self.data.frontendId(name);
    var row = self.data.frontends.get(id);
    if (!row) return reply('frontend ' + name + ' not found').code(404);

    return reply(row.toJSON());
  };
};

Api.prototype.handleGetBackend = function () {
  var self = this;
  return function(request, reply) {
    var name = this.params.name;
    var id = self.data.backendId(name);
    var row = self.data.backends.get(id);
    if (!row) return reply('backend ' + name + ' not found').code(404);

    return reply(row.toJSON());
  };
};

Api.prototype.handlePutFrontend = function () {
  var self = this;
  return function(request, reply) {
    var name = this.params.name;
    var id = self.data.frontendId(name);
    var obj = request.payload;
    obj.name = name;
    self.data.setFrontend(obj);
    return reply(200);
  };
};

Api.prototype.handlePutBackend = function () {
  var self = this;
  return function(request, reply) {
    var name = this.params.name;
    var id = self.data.backendId(name);
    var obj = request.payload;
    obj.name = name;
    self.data.setBackend(obj);
    return reply(200);
  };
};

Api.prototype.handleDeleteFrontend = function () {
  var self = this;
  return function(request, reply) {
    var name = this.params.name;
    var id = self.data.frontendId(name);
    var row = self.data.frontends.get(id);
    if (!row) return reply('frontend ' + name + ' not found').code(404);
    self.data.frontends.rm(id);
    return reply(200);
  };
};

Api.prototype.handleDeleteBackend = function () {
  var self = this;
  return function(request, reply) {
    var name = this.params.name;
    var id = self.data.backendId(name);
    var row = self.data.backends.get(id);
    if (!row) return reply('backend ' + name + ' not found').code(404);
    self.data.backends.rm(id);
    return reply(200);
  };
};
