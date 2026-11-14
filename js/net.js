// スクリーン（投影）とスマホ（コントローラー）をつなぐ通信。
//   ふつう      : Firestore  crane_rooms/{room} と crane_rooms/{room}/players/{id}
//   ?local つき : 同じブラウザのタブどうしだけ（BroadcastChannel）。テスト用。
import { firebaseConfig } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';

export async function createNet(room, { local = false, onError = () => {} } = {}) {
  return local ? localNet(room) : firestoreNet(room, onError);
}

async function firestoreNet(room, onError) {
  const [{ initializeApp }, fs] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-firestore.js`),
  ]);
  const db = fs.getFirestore(initializeApp(firebaseConfig));
  const roomRef = fs.doc(db, 'crane_rooms', room);
  const players = fs.collection(roomRef, 'players');
  const guard = (p) => p.catch((e) => { onError(e); });
  return {
    setRoom: (data) => guard(fs.setDoc(roomRef, data)),
    onRoom: (cb) => fs.onSnapshot(roomRef, (s) => cb(s.exists() ? s.data() : null), onError),
    setPlayer: (id, data) => guard(fs.setDoc(fs.doc(players, id), data, { merge: true })),
    removePlayer: (id) => guard(fs.deleteDoc(fs.doc(players, id))),
    onPlayers: (cb) => fs.onSnapshot(players, (s) => {
      const m = {};
      s.forEach((d) => { m[d.id] = d.data(); });
      cb(m);
    }, onError),
  };
}

function localNet(room) {
  const ch = new BroadcastChannel('crane-' + room);
  const RK = 'crane-room-' + room;
  const PK = 'crane-players-' + room;
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const roomCbs = [];
  const playerCbs = [];
  const fire = (what) => {
    if (what === 'room') roomCbs.forEach((cb) => cb(read(RK, null)));
    else playerCbs.forEach((cb) => cb(read(PK, {})));
  };
  ch.onmessage = (e) => fire(e.data);
  const changed = (what) => { ch.postMessage(what); setTimeout(() => fire(what), 0); };
  return {
    setRoom: async (data) => { localStorage.setItem(RK, JSON.stringify(data)); changed('room'); },
    onRoom: (cb) => { roomCbs.push(cb); setTimeout(() => cb(read(RK, null)), 0); },
    setPlayer: async (id, data) => {
      const m = read(PK, {});
      m[id] = { ...(m[id] || {}), ...data };
      localStorage.setItem(PK, JSON.stringify(m));
      changed('players');
    },
    removePlayer: async (id) => {
      const m = read(PK, {});
      delete m[id];
      localStorage.setItem(PK, JSON.stringify(m));
      changed('players');
    },
    onPlayers: (cb) => { playerCbs.push(cb); setTimeout(() => cb(read(PK, {})), 0); },
  };
}
