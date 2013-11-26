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

app.get('/admin', function(req, res){
  var json = {};
  json.err = 0;
  if(!req.session.auth){
    res.render('auth.ejs', json);
  }
  else{
    dbclient.sendAllRooms(res);
  }
});

// TODO use socket io?
app.post('/admin', function(req, res){
  auth.authenticate(req['body']['inputUser'], req['body']['inputPass'], authConnString, function(auth){
    if(auth){
      req.session.auth = 1;
      dbclient.sendAllRooms(res);
    }
    else{
      var json = {};
      json.err = 1;
      res.render('auth.ejs', json);
    }
  }); 
});

app.get('/threshold', function(req, res){
  dbclient.sendAllRooms(res);
});

app.get('/room', function(req, res){
  dbclient.sendMessages(req['query']['r'], res);
});

io.sockets.on('connection', function(socket){
  socket.on('createRoom', function(data){
    dbclient.createRoom(data.user, data.room, socket);
  });

  socket.on('destroyRoom', function(data){

  });

  socket.on('subscribe', function(data){
    dbclient.subscribeRoom(data.user, data.room, socket, 1);
  });

  socket.on('unsubscribe', function(data){
    // check if # actually exists if not emit something 
  });
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

