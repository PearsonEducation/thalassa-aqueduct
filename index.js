var Haproxy = require('haproxy')
  , Data = require('./lib/Data')
  , HaproxyManager = require('./lib/HaproxyManager')
  , HaproxyStats = require('./lib/HaproxyStats')
  , ThalassaAgent = require('./lib/ThalassaAgent')
  , Api = require('./lib/Api')
  ;


var Aqueduct = module.exports = function (opts) {
  if (typeof opts !== 'object') opts = {};
  var debug = !!opts.debug;
  var noop = function (){};
  var log = this.log = opt.log || (debug) ? require('./lib/defaultLogger') : noop;

  // TODO wire-up
};