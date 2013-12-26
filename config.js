var fs = require('fs');

var readConfig = function(cb){
  fs.readFile('./config.json', function(err, data){
    if(err){
      throw err;
    }

    var cdata = JSON.parse(data);
    if(!cdata.twiNumber){
      throw new Error('Config paramerter (twiNumber) is required.');
    }
    if(!cdata.twiAccountSid){
      throw new Error('Config paramerter (twiAccountSid) is required.');
    }
    if(!cdata.twiAuthSid){
      throw new Error('Config paramerter (twiAuthSid) is required.');
    }
    if(!cdata.host){
      throw new Error('Config parameter (host) is required.');
    }
    if(!cdata.port){
      throw new Error('Config parameter (port) is required.');
    }
    if(!cdata.dbhost){
      throw new Error('Config parameter (dbhost) is required.');
    }
    if(!cdata.dbport){
      throw new Error('Config parameter (dbport) is required.');
    }
    if(!cdata.authConnString){
      throw new Error('Config parameter (authConnString) is required.');
    }

    if(cb){
      cb(cdata);
    }
  });
};

exports.readConfig = readConfig;
