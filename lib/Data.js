var crdt = require('crdt')
  , assert = require('assert')
  , deepEqual = require('deep-equal')
  , diff = require('changeset')
  , fs = require('fs')
  , extend = require('xtend')
  ;

var Data = module.exports = function Data (opts) {
  if (!opts) opts = {};

  this.doc = new crdt.Doc();

  this.frontends          = this.doc.createSet('_type', 'frontend');
  this.backends           = this.doc.createSet('_type', 'backend');

  if (opts.persistence) {
    //this._bootstrapLevelDB(opts.persistence);
    this._bootstrapFileSystemPersistence(opts.persistence);
  }

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
    , host    : obj.host || null // for host header override
    , mode    : obj.mode || 'http'
    , members : (Array.isArray(obj.members)) ? obj.members : []
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
  this.backends.get(id).set({ 'members': members });
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

Data.prototype.setFrontendStat = function(stat) {
  // expect { name: 'fontEndName', status: 'UP/DOWN or like UP 2/3' }
  var statId = stat.id
  var statObj = this._createStatObj(statId, stat.name, 'frontend', stat);
  statObj.frontend = this.frontendId(stat.name);
  this._setStat(statId, statObj);
};

Data.prototype.setBackendStat = function(stat) {
  // expect { name: 'backendName', status: 'UP/DOWN or like UP 2/3' }
  var statId = stat.id;
  var statObj = this._createStatObj(statId, stat.name, 'backend', stat);
  statObj.backend = this.backendId(stat.name);
  this._setStat(statId, statObj);
};

Data.prototype.setBackendMemberStat = function(stat) {
  // expect { name: 'backendName', status: 'UP/DOWN or like UP 2/3' }
  var statId = stat.id;
  var statObj = this._createStatObj(statId, stat.name, 'backendMember', stat);
  statObj.backend = this.backendId(stat.backendName);
  this._setStat(statId, statObj);
};

Data.prototype.rmBackendMemberStatsAllBut = function(backendName, memberNames) {
  var self = this;
  this.stats.toJSON()
      .forEach(function (stat) { 
        if (stat.type === 'backendMember' && 
            stat.backendName === backendName &&
            memberNames.indexOf(stat.name) === -1) {
          self.doc.rm(stat.id);
        }
      });
};

Data.prototype._setStat = function (statId, statObj) {
  var hasChanged = !deepEqual(this.doc.get(statId).toJSON(), statObj);
  if (hasChanged) this.doc.set(statId, statObj);
};

Data.prototype._createStatObj = function(id, name, type, stat) {
  // set just the status and no other stat
  return { id: id, _type: 'stat', type: type, name: name, status: stat.status };
  //return extend(stat, { id: id, _type: 'stat', type: type, name: name});
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


// Data.prototype.closeDb = function(cb) {
//   if (this.db) this.db.close(cb);
//   else cb(null);
// };


// This leveldb back storage is not working, sometimes it either failing
// to store some data or read it out. I had to revert back to constantly
// serializing the contents into a flat file
//
// Data.prototype._bootstrapLevelDB = function(dbLocation) {
//   var self = this;
//   var doc = self.doc;

//   var levelup = require("levelup");
//   var level_scuttlebutt = require("level-scuttlebutt");
//   var SubLevel = require('level-sublevel');
//   var db = this.db = SubLevel(levelup(dbLocation));
//   var udid = require('udid')('thalassa-aqueduct');
//   var sbDb = db.sublevel('scuttlebutt');

//   level_scuttlebutt(sbDb, udid, function (name) {
//     return doc;
//   });

//   sbDb.open(udid, function (err, model) {
//     self.log('debug', 'leveldb initialized, storing data at ' + dbLocation);
//     //model.on('change:key', console.log);
//   });
// };

Data.prototype._bootstrapFileSystemPersistence = function (fileLocation) {
  var self = this;

  var writing = false, queued = false;
  function _syncDown() {
    writing = true;
    queued = false;
    var contents = JSON.stringify({ version: 1, frontends: self.frontends, backends: self.backends });
    fs.writeFile(fileLocation, contents, function (err) {
      if (err)
        self.log('error', 'failed writing serialized configuration ' + fileLocation +', ' + err.message);
      writing = false;
      if (queued) _syncDown();
    });
  }

  var syncDown = function () {
    if (writing) queued = true;
    else _syncDown();
  };

  fs.exists(fileLocation, function (exists) {
    if (exists) {
      var contents = fs.readFileSync(fileLocation);
      try {
        var data = JSON.parse(contents);
        data.frontends.forEach(function (frontend) {
          self.setFrontend(frontend);
        });
        data.backends.forEach(function (backend) {
          self.setBackend(backend);
        });
      }
      catch (err) {
        self.log('error', 'failed parsing serialized configuration JSON ' + fileLocation +', ' + err.message);
      }

    }
    self.frontends.on('changes', syncDown);
    self.backends.on('changes', syncDown);
  });

};

function stripUndefinedProps(obj) {
  Object.keys(obj).forEach(function(key) {
    if (obj[key] === undefined ) delete obj[key];
  });
}
