var assert = require('assert')
  , portfinder = require('portfinder')
  , crdt = require('crdt')
  , Data = require('../lib/Data')
  , ThalassaAgent = require('../lib/ThalassaAgent')
  , Thalassa = require('thalassa')
  ;

describe ('ThalassaAgent', function () {

  describe ('existing backend', function (done) {
    var port, server, client, host = '127.0.0.1', backendName = 'be1',
        name = 'foo1', version = '1.1.1', clientPort = '80';

    before(function (done) {
      portfinder.getPort(function (err, aPort) {
        assert.ifError(err);
        port = aPort;
        apiport = port + 1000;  // TODO ensure unique

        server = new Thalassa.Server({ host: host, port: port, apiport: apiport, reaperFreq: 100 });
        client = new Thalassa.Client({ host: host, port: port, apiport: apiport });
        client.register(name, version, clientPort, { secondsToExpire: 2 });
        client.subscribe(name, version);
        done();
      });

    });

    after(function () {
      server.close();
      client.stop();
    });

    it ('should register/free add/remove members', function (done) {
      this.timeout(5000);
      var data = new Data();
      var agent = new ThalassaAgent({ data: data, host: host, port: port, apiport: apiport });
      data.setBackend({ key: backendName, type: 'dynamic', name: name, version: version });


      // there's a race condition between calling the HTTP API for members and getting updates
      // the socket if the registration slips in between the time the getRegistration request is 
      // still being processed. 
      setTimeout(function() {
        client.start();
        setTimeout(function() {
          var backend = data.backends.get(data.backendId(backendName));
          assert(backend);
          var members = backend.toJSON().members;
          assert.equal(members.length, 1);
          assert.equal(members[0].name, name);
          assert.equal(members[0].version, version);

          client.unregister(name, version, clientPort);
          setTimeout(function() {
            var backend = data.backends.get(data.backendId(backendName));
            assert(backend);
            var members = backend.toJSON().members;
            assert.equal(members.length, 0);
            done();
          }, 300);

        }, 300);

      }, 100);
    });
  });

  describe ('existing service registraions', function (done) {
    var port, server, client, agent, data,
        host = '127.0.0.1', backendName = 'be1',
        name = 'foo2', version = '1.1.2', clientPort = '80';

    before(function (done) {
      data = new Data();

      portfinder.getPort(function (err, aPort) {
        assert.ifError(err);
        port = aPort;
        apiport = port + 1000;  // TODO ensure unique

        server = new Thalassa.Server({ host: host, port: port, apiport: apiport, reaperFreq: 100 });
        agent = new ThalassaAgent({ data: data, host: host, port: port, apiport: apiport });
        client = new Thalassa.Client({ host: host, port: port, apiport: apiport, updateFreq: 100 });
        client.register(name, version, clientPort, { secondsToExpire: 1 });
        client.start();
        setTimeout(done, 500);
      });
    });

    after(function () {
      server.close();
    });

    it ('should add/remove members on backend creation', function (done) {

      data.setBackend({ key: backendName, type: 'dynamic', name: name, version: version });

      setTimeout(function() {
        var backend = data.backends.get(data.backendId(backendName));
        assert(backend);
        var members = backend.toJSON().members;
        assert.equal(members.length, 1);
        assert.equal(members[0].name, name);
        assert.equal(members[0].version, version);
        client.unregister(name, version, clientPort);

        setTimeout(function() {
          var backend = data.backends.get(data.backendId(backendName));
          assert(backend);
          var members = backend.toJSON().members;
          assert.equal(members.length, 0);
          done();
        }, 1500);
      }, 50);
    });
  });

});