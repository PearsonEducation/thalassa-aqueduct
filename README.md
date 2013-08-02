thalassa-aqueduct
=================

Dynamic haproxy load balancer and configuration. Part of Thalassa


`npm install thalassa-aqueduct`

	var Aqueduct = require('thalassa-aqueduct');
	var opts = {
		...
	};
	var aqueduct = new Aqueduct(opts);
	var server = Hapi.createServer(localhost, 8080;
	server.route(aqueduct.apiRoutes());
	aqueduct.bindReadableWebsocketStream(server);
