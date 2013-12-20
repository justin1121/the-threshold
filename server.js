/* jshint node: true */
'use strict';

var WebSocketServer = require('ws').Server,
    http = require('http'),
    express = require('express'),
    app = express(),
    fs = require('fs'),
    twilio = require('twilio'),
    dbclient = require('./redis-rooms.js'),
    auth = require('./auth.js');

app.use(express.static(__dirname + '/public'));
app.use(express.favicon(__dirname + '/public/images/favicon.ico'));
app.use(express.bodyParser());
app.use(express.cookieParser());
app.use(express.cookieSession({secret: '19920606', cookie: {maxAge: 3600000}}));

var server = http.createServer(app);
var twiNumber = '';
var host = '';
var port = 0;
var dbhost = '';
var dbport = '';
var authConnString = '';
var wss;

var readConfig = function(cb){
  fs.readFile('./config.json', function(err, data){
    if(err){
      throw err;
    }

    var cdata = JSON.parse(data);
    if(!cdata.twiNumber){
      throw new Error('Config paramerter (twiNumber) is required.');
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

    twiNumber = cdata.twiNumber;
    host = cdata.host;
    port = cdata.port;
    dbhost = cdata.dbhost;
    dbport = cdata.dbport;
    authConnString = cdata.authConnString;

    setLogging(cdata.log);
    dbclient.connectDb(dbport, dbhost, cb);
  });
};

readConfig(function(){
  server.listen(port, function(){
    console.log('Listening on ' + port);
    wss = new WebSocketServer({server: server});

    wss.broadcast = function(data){
      for(var i in this.clients){
        this.clients[i].send(data);
      }
    };
  });
});

app.get('/auth', function(req, res){
  var json = {};
  json.err = 0;
  json.host = host;

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
  auth.authenticate(user, pass, authConnString, function(auth){
    if(auth){
      req.session.auth = 1;
      res.redirect('/' + req.session.source);
    }
    else{
      var json = {};
      json.err = 1;
      json.host = host;
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
      json.twiNumber = twiNumber;
      json.host = host;
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
    json.twiNumber = twiNumber;
    json.host = host;
    res.render('threshold.ejs', json);
  });
});

app.post('/room', function(req, res){
  var body = req.body;
  if(body.nameInput && body.numberInput){
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
    json.twiNumber = twiNumber;
    json.host = host;
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
      var json = { room: room, msg: msg, time: time };
      wss.broadcast(JSON.stringify(json));

      dbclient.storeMessage(room, msg, time);
    }
  });

};
