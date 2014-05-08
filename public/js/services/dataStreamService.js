angular.module('crowsnest').factory('dataStream', function (browserify, $rootScope, _) {

  var crdt = browserify.crdt
    , shoe = browserify.shoe
    , split =browserify.split
    , MuxDemux = browserify.MuxDemux
    , events = browserify.events
    , CBuffer = browserify.CBuffer
    ;

//
// Because of the way CRDT currently works we need to clobber and recreate all of the CRTD
// docs on reconnection. The issue is that we are twice removed from other CRDT docs and when
// the doc in the middle goes away and is replaced by a new doc, the docs on either end aren't
// getting the change event relayed to them because the the perspective of a doc on the edge 
// and the doc in the center, he doesn't need the updates because he was just born and shouldn't
// care about hsitorical changes --- THATS MY HUNCH ANYWAY
// It's a shame to have to clobber and resync all of the data though.... defeats the purpose a bit
//

  var services = [];
  var activity = [];
  var stats = {};
  var statSubscriptions = {};
  var controlStream = null;
  var aqueductServer = null;

  var data = new events.EventEmitter();
  data.getServices = function getServices () { return services; }; 
  data.getActivity = function getServices () { return activity; };
  data.getPoolServer = function getPoolServer() {
    return aqueductServer;
  }
  data.connection = null;

  data.subscribeToStats = function (hostId) {
    statSubscriptions[hostId] = true;
    if (controlStream) {
      controlStream.write(JSON.stringify(['statSubscribe', hostId]) + '\n');
    }
  };

  var thalassaDoc = null;

  var emitServicesChanged = _.debounce(function () { data.emit('services-changed') }, 400);
  var emitPoolsChanged = _.debounce(function () { data.emit('pools-changed') }, 400);
  var emitStatsChanged = _.debounce(function () { data.emit('stats-changed') }, 400);
  var emitActivityChanged = _.debounce(function () { data.emit('activity-changed') }, 400);

  function AqueductServer(meta) {
    var id = meta.service.id;
    if (!(this instanceof AqueductServer)) {
      return aqueductServer || new AqueductServer(meta);
    }

    var self = this;
    this.id= id;
    this._id = meta.service.id;
    this.meta = meta;
    this.doc = new crdt.Doc();

    this.frontendsSet = this.doc.createSet('_type', 'frontend');
    this.backendsSet  = this.doc.createSet('_type', 'backend');

    var frontends = {}, backends = {};

    stats[id] = {};

    this.getFrontends = function getFrontends() { return frontends; };
    this.getBackends = function getBackends() { return backends; };
    this.getStats = function getStats() { return stats[id]; };

    this.getFrontendStatus = function getFrontendStatus(key) {
      var statId = 'stat/frontend/' + key;
      var statArray = stats[id][statId];
      if (!statArray || statArray.length === 0) return {};
      return statArray.last() || {};
    };

    this.getFrontendConnectionStats = function getFrontendConnectionStats(key) {
      var statId = 'stat/frontend/' + key;
      var statArray = stats[id][statId];
      if (!statArray || statArray.length === 0) return [];
      return statArray.toArray().map(function(s) { return { x: Math.ceil(s.time/1000), y: parseInt(s.connections.current) }; });
    };

    this.getBackendStatus = function getBackendStatus(key) {
      var statId = 'stat/backend/' + key;
      var statArray = stats[id][statId];
      if (!statArray || statArray.length === 0) return {};
      var last = statArray.last() || {};

      // Correct an edge base where there are not backend members and 
      // HAProxy considers the backend to be healthy
      if (this.getBackendMemberHealthCount(key) === 0) last.status = 'DOWN';
      return  last;
    };

    this.getBackendConnectionStats = function getBackendConnectionStats(key) {
      var statId = 'stat/backend/' + key;
      var statArray = stats[id][statId];
      if (!statArray || statArray.length === 0) return [];
      return statArray.toArray().map(function(s) { return { x: Math.ceil(s.time/1000), y: parseInt(s.connections.current) }; });
    };

    this.getBackendMemberStatus = function getBackendMemberStatus(key, host, port) {
      var statId = 'stat/backend/' + key + '/' + key + '_' + host + ':' + port;
      var statArray = stats[id][statId];
      if (!statArray || statArray.length === 0) return {};
      return statArray.last() || {};
    };

    this.setBackendVersion = function setBackendVersion (key, version) {
      if (controlStream) {
        controlStream.write(JSON.stringify(['updateAqueductBackendVersion', id, key, version]) + '\n');
      }
    }

    this.getBackendMemberHealthCount = function getBackendMemberHealthCount(key) {
      var statIdPrefix = 'stat/backend/' + key +'/';
      var statObj = stats[id];
      var backend = backends['backend/'+key];
      var memberHostPorts = backend.members.map(function (m) { return m.host + ':' + m.port; });
      var count = Object.keys(statObj)
          .filter(function (statId) { 
            if (statId.indexOf(statIdPrefix) !== 0) return false;
            var parts = statId.split('/');
            if (parts[3]) {
              var hp = parts[3].split('_')[1];
              return memberHostPorts.indexOf(hp) >= 0;
            }
            return false;
          })
          .reduce(function (total, statId) {
            var statArray  = statObj[statId];
            if (!statArray || statArray.length === 0) return total;
            return ((statArray.last().status.indexOf('UP') === 0) ? 1 : 0) + total;
          } , 0);
      return count;
    };

    this.frontendsSet.on('add', function (row) {
      frontends[row.id] = row.toJSON();
    });
    this.frontendsSet.on('remove', function (row) {
      delete frontends[row.id];
    });
    this.frontendsSet.on('changes', function (row, changes) {
      Object.keys(changes).forEach(function (key) {
        frontends[row.id][key] = changes[key];
      });
    });

    this.backendsSet.on('add', function (row) {
      backends[row.id] = row.toJSON();
    });
    this.backendsSet.on('remove', function (row) {
      delete backends[row.id];
    });
    this.backendsSet.on('changes', function (row, changes) {
      Object.keys(changes).forEach(function (key) {
        backends[row.id][key] = changes[key];
      });
    });

    var handleServiceRemove = function handleServiceRemove (row) {
      var service = row.toJSON();
      if (service.id === self.id) {
        self.destroy();
      }
    };

    this.destroy = function destroy() {
      this.frontendsSet.removeAllListeners();
      this.backendsSet.removeAllListeners();
      this.doc.dispose();
      this.doc.removeAllListeners();
      data.removeListener('service-removed', handleServiceRemove);
      delete aqueductServer;
      emitPoolsChanged();
    };

    data.on('service-removed', handleServiceRemove);

    aqueductServer = this;
    data.emit('pool-connected', aqueductServer);
  }


  function reinitialize() {
    // reset
    if(aqueductServer) aqueductServer.destroy();
    activity = [];
    thalassaDoc  = new crdt.Doc();
    // create a set of all docs
    var thalassaServicesSet = thalassaDoc.createSet('type', 'service');

    thalassaServicesSet.on('add', function (row) {
      services.push(row.toJSON().service)
      services = services.sort(function (a,b) { return (a.id > b.id) ? 1 : -1 });
      emitServicesChanged();
    })

    thalassaServicesSet.on('changes', function (Row, changed) {
    });

    thalassaServicesSet.on('remove', function (row) {
      var service = row.toJSON();
      services = services.filter(function (s) { return s.id !== service.id; });
      emitServicesChanged();
      data.emit('service-removed', row);
    });

  }


  //
  // Ripped out the reconnect module because of a race condition problem
  // spewed this inline for now
  // TODO: refactor connection/reconnection
  //

  function Connection(onConnect) {
    var self = this;
    var STOPPED = 'stopped', CONNECTED = 'connected', DISCONNECTED = 'disconnected', CONNECTING = 'connecting';

    self.disconnect = function () {
      self._changeState(STOPPED);
      self.stream.end();
      return self;
    }

    self.connect = function () {
      self._changeState(CONNECTING);
      self.stream = shoe('/aqueductStreams');

      self.stream.once('end', function () {
        console.log('disconnected', self.state);
        if (self.state !== STOPPED) {
          self._changeState(DISCONNECTED);
          setTimeout(function () {
            self.connect();
          }, 1000);
        }
      });

      self.stream.once('connect', function () {
        console.log('connect')
        self._changeState(CONNECTED);
        onConnect(self.stream);
      });
      return self;
    }

    self._changeState = function (state) {
      self.state = state;
      self.emit(state);
    }

  }
  Connection.prototype = new events.EventEmitter();

  data.connection = new Connection(onConnect).connect();

  function onConnect (stream) {
    var self = this;
    reinitialize();

    var mx = new MuxDemux(function (s) {
      console.log("Websocket type: " + s.meta.type);
      if (s.meta.type === 'aqueduct') {
        var server = AqueductServer(s.meta);

        server.doc.on('row_update', function (row) {
          emitPoolsChanged();
        });

        var docStream = server.doc.createStream({ sendClock: true });
        s.pipe(docStream).pipe(s);
        s.once('close', docStream.destroy.bind(docStream));
        stream.once('close', docStream.destroy.bind(docStream));
      }
      else if (s.meta.type === 'thalassa') {
        var clientDocStream = thalassaDoc.createStream();
        s.pipe(clientDocStream).pipe(s);
        s.once('close', clientDocStream.destroy.bind(clientDocStream));
        stream.once('close', clientDocStream.destroy.bind(clientDocStream));
      }
      else if (s.meta.type === 'stat') {
        s.on('data', function (stat) {
          var statObj = stats[stat.hostId] = stats[stat.hostId] || {};
          var statArray = statObj[stat.id] = statObj[stat.id] || CBuffer(150);

          // if the stat comes in out of order, just drop it
          if (stat.time < (statArray.last() || {} ).time || 0) return;
          statArray.push(stat);
          emitStatsChanged();
        });
      }
      else if (s.meta.type === 'activity') {
        s.on('data', function (activityObj) {
          activity.push(activityObj);
          emitActivityChanged();
        });
      }
      else if (s.meta.type === 'control') {
        controlStream = s;

        // subscribe to any stat subscriptions
        Object.keys(statSubscriptions).forEach(function(hostId) {
          console.log('sending subscribe', hostId)
          controlStream.write(JSON.stringify(['statSubscribe', hostId])+'\n');
        })

        s.pipe(split()).on('data', function (data) {
          console.log(data);
        });
      }
    })

    stream.pipe(mx).pipe(stream);
    stream.once('close', function () {
      mx.destroy();
      controlStream = null;
    })
  }

  return data;
});
