var sys = require('sys');
var childProc = require('child_process');

var utils = require('./utils');

var internals = {};

module.exports.Repo = function(reporDir) {

    this.dir = reporDir;
    this.gitArgs = ['--git-dir="' + this.dir + '/.git"', '--work-tree="' + this.dir + '/"'];

    /**
     * Combination of status and log
     */
    this.getInfo = function(callback) {
        that = this;
        this.status(null, function(statusErr, statusData) {
            that.log({count:1}, function(logErr, logData) {
                var repoInfo = statusData['result'] || {};
                if (logData && logData.result) {
                    repoInfo.lastCommit = logData.result.logs[0];
                }
                var err = statusErr || logErr;
                callback(err, repoInfo);
            });
        });
    }

    this.add = function(params, callback) {
        var  extraArgs = [this.dir];
        if (params && params.args)
        {
            extraArgs.push(params.args);
        }

        this.runGit_('add', extraArgs, callback);
    };

    this.branch = function(params, callback) {
        var extraArgs = [];
        if (params && params.args)
        {
            extraArgs.push(params.args);
        }

        this.runGit_('branch', extraArgs, callback);
    };

    // checkout <branch>
    this.checkout = function(params, callback) {
        var extraArgs = [];
        if (params && params.args)
        {
            extraArgs.push(params.args);
        }
        if (params && params.branch)
        {
            extraArgs.push(params.branch);
        }

        this.runGit_('checkout', extraArgs, callback);
    };
    
    // commit -a -m <comment>
    this.commit = function(params, callback) {
        if (params && params.message)
        {
            var extraArgs = [];
            this.runGit_('commit', extraArgs, callback);
        } else {
            var errObj = {status:400, message:"Missing required arguments"};
            callback(errObj, null);
        }
    };


    this.describe = function(params, callback) {
        this.runGit_('describe', [], callback);
    };

    // log
    this.log = function(params, callback) {
        // %x09 --> tab
        var extraArgs = ['--date=iso', '--pretty=format:"%h%x09%an%x09%ad%x09%s"'];
        if (params && params.count)
        {
            extraArgs.push('-n' + params.count);
        }
        this.runGit_('log', extraArgs, callback);
    };

    // pull <remote> [<branch>]
    this.pull = function(params, callback) {
        var  extraArgs = [];
        if (params && params.remoteRepo)
        {
            extraArgs.push(params.remoteRepo);
        }
        this.runGit_('pull', extraArgs, callback);
    };

    // push <remote> [<branch>]
    this.push = function(params, callback) {
        this.runGit_('push', extraArgs, callback);
    };

    // status
    this.status = function(params, callback) {
        this.runGit_('status', [], callback);
    };

    // submodule update --init
    this.submodule = function(params, callback) {
        var  extraArgs = [];
        if (params && params.remoteRepo)
        {
            extraArgs.push(params.remoteRepo);
        }
        this.runGit_('submodule', args, callback);
    };

    this.runGit_ = function(command, extraArgs, callback)
    {
        var gitCli = new internals.GitCli_();
        gitCli.run(this.gitArgs, command, extraArgs, callback);
    };
};

module.exports.Repo.clone = function (url, destination, params, callback)
{
    var gitCli = new internals.GitCli_();
    var args = [url, destination];
    gitCli.run(null, 'clone', args, callback);
};


internals.GitCli_ = function() {

    this.logger_ = utils.getLogger('gitcli');


    var SUPPORTED_GIT_COMMANDS = ['add', 'clone', 'commit', 'checkout', 'log', 'pull', 'push', 'status', 'submodule'];

    // git clone <url>
    // git commit -a -m <comment>
    // git submodule update --init
    // git checkout <branch>
    // git add . -A
    /**
     * Executs git using cli
     * @param {string} command      The git command
     * @param {Array<string>} args  The git command arguments
     * @param {func(err, result)}   The callback
     */
    this.run = function(gitArgs, command, cmdArgs, callback)
    {
        var gitArgList = (gitArgs) ? gitArgs.join(' ') : '';
        var cmdArgList = (cmdArgs) ? cmdArgs.join(' ') : '';
        var commandLine = 'git ' + gitArgList + ' '  + command + ' ' + cmdArgList;
        
        //childProc.exec(commandLine, parseOutput_);

        var argList = [];
        argList.push(command);
        argList = argList.concat(cmdArgs);

        this.logger_.debug({gitCommand: command, commandLine: commandLine}, 'Executing git CLI');

        var spawnOpts = {
                cwd: this.dir,
                env: process.env
            }
        var spawned = childProc.spawn('git', argList, spawnOpts);
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
            parseOutput_(error, stdout, stderr);
        });

        function parseOutput_(error, stdout, stderr)
        {
            var response = {stdout: stdout};
            if (error !== null)
            {
                response.error = error['message'] || stderr;
                callback(stderr, response);
            } else {
                var result = parseOutput(command, stdout);
                response.stderr = stderr;
                response.result = result;
                callback(null, response);
            }
        }
    };

    // OutputParser
    function parseOutput(command, output)
    {
        if (internals.outputParser[command]) {
            return internals.outputParser[command](output);
        } else {
            return null;
        }
    }
};

internals.outputParser = {
    add: function(output) {
        return {};
    },
    clone: function(output) {
        return {};
    },
    /**
     * Returns {locals:, remotes:, current:}
     */
    branch: function(output) {
        var result = {
            branches: []
        };

        var lines = output.split('\n');
        var arrayLength = lines.length;
        for (var i = 0; i < arrayLength; i++) {
            var line = lines[i].trim();
            if (line.length > 0) {
                var tokens = line.split(' ');
                var branchInfo = {};
                if (tokens[0] == '*') {
                    result['current'] = tokens[1];
                    branchInfo = {
                        name: tokens[1],
                        type: "local"
                    };
                } else {
                    if (tokens[0].indexOf('remotes/') === 0) {
                        var secondSlash = tokens[0].indexOf('/', 8);
                        branchInfo = {
                            name: tokens[0].substring(secondSlash+1),
                            type: "remote",
                            location: tokens[0].substring(8, secondSlash)
                        };
                    } else if (tokens[0].length > 0) {
                        branchInfo = {
                            name: tokens[0],
                            type: "local"
                        };
                    }
                }
                result.branches.push(branchInfo);
            }
        }
        return result;

    },
    log: function(output) {
        var result = {
            logs: []
        };
        var lines = output.split('\n');
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            var tokens = line.split("\t");
            result.logs.push({
                hash: tokens[0],
                author: tokens[1],
                date: tokens[2],
                subject: tokens[3]
            });
        }

        return result;
    },
    status: function(output) {
        var result = {
            modified: [],
            deleted: [],
            untracked: []
        };
        var lines = output.split('\n');
        var scope = 0; // 1= uncommitted; 2=untracked
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            // Some version has "# " prefixing each line, remove them
            if (line.indexOf('# ') === 0) {
                line = line.substring(2);
            }
            if (line.indexOf('On branch') === 0) {
                result.currentBranch = line.substring(10);
            } else {
                if (line.indexOf('Changes not staged for commit:') === 0) {
                    scope = 1;
                }
                if (line.indexOf('Untracked files:') === 0) {
                    scope = 2;
                }
                if (line.indexOf("\t") ===0) {
                    if (scope === 1) {
                        var tokens = line.trim().split(' ').filter(function(el) {return el.length != 0});
                        if (tokens[0] === 'modified:') {
                            result.modified.push(tokens[1]);
                        } else if (tokens[0] === 'deleted:') {
                            result.deleted.push(tokens[1]);
                        }
                    } else if (scope === 2) {
                        result.untracked.push(line.trim());
                    }
                }
            }
            
        }

        return result;
    },
    /*,
    commit: function(output) {
    },
    checkout: function(output) {

    },
    pull: function(output) {

    },
    push: function(output) {

    },
    
    submodule: function(output) {

    }*/
};


/*
clone
Cloning into 'node-gitteh'...
remote: Counting objects: 3539, done.
remote: Total 3539 (delta 0), reused 0 (delta 0)
Receiving objects: 100% (3539/3539), 1.85 MiB | 998.00 KiB/s, done.
Resolving deltas: 100% (1441/1441), done.
Checking connectivity... done.



status
On branch master
Changes to be committed:
  (use "git reset HEAD <file>..." to unstage)

    new file:   app.js
    modified:   index.js
    new file:   lib/index.js
    new file:   lib/simplegitcli.js
    modified:   package.json
*/