var assert = require('assert')
  , Thalassa = require('thalassa')
  ;

var ThalassaAgent = module.exports = function ThalassaAgent (opts) {
  if (typeof opts !== 'object') opts = {};

  assert(opts.host, 'opts.host must be passed!');
  assert(opts.port, 'opts.port must be passed!');
  assert(opts.data, 'opts.data must be passed!');

  var client = this.client = new Thalassa.Client(opts);
  client.connect();
  this.data = opts.data;

  this.data.backends.on('changes', this.handleBackendChange.bind(this));
  client.on('register', this.handleThalassaRegister.bind(this));
  client.on('free', this.handleThalassaFree.bind(this));
};


ThalassaAgent.prototype.handleThalassaRegister = function (service) {
  var self = this;
  var role = service.role, version = service.version;

  self.data.backends.toJSON().forEach(function (backend) {
    if (backend.type === 'spindrift' &&
        backend.version === version &&
        backend.role === role) {
      var newMembers = backend.members.concat(service);
      self.data.setBackendMembers(backend.name, newMembers);
    }
  });

};

ThalassaAgent.prototype.handleThalassaFree = function (service) {
  var self = this;
  var role = service.role, version = service.version;

  self.data.backends.toJSON().forEach(function (backend) {
    if (backend.type === 'spindrift' &&
        backend.version === version &&
        backend.role === role) {

      var newMembers = backend.members.filter(function (member) {
        return (member.id !== service.id);
      });
      self.data.setBackendMembers(backend.name, newMembers);
    }
  });
};

ThalassaAgent.prototype.handleBackendChange = function(row, changes) {
  var self = this;
  var backend = row.toJSON();
  if (backend.type !== 'spindrift') return;
  // We can get into a cycle of changing members and detecting they changed.
  // So if the members just changed but the role and version hasn't changed
  // and this is not a new backend, ignore this change
  if (changes.members && !changes._type && !changes.role && !changes.version) return;

  var newMembers = self.client.query(backend.role, backend.version) || [];
  self.data.setBackendMembers(backend.name, newMembers);
};