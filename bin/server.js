#!/usr/bin/env node
var Aqueduct = require('..')
  , Hapi = require('hapi')
  , shoe = require('shoe')
  , util = require('util')
  ;

// require('nodetime').profile({
//     accountKey: '1765a180c09b73ea0a7d7262ff6dc60d776bf395', 
//     appName: 'Aqueuct'
//   });

var optimist = require('optimist')
            .options({
              host: {
                default : '0.0.0.0',
                describe: 'host to bind to'
              },
              port: {
                default : 10000,
                describe: 'port to bind to'
              },
              label: {
                describe: 'logical label for this aqueduct'
              },
              thalassaHost: {
                default : '127.0.0.1',
                describe: 'host of the Thalassa server'
              },
              thalassaPort: {
                default : 5001,
                describe: 'socket port of the Thalassa server'
              },
              thalassaApiPort: {
                default : 9000,
                describe: 'http API port of the Thalassa server'
              },
              haproxySocketPath: {
                default: '/tmp/haproxy.status.sock',
                describe: 'path to Haproxy socket file'
              },
              haproxyPidPath: {
                default: '/var/run/haproxy.pid',
                describe: 'path to  Haproxy pid file'
              },
              haproxyCfgPath: {
                default: '/etc/haproxy/haproxy.cfg',
                describe: 'generated Haproxy config location'
              },
              templateFile: {
                default: __dirname + '/../default.haproxycfg.tmpl',
                describe: 'template used to generate Haproxy config'
              },
              persistence: {
                describe: 'directory to save configuration'
              },
              dbPath: {
                default : __dirname + '/db',
                describe: 'filesystem path for leveldb'
              },
              sudo: {
                describe: 'use sudo when starting haproxy'
              },
              debug: {
                boolean: true,
                describe: 'enabled debug logging'
              },
              help: {
                alias: 'h'
              }
            });

var argv = optimist.argv;
if (argv.h) {
  optimist.showHelp();
  process.exit(0);
}

var log = argv.log = require('../lib/defaultLogger')( (argv.debug == true) ? 'debug' : 'error' );
var aqueduct = new Aqueduct(argv);
var server = new Hapi.Server({
	port: argv.port,
	host: argv.host
});
server.route(aqueduct.apiRoutes());

// anything at the top level goes to index.html
server.route({ method: 'GET', path: '/{p}', handler: { file: { path: __dirname+'/../public/index.html' }}});

server.route({
    method: 'GET',
    path: '/{path*}',
    handler: {
        directory: { path: __dirname + '/../public', listing: false, index: true }
    }
});

//Setup websocket to the client/browser
var sock = shoe();
sock.install(server.listener, '/aqueductStreams');
sock.on('connection', function (stream) {
  var s = aqueduct.createMuxStream();
  stream.pipe(s).pipe(stream);

  stream.on('end', function () {
    s.destroy();
  })

});

sock.on('log', function (severity, msg) {
  log(severity, msg);
})

server.start(function () {
  log('info', util.format("Thalassa Aqueduct listening on %s:%s", argv.host, argv.port));
});

aqueduct.haproxyManager.on('configChanged', function() { log('debug', 'Config changed') });
aqueduct.haproxyManager.on('reloaded', function() { log('debug', 'Haproxy reloaded') });
aqueduct.data.stats.on('changes', function (it) { log('debug', it.state.id, it.state.status )})

// var memwatch = require('memwatch');
// memwatch.on('leak', function(info) { log('debug', 'leak', info); });
// memwatch.on('stats', function(stats) { log('debug', 'stats', stats); });
// var hd = new memwatch.HeapDiff();

// setInterval(function () {
//   log('debug', 'diff', hd.end().after.size);
//   hd = new memwatch.HeapDiff();
// }, 10000);

