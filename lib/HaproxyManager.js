var handlebars = require('handlebars')
  , HAProxy = require('haproxy')
  , fs = require('fs')
  , norm = require('path').normalize
  , util = require('util')
  , assert = require('assert')
  , EventEmitter  = require('events').EventEmitter
  , debounce = require('debounce')
  , deepEqual = require('deep-equal')
  ;

var HAProxyManager = module.exports = function (opts) {
  if (typeof opts !== 'object') opts = {};

  assert(opts.data, 'opts.data required');
  assert(opts.haproxy, 'opts.haproxy required');

  this.config = {};
  this.config.templateFile = norm(opts.templateFile || __dirname + '/../default.haproxycfg.tmpl');
  this.config.haproxyCfgPath = norm(opts.haproxyCfgPath || '/etc/haproxy/haproxy.cfg');
  this.config.watchConfigFile = (opts.watchConfigFile !== undefined) ? opts.watchConfigFile : true;
  this.config.debounceRate = opts.debounceRate || 2000;
  this.log = (typeof opts.log === 'function') ? opts.log : function (){};

  this.latestConfig = "";

  this.template = handlebars.compile(fs.readFileSync(this.config.templateFile, 'utf-8'));
  this.writeConfigDebounced = debounce(this.writeConfig.bind(this), this.config.debounceRate, false);

  this.data = opts.data;
  this.haproxy = opts.haproxy;
  this.data.frontends.on( 'changes', this._changeFrontEnd.bind(this)  );
  this.data.backends.on ( 'changes', this._changeBackEnd.bind(this)   );

  this.writeConfigDebounced();

};

util.inherits(HAProxyManager, EventEmitter);

HAProxyManager.prototype.writeConfig = function() {
  var data = {
    frontends: this.data.frontends.toJSON(),
    backends: this.data.backends.toJSON(),
    haproxySocketPath: this.haproxy.socket
  };

  var previousConfig = this.latestConfig;
  this.latestConfig = this.template(data);

  // only write the config and reload if it actually changed
  if (!deepEqual(previousConfig, this.latestConfig)) {
    fs.writeFileSync(this.config.haproxyCfgPath, this.latestConfig , 'utf-8');
    this.emit('configChanged');
    this.reload();
  }
};

HAProxyManager.prototype.reload = function () {
  var self = this;
  self.haproxy.running(function (err, running) {
    if (running) self.haproxy.reload();
    else self.haproxy.start();
    self.emit('reloaded');
  });
};

HAProxyManager.prototype._changeFrontEnd = function(row, changed) {
  this.log('debug', 'HaproxyManager._changeFrontEnd', changed);
  this.writeConfigDebounced();
};

HAProxyManager.prototype._changeBackEnd = function(row, changed) {
  this.log('debug', 'HaproxyManager_changeBackEnd', changed);
  this.writeConfigDebounced();
};

//
//
//
//
//
//
//
// TODO refactor all these helper, reconsider business logic
//

// tempalte helper for outputing FrontEnd acl rules
handlebars.registerHelper('aclRule', function (rule) {
  var rand = Math.random().toString(36).substring(13);
  var name = rule.type + '_' + rand;

  if (rule.type === 'path' || rule.type === 'url') {
    return util.format("acl %s %s %s\nuse_backend %s if %s\n", name, rule.operation, rule.value, rule.backend, name);
  }
  else if (rule.type === 'header') {
    return util.format("acl %s %s(%s) %s\nuse_backend %s if %s\n", name, rule.operation, rule.header, rule.value, rule.backend, name);
  }
});

handlebars.registerHelper('frontendHelper', function (frontend) {
  var output = [];
  var hasRules = frontend.rules && frontend.rules.length > 0;
  var hasNatives = frontend.natives && frontend.natives.length > 0;

  output.push("bind " + frontend.bind);
  output.push("mode " + frontend.mode);
  output.push("default_backend " + frontend.backend);

  // http only default options
  if (frontend.mode === 'http') {
    output.push("option httplog");

    // The default keep-alive behavior is to use keep-alive if clients and
    // backends support it. However, if haproxy will only process rules when
    // a connection is first established so if any rules are used then server-close
    // should be specified at least and haproxy will let clients use keep-alive
    // to haproxy but close the backend connections each time.
    //
    // If there are any rules, the default behavior is to use http-server-close
    // and http-pretend-keepalive
    if (frontend.keepalive === 'server-close') {
      output.push("option http-server-close");
      output.push("option http-pretend-keepalive");
    }
    else if (frontend.keepalive === 'close'){
      output.push("option forceclose");
    }
    // the default if there are rules is to use server close
    else if (hasRules) {
      output.push("option http-server-close");
      output.push("option http-pretend-keepalive");
    }
  }

  if (hasRules) {
    frontend.rules.forEach(function (rule) {
      var rand = Math.random().toString(36).substring(13);
      var name = rule.type + '_' + rand;

      if (rule.type === 'path' || rule.type === 'url') {
        output.push(util.format("acl %s %s %s\nuse_backend %s if %s",
          name, rule.operation, rule.value, rule.backend, name));
      }
      else if (rule.type === 'header') {
        output.push(util.format("acl %s %s(%s) %s\nuse_backend %s if %s",
          name, rule.operation, rule.header, rule.value, rule.backend, name));
      }
    });
  }

  if (hasNatives) {
    frontend.natives.forEach(function (native) {
      output.push(native);
    });
  }

  return output.join('\n');
});


// helper to output http check and servers block
handlebars.registerHelper('backendHelper', function (backend) {
  var host = backend.host;
  var health = backend.health;
  var members = backend.members;
  var output = [];
  var hasNatives = backend.natives && backend.natives.length > 0;

  // output mode and balance options
  output.push("mode " + backend.mode);
  output.push("balance " + backend.balance);

  // host header propagation
  if (backend.host) {
    output.push("reqirep ^Host:\\ .*  Host:\\ " + backend.host);
  }

  // option httpchk
  if (backend.mode === 'http' && health) {
    var httpVersion = (health.httpVersion === 'HTTP/1.1') ?
                      ('HTTP/1.1\\r\\nHost:\\ ' + backend.host) :
                      health.httpVersion;
    output.push(util.format("option httpchk %s %s %s", health.method, health.uri, httpVersion));
  }

  if (hasNatives) {
    backend.natives.forEach(function (native) {
      output.push(native);
    });
  }

  if (members) {
    // server lines for each member
    members.forEach(function (member) {
      var name = util.format("%s_%s:%s", backend.name, member.host, member.port);
      var interval = (health) ? health.interval : 2000;
      output.push(util.format("server %s %s:%s check inter %s", name, member.host, member.port, interval));
    });
  }

  return output.join('\n');
});