angular.module('crowsnest').controller('ConnectionController', function ($scope, dataStream) {
  var c = dataStream.connection;
  var interval = null;

  $scope.count = ' ';
  $scope.status = c.state;

  $scope.toggle = function () {
    setTimeout(function() {
      c.state === 'connected' ? c.disconnect() : c.connect();
    }, 1);
  };

  // r.on('reconnect', function (n, d) {
  //   var delay = Math.round(d / 1000) + 1;
  //   clearInterval(interval)
  //   $scope.count = delay;
  //   $scope.status = 'disconnected';
  //   $scope.$apply();
  //   interval = setInterval(function () {
  //     $scope.count = (delay > 0 ? --delay : 0);
  //     $scope.status = (delay ? 'disconnected' :'connecting');
  //     $scope.$apply();
  //   }, 1e3)
  // });

  c.on('connected',   function () {
    //$scope.count = ' ';
    $scope.status = 'connected';
    //clearInterval(interval)
    $scope.$apply();
  })

  c.on('connecting',   function () {
    //$scope.count = ' ';
    $scope.status = 'connecting';
    //clearInterval(interval)
    $scope.$apply();
  })

  c.on('disconnected', function () {
    $scope.status = 'disconnected';
    $scope.$apply();
  })

  c.on('stopped', function () {
    $scope.status = 'disconnected';
    $scope.$apply();
  })

});