var assert = require('assert')
  , Thalassa = require('thalassa')
  , MuxDemux = require('mux-demux')
  , EventEmitter  = require('events').EventEmitter
  , util = require('util')
  , crdt = require('crdt')
  ;

var ThalassaAgent = module.exports = function ThalassaAgent (opts) {
  if (typeof opts !== 'object') opts = {};

  assert(opts.host,     'opts.host must be passed!');
  assert(opts.port,     'opts.port must be passed!');
  assert(opts.apiport,  'opts.apiport must be passed!');
  assert(opts.data,     'opts.data must be passed!');

  var self = this;
  this.log = (typeof opts.log === 'function') ? opts.log : function (){};

  var client = this.client = new Thalassa.Client(opts);

  this.data = opts.data;
  this.serviceDoc = new crdt.Doc();
  this.backendSubs = {};
  this._clientMuxes = [];

  this.data.backends.on('changes', this.handleBackendChange.bind(this));
  this.data.backends.on('remove', this.handleBackendRemoved.bind(this));

  client.on('online', this.handleThalassaOnline.bind(this));
  client.on('offline', this.handleThalassaOffline.bind(this));
  client.start();

  this.data.backends.toJSON().forEach(function (backend) {

    client.getRegistrations(backend.name, function (err, regs) {
      if (err) {
        self.log('error', 'Thalassa.getRegistrations', err);
      }
      else {
        regs.forEach(self.handleThalassaOnline.bind(self));
      }
    });
  });
};

util.inherits(ThalassaAgent, EventEmitter);

ThalassaAgent.prototype.handleThalassaOnline = function (reg) {
  var self = this;
  var activity = { type: 'activity',  time: Date.now(), verb: 'online', object: reg.id };
  self.emit('activity', activity);
  self.log('debug', 'ONLINE', reg.id);
  self.serviceDoc.add({ id: reg.id, type: 'service', service: reg});

  var name = reg.name, version = reg.version;

  self.data.backends.toJSON().forEach(function (backend) {
    if (backend.type === 'dynamic' &&
        backend.version === version &&
        backend.name === name) {
      var newMembers = backend.members.filter(function (member) {
        return member.id !== reg.id;
      }).concat(reg);
      self.data.setBackendMembers(backend.key, newMembers);
    }
  });

};

ThalassaAgent.prototype.handleThalassaOffline = function (regId) {
  var self = this;
  var activity = { type: 'activity', time: Date.now(), verb: 'offline', object: regId };
  self.emit('activity', activity);

  self.serviceDoc.rm(regId);

  // TODO move parsing of regId
  var parts = regId.split('/');
  var name = parts[1], version = parts[2];

  self.data.backends.toJSON().forEach(function (backend) {
    if (backend.type === 'dynamic' &&
        backend.version === version &&
        backend.name === name) {

      var newMembers = backend.members.filter(function (member) {
        return (member.id !== regId);
      });
      self.data.setBackendMembers(backend.key, newMembers);
    }
  });
};

ThalassaAgent.prototype.handleBackendChange = function(row, changes) {
  var self = this;
  var backend = row.toJSON();
  if (backend.type !== 'dynamic') return;
  // We can get into a cycle of changing members and detecting they changed.
  // So if the members just changed but the name and version hasn't changed
  // and this is not a new backend, ignore this change
  if (changes.members && !changes._type && !changes.name && !changes.version) return;
  //We need to subscribe to all versions of the backend/appname, but only once
  if(!(backend.name in self.backendSubs)){
    self.client.subscribe(backend.name);
    self.backendSubs[backend.name] = true;
  }
  updateRegistrations(backend.key, backend.version);

  function updateRegistrations(key, version) {
    self.client.getRegistrations(backend.name, backend.version, function (err, regs) {
      if (err) {
        self.log('error', 'ThalassaAgent.handleBackendChange failed, retrying in 5s', err);
        setTimeout(function () {
          updateRegistrations(key, version);
        }, 5000);
      }
      else {
        self.data.setBackendMembers(key, regs);
      }
    });
  }
};

ThalassaAgent.prototype.handleBackendRemoved = function(row) {
  var self = this;
  var backend = row.toJSON();
  if(backend.name in self.backendSubs){
    //self.client.unsubscribe(backend.name); 'unsubscribe' currently broken in client
    delete self.backendSubs[backend.name];
  }
};

ThalassaAgent.prototype.createReadableMuxStream = function() {
  var self = this;
  var mx = new MuxDemux();
  var id = Date.now() + String(Math.ceil(Math.random()*9999999));

  self._clientMuxes[id] = mx;

  mx.on('close', function () {
    delete self._clientMuxes[id];
  });

  // services crdt
  var serviceStream = self.serviceDoc.createStream({writable: false, sendClock: true});
  var mxs = mx.createStream({ type: 'thalassa' });
  serviceStream.pipe(mxs).pipe(serviceStream);

  return mx;
};
