var express = require('express'),
    app = express(),
    server = require('http').createServer(app),
    twilio = require('twilio'),
    redis = require('redis'),
    io = require('socket.io').listen(server),
    fs = require('fs');

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

/* 
 * Redis Infrastrucutre:
 *
 * Need to create a background API for dealing with the different functions
 * concerning the below infrastructure. The API will then be able to be
 * accessed easily from a few different ways. Including: web interface, text
 * interface.
 *
 * (phone #) - (room)
 *
 * (room) -> users 
 *
 * sms-(room) -> messages
 *
 * Anything surronded in '()' are variables to be filled in with user
 * specified info. '-' characters mean its a key to value pair. '->' 
 * characters mean key to list value.
 *
 * Redis side note:
 *
 * Investigate just putting messages into redis and have a pub-sub
 * system where it forwards the message out to clients when it gets added.
 * Might scale better? Could have messages coming in from other services 
 * other then just the current twilio GET request. Might cause delay, but
 * probably not, just seems a little weird to have two data sources feeding
 * the app.
 *
 * Redis vs. Postgres:
 *
 * Might make a neat drop in replacement for redis and use postgres and maybe
 * eventually do some A/B testing and see which ones scales better. Problem
 * with this is getting enough traffic where these things could be stressed
 * in some way or another.
 *
 * Subscribing to more than on room?
 *
 * Not sure how going to handle this...maybe doesn't make sense seeing as
 * user receiving the message to their phone would have to parse out the
 * differences in the single stream. I think maybe this is where text message
 * meta data being parsed out by an android app would come in handy. Side note:
 * a twitter bootstrap like thing just came out for android. Anyway kitkat 4.4
 * comes with SMS apis, so maybe can use this to receive text messages from
 * certain numbers and parse out the meta data to route messages. Hopefully
 * these SMS apis will be backported.
 *
 */

io.sockets.on('connection', function(socket){
  socket.on('createRoom', function(data){
    // check if room exists
    // check is # is valid in CAN and US and doesn't already exist
    // create room with name
    // subscribe to room
  });

  socket.on('subscribe', function(data){
    // check is # is valid in CAN and US and make sure it actually exists

  });

  socket.on('unsubscribe', function(data){
    // check if # actually exists if not emit something 
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
