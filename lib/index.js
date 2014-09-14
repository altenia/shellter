// Load modules
var fs = require('fs');
var path = require('path');
var childProc = require('child_process');
var Hoek = require('hoek');
var Handlebars = require('handlebars');
var mime = require('mime');

var utils = require('./utils');
var FileUtil = require('./fileutil').FileUtil;

var SHELLTER_VER = "0.0.1+20140912";


// Declare internals
var internals = {
    defaults: {
        pathPrefix: "/shellter",
        basePath: path.join(__dirname, '..', 'templates'),
        publicPath: path.join(__dirname, '..', 'public'),
        helpersPath: path.join(__dirname, '..', 'templates', 'helpers'),
        partialsPath: path.join(__dirname, '..', 'templates'),
        indexTemplate: 'index',
        routeTemplate: 'route',
        allowedShellCommands: ['make', 'ls'];
    }
};

var FILES_PATH = '/files';

/**
 * Route endpoints:
 * List of files: /shellter/files/* (GET)
 *      Returns [if file] -> content
 *              [if folder] -> list of sub folders/files
 * File command : /shellter/files/command (POST)
 *      E.g. delete, copy, mv
 * Shell command: /shellter/shell/command (POST)
 */
exports.register = function(plugin, options, next) {
    
    console.log(JSON.stringify(options));

    var logger_ = utils.getLogger('shellter', options['log']);

	settings = Hoek.applyToDefaults(internals.defaults, options);
    
    // baseDir not provided, go down two level
    var baseDir = settings.baseDir || path.resolve(__dirname) + '/../../repos';
    baseDir = path.normalize(baseDir);
    if (!utils.endsWith(baseDir, '/')) {
        baseDir += '/';
    }
    if (!fs.existsSync(baseDir)) {
        logger_.error({"baseDir": baseDir}, "Base Directory not found.");
    }
    if (!fs.statSync(baseDir).isDirectory()) {
        logger_.error({"baseDir": baseDir}, "baseDir is not a directory.");
    }

    logger_.info({"baseDir": baseDir}, "Registering Shellter plugin");

    plugin.views({
        engines: settings.engines || {
            html: {
                module: Handlebars
            }
        },
        path: settings.basePath,
        partialsPath: settings.partialsPath,
        helpersPath: settings.helpersPath
        
    });

    /**
     * Index web page
     */
    plugin.route({
        path: settings.pathPrefix + '/index.html',
        method: "GET",
        handler: function(request, reply) {

            var serverInfo = {
                SHELLTER_VER: SHELLTER_VER,
                baseDir : baseDir
            };
            return reply.view(settings.indexTemplate, serverInfo);
        }
    });

    /**
     * Public web assets
     */
    plugin.route({
        method: 'GET',
        path: settings.pathPrefix + '/public/{path*}',
        config: {
            handler: {
                directory: {
                    path: settings.publicPath,
                    index: false,
                    listing: false
                }
            },
            plugins: {
                lout: false
            }
        }
    });

    /**
     * API: Server info
     */
    plugin.route({
        path: settings.pathPrefix,
        method: "GET",
        handler: function(request, reply) {

            var response = {
                GITRIUM_VER: GITRIUM_VER,
                baseDir : baseDir
            };
            reply(response, 200);
        }
    });


    /**
     * API: files info
     */
    plugin.route({
        path: settings.pathPrefix + FILES_PATH,
        method: "GET",
        handler: function(request, reply) {
            var fileInfos = getFileInfos(baseDir);
            var response = {
                    files : fileInfos
                };
            reply(response, 200);
        }
    });


    /**
     * API: files info
     */
    plugin.route({
        path: settings.pathPrefix + FILES_PATH + '/{relativePath*}',
        method: "GET",
        handler: function(request, reply) {
            var fullPath = baseDir + request.params.relativePath;

            if (fs.existsSync(fullPath)) {
                if (fs.statSync(fullPath).isFile()) {
                    handleFile(fullPath);
                }
                else if (fs.statSync(fullPath).isDirectory()) {
                    handleDirectory(fullPath);
                }
            }

            function handleFile(path)
            {
                fs.readFile(path, function(error, content) {
                    if (error) {
                        response.writeHead(500);
                        response.end();
                    }
                    else {
                        var mimeType = mime.lookup(path);
                        reply(content, 200).type(mimeType);
                    }
                });
            }

            function handleDirectory(path)
            {
                var fileInfos = getFileInfos(path);
                var response = {
                        files : fileInfos
                    };
                reply(response, 200);
            }
        }
    });


    /**
     * File command : /shellter/command(POST)
     * Payload:
     * {
     *     relativePath: {string} - relative path
     *     command: {string} - Command e.g.: shell, copy
     *     params: {object} - Parameters to be passed to the command
     * }
     */
    plugin.route({
        path: settings.pathPrefix + '/command',
        method: "POST",
        handler: function(request, reply) {
            var fullPath = baseDir + request.payload.relativePath;

            var command = request.payload.command;

            var response = {};
            if (fs.existsSync(fullPath))
            {
                if (command == 'shell') {
                    var args = request.payload.params.args;
                    var argList = args.split(' ').filter(function(val){
                            return (val.length > 0);
                        });

                    logger_.info({fullPath: fullPath}, "Shell command");
                    var shellCommand = argList.shift();
                    if (!shellCommand || shellCommand.length === 0) {
                        reply({error:"Command is empty."}, 400);
                        return;
                    }
                    runCommandLine(fullPath, shellCommand, argList, function(error, data) {
                        if (error) {
                            reply({error: error, data: data}, 500);
                        } else {
                            reply(data, 200);
                        }
                    });
                }


            } else {
                response = {error: 'File not found'};
                reply(response, 404);
            }
        }
    });

    /**
     * API: Shell command
     */
    plugin.route({
        path: settings.pathPrefix + FILES_PATH + '/{repoName}',
        method: "DELETE",
        handler: function(request, reply) {
            var fullPath = baseDir + request.params.relativePath;

            var response = {};
            if (fs.existsSyc(fullPath))
            {
                logger_.info({repoPath: repoPath}, "Removing file.");

            } else {
                response = {error: 'File not found'};
                reply(response, 404);
            }
        }
    });

    next();
};
 
exports.register.attributes = {
    pkg: require("../package.json")
};

/**
 * Returns list of folders
 */
function getFileInfos(path) {
    if (!utils.endsWith(path, '/')) {
        path += '/';
    }
    var files = fs.readdirSync(path);
    var infos = [];
    for(var i=0; i < files.length; i++) {
        var fileName = files[i];
        var rawStat = fs.statSync(path + fileName);

        var type = null;
        if (rawStat.isFile()) {
            type = 'file';
        } else if (rawStat.isDirectory()) {
            type = 'directory';
        }
        var info = {
                name: fileName,
                type: type,
                uid: rawStat.uid,
                gid: rawStat.gid,
                atime: rawStat.atime,
                ctime: rawStat.ctime,
                mtime: rawStat.mtime,
                size: rawStat.size,
                permission: parseInt(rawStat.mode.toString(8), 10),
            };
        infos.push(info);
    }

    return infos;
}

/**
 * onclose {function(err, data)} The callback function
 */
function runCommandLine(cwd, command, argList, onclose){
    var spawnOpts = {
            cwd: cwd,
            env: process.env
        }
    var spawned = childProc.spawn(command, argList, spawnOpts);
    var stdout = '', 
        stderr = '';
    spawned.stdout.on('data', function(data){
        stdout += data;
    });
    spawned.stderr.on('data', function(data){
        stderr += data;
    });
    spawned.on('close', function(code){
        var error = null;
        if (code !== 0) {
            error = 'Error code ' + code;
        }
        stdout = stdout.split("\n");
        stderr = stderr.split("\n");
        onclose(error, {stdout: stdout, stderr: stderr} );
    });
}