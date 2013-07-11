var assert = require('assert')
  , path = require('path')
  , request = require('request')
  , portfinder = require('portfinder')
  , Thalassa = require('thalassa')
  , Hapi = require('hapi')
  , Api = require('../lib/Api')
  , Data = require('../lib/Data')
  ;

describe ('Harbor Module', function () {

  describe ('api', function () {
    var localhost = '127.0.0.1'
      , apiPort = null
      , server = null
      , thalassaPort = null
      , thalassaHost = localhost
      , thalassaApiPort = null
      , thalassaApiHost = localhost
      , thalassaServer = null
      , apiRoot = null
      ;

    before (function (done) {

      portfinder.basePort = Math.ceil(Math.random()*2000)+10000;
      portfinder.getPort(function (err, port1) {
        // TODO: guarantee free ports, portfinder wasn't working right but this hack was better for now
        var port2 = port1+1, port3 = port1+2;
        assert.ifError(err);
        thalassaPort = port1;
        thalassaApiPort = port2;

        thalassaServer = new Thalassa.Server( {
          port: thalassaPort,
          host: thalassaHost,
          apiport: thalassaApiPort,
          apihost: thalassaApiHost
        });

        apiPort = port3;
        apiRoot = 'http://' + localhost + ':' + apiPort;
        server = Hapi.createServer(localhost, apiPort);
        server.route( (new Api({ data: new Data() })).routes() );
        server.start(done);
      });
    });

    after (function () {
      thalassaServer.close();
      server.stop();
    });


    it ('should put and get and delete frontend', function (done) {
      var fe = { name: 'foo', bind: '*:80', backend: 'foob' };

      // need to wait until it comes up
      setTimeout(function () {
        request({
          method: 'PUT',
          uri: apiRoot + '/frontends/' + fe.name,
          json: fe
        }, function (error, response, body) {
          assert.ifError(error);
          assert.equal(200, response.statusCode);

          request({
            method: 'GET',
            uri: apiRoot + '/frontends/' + fe.name,
            json: true
          }, function (error, response, body) {
            assert.ifError(error);
            assert.equal(200, response.statusCode);

            assert(body);
            assert.equal(fe.name, body.name);
            assert.equal(fe.bind, body.bind);
            assert.equal(fe.backend, body.backend);

            request({
              method: 'DELETE',
              uri: apiRoot + '/frontends/' + fe.name,
              json: true
            }, function (error, response, body) {
              assert.ifError(error);
              assert.equal(200, response.statusCode);

              request({
                method: 'GET',
                uri: apiRoot + '/frontends/' + fe.name,
                json: true
              }, function (error, response, body) {
                assert.ifError(error);
                assert.equal(404, response.statusCode);
                done();
              });
            });

          });
        });
      }, 50);
    });

    it ('should put and get and delete backendend', function (done) {
      var be = { name: 'foo', role: 'foo', version: '1.0.0', type: 'spindrift' };

      // need to wait until it comes up
      setTimeout(function () {
        request({
          method: 'PUT',
          uri: apiRoot + '/backends/' + be.name,
          json: be
        }, function (error, response, body) {
          assert.ifError(error);
          assert.equal(200, response.statusCode);

          request({
            method: 'GET',
            uri: apiRoot + '/backends/' + be.name,
            json: true
          }, function (error, response, body) {
            assert.ifError(error);
            assert.equal(200, response.statusCode);

            assert(body);
            assert.equal(be.name, body.name);
            assert.equal(be.role, body.role);
            assert.equal(be.version, body.version);
            assert.equal(be.type, body.type);

            request({
              method: 'DELETE',
              uri: apiRoot + '/backends/' + be.name,
              json: true
            }, function (error, response, body) {
              assert.ifError(error);
              assert.equal(200, response.statusCode);

              request({
                method: 'GET',
                uri: apiRoot + '/backends/' + be.name,
                json: true
              }, function (error, response, body) {
                assert.ifError(error);
                assert.equal(404, response.statusCode);
                done();
              });
            });

          });
        });
      }, 50);
    });
  });
});