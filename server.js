/* jshint node: true */
'use strict';

var http            = require('http'),
    express         = require('express'),
    app             = express(),
    redis           = require('redis'),
    twilio          = require('twilio'),
    async           = require('async'),
    conf            = require('./config.js'),
    dbclient        = require('./redis-rooms.js'),
    auth            = require('./auth.js');

app.use(express.static(__dirname + '/public'));
app.use(express.favicon(__dirname + '/public/images/favicon.ico'));
app.use(express.bodyParser());
app.use(express.cookieParser());
app.use(express.cookieSession({secret: '19920606', cookie: {maxAge: 3600000}}));

var server         = http.createServer(app);
var msgPubClient   = null;
var config         = {};
var twiClient      = null;
var twiListNumbers = [];

conf.readConfig(function(cdata){
  config = cdata;
  setLogging(config.log);
  twiClient = twilio(config.twiAccountSid, config.twiAuthSid);

  async.series([
    function(callback){
      dbclient.connectDb(config.dbport, config.dbhost, function(){
        callback(null, null);
      });
    },
    function(callback){
      twiClient.incomingPhoneNumbers.list(function(err, data){
        if(err){
          callback(err, null);
        }
        for(var number in data.incomingPhoneNumbers){
          twiListNumbers.push(number.phone_number);
        }
        callback(null, null);
      });
    },
    function(callback){
      msgPubClient = redis.createClient(config.dbport, config.dbhost);

      msgPubClient.on('connect', function(err){
        if(err){
          throw err;
        }

        server.listen(config.port, function(){
          console.log('Listening on ' + config.port);
          callback(null, null);
        });
      });

      msgPubClient.on('error', function(err){
        throw err;
      });
    }
  ]);
});

app.get('/auth', function(req, res){
  var json = {};
  json.err = 0;
  json.host = config.host;

  if(req.session.auth){
    res.redirect('/admin');
  }
  else if(req.query.source){
    req.session.source = req.query.source;
    res.render('auth.ejs', json);
  }
  else{
    req.session.source = 'admin';
    res.render('auth.ejs', json);
  }
});

app.post('/auth', function(req, res){
  var user = req.body.inputUser, pass = req.body.inputPass;
  auth.authenticate(user, pass, config.authConnString, function(auth){
    if(auth){
      req.session.auth = 1;
      res.redirect('/' + req.session.source);
    }
    else{
      var json = {};
      json.err = 1;
      json.host = config.host;
      res.render('auth.ejs', json);
    }
  });
});

app.get('/admin', function(req, res){
  if(!req.session.auth){
    var json = {};
    json.err = 0;
    res.redirect('/auth?source=admin');
  }
  else{
    dbclient.getAllRooms(function(reply){
      var json = {};
      json.rooms = reply;
      json.auth = 1;
      json.err = 0;
      json.twiNumber = config.twiNumber;
      json.host = config.host;
      res.render('threshold.ejs', json);
    });
  }
});

app.get('/threshold', function(req, res){
  var json = {};
  switch(req.query.err){
    case 1:
      json.err = 1;
      json.errmsg = 'Room exists!';
      break;
    case 2:
      json.err = 1;
      json.errmsg = 'Room does not exists!';
      break;
    default:
      json.err = 0;
  }

  dbclient.getAllRooms(function(reply){
    json.rooms = reply;
    json.auth = 0;
    json.twiNumber = config.twiNumber;
    json.host = config.host;
    res.render('threshold.ejs', json);
  });
});

app.post('/room', function(req, res){
  var body = req.body;
  if(body.nameInput && body.numberInput){
    createSSERoomRoute(body.nameInput);
    dbclient.createRoom(body.numberInput, body.nameInput, function(state){
      if(state){
        res.redirect('/room?r=' + body.nameInput);
      }
      else{
        res.redirect('/threshold?err=1');
      }
    });
  }
  else if(body.snameInput && body.snumberInput){
    dbclient.subscribeRoom(body.snumberInput, body.snameInput, function(){
      res.redirect('/room?r=' + body.snameInput);
    });
  }
});

app.get('/room', function(req, res){
  if(req.query.r){
    sendMessages(res, req.query.r);
  }
  else{
    res.redirect('/threshold?err=2');
  }
});

app.get('/delete', function(req, res){
  if(!req.session.auth){
    res.redirect('/threshold?err=3');
  }
  else{
    dbclient.destroyRoom(req.query.r, function(){
      res.redirect('/admin');
    });
  }
});

/* TODO need to create a way of namespacing sockets so not emitting every message
 * TODO to every client connected */
app.get('/sms', function(req, res){
  if(req.query.clear == 1){
    if(!req.query.room){
      res.send(400);
    }
    else{
      console.log('Deleting SMS list.');
      dbclient.clearSMSList(req.query.room);
      res.send(204);
    }
  }
  else if(req.query.clear == 2){
    console.log('Flushing Database');
    dbclient.flushDb();
    res.send(204);
  }
  else{
    handleText(req, res);
  }
});


var setLogging = function(){
  // TODO does nothing should add some stuff for logging, not sure what though
};

var sendMessages = function(res, room){
  dbclient.getMessages(room, function(msgs){
    var json = {};
    json.twiNumber = config.twiNumber;
    json.host = config.host;
    json.room = room;
    json.messTime = msgs;
    res.render('room.ejs', json);
  });
};

var handleText = function(req, res){
  var from = req.query.From, msg = req.query.Body;
  from = from.substring(1, from.length);

  dbclient.checkSubscription(from, function(room){
    var tres = new twilio.TwimlResponse();
    if(!room){
      tres.message('You are not subscribed to a room.');
      res.send(tres.toString());
    }
    else{
      tres.message('Message Forwarded to ' + room + '!');
      res.send(tres.toString());

      var time = (new Date()).getTime();
      var json = { msg: msg, time: time, user: from, room: room, };

      msgPubClient.publish('txtMessages', JSON.stringify(json));
    }
  });
};

var sendSSE = function(res, msg){
  res.write('data: ' + msg + '\n\n');
};

var createSSERoomRoute = function(room){
  app.get('/room/' + room, function(req, res){
    req.socket.setTimeout(Infinity);

    var msgSubClient = redis.createClient(config.dbport, config.dbhost);
    
    msgSubClient.on('connect', function(err){
      if(err){
        throw err;
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });
      res.write('\n');

      msgSubClient.on('error', function(err){
        throw err;
      });

      msgSubClient.on('message', function(chl, msg){
        if(chl === 'txtMessages' && msg.room === room){
          sendSSE(res, JSON.stringify(msg));
        }
      });
    });
  });
};

var destroySSERoomRoute = function(room){
  // find route in app.route and remove it 
};
