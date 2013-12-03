var express = require('express'),
    app = express(),
    server = require('http').createServer(app),
    twilio = require('twilio'),
    redis = require('redis'),
    io = require('socket.io').listen(server),
    fs = require('fs'),
    dbclient = require('./redis-rooms.js'),
    auth = require('./auth.js');

var port = 80;
var dbhost = '';
var dbport = '';
var authConnString = '';
var dbclient;

server.listen(port, function(){
  readConfig();

  console.log('Listening on ' + port);
});

app.use(express.static(__dirname + '/public'));
app.use(express.favicon(__dirname + '/public/images/favicon.ico'));
app.use(express.bodyParser());
app.use(express.cookieParser());
app.use(express.cookieSession({secret: '19920606', 
                               cookie: {maxAge: 3600000}}));

app.get('/', function(req, res){
  res.render('circumpunct.ejs');
});

// TODO need an auth page so can redirect from it
app.get('/admin', function(req, res){
  if(!req.session.auth){
    var json = {};
    json.err = 0;
    res.render('auth.ejs', json);
  }
  else{
    dbclient.getAllRooms(function(reply){
      var json = {};              
      json.rooms = reply;
      json.auth = 1;
      json.err = 0; 
      res.render('threshold.ejs', json);
    });
  }
});

app.post('/admin', function(req, res){
  auth.authenticate(req['body']['inputUser'], req['body']['inputPass'], authConnString, function(auth){
    if(auth){
      req.session.auth = 1;
      dbclient.getAllRooms(function(reply){
        var json = {};              
        json.rooms = reply;
        json.auth = 1;
        json.err = 0; 
        res.render('threshold.ejs', json);
      });
    }
    else{
      var json = {};
      json.err = 1;
      res.render('auth.ejs', json);
    }
  }); 
});

app.get('/threshold', function(req, res){
  var json = {};              
  switch(req['query']['err']){
    case 1:
      json.err = 1;
      json.errmsg = "Room exists!";
      break;
    case 2:
      json.err = 1;
      json.errmsg = "Room does not exists!";
      break;
    default:
      json.err = 0;
  }

  dbclient.getAllRooms(function(reply){
    json.rooms = reply;
    json.auth = 0;
    res.render('threshold.ejs', json);
  });
});

app.post('/room', function(req, res){
  if(req['body']['nameInput'] && req['body']['numberInput']){
    dbclient.createRoom(req['body']['numberInput'], req['body']['nameInput'], function(state){
      if(state){
        dbclient.sendMessages(req['body']['nameInput'], res);
      }
      else{
        res.redirect('/threshold?err=1');
      }
    });
  }
  else if(req['body']['snameInput'] && req['body']['snumberInput']){
    dbclient.subscribeRoom(req['body']['snumberInput'], req['body']['snameInput'], function(){
      dbclient.sendMessages(req['body']['snameInput'], res);
    });
  }
});

app.get('/room', function(req, res){
  if(req['query']['r']){
    dbclient.sendMessages(req['query']['r'], res);
  }
  else{
    res.redirect('/threshold?err=2');
  }
});

app.get('/delete', function(req, res){
  if(!req.session.auth){
    res.redirect('/threshold?err=3');;
  }
  else{
    dbclient.destroyRoom(req['query']['r'], function(){
      res.redirect('/threshold');               
    });
  }
});

/* TODO need to create a way of namespacing sockets so not emitting every message
 * TODO to every socket created, roooooooms*/
app.get('/sms', function(req, res){
  if(req['query']['clear'] == 1){
    if(req['query']['room'] == undefined){
      res.send(400);
    }
    else{
      console.log('Deleting SMS list.');
      dbclient.clearSMSList(req['query']['room']);
      res.send(204);
    }
  }
  else if(req['query']['clear'] == 2){
    console.log('Flushing Database');
    dbclient.flushDb();
    res.send(204);
  }
  else{
    var from = req['query']['From'];  
    from = from.substring(1, from.length);
    dbclient.forwardMessage(from, req['query']['Body'], res, io);
  }
});

var readConfig = function(){
  fs.readFile('./config.json', function(err, data){
    if(err){
      throw err;
    }

    var cdata = JSON.parse(data);
    dbhost = cdata['dbhost'];
    dbport = cdata['dbport'];
    setLogging(cdata['log']);
    authConnString = cdata['authConnString'];
    connectDb();
  });
};

var connectDb = function(){
  dbclient.connectDb(dbport, dbhost);
};

var setLogging = function(level){
  if(level == 0){
    io.set('log level', 1);
  }
};

