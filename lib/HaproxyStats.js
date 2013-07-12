var handlebars = require('handlebars')
  , HAProxy = require('haproxy')
  , fs = require('fs')
  , norm = require('path').normalize
  , util = require('util')
  , assert = require('assert')
  , EventEmitter  = require('events').EventEmitter
  , deepEqual = require('deep-equal')
  ;

var HaproxyStats = module.exports = function HaproxyStats (opts) {
  if (typeof opts !== 'object') opts = {};

  assert(opts.data, 'opts.data required');
  assert(opts.haproxy, 'opts.haproxy required');

  // TODO normalize paths

  this.config = {};
  this.data = opts.data;
  this.haproxy = opts.haproxy;
  this.config.haproxySocketPath = norm(opts.haproxySocketPath || '/tmp/haproxy.sock');
  this.config.statsIntervalRate = opts.statsIntervalRate || 2000;
  this.log = (typeof opts.log === 'function') ? opts.log : function (){};

  this.createStatsInterval(this.config.statsIntervalRate);
};

HaproxyStats.prototype.createStatsInterval = function(period) {
  var self = this;
  self.statsTimer = setTimeout(function() {
    self.haproxy.stat('-1', '-1', '-1', function (err, stats) {
      if (err) {
        self.log('error', 'HaproxyStats: ' + err.message);
      }
      else if (!stats) {
        self.log('error', 'HaproxyStats: connected but received no stats');
      }
      else {
        //console.log(stats);

        // frontend stats
        stats.filter(isFrontend).forEach(function (it) {
          var statsObj = {
            name: it.pxname,
            status: it.status
            // responses: {
            //   '100': it.hrsp_1xx,
            //   '200': it.hrsp_2xx,
            //   '300': it.hrsp_3xx,
            //   '400': it.hrsp_4xx,
            //   '500': it.hrsp_5xx,
            //   total: it.req_tot
            // }
          };
          self.data.setFrontendStat(it.pxname, statsObj);
        });

        // backend stats
        stats.filter(isBackend).forEach(function (it) {
          var statsObj = {
            name: it.pxname,
            status: it.status
          };
          self.data.setBackendStat(it.pxname, statsObj);

          // backend members stats
          var backendName = it.pxname;
          stats.filter(isBackendMember(it.pxname)).forEach(function (it) {
            var statsObj = {
              name: it.pxname,
              status: it.status
            };
            self.data.setBackendMemberStat(backendName, it.svname, statsObj);
          });

        });
      }
      self.createStatsInterval(period);
    });
  }, period);
};

function isFrontend (it) { return it.svname === 'FRONTEND' && it.pxname != 'stats';}
function isBackend(it) { return it.svname === 'BACKEND' && it.pxname != 'stats';}
function isBackendMember (backendName) { return function (it) { 
    return it.pxname === backendName && it.svname.indexOf(backendName) === 0; 
  };
}