var express = require('express'),
    app = express(),
    server = require('http').createServer(app),
    twilio = require('twilio'),
    redis = require('redis'),
    io = require('socket.io').listen(server),
    fs = require('fs');
    go = require('./goinstant.js');

var port = 80;
var host = '';
var dbhost = '';
var dbport = '';
var rclient;

server.listen(port, function(){
  readConfig();

  console.log('Listening on ' + port);
});

app.use(express.static(__dirname + '/public'));
app.use(express.favicon(__dirname + '/public/images/favicon.ico'));

app.get('/', function(req, res){
  res.render('circumpunct.ejs');
});

app.get('/threshold', function(req, res){
  rclient.llen('sms', function(err, reply){
    var json = {};
    json.host = host;
    json.messTime = null;
    if(!reply){
      res.render('threshold.ejs', json);
    }
    else{
      rclient.lrange('sms', 0, 9, function(err, reply){
        json.messTime = reply;
        res.render('threshold.ejs', json);
      });
    }
  });

});

app.get('/sms', function(req, res){
  if(req['query']['clear']){
    console.log('Deleting SMS list.');
    clearSMSList();
    res.send(200);
  }
  else{
    var tres = new twilio.TwimlResponse();
    tres.message("Message Received!");
    res.send(tres.toString());
    
    var mtime = getTimeString();
    var json = createMessageJSON(req['query']['Body'], mtime);
    rclient.lpush('sms', json, function(err){
      if(err){
        console.log(err);
      }
    });
    io.sockets.emit('sms', { message: req['query']['Body'], time: mtime });
  }
});

var readConfig = function(){
  fs.readFile('./config.json', function(err, data){
    if(err){
      throw err;
    }

    var cdata = JSON.parse(data);
    host = cdata['host'];
    dbhost = cdata['dbhost'];
    dbport = cdata['dbport'];
    setLogging(cdata['log']);
    connectRedis();
    go.connectGoInstant(cdata['go-client-id'], cdata['go-client-secret']);
  });
};

var connectRedis = function(){
  rclient = redis.createClient(dbport, dbhost);

  rclient.on('error', function(err){
    throw err;
  });

  console.log("Connected to Redis at", dbhost + ":", dbport);
};

var clearSMSList = function(){
  rclient.del('sms', function(err){
    if(err){
      console.log(err);
    }
  });
};

var setLogging = function(level){
  if(level == 0){
    io.set('log level', 1);
  }
};

var getTimeString = function(){
  var d = new Date();
  var min = '';

  if(d.getMinutes() < 10){
    min = '0' + d.getMinutes();
  }
  else{
    min = d.getMinutes();
  }

  return d.getHours() + ':' + min + ' ' + d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear();
};

var createMessageJSON = function(message, time){
  return '{"message":"' + message + '","time":"' + time + '"}'
};
