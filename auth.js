/* jshint node: true */
'use strict';

var crypto = require('crypto'),
    pg = require('pg');

// this is not used in the actual server yet
var createAuth = function(user, pass, connString){
  pg.connect(connString, function(err, client, done){
    if(err){
      throw err;
    }
    crypto.randomBytes(16, function(err, buf){
      if(err){
        throw err;
      }
      crypto.pbkdf2(pass, buf, 3000, 16, function(err, key){
        if(err){
          throw err;
        }
        var querystr = 'INSERT INTO auth (username, salt, key) VALUES ($1, $2, $3)';
        client.query(querystr, [user, buf, key], function(err){
          if(err){
            throw err;
          }
          done();
        });
      });
    });
  });
};

var authenticate = function(user, pass, connString, cb){
  pg.connect(connString, function(err, client, done){
    if(err){
      throw err;
    }
    var querystr = 'SELECT salt, key FROM auth WHERE username=$1';
    var query = client.query(querystr, [user]);

    query.on('row', function(row){
      crypto.pbkdf2(pass, row.salt, 3000, 16, function(err, key){
        if(err){
          throw err;
        }
        if(key.toString() === row.key.toString()){
          cb(1);
          done();
        }
        else{
          cb(0);
          done();
        }
      });
    });

    query.on('error', function(err){
      if(err){
        throw err;
      }
    });

    query.on('end', function(res){
      if(!res.rowCount){
        cb(0);
        done();
      }
    });
  });
};

/* TODO */
var deleteAuth = function(){

};

// testing for the amount of iterations used,
// on my machine it seems to reach about 8ms at 3000 iterations
// with a more powerful computer, this should be increased to as
// high as possible while still staying around 8ms
var iterationsTest = function(pass){
  console.time('itsTest');
  crypto.randomBytes(16, function(err, buf){
    if(err){
      throw err;
    }

    crypto.pbkdf2(pass, buf, 3000, 16, function(){
      console.timeEnd('itsTest');
    });
  });
};

exports.createAuth = createAuth;
exports.deleteAuth = deleteAuth;
exports.authenticate = authenticate;
exports.iterationsTest = iterationsTest;
