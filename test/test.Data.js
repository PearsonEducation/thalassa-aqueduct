var assert = require('assert')
  , crdt = require('crdt')
  , Data = require('../lib/Data')
  ;

describe ('Data', function () {

  it ('should create a CRDT document with sets', function (done) {
    var data = new Data();
    assert(data);
    assert(data.doc);
    assert(data.backends);
    assert(data.frontends);
    assert.equal(0, data.backends.asArray().length);
    assert.equal(0, data.frontends.asArray().length);
    done();
  });

  it ('should create a frontend', function (done) {
    var name = 'test', bind = "*:80", backend = 'testbackend';
    var data = new Data();
    data.setFrontend({ name: name, bind: bind, backend: backend });
    var frontends = data.frontends.toJSON();
    assert.equal(1, frontends.length);
    assert.equal(name, frontends[0].name);
    assert.equal(bind, frontends[0].bind);
    assert.equal(backend, frontends[0].backend);
    assert.equal(data.frontendId(frontends[0].name), frontends[0].id);
    done();
  });

  it ('should create a backend', function (done) {
    var name = 'test', type = 'dynamic';
    var data = new Data();
    data.setBackend({ name: name, type: type });
    var backends = data.backends.toJSON();
    assert.equal(1, backends.length);
    assert.equal(name, backends[0].name);
    assert.equal(type, backends[0].type);
    assert.equal(data.backendId(backends[0].name), backends[0].id);
    done();
  });

  it ('should get array of frontends', function () {
    var data = new Data();
    data.setFrontend({ name: 'foo', bind: '*:80', backend: 'foob' });
    data.setFrontend({ name: 'bar', bind: '*:80', backend: 'barb' });
    data.setFrontend({ name: 'baz', bind: '*:80', backend: 'bazb' });
    var frontends = data.getFrontends();
    assert(Array.isArray(frontends));
    assert.equal(3, frontends.length);
  });

  it ('should get array of backends', function () {
    var data = new Data();
    data.setBackend({ name: 'foo', type: 'dynamic' });
    data.setBackend({ name: 'bar', type: 'static' });
    data.setBackend({ name: 'baz', type: 'dynamic' });
    var backends = data.getBackends();
    assert(Array.isArray(backends));
    assert.equal(3, backends.length);
  });

  it ('should delete a frontend', function () {
    var name = 'test', bind = "*:80", backend = 'testbackend';
    var data = new Data();
    data.setFrontend({ name: name, bind: bind, backend: backend });
    assert.equal(1, data.frontends.toJSON().length);
    data.deleteFrontend(name);
    assert.equal(0, data.frontends.toJSON().length);
  });

  it ('should set backend members', function (done) {
    var name = 'test', bind = "*:80", backend = 'testbackend';
    var members1 = [{ host: 'foo.com', port: 80 }];
    var members2 = [{ host: 'foo.com', port: 80 }, { host: 'bar.com', port: 80 }];
    var data = new Data();
    data.setBackend({ name: name, type: 'static', members: members1 });
    data.backends.on('changes', function (row, changes) {
      assert.equal(Object.keys(changes).length, 1);
      assert.equal(changes.members, members2);
      done();
    });
    data.setBackendMembers(name, members2);
  });

  it ('should delete a backend', function () {
    var name = 'test', type = 'dynamic';
    var data = new Data();
    data.setBackend({ name: name, type: type });
    assert.equal(1, data.backends.toJSON().length);
    data.deleteBackend(name);
    assert.equal(0, data.backends.toJSON().length);
  });

  it ('should create writeable stream', function (done) {
    var name = 'test', bind = "*:80", backend1 = 'be1', backend2 = 'be2';
    var data = new Data();
    data.setFrontend({ name: name, bind: bind, backend: backend1 });


    var replica = new Data();
    var as;
    (as = data.createStream())
      .pipe(replica.createStream())
      .pipe(as);

    setTimeout(function() {
      assert.deepEqual(data.frontends.toJSON(), replica.frontends.toJSON());

      data.setFrontend({ name: name, bind: bind, backend: backend2 });
      setTimeout(function() {
        assert.deepEqual(data.frontends.toJSON(), replica.frontends.toJSON());
        done();
      }, 10);

    }, 10);
  });

  it ('should create readable stream', function (done) {
    var name = 'test', bind = "*:80", backend1 = 'be1', backend2 = 'be2', backend3 = 'be3';
    var data = new Data();
    data.setFrontend({ name: name, bind: bind, backend: backend1 });


    var replica = new Data();
    var as;
    (as = data.createReadableStream())
      .pipe(replica.createStream())
      .pipe(as);

    setTimeout(function() {
      assert.deepEqual(data.frontends.toJSON(), replica.frontends.toJSON());

      replica.setFrontend({ name: name, bind: bind, backend: backend2 });
      // data should not get the update
      setTimeout(function() {
        assert.equal(replica.frontends.toJSON()[0].backend, backend2);
        assert.equal(data.frontends.toJSON()[0].backend, backend1);

        // if data changes the frontend back, fe should get it again
        data.setFrontend({ name: name, bind: bind, backend: backend3 });
        setTimeout(function() {
          assert.deepEqual(data.frontends.toJSON(), replica.frontends.toJSON());
          done();
        }, 10);
      }, 10);

    }, 10);
  });

  it ('should generate predictable ids', function () {
    var data = new Data();
    var name = 'penguin';
    assert('frontend/'+name, data.frontendId(name));
    assert('backend/'+name, data.backendId(name));
  });

  it ('should set frontend stat', function (done) {
    var data = new Data();
    var frontendName = 'foo';

    data.stats.on('changes', function (row) {
      var stat = row.toJSON();
      assert.equal(stat._type, 'stat');
      assert.equal(stat.name, frontendName);
      assert.equal(stat.id, 'stat/frontend/' + frontendName);
      assert.equal(stat.frontend, 'frontend/' + frontendName);
      assert.equal(stat.status, 'UP 2/3');
      done();
    });
    data.setFrontendStat({ id: 'stat/frontend/' + frontendName, name: frontendName, status: 'UP 2/3' });
  });

  it ('should set backend stat', function (done) {
    var data = new Data();
    var backendName = 'foo';

    data.stats.on('changes', function (row) {
      var stat = row.toJSON();
      assert.equal(stat._type, 'stat');
      assert.equal(stat.name, backendName);
      assert.equal(stat.id, 'stat/backend/' + backendName);
      assert.equal(stat.backend, 'backend/' + backendName);
      assert.equal(stat.status, 'DOWN');
      done();
    });
    data.setBackendStat({ id: 'stat/backend/' + backendName, name: backendName, status: 'DOWN' });
  });

  it ('should set backend member stat', function (done) {
    var data = new Data();
    var backendName = 'foo';
    var memberName = 'boo-member';
    var id = 'stat/backend/' + backendName + '/' + memberName;

    data.stats.on('changes', function (row) {
      var stat = row.toJSON();
      assert.equal(stat._type, 'stat');
      assert.equal(stat.name, memberName);
      assert.equal(stat.id, 'stat/backend/' + backendName + '/' + memberName);
      assert.equal(stat.backend, 'backend/' + backendName);
      assert.equal(stat.status, 'DOWN 1/2');
      done();
    });
    data.setBackendMemberStat({ id: id, name: memberName, backendName: backendName, status: 'DOWN 1/2' });
  });

});