const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "state.json");
fs.mkdirSync(DATA_DIR, { recursive: true });

app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));

let db = { users: {}, history: [] };
if (fs.existsSync(DB_FILE)) {
  try { db = JSON.parse(fs.readFileSync(DB_FILE, "utf8")); }
  catch { console.error("state.json không đọc được; dùng dữ liệu mới."); }
}
function saveDb() {
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}
const sessions = new Map(); // token -> username (demo session store)
const socketUsers = new Map();
const STARTING_POINTS = 1000000;
const MIN_BET = 1000;
const MAX_BET = 1000000;
const BETTING_SECONDS = 15;
let roundNumber = 1;
let round = { id: roundNumber, status: "open", endsAt: Date.now() + BETTING_SECONDS * 1000, bets: new Map() };

function safeUser(username) {
  const u = db.users[username];
  if (!u) return null;
  return { username, balance: u.balance, createdAt: u.createdAt };
}
function userFromToken(token) {
  const username = sessions.get(token);
  return username && db.users[username] ? username : null;
}
function auth(req, res, next) {
  const raw = req.headers.authorization || "";
  const token = raw.startsWith("Bearer ") ? raw.slice(7) : "";
  const username = userFromToken(token);
  if (!username) return res.status(401).json({ error: "Bạn cần đăng nhập lại." });
  req.username = username;
  next();
}
function cleanUsername(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_]{3,20}$/.test(value);
}

app.get("/api/health", (_req, res) => res.json({ ok: true, mode: "virtual-points-demo" }));
app.post("/api/register", async (req, res) => {
  const { username, password } = req.body || {};
  if (!cleanUsername(username)) return res.status(400).json({ error: "Tên tài khoản dài 3–20 ký tự, chỉ gồm chữ, số và dấu gạch dưới." });
  if (typeof password !== "string" || password.length < 8 || password.length > 100)
    return res.status(400).json({ error: "Mật khẩu cần từ 8 đến 100 ký tự." });
  if (db.users[username]) return res.status(409).json({ error: "Tên tài khoản đã tồn tại." });
  const passwordHash = await bcrypt.hash(password, 12);
  db.users[username] = { passwordHash, balance: STARTING_POINTS, createdAt: new Date().toISOString() };
  saveDb();
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, username);
  res.json({ token, user: safeUser(username) });
});
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body || {};
  const u = db.users[username];
  if (!u || typeof password !== "string" || !(await bcrypt.compare(password, u.passwordHash)))
    return res.status(401).json({ error: "Tên tài khoản hoặc mật khẩu không đúng." });
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, username);
  res.json({ token, user: safeUser(username) });
});
app.post("/api/logout", auth, (req, res) => {
  const token = (req.headers.authorization || "").slice(7);
  sessions.delete(token);
  res.json({ ok: true });
});
app.get("/api/me", auth, (req, res) => res.json({ user: safeUser(req.username) }));
app.get("/api/history", (_req, res) => res.json({ history: db.history.slice(0, 30) }));

function publicRound() {
  return { id: round.id, status: round.status, endsAt: round.endsAt, secondsLeft: Math.max(0, Math.ceil((round.endsAt - Date.now()) / 1000)) };
}
function broadcastState() {
  io.emit("round:state", { round: publicRound(), history: db.history.slice(0, 15) });
  for (const [socketId, username] of socketUsers) {
    const s = io.sockets.sockets.get(socketId);
    if (s) s.emit("user:balance", { balance: db.users[username]?.balance ?? 0 });
  }
}
function beginRound() {
  roundNumber += 1;
  round = { id: roundNumber, status: "open", endsAt: Date.now() + BETTING_SECONDS * 1000, bets: new Map() };
  io.emit("round:opened", publicRound());
  broadcastState();
}
function settleRound() {
  if (round.status !== "open") return;
  round.status = "closed";
  const dice = [1, 2, 3].map(() => crypto.randomInt(1, 7));
  const sum = dice.reduce((a, b) => a + b, 0);
  const triple = dice.every(n => n === dice[0]);
  const result = sum >= 11 ? "Tài" : "Xỉu";
  const outcomes = [];
  for (const [username, bet] of round.bets) {
    const user = db.users[username];
    if (!user) continue;
    const won = !triple && bet.choice === result;
    if (won) user.balance += bet.amount * 2; // stake was deducted at bet time
    outcomes.push({ username, choice: bet.choice, amount: bet.amount, won, payout: won ? bet.amount * 2 : 0 });
    const tokenSocket = [...socketUsers.entries()].find(([, name]) => name === username);
    if (tokenSocket) {
      const s = io.sockets.sockets.get(tokenSocket[0]);
      if (s) s.emit("bet:result", { roundId: round.id, choice: bet.choice, amount: bet.amount, won, payout: won ? bet.amount * 2 : 0, balance: user.balance, result, sum, dice, triple });
    }
  }
  const record = { id: round.id, dice, sum, result, triple, at: new Date().toISOString(), playerCount: round.bets.size, outcomes };
  db.history.unshift(record);
  db.history = db.history.slice(0, 100);
  saveDb();
  io.emit("round:result", record);
  broadcastState();
  setTimeout(beginRound, 3500);
}
setInterval(() => {
  if (round.status === "open" && Date.now() >= round.endsAt) settleRound();
  else broadcastState();
}, 1000);

io.on("connection", socket => {
  socket.emit("round:state", { round: publicRound(), history: db.history.slice(0, 15) });
  socket.on("auth", token => {
    const username = userFromToken(token);
    if (!username) return socket.emit("notice", "Đăng nhập để đặt cược bằng điểm ảo.");
    socketUsers.set(socket.id, username);
    socket.emit("auth:ok", { user: safeUser(username) });
    socket.emit("user:balance", { balance: db.users[username].balance });
  });
  socket.on("bet:place", payload => {
    const username = socketUsers.get(socket.id);
    if (!username || !db.users[username]) return socket.emit("notice", "Bạn cần đăng nhập.");
    if (round.status !== "open") return socket.emit("notice", "Phiên đã đóng cược.");
    if (round.bets.has(username)) return socket.emit("notice", "Mỗi tài khoản chỉ đặt một cược mỗi phiên demo.");
    const choice = payload?.choice;
    const amount = Number(payload?.amount);
    if (!["Tài", "Xỉu"].includes(choice)) return socket.emit("notice", "Lựa chọn không hợp lệ.");
    if (!Number.isSafeInteger(amount) || amount < MIN_BET || amount > MAX_BET) return socket.emit("notice", "Cược từ 1.000 đến 1.000.000 điểm ảo.");
    const user = db.users[username];
    if (amount > user.balance) return socket.emit("notice", "Không đủ điểm ảo.");
    user.balance -= amount;
    round.bets.set(username, { choice, amount });
    saveDb();
    socket.emit("bet:accepted", { roundId: round.id, choice, amount, balance: user.balance });
    io.emit("bet:count", { roundId: round.id, count: round.bets.size });
    socket.emit("user:balance", { balance: user.balance });
  });
  socket.on("chat:send", message => {
    const username = socketUsers.get(socket.id);
    if (!username) return socket.emit("notice", "Đăng nhập để chat.");
    if (typeof message !== "string") return;
    const text = message.trim().slice(0, 160);
    if (text) io.emit("chat:message", { username, text, at: new Date().toISOString() });
  });
  socket.on("disconnect", () => socketUsers.delete(socket.id));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Tài Xỉu điểm ảo đang chạy: http://localhost:${PORT}`);
});
