var assert = require('assert')
  , request = require('request')
  , deepEqual = require('deep-equal')
  ;

var ConsulAgent = module.exports = function ConsulAgent (opts) {
  if (typeof opts !== 'object') opts = {};

  assert(opts.rootUrl,  'opts.rootUrl must be passed!');
  assert(opts.data,     'opts.data must be passed!');

  this.log = (typeof opts.log === 'function') ? opts.log : function (){};
  this.data = opts.data;
  this.rootUrl = opts.rootUrl;
  // TODO ? handle backend changes immediately or just wait for the interval to fire?
  //this.data.backends.on('changes', this.handleBackendChange.bind(this));

  this.pollingTimeMs = 4000;
  this.pollingInterval = setInterval(this.checkMembers.bind(this), this.pollingTimeMs);

};

ConsulAgent.prototype.checkMembers = function () {
  var self = this;
  var backends = self.data.backends.toJSON();

  // iterate through all of the backends
  backends.forEach(function (backend) {
    if (backend.type === 'dynamic') {

      var url = self.rootUrl + '/v1/catalog/service/' + backend.name;

      request({
        uri: url,
        json: true,
        timeout: (self.pollingTimeMs/2)
      }, function (err, resp, body) {
        if (!err && resp.statusCode !== 200) {
          err = new Error("Unsuccessful HTTP status code " + resp.statusCode);
        }
        if (err) {
          self.log('error', 'ConsulAgent.checkMembers failed ' + url, err);
          return;
        }

        // filter only the members of this version
        var newRegs = body.filter(function (reg) {
          return (reg.ServiceTags.indexOf(backend.version) > -1);
        });

        // convert the format to what Thalassa expects
        var newMembers = newRegs.map(function (reg) {
          return {
            name: reg.ServiceName,
            version: backend.version,
            host: reg.Address,
            port: reg.ServicePort,
            meta: {
              tags: reg.ServiceTags,
              consulNode: reg.Node
            }
          }
        });

        //console.log('newMembers', newMembers);

        // TODO check if the member list actually changed before we set it?

        // update the new members
        if (!deepEqual(backend.members, newMembers)) {
          self.data.setBackendMembers(backend.key, newMembers);
        }

      })

    }
  });
}
