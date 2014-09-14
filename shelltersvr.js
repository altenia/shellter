var Hapi = require("hapi");
var nconf = require('nconf');

nconf.argv()
       .env()
       .file({ file: './conf/shellter.conf.json' });

var port = nconf.get('port');
var baseDir = nconf.get('baseDir');
var logConf = nconf.get('log');

var server = new Hapi.Server(port, {
    cors: true
});

server.pack.register([
	    { plugin: require("lout") },
	    { plugin: require("./index"), options: { baseDir: baseDir, log: logConf}
    }
], function(err) {
    if (err) throw err;
    server.start(function() {
        console.log("Shellter server started @ " + server.info.uri);
    });
});