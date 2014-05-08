var level = require('level')
  , assert = require('assert')
  , util = require('util')
  , path = require('path')
  , mkdirp = require('mkdirp')
  , LiveStream = require('level-live-stream')
  ;

//
// opts:
//    - dbPath
//    - secondsToRetainStats
//
var ActivityStreamDb = module.exports = function ActivityStreamDb (opts, cb) {
  var self = this;
  if (typeof opts !== 'object') opts = {};
  this.log = (typeof opts.log === 'function') ? opts.log : function (){};

  assert(opts.dbPath, 'ActivityStreamDb.js: opts.dbPath, dbPath to leveldb database, must be passed!');

  var dbPath = self.DBPATH = opts.dbPath;
  self.SECONDS_TO_RETAIN_STATS = opts.secondsToRetainStats || 300;

  mkdirp(dbPath, function (err) {
    if (err) {
      self.log('error', 'mkdirp ' + dbPath, String(err));
      throw err;
    }

    var statsDbPath = path.join(dbPath, 'statsDb');
    self.statsDb = level(statsDbPath, { valueEncoding : 'json' });
    LiveStream.install(self.statsDb);
    self.log('debug', 'statsDbPath=' + statsDbPath);

    var activityDbPath = path.join(dbPath, 'activityDb');
    self.activityDb = level(activityDbPath, { valueEncoding : 'json' });
    LiveStream.install(self.activityDb);
    self.log('debug', 'activityDbPath=' + activityDbPath);
    if (typeof cb === 'function') cb();

  });

};

ActivityStreamDb.prototype.writeStat = function(statObj) {
  var key = [statObj.time, statObj.id].join('~');
  this.statsDb.put(key, statObj);
  this.trimStats();
};

ActivityStreamDb.prototype.writeActivity = function(activityObj) {
  this.log('debug', "activity", activityObj);
  var key = [activityObj.time, activityObj.object].join('~');
  this.activityDb.put(key, activityObj);
};

ActivityStreamDb.prototype.trimStats = function () {
  var self = this;

  // if we're already trimming, return
  if (self.isTrimming) return;

  self.isTrimming = true;
  // self.log('debug', 'trimStats starting');

  var ws = self.statsDb.createWriteStream();
  var numKeysDeleted = 0;
  var startTime = Date.now();
  var timeToExpire = Date.now() - (self.SECONDS_TO_RETAIN_STATS * 1000);

  var rs = self.statsDb.createReadStream({ keys: true, values: false, start: '0', end: timeToExpire + '~' })
    .on('data', function (key) {
      console.log(timeToExpire, key);
      ws.write({ type: 'del', key: key });
      numKeysDeleted++;
    })
    .on('end', function () {
      ws.end();
      var duration = Date.now()-startTime;
      self.log('debug', util.format('trimStats trimmed %s in %sms (%s)', numKeysDeleted, duration, (numKeysDeleted/duration)));
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

ActivityStreamDb.prototype.statsValueStream = function() {
  return this.statsDb.liveStream();
  // var opts = (hostId) ? { start: hostId + '~', end: hostId + '~~' } : undefined;
  // return this.statsDb.createValueStream(opts);
};

ActivityStreamDb.prototype.activityValueStream = function(opts) {
  if (!opts) opts = {};
  if (!opts.start) opts.start = Date.now();
  if (!opts.limit) opts.limit = 50;
  opts.reverse = true;
  return this.activityDb.createValueStream(opts);
};

ActivityStreamDb.prototype.allowTrimmingIn = function (t) {
  var self = this;
  setTimeout(function () {
    self.isTrimming = false;
  }, t);
};
