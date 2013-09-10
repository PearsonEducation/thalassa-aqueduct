var assert = require('assert')
  , Thalassa = require('thalassa')
  ;

var ThalassaAgent = module.exports = function ThalassaAgent (opts) {
  if (typeof opts !== 'object') opts = {};

  assert(opts.host,     'opts.host must be passed!');
  assert(opts.port,     'opts.port must be passed!');
  assert(opts.apiport,  'opts.apiport must be passed!');
  assert(opts.data,     'opts.data must be passed!');

  this.log = (typeof opts.log === 'function') ? opts.log : function (){};

  var client = this.client = new Thalassa.Client(opts);
  this.data = opts.data;

  this.data.backends.on('changes', this.handleBackendChange.bind(this));
  client.on('online', this.handleThalassaOnline.bind(this));
  client.on('offline', this.handleThalassaOffline.bind(this));
  client.start();
};


ThalassaAgent.prototype.handleThalassaOnline = function (reg) {
  var self = this;
  var role = reg.name, version = reg.version;

  self.data.backends.toJSON().forEach(function (backend) {
    if (backend.type === 'dynamic' &&
        backend.version === version &&
        backend.role === role) {
      var newMembers = backend.members.filter(function (member) { 
        return member.id !== reg.id; 
      }).concat(reg);
      self.data.setBackendMembers(backend.name, newMembers);
    }
  });

};

ThalassaAgent.prototype.handleThalassaOffline = function (regId) {
  var self = this;

  // TODO move parsing of regId
  var parts = regId.split('/');
  var role = parts[1], version = parts[2];

  self.data.backends.toJSON().forEach(function (backend) {
    if (backend.type === 'dynamic' &&
        backend.version === version &&
        backend.role === role) {

      var newMembers = backend.members.filter(function (member) {
        return (member.id !== regId);
      });
      self.data.setBackendMembers(backend.name, newMembers);
    }
  });
};

ThalassaAgent.prototype.handleBackendChange = function(row, changes) {
  var self = this;
  var backend = row.toJSON();
  if (backend.type !== 'dynamic') return;
  // We can get into a cycle of changing members and detecting they changed.
  // So if the members just changed but the role and version hasn't changed
  // and this is not a new backend, ignore this change
  if (changes.members && !changes._type && !changes.role && !changes.version) return;
  self.client.subscribe(backend.role, backend.version);
  updateRegistrations(backend.name, backend.version);

  function updateRegistrations(name, version) {
    self.client.getRegistrations(backend.role, backend.version, function (err, regs) {
      if (err) {
        self.log('error', 'ThalassaAgent.handleBackendChange failed, retrying in 5s', err);
        setTimeout(function () {
          updateRegistrations(name, version);
        }, 5000);
      }
      else {
        self.data.setBackendMembers(name, regs);
      }
    });
  }
};