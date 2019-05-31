module.exports = {
    apps: [{
        name: 'wifaq-result',
        script: './index.js',
        exec_mode: 'cluster',
        instances: 'max',
        pid_file: './wifaq-result.pid',
        error_file: './logs/error.log',
        out_file: './logs/node.log'
    }]
};
