angular.module('crowsnest').factory('browserify', function () {
  return {
    shoe: require('shoe'),
    crdt: require('crdt'),
    split: require('split'),
    MuxDemux: require('mux-demux'),
    events: require('events'),
    CBuffer: require('CBuffer')
  }
})