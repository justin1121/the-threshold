var GoInstant = require('goinstant-rest').v1;

exports.connectGoInstant = function(id, secret){
  var client = new GoInstant({
    client_id: id,
    client_secret: secret
  });

  return client;
};
