var level = require('level')
  , assert = require('assert')
  , util = require('util')
  , path = require('path')
  , mkdirp = require('mkdirp')
  ;

//
// opts:
//    - dbPath
//    - secondsToRetainStats
//
var Db = module.exports = function Db (opts, cb) {
  var self = this;
  if (typeof opts !== 'object') opts = {};
  this.log = (typeof opts.log === 'function') ? opts.log : function (){};

  assert(opts.dbPath, 'Db.js: opts.dbPath, dbPath to leveldb database, must be passed!');

  var dbPath = self.DBPATH = opts.dbPath;
  self.SECONDS_TO_RETAIN_STATS = opts.secondsToRetainStats || 300;

  mkdirp(dbPath, function (err) {
    if (err) {
      self.log('error', 'mkdirp ' + dbPath, String(err));
      throw err;
    }

    var statsDbPath = path.join(dbPath, 'statsDb');
    self.statsDb = level(statsDbPath, { valueEncoding : 'json' });
    self.log('debug', 'statsDbPath=' + statsDbPath);

    var activityDbPath = path.join(dbPath, 'activityDb');
    self.activityDb = level(activityDbPath, { valueEncoding : 'json' });
    self.log('debug', 'activityDbPath=' + activityDbPath);
    if (typeof cb === 'function') cb();

  });

};

Db.prototype.writeStat = function(statObj) {
  var key = [statObj.hostId, statObj.id, statObj.time].join('~');
  this.statsDb.put(key, statObj);
  this.trimStats();
};

Db.prototype.writeActivity = function(activityObj) {
  this.log('debug', "activity", activityObj);
  var key = [activityObj.time, activityObj.object].join('~');
  this.activityDb.put(key, activityObj);
};

Db.prototype.trimStats = function () {
  var self = this;

  // if we're already trimming, return
  if (self.isTrimming) return;

  self.isTrimming = true;
  // self.log('debug', 'trimStats starting');

  var ws = self.statsDb.createWriteStream();
  var numKeysDeleted = 0;
  var numKeysConsidered = 0;
  var startTime = Date.now();
  var timeToExpire = Date.now() - (self.SECONDS_TO_RETAIN_STATS * 1000);

  var rs = self.statsDb.createReadStream({ keys: true, values: false })
    .on('data', function (key) {
      numKeysConsidered++;
      var parts = key.split('~');
      var epoch = parseInt(parts[2], 10) || 0;  // if the key doesn't contain the time, aggressively delete it
      if (epoch < timeToExpire) {
        //self.log('debug', 'trimStats deleting (' + (epoch - timeToExpire) + ') ' + key);
        ws.write({ type: 'del', key: key });
        numKeysDeleted++;
      }
    })
    .on('end', function () {
      ws.end();
      var duration = Date.now()-startTime;
      self.log('debug', util.format('trimStats trimmed %s of %s in %sms (%s)', numKeysDeleted, numKeysConsidered, duration, (numKeysConsidered/duration)));
      self.allowTrimmingIn(6000);
    })
    .on('error', function (err) {
      self.log('error', 'trimStats reading keystream from statsDb', String(err));
      ws.end();
    });

  ws.on('error', function (err) {
    self.log('error', 'trimStats write stream to statsDb', String(err));
    rs.destroy();
  });
};

Db.prototype.statsValueStream = function(hostId) {
  var opts = (hostId) ? { start: hostId + '~', end: hostId + '~~' } : undefined;
  return this.statsDb.createValueStream(opts);
};

Db.prototype.activityValueStream = function(opts) {
  if (!opts) opts = {};
  if (!opts.start) opts.start = Date.now();
  if (!opts.limit) opts.limit = 50;
  opts.reverse = true;
  return this.activityDb.createValueStream(opts);
};

Db.prototype.allowTrimmingIn = function (t) {
  var self = this;
  setTimeout(function () {
    self.isTrimming = false;
  }, t);
};
