var assert = require('assert')
  , Haproxy = require('haproxy')
  , Data = require('./lib/Data')
  , HaproxyManager = require('./lib/HaproxyManager')
  , HaproxyStats = require('./lib/HaproxyStats')
  , ThalassaAgent = require('./lib/ThalassaAgent')
  , Api = require('./lib/Api')
  , WebsocketStream = require('./lib/WebsocketStream')
  ;


module.exports = function Aqueduct (opts) {
  if (typeof opts !== 'object') opts = {};
  var noop = function (){};
  var log = this.log = opts.log || noop;

  if (!opts.haproxySocketPath) opts.haproxySocketPath = '/tmp/haproxy.status.sock';

  // opt.persistence - file location or leveldb
  var data = new Data( {
    persistence: opts.persistence,
    log: log
  });

  assert(opts.haproxySocketPath, 'opts.haproxySocketPath required');
  assert(opts.thalassaHost, 'opts.thalassaHost required');
  assert(opts.thalassaPort, 'opts.thalassaPort required');

  var haproxy = new Haproxy(opts.haproxySocketPath, {
    config:  opts.haproxyCfgPath,
    pidFile: opts.haproxyPidPath
  });

  var haproxyManager = new HaproxyManager({
    haproxy: haproxy,
    data: data,
    haproxyCfgPath: opts.haproxyCfgPath,
    templateFile: opts.templateFile,
    log: log
  });

  var haproxyStats = new HaproxyStats({
    haproxy: haproxy,
    data: data,
    log: log
  });

  var thalassaAgent = new ThalassaAgent({
    data: data,
    host: opts.thalassaHost,
    port: opts.thalassaPort,
    log: log
  });

  var api = new Api({
    data: data,
    haproxyManager: haproxyManager,
    log: log
  });

  var websocketStream = new WebsocketStream({
    data: data,
    log: log
  });

  this.data = data;
  this.haproxy = haproxy;
  this.haproxyManager = haproxyManager;
  this.haproxyStats = haproxyStats;
  this.thalassaAgent = thalassaAgent;
  this.apiRoutes = api.routes.bind(api);
  this.createStream = data.createStream.bind(data);
  this.createReadableStream = data.createReadableStream.bind(data);
  this.bindReadableWebsocketStream = websocketStream.bindReadableStream.bind(websocketStream);
  this.bindWritableWebsocketStream = websocketStream.bindWritableStream.bind(websocketStream);
};