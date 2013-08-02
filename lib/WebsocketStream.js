var assert = require('assert')
  , shoe = require('shoe')
  , WebSocketServer = require('ws').Server
  , websocket = require('websocket-stream');

var WebsocketStream = module.exports = function WebsocketStream (opts) {
  if (typeof opts !== 'object') opts = {};
  assert(opts.data, 'opts.data required');
  this.data = opts.data;
};

WebsocketStream.prototype.bindReadableStream = function(hapiServer, path) {
  var self = this;
  var wss = new WebSocketServer({server: hapiServer.listener});
  wss.on('connection', function(ws) {
    var stream = websocket(ws);
    stream.pipe(self.data.createReadableStream()).pipe(stream);
  });
};

WebsocketStream.prototype.bindWritableStream = function(hapiServer, path) {
  var self = this;
  if (!path) path = '/stream';
  shoe(function (sock) {
    sock.pipe(aqueduct.createStream()).pipe(sock);
  }).install(hapiServer.listener, path);
};