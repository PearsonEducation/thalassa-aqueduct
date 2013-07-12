var crdt = require('crdt')
  , assert = require('assert')
  , deepEqual = require('deep-equal')
  , diff = require('changeset')
  ;

var Data = module.exports = function Data (opts) {
  if (!opts) opts = {};

  this.doc = new crdt.Doc();

  if (opts.persistence) {
    this._bootstrapLevelDB(opts.persistence);
  }

  this.frontends          = this.doc.createSet('_type', 'frontend');
  this.backends           = this.doc.createSet('_type', 'backend');

  // Stats are kept separate from the frontends and backends because
  // change events on those trigger possible reloading of Haproxy
  // and we don't want to reload Haproxy every time we retreive stats :)
  // IDEA: reconsider separate stats storage and conditionally reload haproxy
  this.stats      = this.doc.createSet('_type', 'stat');

  this.log = opts.log || function (){};
};

Data.prototype.createStream = function() {
  return this.doc.createStream();
};

Data.prototype.createReadableStream = function() {
  return this.doc.createStream({writable: false, sendClock: true});
};

Data.prototype.setFrontend = function(obj) {
  assert(typeof obj.name === 'string' && obj.name.length > 0);
  assert(typeof obj.bind === 'string');
  var id = this.frontendId(obj.name);
  if (obj.id) assert.equal(obj.id, id, 'name must correspond with id');

  var frontend = {
      _type     : 'frontend'
    , name      : obj.name
    , bind      : obj.bind  // TODO validate bind comma separated list of host || * : port
    , backend   : obj.backend // TODO validate, make sure the backend is defined ?
    , mode      : obj.mode || 'http'
    , keepalive : obj.keepalive || 'default' // default|close|server-close, default default
    , rules     : obj.rules || [] // TODO validate each rule
    , natives   : obj.natives || []
  };

  stripUndefinedProps(frontend);
  this._updateDifferences(id, this.frontends.get(id), frontend);
};

Data.prototype.setBackend = function(obj) {
  assert(typeof obj.name === 'string' && obj.name.length > 0);
  assert(obj.type === 'spindrift' || obj.type === 'static');
  var id = this.backendId(obj.name);
  if (obj.id) assert.equal(obj.id, id, 'name must correspond with id');

  var backend = {
      _type   : 'backend'
    , name    : obj.name
    , type    : obj.type 
    , role    : obj.role // TODO validate
    , version : obj.version // TODO validate
    , balance : obj.balance || 'roundrobin' // TODO validate
    , host    : obj.host || undefined // for host header override
    , mode    : obj.mode || 'http'
    , members : obj.members || []
    , natives : obj.natives || []
  };

  stripUndefinedProps(backend);

  // custom health checks, only for http
  if (backend.mode === 'http' && obj.health) {
    backend.health = {
        method: obj.health.method            || 'GET'
      , uri: obj.health.uri                  || '/'
      , httpVersion: obj.health.httpVersion  || 'HTTP/1.0'
      , interval: obj.health.interval        || 2000
    };

    // validation - host header required for HTTP/1.1
    assert(backend.health.httpVersion === 'HTTP/1.1' && !backend.host, 
      'host required with health.httpVersion == HTTP/1.1');
  }

  this._updateDifferences(id, this.backends.get(id), backend);
};


Data.prototype.setBackendMembers = function(backendName, members) {
  var id = this.backendId(backendName);
  this.backends.get(id).set('members', members);
};

Data.prototype.getFrontends = function() {
  return this.frontends.toJSON();
};

Data.prototype.getBackends = function() {
  return this.backends.toJSON();
};

Data.prototype.deleteFrontend = function(frontendName) {
  var id = this.frontendId(frontendName);
  this.doc.rm(id);
};

Data.prototype.deleteBackend = function(backendName) {
  var id = this.backendId(backendName);
  this.doc.rm(id);
};

Data.prototype.frontendId = function(frontendName) {
  return "frontend/"+frontendName;
};

Data.prototype.backendId = function(backendName) {
  return "backend/"+backendName;
};

Data.prototype.setFrontendStat = function(frontendName, stat) {
  // expect { name: 'fontEndName', status: 'UP/DOWN or like UP 2/3' }
  var statId = 'stat/' + this.frontendId(frontendName);
  var statObj = this._createStatObj(statId, frontendName, 'frontend', stat);
  statObj.frontend = this.frontendId(frontendName);
  this._setStat(statId, statObj);
};

Data.prototype.setBackendStat = function(backendName, stat) {
  // expect { name: 'backendName', status: 'UP/DOWN or like UP 2/3' }
  var statId = 'stat/' + this.backendId(backendName);
  var statObj = this._createStatObj(statId, backendName, 'backend', stat);
  statObj.backend = this.backendId(backendName);
  this._setStat(statId, statObj);
};

Data.prototype.setBackendMemberStat = function(backendName, memberName, stat) {
  // expect { name: 'backendName', status: 'UP/DOWN or like UP 2/3' }
  var statId = 'stat/' + this.backendId(backendName) + '/' + memberName;
  var statObj = this._createStatObj(statId, memberName, 'backendMember', stat);
  statObj.backend = this.backendId(backendName);
  statObj.backendName = backendName;
  this._setStat(statId, statObj);
};

Data.prototype._setStat = function (statId, statObj) {
  var hasChanged = !deepEqual(this.doc.get(statId).toJSON(), statObj);
  if (hasChanged) this.doc.set(statId, statObj);
};

Data.prototype._createStatObj = function(id, name, type, stat) {
  return {
    id: id,
    _type: 'stat',
    type: type,
    name: name,
    status: stat.status
  };
};

Data.prototype._updateDifferences = function (id, existingRow, updatedObj) {
  if (!existingRow) return this.doc.set(id, updatedObj);

  var diffObj = {};
  diff(existingRow.toJSON(), updatedObj).forEach(function (change) {
    var key = change.key[0];
    if (key === 'id') return;
    if (!diffObj[key]) {
      if (change.type === 'put') diffObj[key] = updatedObj[key];
      else if (change.type === 'del') diffObj[key] = undefined;
    }
  });
  existingRow.set(diffObj);
};


Data.prototype.closeDb = function(cb) {
  if (this.db) this.db.close(cb);
  else cb(null);
};

Data.prototype._bootstrapLevelDB = function(dbLocation) {
  var self = this;
  var doc = self.doc;

  var levelup = require("levelup");
  var level_scuttlebutt = require("level-scuttlebutt");
  var SubLevel = require('level-sublevel');
  var db = this.db = SubLevel(levelup(dbLocation));
  var udid = require('udid')('thalassa-aqueduct');
  var sbDb = db.sublevel('scuttlebutt');

  level_scuttlebutt(sbDb, udid, function (name) {
    return doc;
  });

  sbDb.open(udid, function (err, model) {
    self.log('debug', 'leveldb initialized, storing data at ' + dbLocation);
    //model.on('change:key', console.log);
  });
};

function stripUndefinedProps(obj) {
  Object.keys(obj).forEach(function(key) {
    if (obj[key] === undefined ) delete obj[key];
  });
}
