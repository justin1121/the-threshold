/* jshint node: true */
'use strict';

var http     = require('http'),
    express  = require('express'),
    app      = express(),
    twilio   = require('twilio'),
    async    = require('async'),
    conf     = require('./config.js'),
    dbclient = require('./redis-rooms.js'),
    auth     = require('./auth.js');

app.use(express.static(__dirname + '/public'));
app.use(express.favicon(__dirname + '/public/images/favicon.ico'));
app.use(express.bodyParser());
app.use(express.cookieParser());
app.use(express.cookieSession({secret: '19920606', cookie: {maxAge: 3600000}}));

var server         = http.createServer(app);
var config         = {};
var twiClient      = null;
var twiListNumbers = [];

conf.readConfig(function(cdata){
  config = cdata;
  setLogging(config.log);
  addRoutes();
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
      server.listen(config.port, config.host, function(){
        console.log('Listening on ' + config.port);
        callback(null, null);
      });
    }
  ]);
});



var setLogging = function(){
  // TODO does nothing should add some stuff for logging, not sure what though
};

var sendMessages = function(res, room){
  dbclient.getMessages(room, function(msgs){
    var json = {};
    json.twiNumber = config.twiNumber;
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
      res.send(tres);
    }
    else{
      tres.message('Message Forwarded to ' + room + '!');
      res.send(tres);

      var time = (new Date()).getTime();
      var json = { msg: msg, time: time, user: from, room: room, };

      dbclient.publishTxtMessage(JSON.stringify(json));
    }
  });
};

var sendSSE = function(res, msg){
  res.write('data: ' + msg + '\n\n');
};

var createSSERoomRoute = function(room){
  app.get('/room/' + room, routeCreateCallback);
};

var routeCreateCallback = function(req, res){
  var room = (req.url.split('/'))[2];
  req.socket.setTimeout(Infinity);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  res.write('\n');

  var index = dbclient.addMsgSubListener(function(msg){
    var json = JSON.parse(msg);

    if(room === json.room){
      sendSSE(res, msg);
    }
  });

  req.on('close', function(){
    dbclient.removeMsgSubListener(index);
  });
};

var destroySSERoomRoute = function(room){
  for(var i = 0; i < app.routes.get.length; i++){
    if(app.routes.get[i].path === '/room/' + room){
      app.routes.get.splice(i, 1);
      return;
    }
  }
};

var addRoutes = function(){
  app.get('/auth', function(req, res){
    var json = {};
    json.err = 0;

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
        destroySSERoomRoute(req.query.r);
      });
    }
  });

  app.get('/sms', twilio.webhook(config.twiAuthSid), function(req, res){
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
};
