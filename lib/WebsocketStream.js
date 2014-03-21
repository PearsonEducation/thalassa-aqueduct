var assert = require('assert')
  , shoe = require('shoe')
  , MuxDemux = require('mux-demux')
  , WebSocketServer = require('ws').Server
  , websocket = require('websocket-stream');

var WebsocketStream = module.exports = function WebsocketStream (opts) {
  if (typeof opts !== 'object') opts = {};
  assert(opts.data, 'opts.data required');
  this.data = opts.data;
  this.statStreams = [];
  this.activityStreams = [];
};

WebsocketStream.prototype.bindReadableStream = function(hapiServer, path) {
  var self = this;
  var wss = new WebSocketServer({server: hapiServer.listener});
  wss.on('connection', function(ws) {

    // need to bind on `close` before creating muxdemux so this handler will be
    // called first
    ws.on('close', cleanup);

    var stream = websocket(ws);
    var mx = new MuxDemux();
    stream.pipe(mx).pipe(stream);

    var configStream = mx.createWriteStream({ type: 'config' });
    var statStream = mx.createWriteStream({ type: 'stat' });
    self.statStreams.push(statStream);
    var activityStream = mx.createWriteStream({ type: 'activity' });
    self.activityStreams.push(activityStream);

    configStream.pipe(self.data.createReadableStream()).pipe(configStream);

    mx.on('error', cleanup);

    function cleanup () {
      self.statStreams = self.statStreams.filter(function (s) { return s !== statStream; });
      self.activityStreams = self.activityStreams.filter(function (s) { return s !== activityStream; });
      // destroying stream should cascade to others
      stream.destroy();
    }
  });
};

WebsocketStream.prototype.bindWritableStream = function(hapiServer, path) {
  var self = this;
  if (!path) path = '/stream';
  shoe(function (sock) {
    sock.pipe(aqueduct.createStream()).pipe(sock);
  }).install(hapiServer.listener, path);
};

WebsocketStream.prototype.writeStat = function(statObj) {
  var stringified = JSON.stringify(statObj) + '\n';
  this.statStreams.forEach(function (s) {
    s.write(stringified);
  });
};

WebsocketStream.prototype.writeActivity = function(activityObj) {
  var stringified = JSON.stringify(activityObj) + '\n';
  this.activityStreams.forEach(function (s) {
    s.write(stringified);
  });
};
