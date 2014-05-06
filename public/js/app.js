angular.module('crowsnest', ['LocalStorageModule'])
  .config(['$routeProvider', '$locationProvider', function($routeProvider, $locationProvider) {
    $routeProvider  
        .when('/', {redirectTo:'/overview'})
        .when('/overview', {templateUrl: '/templates/poolDetailView.html',   controller: 'PoolDetailController', active: 'overview'})
        .when('/activity', {templateUrl: '/templates/activityView.html', controller: 'ActivityController', active: 'activity'})
    $locationProvider.html5Mode(true);
  }])
  .directive('connectionStatus', function () {
    return {
      restrict: 'E',
      controller: 'ConnectionController',
      templateUrl: '/templates/connection.html'
    };
  })

  .directive('timeSeries', function () {

    return {
      restrict: 'E',
      scope: { // attributes bound to the scope of the directive
        data: '=data'
      },
      link: function (scope, element, attrs) {
        var width = parseInt(attrs.width || 300, 10);
        var height = parseInt(attrs.height || 100, 10);
        var color = attrs.color || 'steelblue';
        var type = attrs.type || 'line';
        var axis = (attrs.axis) ? true : false;

        var graph = new Rickshaw.Graph( {
            element: element[0], 
            width: width,
            height: height,
            renderer: type,
            preserve: true,
            stroke: true,
            series: [{
                color: color,
                data: [{x: 0, y: 0}]
            }]
        });

        if (axis) {
          var xAxis = new Rickshaw.Graph.Axis.Time( {
            graph: graph,
            ticksTreatment: 'glow'
          } );

          xAxis.render();

          var yAxis = new Rickshaw.Graph.Axis.Y( {
            graph: graph,
            tickFormat: Rickshaw.Fixtures.Number.formatKMBT,
            ticksTreatment: 'glow',
            pixelsPerTick: Math.ceil(height/2)
          } );

          yAxis.render();
        }

        scope.$watch('data', function (value, oldVal) {
          if (!value) return;
          var data = value; //JSON.parse(value);
          if (typeof data[0] === 'number') {
            var i = 0;
            data = data.map(function(y) { return { x: i++, y: y }; });
          }
          graph.series[0].data = data;
          graph.render();
        });
      }
    };
  })


  .directive('serversDonut', function () {

    return {
      restrict: 'E',
      link: function (scope, element, attrs) {

        // SETUP CHART SIZE VARIABLES
        var width = 80,
            height = 80,
            borderThickness = 5,
            donutColor = "#ddd",
            backgroundDonutColor = "#ddd",
            labelTopMargin = 5, // Horizontal Fudge Factor
            t = 2 * Math.PI; // http://tauday.com/tau-manifesto

        var arc = d3.svg.arc()
            .innerRadius((height / 2) - borderThickness)
            .outerRadius(height / 2)
            .startAngle(0);

        // DRAW CANVAS
        var svg = d3.select(element[0]).append("svg")
            .attr("class", "donut")
            .attr("width", width)
            .attr("height", height)
            .append("g")
            .attr("transform", "translate(" + width / 2 + "," + height / 2 + ")");

        // DRAW BACKGROUND ARC
        var background = svg.append("path")
            .datum({endAngle: t})
            .style("fill", backgroundDonutColor)
            .attr("d", arc);

        // SET THE START OF THE Animation at 0
        var foreground = svg.append("path")
            .datum({endAngle: 0})
            .style("fill", donutColor)
            .attr("d", arc);

        // TEXT Label
        var donutLabel = svg.append("text")
            .attr("x", 0)
            .attr("y", labelTopMargin)
            .style("text-anchor", "middle")
            .style("font-size", "18px")
            .style("font-weight", "400")
            .text(0 + "/" + 0);

        var total = parseInt(attrs.total, 10) || 0, 
            healthy = parseInt(attrs.healthy, 10) || 0,
            angleToDraw = 0;

        attrs.$observe('total', function(value) {
          total = parseInt(value, 10);
          reDraw();
        });
        attrs.$observe('healthy', function(value) {
          healthy = parseInt(value, 10);
          reDraw();
        });

        // CHECK THE DATA AND DO STUFF IF ITS CHANGED
        function reDraw() {
          data = [];

          // CHANGE THE COLOR OF THE DONUT
          var ratio = (total !== 0) ? healthy / total : 0;

          if (ratio >= 0.7) {
            donutColor = "#2CCE10"; // GREEN
          } else if (ratio < 0.7 && ratio > 0.4) {
            donutColor = "#E7BE23"; // YELLOW
          } else {
            donutColor = "#F83E32"; // RED
          }

          angleToDraw = ratio; // New Angle for tween

          if (ratio === 0 && healthy === 0) {
            donutColor = "#F83E32";
            angleToDraw = 1;
          }

          fireTween();
        }

        // ANIMATES to % of servers up
        function fireTween() {
          foreground.transition()
              .duration(750)
              .style("fill", donutColor)
              .call(arcTween, angleToDraw * t );
          donutLabel.transition()
              .duration(750)
              .text(healthy + "/" + total);
        }

        // ARC TWEEN FUNCTION
        function arcTween(transition, newAngle) {
          transition.attrTween("d", function(d) {
            var interpolate = d3.interpolate(d.endAngle, newAngle);
            return function(t) {
              d.endAngle = interpolate(t);
              return arc(d);
            };
          });
        }
      }
    };
  })








  .directive('favoriteBarChart', function () {

    //Width and height
    var width = 500;
    var height = 80;
    var barPadding = 1;

    return {
      restrict: 'E',
      link: function (scope, element, attrs) {

        // constants
        var serverNameHolder = ''; //serverName;
        var ipAddressHolder = ''; //ipAddress;

        // set up initial svg object
        var chart = d3.select(element[0])
          .append("svg")
            .attr("class", "chart")
            .attr("width", width)
            .attr("height", height);

        attrs.$observe('data', function(value) {
          // clear the elements inside of the directive
          chart.selectAll('*').remove();

          // if 'val' is undefined, exit
          if (!value) {
            return;
          }

          var data = JSON.parse(value);//newVal;
          console.log(data);
          var y = d3.scale.linear().domain([0, d3.max(data, function(datum) { return datum; })]).rangeRound([0, height]);

          chart.selectAll("rect")
             .data(data)
             .enter()
             .append("rect")
             .attr("x", function(d, i) {
                return i * (width / data.length - 0.5); // .5 sharpens the bars on pixels
              })
             .attr("y", height - 1)
             .attr("width", width / data.length - barPadding)
             .attr("height", 1);


          function animateInitial() {
            chart.selectAll("rect")
            .data(data)
            // .transition()
            // .duration(1000)
            .attr("x", function(d, i) {
                return i * (width / data.length - 0.5); // .5 sharpens the bars on pixels
              })
            .attr("y", function(datum) { return height - y(datum); })
            .attr("width", width / data.length - barPadding)
            .attr("height", function(datum) { return y(datum); });
          }

          animateInitial();

          chart.append("text")
              .attr("x", 0)
              .attr("y", 20)
              .style("text-anchor", "start")
              .style("font-size", "20px")
              .style("font-weight", "500")
              .text(serverNameHolder);

          chart.append("text")
              .attr("x", 0)
              .attr("y", 40)
              .style("text-anchor", "start")
              .style("font-size", "14px")
              .style("font-weight", "700")
              .text(ipAddressHolder);

          chart.append("text")
              .attr("x", width - 15)
              .attr("y", 20)
              .style("text-anchor", "end")
              .style("font-size", "14px")
              .style("font-weight", "500")
              .text("Connections " + data[data.length - 1]);
        });
      }
    };
});
