var assert = require('assert')
  , resolve = require('path').resolve
  , Haproxy = require('haproxy')
  , Data = require('./lib/Data')
  , HaproxyManager = require('./lib/HaproxyManager')
  , HaproxyStats = require('./lib/HaproxyStats')
  , ThalassaAgent = require('./lib/ThalassaAgent')
  , Api = require('./lib/Api')
  , WebsocketStream = require('./lib/WebsocketStream')
  , pkg = require('./package.json')
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
  assert(opts.thalassaApiPort, 'opts.thalassaPort required');

  var haproxy = new Haproxy(opts.haproxySocketPath, {
    config:  resolve(opts.haproxyCfgPath),
    pidFile: resolve(opts.haproxyPidPath),
    prefix: (opts.sudo) ? 'sudo' : undefined
  });

  var haproxyManager = new HaproxyManager({
    haproxy: haproxy,
    data: data,
    haproxyCfgPath: opts.haproxyCfgPath,
    templateFile: opts.templateFile,
    sudo: opts.sudo,
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
    apiport: opts.thalassaApiPort,
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

  //
  // register with Thalassa and pass label meta data if it's been specified.
  //
  thalassaAgent.client.register(pkg.name, pkg.version, opts.port, { label: opts.label });
  // TODO make client.register return the registration instead of this hack that blows encapsulation
  var me = thalassaAgent.client.intents[0];


  //
  // Wire up stats to write to data and to the websocket streams
  //
  haproxyStats.on('stat', function (statObj) {
    websocketStream.writeStat(statObj);

    if (statObj.type === 'frontend') {
      data.setFrontendStat(statObj);
    }
    else if (statObj.type === 'backend') {
      data.setBackendStat(statObj);
    }
    else if (statObj.type === 'backendMember') {
      data.setBackendMemberStat(statObj);
    }
  });

//
  // Wire up haproxy changes to write to activity stream
  //
  haproxyManager.on('configChanged', function (statObj) {
    var activityObj = { type: 'activity',  time: Date.now(), verb: 'haproxyConfigChanged', object: me.id };
    log('debug', 'activity', activityObj);
    websocketStream.writeActivity(activityObj);
  });

  haproxyManager.on('reloaded', function (statObj) {
    var activityObj = { type: 'activity',  time: Date.now(), verb: 'haproxyRestarted', object: me.id };
    log('debug', 'activity', activityObj);
    websocketStream.writeActivity(activityObj);
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