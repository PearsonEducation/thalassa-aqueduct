Thalassa Aqueduct
=================

# Overview

Aqueduct is a part of the [Thalassa](https://github.com/PearsonEducation/thalassa) system of components. Thalassa is primarily geared to enable continuous deployment scenarios through dynamic configuration of [HAProxy](http://haproxy.1wt.eu/) load balancers and seamless, no connection drop A/B deploys. Aqueduct is the node.js service that manages and controls an HAProxy server.

Aqueduct exposes a REST API for configuring HAProxy and can dyanmically set HAProxy backends members based on the `name ` and `version` of Thalassa registered services. Aqueduct leverages HAProxy's ability to gracefully reload config without any interruption to user, in other words, without dropping any connections.

The Thalassa version of Aqueduct has been updated to use [@3rd-Eden](https://github.com/3rd-Eden)'s [haproxy](https://github.com/observing/haproxy) module to manage and control the HAProxy process.

## HAProxy Fundamentals

Aqueduct does not try to obfuscate HAProxy, and it's important to know the fundamentals of how HAProxy works to understand Aqueduct. The API mirrors HAProxy's semantics. The [HAProxy documentation](http://cbonte.github.io/haproxy-dconv/configuration-1.4.html) contains a wealth of detailed information.

1. **Frontends** - A "frontend" section describes a set of listening sockets accepting client
connections.

2. **Backends** - A "backend" section describes a set of servers to which the proxy will connect
to forward incoming connections.

3. **Members/Servers** - Aqueduct calls the servers that *backends* route to "members". In other words, members of a backend pool of servers.

4. **Config file** - At startup, HAProxy loads a configuration file and never looks at that file again. Aqueduct manages this by re-templating a new config file and gracefully restarting the HAProxy process.

5. **Stats Socket** - a UNIX socket in stream mode that will return various statistics outputs and even allows some basic configuration tweaking like enabling and disabling existing backend members, setting weights, etc. Aqueduct connects to this socket and provides realtime streaming stats over a web socket stream.


# Installation

    npm install thalassa-aqueduct
    
# Running

The easiest way to run Aqueduct at this point is with the bin script from the command line. Aqueduct is exposed as a module and can be used as such in your own application but you should have [a close look](https://github.com/PearsonEducation/thalassa-aqueduct/blob/master/bin/server.js#L88) at how the Hapi server and web socket stream is configured.

    ./node_modules/.bin/thalassa-aqueduct 
 
## Options

     ./node_modules/.bin/thalassa-aqueduct --help
    Options:
      --host               host to bind to                           [default: "0.0.0.0"]
      --port               port to bind to                           [default: 10000]
      --label              logical label for this aqueduct
      --thalassaHost       host of the Thalassa server               [default: "127.0.0.1"]
      --thalassaPort       socket port of the Thalassa server        [default: 5001]
      --thalassaApiPort    http API port of the Thalassa server      [default: 9000]
      --haproxySocketPath  path to Haproxy socket file               [default: "/tmp/haproxy.status.sock"]
      --haproxyPidPath     path to  Haproxy pid file                 [default: "/var/run/haproxy.pid"]
      --haproxyCfgPath     generated Haproxy config location         [default: "/etc/haproxy/haproxy.cfg"]
      --templateFile       template used to generate Haproxy config  [default: "default.haproxycfg.tmpl"]
      --persistence        directory to save configuration
      --sudo               use sudo when starting haproxy
      --debug              enabled debug logging
      --dbPath             filesystem path for leveldb               [default: "./node_modules/thalassa-crowsnest/bin/db"] 

For example the command to run might look something like this (typically how I run locally):

	./node_modules/.bin/thalassa-aqueduct --haproxyCfgPath  /tmp/haproxy.cfg --debug --persistence \
	  '/tmp/aqueduct.json' --templateFile dev.haproxycfg.tmpl --haproxyPidPath /tmp/haproxy.pid  \
	  --label 'myapp-dev'

# Web UI

Aqueduct provides a web UI that allows users to get a visual representation of the frontends/backends/member data related to their haproxy instance (via the 'overview' page), as well as some insight into the activity (haproxy config changes, online/offline events) occuring within Aqueduct (via the 'activity' page). 

The UI can be accessed on the port specified by the --port parameter (by default port 10000). 

e.g. http://127.0.0.1:10000 would access the web UI on localhost at the default port of 10000

# HTTP API

### GET `/frontends`

Returns Array of `frontend` objects for all of the frontends configured for this Aqueduct server.

For example:

    [{
        "id": "frontend/myapp",
        "_type": "frontend",
        "key": "myapp",
        "bind": "*:8080,*:80",
        "backend": "live",
        "mode": "http",
        "keepalive": "default",
        "rules": [{
            "type": "header",
            "header": "host",
            "operation": "hdr_dom",
            "value": "staged.myapp.com",
            "backend": "staged"
        }],
        "natives": []
    }]


### GET `/frontends/{key}`

Gets a specific frontend by `key`. Expect a response status code of `200` otherwise `404`.


### PUT `/frontends/{key}`

Create or update a `frontend` by `key`. `PUT` with a `Content-Type` of `application/json` and a body like:

    {
        "bind": "10.2.2.2:80,*:8080" // IP and ports to bind to, comma separated, host may be *
      , "backend": "foo"      // the default backend to route to, it must be defined already
      , "mode": "tcp"         // default: http, expects tcp|http
      , "keepalive": "close"  // default: "default", expects default|close|server-close
      , "rules": []           // array of rules, see next section
      , "natives": []         // array of strings of raw config USE SPARINGLY!!
    }

#### Routing Rules

There are currently 3 types of rules that can be applied to frontends: `path`, `url`, and `header`.

Path rules support `path`, `path_beg`, and `path_reg` HAProxy operations

	{
	    "type": "path"
	  , "operation": "path|path_beg|path_reg"
	  , "value": "favicon.ico|/ecxd/|^/article/[^/]*$"
	  , "backend": "foo" // if rule is met, the backend to route the request to
	}


Url rules support `url`, `url_beg`, and `url_reg` HAProxy operations

	{
	    "type": "url"
	  , "operation": "url|url_beg|url_reg"
	  , "value": "/bar" // value for the operation
	  , "backend": "bar" // if rule is met, the backend to route the request to
	}

Header rules support `hdr_dom` with a entire value at this point

	{
	    "type": "header"
	  , "header": "host"			// the name of the HTTP header
	  , "operation": "hdr_dom"
	  , "value": "baz.com"
	  , "backend": "baz" // if rule is met, the backend to route the request to
	}

#### Natives

The natives property is an end around way to insert raw lines of config for front ends and backends. Use them sparingly but use them if you need them.


### DELETE `/frontends/{key}`

Delete a specific frontend by `key`. Expect `200` or `404`


### GET `/backends`

Returns Array of `backend` objects for all of the backends configured for this Aqueduct server.

For example:

    [{
    	"id": "backend/live",
    	"_type": "backend",
    	"key": "live",
    	"type": "dynamic",
    	"name": "classroom-ui",
    	"version": "1.0.0",
    	"balance": "roundrobin",
    	"host": null,
    	"mode": "http",
    	"members": [{
    		"name": "myapp",
    		"version": "1.0.0",
    		"host": "10.10.240.121",
    		"port": 8080,
    		"lastKnown": 1378762056885,
    		"meta": {
    			"hostname": "dev-use1b-pr-01-myapp-01x00x00-01",
    			"pid": 17941,
    			"registered": 1378740834616
    		},
    		"id": "/myapp/1.0.0/10.10.240.121/8080"
    	},
    	{
    		"name": "myapp",
    		"version": "1.0.0",
    		"host": "10.10.240.80",
    		"port": 8080,
    		"lastKnown": 1378762060226,
    		"meta": {
    			"hostname": "dev-use1b-pr-01-myapp-01x00x00-02",
    			"pid": 18020,
    			"registered": 1378762079883
    		},
    		"id": "/myapp/1.0.0/10.10.240.80/8080"
    	}],
    	"natives": []
    }]


### PUT `/backends/{key}`

Create or update a `backend` by `key`. `PUT` with a `Content-Type` of `application/json` and a body like:

    {
        "type" : "dynamic|static" 
      , "name" : "foo" // only required if type = dynamic
      , "version" : "1.0.0" // only required if type = dynamic
      , "balance" : "roundrobin|source" // defaults to roundrobin
      , "host" : "myapp.com"  // default: undefined, if specified request to member will contain this host header
      , "health" : {                 // optional health check
      	  "method": "GET"            // HTTP method
      	, "uri": "/checkity-check"   // URI to call
      	, "httpVersion": "HTTP/1.1"  // HTTP/1.0 or HTTP/1.1 `host` required if HTTP/1.1
      	, "interval": 5000           // period to check, milliseconds
      }
      , "mode" : "http|tcp" // default: http
      , "natives": []  // array of strings of raw config USE SPARINGLY!!
      , "members" : [] // if type = dynamic this is dynamically populated based on role/version subscription
                       // otherwise expects { host: '10.10.10.10', port: 8080}
    }

### GET `/backends/{key}`

Gets a specific `backend` by `key`. Expect `200` else `404`.


### DELETE `/backends/{key}`

Delete a specific `backend` by `key`. Expect `200` or `404`



### POST `/backends/{key}`

Update a `backend`s `role` and `version` Subscription with a `Content-Type` of `application/json` and a body like:

    {
        "name": "myapp"		// app name registered to thalassa
      , "version": "1.1.0" // version to route to
    }

`name` is actually optional. You may also just send the `version`:

    {
        "version": "1.1.0"
    }


### GET `/haproxy/config`

Return the last know generated HAProxy config file contents that were written to the location of `opts.haproxyCfgPath`.


    global
	  log 127.0.0.1 local0
	  log 127.0.0.1 local1 notice
	  daemon
	  maxconn 4096
	  user haproxy 
	  group haproxy 
	  stats socket /tmp/haproxy.status.sock user appuser level admin

	  defaults
	    log global
	    option dontlognull
	    option redispatch
	    retries 3
	    maxconn 2000
	    timeout connect 5000ms
	    timeout client 50000ms
	    timeout server 50000ms

	  listen stats :1988
	    mode http
	    stats enable
	    stats uri /
	    stats refresh 2s
	    stats realm Haproxy\ Stats
	    stats auth showme:showme


	  frontend myapp
	    bind *:8080,*:80
		mode http
		default_backend live
		option httplog
		option http-server-close
		option http-pretend-keepalive
		acl header_uv7vi hdr_dom(host) myapp-staged.com
		use_backend staged if header_uv7vi



	  backend live
	    mode http
		balance roundrobin
		server live_10.10.240.121:8080 10.10.240.121:8080 check inter 2000
		server live_10.10.240.80:8080 10.10.240.80:8080 check inter 2000

	  backend staged
	    mode http
		balance roundrobin
		server staged_10.10.240.174:8080 10.10.240.174:8080 check inter 2000
		server staged_10.10.240.206:8080 10.10.240.206:8080 check inter 2000


# Known Limitations and Roadmap

Thalassa currently doesn't implement any type of authentication or authorization and at this point expects to be running on a trusted private network. This will be addressed in the future. Ultimately auth should be extensible and customizable. Suggestions and pull requests welcome!

# License

Licensed under Apache 2.0. See [LICENSE](https://github.com/PearsonEducation/thalassa-aqueduct/blob/master/LICENSE) file.
