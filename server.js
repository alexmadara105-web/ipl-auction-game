const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());

// Serve static frontend files from the "public" folder
app.use(express.static(path.join(__dirname, 'public')));

// Fallback to index.html for any route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const TM = {CSK:1, MI:1, RCB:1, KKR:1, DC:1, SRH:1, RR:1, PBKS:1, GT:1, LSG:1};
const rooms = {};

io.on('connection', (socket) => {
  socket.on('create_room', ({ cfg, name }) => {
    let code;
    for (let i = 0; i < 10; i++) {
      code = String(1000 + (Math.random() * 9000 | 0));
      if (!rooms[code]) break;
    }
    const ts = Object.keys(TM).map(c => ({
      c,
      u: '',
      o: '',
      purse: cfg.pu || 100,
      rtm: cfg.rt || 0,
      sq: []
    }));
    const g = ts.find(t => t.c === 'GT');
    g.u = socket.id;
    g.o = name;

    rooms[code] = {
      h: socket.id,
      code,
      st: 'lobby',
      cfg,
      ts,
      ev: null
    };

    socket.join(code);
    socket.emit('room_created', { code });
    io.to(code).emit('state_update', rooms[code]);
  });

  socket.on('join_room', ({ code, name }) => {
    const room = rooms[code];
    if (!room) {
      return socket.emit('error_msg', 'Lobby ' + code + ' was not found or has closed.');
    }
    socket.join(code);
    socket.emit('joined_room', { code, isHost: room.h === socket.id });
    io.to(code).emit('state_update', room);
  });

  socket.on('pick_team', ({ code, teamIndex, name }) => {
    const room = rooms[code];
    if (!room || room.st !== 'lobby') return;
    if (room.ts[teamIndex].u) return;
    room.ts.forEach(t => {
      if (t.u === socket.id) {
        t.u = '';
        t.o = '';
      }
    });
    room.ts[teamIndex].u = socket.id;
    room.ts[teamIndex].o = name || 'Player';
    io.to(code).emit('state_update', room);
  });

  socket.on('kick_team', ({ code, teamIndex }) => {
    const room = rooms[code];
    if (!room || room.h !== socket.id) return;
    room.ts[teamIndex].u = '';
    room.ts[teamIndex].o = '';
    io.to(code).emit('state_update', room);
  });

  socket.on('sync_state', ({ code, newState }) => {
    const room = rooms[code];
    if (!room) return;
    rooms[code] = newState;
    io.to(code).emit('state_update', newState);
  });

  socket.on('close_room', ({ code }) => {
    const room = rooms[code];
    if (!room || room.h !== socket.id) return;
    delete rooms[code];
    io.to(code).emit('room_closed', 'Host closed the lobby.');
  });

  socket.on('leave_room', ({ code }) => {
    const room = rooms[code];
    if (room && room.st === 'lobby') {
      room.ts.forEach(t => {
        if (t.u === socket.id) {
          t.u = '';
          t.o = '';
        }
      });
      io.to(code).emit('state_update', room);
    }
  });

  socket.on('disconnect', () => {});
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
