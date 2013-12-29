/* jshint node: true */
'use strict';

var redis = require('redis');


var rclient = null;
var msgSubClient = null;
var msgSubListeners = [];

var connectDb = function(dbport, dbhost, cb){
  rclient = redis.createClient(dbport, dbhost);
  rclient.on('connect', function(err){
    if(err){
      throw err;
    }
    console.log('Connected to Redis at', dbhost + ':', dbport);
    connectMsgSub(dbport, dbhost, cb);
  });

  rclient.on('error', function(err){
    throw err;
  });

};

var connectMsgSub = function(dbport, dbhost, cb){
  msgSubClient = redis.createClient(dbport, dbhost);
  msgSubClient.on('connect', function(err){
    if(err){
      throw err;
    }

    msgSubClient.subscribe('txtMessages');
    msgSubClient.on('message', function(chl, msg){
      if(chl === 'txtMessages'){
        var json = JSON.parse(msg);
        storeMessage(json.room, json.msg, json.time);
      }
    });

    msgSubClient.on('error', function(err){
      throw err;
    });

    if(cb){
      cb();
    }
  });
};

var createRoom = function(user, room, cb){
  rclient.lindex(room, 0, function(err, reply){
    if(!reply){
      rclient.lpush(room, user, function(err){
        if(err){
          console.log(err);
        }
      });
      subscribeRoom(user, room);
      rclient.lpush('rooms', room, function(err){
        if(err){
          console.log(err);
        }
      });
      if(cb){
        cb(1);
      }
    }
    else{
      if(cb){
        cb(0);
      }
    }
  });
};

var destroyRoom = function(room, cb){
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

  if(cb){
    cb();
  }
};

var subscribeRoom = function(user, room, cb){
  if(user !== ''){
    rclient.set(user, room, function(err){
      if(err){
        throw err;
      }

      if(cb){
        cb();
      }
    });
  }
};

// TODO last action that needs to be fully implemented
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

var getMessages = function(room, cb){
  rclient.llen('sms-' + room, function(err, reply){
    if(!reply){
      if(cb){
        cb(reply);
      }
    }
    else{
      rclient.lrange('sms-' + room, 0, reply - 1, function(err, reply){
        if(cb){
          cb(reply);
        }
      });
    }
  });
};

var checkSubscription = function(user, cb){
  rclient.get(user, function(err, reply){
    if(err){
      throw err;
    }

    if(cb){
      cb(reply);
    }
  });
};

var storeMessage = function(room, msg, time){
  var json = { msg: msg, time: time };

  rclient.lpush('sms-' + room, JSON.stringify(json), function(err){
    if(err){
      console.log(err);
    }
  });
};

var getAllRooms = function(cb){
  rclient.llen('rooms', function(err, reply){
    if(!reply){
      if(cb){
        cb(null);
      }
    }
    else{
      rclient.lrange('rooms', 0, reply - 1, function(err, reply){
        if(cb){
          cb(reply);
        }
      });
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

var publishTxtMessage = function(msg){
  rclient.publish('txtMessages', msg);
};

var addMsgSubListener = function(cb){
  var listener;

  msgSubClient.on('message', listener = function(chl, msg){
    if(chl === 'txtMessages'){
      if(cb){
        cb(msg);
      }
    }
  });

  var index = msgSubListeners.push(listener);
  return index - 1;
};

var removeMsgSubListener = function(index){
  msgSubClient.removeListener('message', msgSubListeners[index]);
  // TODO this is dumb and this needs to be done more correctly gonna leave it for now
  //msgSubListeners.splice(index, 1);
};

exports.clearSMSList = clearSMSList;
exports.getMessages = getMessages;
exports.unsubscribeRoom = unsubscribeRoom;
exports.subscribeRoom = subscribeRoom;
exports.destroyRoom = destroyRoom;
exports.createRoom = createRoom;
exports.connectDb = connectDb;
exports.flushDb = flushDb;
exports.checkSubscription = checkSubscription;
exports.storeMessage = storeMessage;
exports.getAllRooms = getAllRooms;
exports.addMsgSubListener = addMsgSubListener;
exports.removeMsgSubListener = removeMsgSubListener;
exports.publishTxtMessage = publishTxtMessage;

