var crypto = require('crypto'),
    pg = require('pg');

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
        client.query('INSERT INTO auth (username, salt, key) VALUES ($1, $2, $3)', [user, buf, key], 
        function(err, res){
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
    var query = client.query('SELECT salt, key FROM auth WHERE username=$1', [user]);

    query.on('row', function(row, res){
      crypto.pbkdf2(pass, row.salt, 3000, 16, function(err, key){
        if(err){
          throw err;
        }
        if(key.toString() === row.key.toString()){
          cb(1);
        }
        else{
          cb(0);
        }
      });
    });

    query.on('error', function(err){
      if(err){
        throw err;
      }
    });

    query.on('end', function(res){
      if(res.rowCount == 0){
        cb(0);
      }
    });
  });
};

var deleteAuth = function(user){

};

var iterationsTest = function(pass){
  console.time('itsTest');
  crypto.randomBytes(16, function(err, buf){
    if(err){
      throw err;
    }

    crypto.pbkdf2(pass, buf, 3000, 16, function(err, key){
      console.timeEnd('itsTest');
    });
  });
};

exports.createAuth = createAuth;
exports.deleteAuth = deleteAuth;
exports.authenticate = authenticate;
exports.iterationsTest = iterationsTest;
