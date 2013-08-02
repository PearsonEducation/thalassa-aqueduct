var assert = require('assert')
  , Data = require('../lib/Data')
  , rimraf = require('rimraf')
  ;

describe ('Data', function () {
  var filePath = '/tmp/test.data.persistence';
  it ('should store and retrieve data', function (done) {
    var data = new Data({ persistence: filePath });
    var name = 'test', bind = "*:80", backend = 'testbackend';

    setTimeout(function() {
      data.setFrontend({ name: name, bind: bind, backend: backend });
      data.setBackend({ name: 'be', type: 'static' });

      setTimeout(function () {
        var data2 = new Data({ persistence: filePath });
        setTimeout(function () {
          assert.deepEqual(data.doc.toJSON(), data2.doc.toJSON());
          done();
        }, 50);
      }, 50);
    }, 20);

    // data.doc.on('sync', function () {
    //   console.log('sync');
    //   data.closeDb(function (error) {
    //     var data2 = new Data({ persistence: dbPath });
    //     data2.doc.on('sync', function () {
    //       assert.deepEqual(data.doc.toJSON(), data2.doc.toJSON());
    //       data2.closeDb(done);
    //     });
    //   });
    // });
  });

  after(function (done) {
    rimraf('/tmp/test.data.persistence', done);
  });
});