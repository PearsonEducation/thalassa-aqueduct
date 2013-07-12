#!/usr/bin/env node
var Aqueuct = require('..')
  , shoe = require('shoe')
  , Hapi = require('hapi')
  , util = require('util')
  ;

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
              thalassaHost: {
                default : '127.0.0.1',
                describe: 'host of the Thalassa server'
              },
              thalassaPort: {
                default : 5001,
                describe: 'port of the Thalassa server'
              },
              haproxySocketPath: {
                default: '/tmp/haproxy.status.sock',
                describe: 'path to Haproxy socket file'
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
                describe: 'leveldb file path to persist data'
              },
              debug: {
                boolean: true,
                describe: 'enabled debug logging'
              },
              showhelp: {
                alias: 'h'
              }
            });

var argv = optimist.argv;
if (argv.h) {
  optimist.showHelp();
  process.exit(0);
}

var log = argv.log = require('../lib/defaultLogger')( (argv.debug == true) ? 'debug' : 'error' );
var aqueduct = new Aqueuct(argv);
var server = Hapi.createServer(argv.host, argv.port);
server.route(aqueduct.apiRoutes());

server.route({
    method: 'GET',
    path: '/{path*}',
    handler: {
        directory: { path: './public', listing: false, index: true }
    }
});

shoe(function (sock) {
  sock.pipe(aqueduct.createStream()).pipe(sock);
}).install(server.listener, '/stream')

server.start(function () {
  log('info', util.format("Thalassa Aqueduct listening on %s:%s", argv.host, argv.port));
});

aqueduct.haproxyManager.on('configChanged', function() { log('debug', 'Config changed') });
aqueduct.haproxyManager.on('reloaded', function() { log('debug', 'Haproxy reloaded') });
aqueduct.data.stats.on('changes', function (it) { log('debug', it.state.id, it.state.status )})
