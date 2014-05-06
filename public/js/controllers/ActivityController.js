angular.module('crowsnest').controller('ActivityController', function ($scope, dataStream) {
  $scope.activity = dataStream.getActivity();

  dataStream.on('activity-changed', function (s) {
    $scope.activity = dataStream.getActivity();
    $scope.$apply();
  });

});