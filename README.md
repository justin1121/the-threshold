THE THRESHOLD OVERVIEW
======================

The Threshold receives SMS messages and then forwards them to the room the messages belong in. The Threshold receives messages from the Twilio servers as a HTTP request. It forwards messages depending on the number the messages came from and if the number is subscribed to a room. If the number is not subscribed to a room then the message is discarded. Every time a message is received a message is sent to the Twilio servers to be forwarded back to the number the message was received from. This is to confirm the message was received and processed. In the future it will also forward messages to everyone else who is subscribed to the room a message is received from.

CONFIG
------

The Threshold relies on a configuration file called config.json. This file contains all of the parameters that is needed for The Threshold to run. All parameters are required except for the ``` log ``` parameter. (Which actually doesn't do anything right now).

Example:

```
{
  "twiPhone": "+111155566666",
  "host: "example.com",
  "port: "8080",
  "dbhost": "localhost",
  "dbport": "6379",
  "authConnSTring": "postgres://example@localhost/threshold",
  "log", "0"
}
```

TODO: Autogen config file

DATABASES
---------

The Threshold uses two separate databases. The main database is the database the stores all of the main data. This includes the rooms, subscribers to the rooms and messages sent to each room. By default this is a Redis database. The connection between the main application and the databases connection will be standardised. This will allow any database to be dropped in a used as the main database. Postgres will be implemented as another option. TODO: For other databases an implementation can be supplied by the file name?????

The other database that The Threshold relies on is an authentication database. This uses a Postgres database. See AUTHENTICATION below. 

A future feature idea is to use the main database as a funnel for all messages. When using Redis it would use Redis' pub-sub feature. Need to look into the same sort of thing in Postgres. For other custom databases this feature can be turned on and off depending on if the database/implementation support some sort of pub-sub functionality. Using message funneling will provide two main advantages over the complexity it will cause. First, it will allow messages to come from any source. This will make it easy to extend to other data sources. Right now messages can only be received from Twilio's servers. The other advantage will allow for clustering of The Threshold servers. This will allow load balancing by having slave servers only subscribed to certain rooms. This needs to be thought about some more once I decide to implement this.

REDIS DATA ARCH
---------------

Name           Structure 

rooms:         rooms -> rooms

subscribers:   (room) -> users 

subscriptions: (phone #) - (room)

messages:      sms-(room) -> messages

NOTE: Anything above surrounded in '()' are variables to be filled in with user specified info, '-' represents a key to value pair, '->' represents a key to list.

POSTGRES DATA ARCH - TODO
-------------------------

AUTHENTICATION - TODO
---------------------

AUTH POSTGRES DATA ARCH - TODO
------------------------------

ADMIN - TODO
------------

CLIENT SIDE/TEMPLATES - TODO
----------------------------

Websockets vs. SSE
------------------

Websockets provide duplex communication between the server and the client. Websockets use a special protocol for communicating. Server-Sent Events provide one-way communication from the server to client. Server-Sent Events use the existing HTTP protocol to communicate. Passing messages to the client via Websockets is not necessary because the client does not need to communicate back to the server right now. Two things will determine which one I will use:

1. The chance I will need duplex communication.
2. The difficulty of separating messaging channels between each room.

Will begin by experimenting with separating out messaging channels by room with Server-Sent Events.

TWILIO TELEPHONE LOAD BALANCING
-------------------------------

FUTURE
------

* Forward messages to subscribers of a room
* Add user persistence 
* Turn off message confirmation in user setting.
* Telephone number validation, see http://libphonenumber.googlecode.com/svn/trunk/javascript/README
* Redis pub-sub system, see above Redis docs. Is this doable in Postgres if need be?
* Subscribing to multiple rooms 
* Scaling with multiple Twilio numbers
* Testing

AUTOMATION - GRUNT - TODO
-------------------------

* uglify
* deploy
* testing
* generate config file
