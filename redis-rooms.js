var redis = require('redis'),
    twilio = require('twilio');


var rclient;

var connectDb = function(dbport , dbhost){
  rclient = redis.createClient(dbport, dbhost);

  rclient.on('error', function(err){
    throw err;
  });

  console.log("Connected to Redis at", dbhost + ":", dbport);
};

var createRoom = function(user, room, socket){
  rclient.lindex(room, 0, function(err, reply){
    if(!reply){
      rclient.lpush(room, user, function(err){
        if(err){
          console.log(err);
        }
      });
      subscribeRoom(user, room, socket); 
      rclient.lpush('rooms', room, function(err){
        if(err){
          console.log(err);
        }
      });
      socket.emit("roomCreated");
    }
    else{
      socket.emit('roomExists');
    }
  });
};

var destroyRoom = function(room, socket){
  rclient.del(room, function(err){
    if(err){
      console.log(err);
    }
  });

  rclient.del('sms-' + room, function(err){
    if(err){
      console.log(err);
    }
  });
  
  rclient.lrem('rooms', 1, room, function(err){
    if(err){
      console.log(err);
    }
  });

  socket.emit('roomDeleted');
};

var subscribeRoom = function(user, room, socket){
  rclient.set(user, room, function(err){
    socket.emit('roomSubscribed');
  });
};

var unsubscribeRoom = function(user, room, socket){
  if(room){
    subscribeRoom(user, room, socket);
  }
  else{
    rclient.del(user, function(err){
      console.log(err);
    });
  }

  socket.emit('roomUnsubscribed');
};

var sendMessages = function(room, res){ 
  rclient.llen('sms-' + room, function(err, reply){
    var json = {};
    json.room = room;
    json.messTime = null;
    if(reply == 0){
      res.render('room.ejs', json);
    }
    else{
      rclient.lrange('sms-' + room, 0, reply - 1, function(err, reply){
        json.messTime = reply;
        res.render('room.ejs', json);
      });
    }
  });
};

var forwardMessage = function(user, mess, res, io){
  rclient.get(user, function(err, reply){
    var tres = new twilio.TwimlResponse(); 
    if(!reply){
      tres.message("You are not subscribed to a room.");
      res.send(tres.toString());
    }
    else{
      var mtime = getTimeString();
      var json = createMessageJSON(mess, mtime);

      rclient.lpush('sms-' + reply, json, function(err){
        if(err){
          console.log(err);
        }
      });
      tres.message("Message Forwarded to " + reply + "!");
      res.send(tres.toString());
      io.sockets.emit('sms-' + reply, { message: mess, time: mtime });
    }
  });
};

var clearSMSList = function(room){
  rclient.del('sms-' + room, function(err){
    if(err){
      console.log(err);
    }
  });
};

var flushDb = function(){
  rclient.flushdb();
};

// TODO move these to own lib
var createMessageJSON = function(message, time){
  return '{"message":"' + message + '","time":"' + time + '"}'
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

exports.clearSMSList = clearSMSList
exports.sendMessages = sendMessages
exports.unsubscribeRoom = unsubscribeRoom
exports.subscribeRoom = subscribeRoom
exports.destroyRoom = destroyRoom
exports.createRoom = createRoom
exports.connectDb = connectDb
exports.flushDb = flushDb
exports.forwardMessage = forwardMessage
