/*jslint plusplus: true, maxlen: 80*/

/*
Script: Node.JS Game Server - Core Server
Author: Huy Tran
Email: kingbazoka@gmail.com
Description: 
 This project aim to create an easy to use multiplayer game server,
 programmers only have to implement gameplay logic which will be run in
 each game room and don't have to care much about the core server.
 The Core Server is a room-based multiplayer system that enable players
 connect, chat in Global Lobby, join/create room, chat in rooms.
 Room Logic will be implemented in run() method of the file: room.js
-------------------------------------------

CORE SERVER MESSAGES:

1) Player connected to server
	RECEIVE:   [CONNECTED;<player-name>]       (Everyone except sender)
	
2) Player disconnected from server
	RECEIVE:	[DISCONNECTED;<player-name>]   (Everyone except sender)
	
3) Player send a chat message in Global chat
	SEND:       [CHAT;<message>]
	RECEIVE:    [CHAT;<player-name>;<message>]	(Everyone in Global lobby)

4) Player created a Room
	SEND:		[CREATEROOM;<room-name>;<max-players>]

5) Player joined room
	SEND:		[JOINROOM;<room-name>]
	RECEIVE:	[JOINEDROOM;<room-name>]		(Sender)
				[JOINROOM;<player-name>]		(Players already in room)
				[NOROOM;<room-name>]			(Sender - when room not found)
				[ROOMFULL;<room-name>]			(Sender - when room is full)

6) Player left room
	SEND:		[LEAVEROOM]
	RECEIVE:	[LEFTROOM;<player-name>]		(Players already in room)
	
7) Player chat in a room
	SEND:		[CHATROOM;<message>]			
	RECEIVE:	[CHATROOM;<player-name>;<message>] (Players already in room)

8) Get available room list:
	SEND:		[GETROOMLIST]
	RECEIVE:	[ROOMLIST;<list-of-room-name>]	(Sender)		
	
9) Ready/Cancel in room:
	SEND:		[READY] / [CANCEL]
	RECEIVE:	[PLAYERREADY;<player-name>] / [PLAYERCANCEL;<player-name>]
                                                   (Players already in room)
*/

/*

TODO:
	- Add realtime update for room

DEV DIARY:

7:00 - 13/10/2013: It's a beautiful sunday, have nothing to do.
                    So, I decided to make something.
                    I will learn node.js and make something fun today!

15:00 - 13/10/2013: Sorry guys, my girlfriend coming. Stop coding now >:)

22:45 - 13/10/2013: Weekend ended. Back to work now :D

14/10/2013: The first release with: 
	- Connecting to server
	- Disconnecting from server
	- Player joining room
	- Player creating room
	- Chat in global lobby
	- Chat in room
	- Room.js module

15/10/2013: Today, the storm coming to the city,
                    I got a day off so I spent all my day to coding =]]
	- Add Find functions for arrays (to find room/player by name)
	- Add Room Type (to create many types of room with different
        game logic - eg: deathmatch, capture the flags,...)
	- Add Room state switching functions and auto switch state when
        player connected
	- Add Player ready function (to switch ready/waiting when player is in room)
	- Add realtime update for room
	- Auto remove unused room (finished room, playing room with no players,...)
*/

var roomScript = require('./room.js');

var net = require('net');
var serverPort = process.env.PORT || 8888;

// Define Player class and player list
var playerList = [];

// Define Room class and room list
var roomList = [];

function Player(name, socket) {
    "use strict";

    this.name = name;
    this.room = null;
    this.socket = socket;
    this.isReady = false;

    this.ready = function () {
        if (this.room !== null) {
            this.isReady = true;

            // Send ready message to all players
            this.room.broadcast("[PLAYERREADY;" + this.name + "]", this);
        }
    };

    this.cancel = function () {
        if (this.room !== null) {
            this.isReady = false;

            // Send cancel message to all players
            this.room.broadcast("[PLAYERCANCEL;" + this.name + "]", this);
        }
    };

    this.joinRoom = function (roomName) {
        var cplayer = this,
            roomExist = false;

        roomList.forEach(function (r) {
            if (r.name === roomName) {
                roomExist = true;

                console.log("> ROOM EXIST! Count:"
                            + r.playerCount + " / " + r.maxPlayerId);

                if (r.playerCount < r.maxPlayerId) {
                    r.players.push(cplayer);
                    r.playerCount++;

                    // Switch room state
                    if (r.playerCount < r.maxPlayerId) {
                        r.Wait(); // Still waiting for players
                    } else {
                        if (r.isWaiting()) {
                            // Switch to ready state
                            r.ready();
                        }
                    }

                    cplayer.room = r;

                    console.log("[!] " + cplayer.name +
                        " joined room " + r.name);

                    r.broadcast("[JOINROOM;" + cplayer.name + "]", cplayer);

                    cplayer.socket.write("[JOINEDROOM;" + r.name + "]");
                } else {
                    cplayer.socket.write("[ROOMFULL;" + r.name + "]");

                    console.log("[!] Room " + r.name + " is full");
                }
            }
        });

        if (roomExist === false) {
            cplayer.socket.write("[NOROOM;" + roomName + "]");

            console.log("[!] Room " + roomName + " not found");
        }
    };

    this.leaveRoom = function () {
        if (this.room !== null) {
            remove(this.room.players, this);
            this.room.playerCount--;

            if (this.room.playerCount < this.room.maxPlayerId) {
                this.room.wait();
            }

            this.room.broadcast("[LEFTROOM;" + this.name + "]", this);

            console.log("[!] " + this.name + " left room " + this.room.name);

            this.room = null;
        }
    };
}

function Room(name, maxPlayerId) {
    "use strict";

    console.log("[*] Creating room with params: {" + name + ":" + maxPlayerId +
        "}");

    this.name = name;
    this.maxPlayerId = maxPlayerId;
    this.playerCount = 0;
    this.players = [];

    // WAITING - READY - PLAYING - FINISHED
    this.roomState = 'WAITING';

    // Check this in room.js to create more game types
    this.roomType = 'Type01';

    this.broadcast = function (message, except) {
        this.players.forEach(function (p) {
            console.log("> Check " + p.name + " : " + except.name);
            if (p.name !== except.name) {
                p.socket.write(message);
            }
        });
    };

    // Switch state
    this.wait = function () {
        this.roomState = "WAITING";
    };

    this.isWaiting = function () {
        return (this.roomState === "WAITING");
    };

    this.ready = function () {
        this.roomState = "READY";
    };

    this.isReady = function () {
        return (this.roomState === "READY");
    };

    this.play = function () {
        this.roomState = "PLAYING";
    };

    this.isPlaying = function () {
        return (this.roomState === "PLAYING");
    };

    this.finish = function () {
        this.roomState = "FINISHED";
    };

    this.isFinished = function () {
        return (this.roomState === "FINISHED");
    };
}

// Add remove function for arrays
function remove(arr, elem) {
    "use strict";
    var i;

    for (i = arr.length - 1; i >= 0; i--) {
        if (arr[i] === elem) {
            return arr.splice(i, 1);
        }
    }
}

// Add find by name function for arrays (to find player or room)
function findByElemName(arr, name) {
    "use strict";
    var i;

    for (i = arr.length; i >= 0; i--) {
        if (arr[i].name === name) {
            return arr[i];
        }
    }

    return null;
}

// Add trim feature
if (!String.prototype.trim) {
    String.prototype.trim = function () {
        "use strict";

        return this.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, '');
    };
}

function ltrim(str) {
    "use strict";

    return str.replace(/^\s+/, '');
}

function rtrim(str) {
    "use strict";

    return str.replace(/\s+$/, '');
}


function fulltrim(str) {
    "use strict";

    return str.replace(/(?:(?:^|\n)\s+|\s+(?:$|\n))/, '');
}

// Add startsWith and endsWidth function for strings
if (!String.prototype.startsWith) {
    String.prototype.startsWith = function (searchString, position) {
        "use strict";

        position = position || 0;
        return this.substr(position, searchString.length) === searchString;
    };
}

if (!String.prototype.endsWith) {
    String.prototype.endsWith = function (searchString, position) {
        "use strict";

        var subjectString = this.toString(),
            lastIndex;

        if (typeof position !== 'number' || !isFinite(position)
                || Math.floor(position) !== position
                || position > subjectString.length) {
            position = subjectString.length;
        }

        position -= searchString.length;

        lastIndex = subjectString.indexOf(searchString, position);
        return lastIndex !== -1 && lastIndex === position;
    };
}

// Global Broadcast Function
function broadcastAll(message, except) {
    "use strict";

    playerList.forEach(function (p) {
        if (p !== except) {
            p.socket.write(message);
        }
    });
}

function globalChat(message, except) {
    "use strict";

    // Only players in Global lobby can send message
    if (except.room === null) {
        playerList.forEach(function (p) {
            // Only players in Global lobby can receive the message
            if (p !== except && p.room === null) {
                p.socket.write(message);
            }
        });
    }
}

// Update room
setInterval(function () {
    "use strict";

    roomList.forEach(function (r) {
        if (r.isFinished() || (!r.isWaiting() && r.playerCount <=
                0)) {
            remove(roomList, r);
        }

        if (!r.isFinished() && r.playerCount > 0) {
            // Switch from READY to PLAYING mode
            if (r.isReady()) {
                var isAllReady = true;

                r.players.forEach(function (p) {
                    if (p.isReady === false) {
                        isAllReady = false;
                    }
                });

                if (isAllReady) {
                    r.play();
                }
            }

            roomScript.update(r);
        }
    });
}, 10);

// Main Server
net.createServer(function (socket) {
    "use strict";

    // Create new player on connected
    var player = new Player("player-" + playerList.length, socket),
        receivedData = "",
        list = "",
        roomData,
        roomDataArr,
        room,
        roomName,
        chat;

    // Add to PlayerList
    playerList.push(player);

    console.log("[!] " + player.name + " connected!");

    // Tell everybody the newcomer
    broadcastAll("[CONNECTED;" + player.name + "]", player);

    // Process received data
    socket.on('data', function (data) {
        receivedData += data;
        console.log("[i] Data received: "
                    + player.name + " said: " + receivedData);

        // ==================SERVER PROCESSING=====================
        // Implement chat in lobby feature
        if (receivedData.startsWith("[CHAT;")) {
            // Broadcast
            chat = receivedData.substring(6, receivedData.length - 1);
            globalChat("[CHAT;" + player.name + ";" + chat + "]", player);
        }

        // Basic Room function: Get list, create, join, leave, chat in room
        if (receivedData.startsWith("[GETROOMLIST]")) {
            // Get room list
            roomList.forEach(function (r) {
                list += r.name;
            });

            socket.write("[ROOMLIST;" + list + "]");
        }

        if (receivedData.startsWith("[CREATEROOM;")) {
            // RoomName;MaxPlayer
            roomData = receivedData.substring(12, receivedData.length - 1);
            roomDataArr = roomData.split(';');

            if (roomDataArr.length >= 2) {
                room = new Room(roomDataArr[0], parseInt(roomDataArr[1], 10));

                roomList.push(room);
                console.log("[+] Room "
                            + room.name + " created by " + player.name);
                player.leaveRoom();
                player.joinRoom(room.name);
            }
        }

        if (receivedData.startsWith("[JOINROOM;")) {
            roomName =
                receivedData.substring(10, receivedData.fulltrim().length - 1);
            console.log("> SELECTED ROOM: " + roomName);
            player.joinRoom(roomName);
        }

        if (receivedData.startsWith("[LEAVEROOM]")) {
            player.leaveRoom();
        }

        if (receivedData.startsWith("[CHATROOM;")) {
            // Broadcast
            chat = receivedData.substring(10, receivedData.length - 1);
            player.room.broadcast("[CHATROOM;"
                                  + player.name + ";" + chat + "]", player);
        }

        if (receivedData.startsWith("[READY]")) {
            player.ready();
        }

        if (receivedData.startsWith("[CANCEL]")) {
            player.cancel();
        }

        // ===================== EACH ROOM ================================
        roomList.forEach(function (r) {
            roomScript.run(r, player, receivedData);
        });
        // ================================================================

        receivedData = "";
    });

    // Handle player disconnect event
    socket.on('close', function () {
        player.leaveRoom(); // Leave all room before disconnected

        remove(playerList, player);

        console.log("[!] " + player.name + " disconnected!");

        // Tell everyone Player disconnected
        playerList.forEach(function (c) {
            // Send disconnect notify - MSG: [DC;<player name>]
            c.socket.write("[DISCONNECTED;" + player.name + "]");
        });
        // Close connection
        socket.end();
    });

}).listen(serverPort);

console.log("Server is running at port " + serverPort);
