var assert = require('assert')
  , fs = require('fs')
  , Data = require('../lib/Data')
  , HaproxyManager = require('../lib/HaproxyManager')
  //, HAProxy = require('haproxy')
  ;

describe ('HaproxyManager', function () {
  var noop = function(){};

  function MockHaproxy(socketPath, ops) {
    this.socket = socketPath;
    this.running = function (cb) {
      cb(null, true);
    };
    this.reload = noop;
    this.start = noop;
  }

  it ('should initialize HaproxyManager', function (done) {
    var seed = Math.ceil(Math.random()*100000);
    var configPath = '/tmp/haproxy-'+seed+'.cfg';
    var socketPath = '/tmp/haproxy-'+seed+'.sock';
    var pidPath = '/tmp/haproxy-'+seed+'.pid';

    after (function () {
      fs.unlink(configPath, noop);
      fs.unlink(socketPath, noop);
      fs.unlink(pidPath, noop);
    });

    var data = new Data();
    var haproxy = new MockHaproxy(socketPath, { config: configPath, pidFile: pidPath});
    var haproxyManager = new HaproxyManager({ haproxy: haproxy, data: data, haproxyCfgPath: configPath, log: console.log });
    assert(haproxy.socket, socketPath);
    done();
  });
});