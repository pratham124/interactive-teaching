#!/usr/bin/env node
// interactive-teaching: the classroom server and the teacher's command line. Plain Node, no dependencies.
//
// The teacher (the agent) never edits state.json. Each command below does one checked change and
// prints one short line. The learner's page streams state.json over SSE and posts Sends, which land
// in events.jsonl (one JSON line each) and are printed by `serve`, so a Monitor on `serve` wakes the agent.
//
// Setup and listening
//   init --topic T [--intent I]          set up ./.teach and copy the starter kit into ./assets
//   serve [--port N]                     serve the page and the workspace; print each Send as a line
//   url                                  print the running server's url
//   stop                                 shut the running server down cleanly, exit 0 (its port is remembered for next time)
//   pending                              print every Send newer than the last ack (replay on resume)
//   wait [--after N] [--timeout S]       block until a Send newer than N, print it, exit 0 (3 = timeout)
//   show                                 one-screen summary of the classroom (ids, statuses, scores, outcomes)
//   progress                             "is this working?": per lesson status, first-attempt score and outcome, then every
//                                        learning-records/*.md (title, Level:, superseded last), then a tally. Read-only plain
//                                        text; needs no server, and with no .teach/ it prints the records alone.
//
// Teaching (A.I = action I of send A, e.g. 7.0; text is the last arguments, or - to read it from stdin)
//   reply A.I [text]                     answer a learner's thread question or recall item where it was asked
//   say --lesson ID|--q ID|--general [text]   post a message of your own
//   ask ID --title T [--body B] [--option K=text]... [--rec K | --rec-text T, with --why W] [--kind mission|check-in]
//   answer A.I | answer ID --option K | --text T     record a question's answer
//   defer ID
//   lesson add ID --title T --file lessons/x.html [--goal G]     (status: drafting)
//   lesson ready|done ID   lesson failed ID --note N   lesson retitle ID --title T   lesson outcome ID R (below)
//                                        (ready first runs check-lesson: it refuses a lesson with errors, prints warnings)
//   check-lesson <file> [--render]       check a lesson's HTML will work: kit links, quiz markup, relative links.
//                                        Prints {ok,file,items,errors,warnings}; exit 2 when there are errors.
//                                        --render (after a clean static check) also opens the lesson in headless
//                                        Chrome or Edge with #teach-selftest, lets the kit click through every
//                                        item, and adds render:{ran,browser,ok,items,errors}: did each activity
//                                        render, respond and report exactly once? Render problems exit 2 too; no
//                                        browser found is only a warning (set TEACH_BROWSER to a browser path).
//                                        `lesson ready` never renders: it stays fast and dependency-free.
//   lesson outcome ID learned|partial|not-yet [--note "<one line of evidence>"]
//                                        did the lesson achieve its objective? Evidence, not activity. Changeable later (a
//                                        re-teach); the latest wins and the previous one is kept in outcomeHistory.
//   score ID [R/T]                       set a lesson's score; without R/T it is counted from the learner's quiz sends
//   current ID                           the lesson (or question) the page opens by default
//   note [text] | note --clear           the short line above the lesson list
//   queue add [text] | queue clear       lesson requests that arrived while one was drafting
//   working                              tell the page you are on it (Send is disabled until ack)
//   ack SEQ                              mark every send up to SEQ handled; the page clears its spinner
//   finish [summary]                     end the session (page locks; stop the server afterwards)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomBytes } from "node:crypto";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KIT = ["teach.css", "teach-quiz.js", "outfit.woff2", "outfit-OFL.txt"];

// ---------- small helpers ----------
const FLAGS = new Set(["general", "clear", "render"]); // switches that never take a value
function parseArgs(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { o._.push(a); continue; }
    const k = a.slice(2), v = argv[i + 1];
    const val = FLAGS.has(k) || v === undefined || v.startsWith("--") ? true : (i++, v);
    if (k === "option") (o.option = o.option || []).push(val); else o[k] = val;
  }
  return o;
}
class UsageError extends Error {}
const fail = (msg) => { throw new UsageError(msg); };
const print = (obj) => process.stdout.write(JSON.stringify(obj) + "\n");
const strArg = (o, k, what) => { const v = o[k]; if (v === undefined || v === true || v === "") fail(`--${k} <${what}> is required`); return String(v); };
const optStr = (o, k) => (typeof o[k] === "string" ? o[k] : undefined);
function writeJson(file, obj) {
  const tmp = `${file}.${process.pid}.tmp`;
  try { fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + "\n"); fs.renameSync(tmp, file); } catch (e) { fs.rmSync(tmp, { force: true }); throw e; }
}
const SESSION = path.resolve(".teach");
const STATE = path.join(SESSION, "state.json");
const EVENTS = path.join(SESSION, "events.jsonl");
const SERVER = path.join(SESSION, "server.json");
function needSession() { if (!fs.existsSync(STATE)) fail(`no classroom here (${SESSION}); run init from the workspace folder first`); }
function readState() { needSession(); return JSON.parse(fs.readFileSync(STATE, "utf8")); }
function readEvents() {
  if (!fs.existsSync(EVENTS)) return [];
  const out = [];
  for (const line of fs.readFileSync(EVENTS, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { out.push({ line, ev: JSON.parse(line) }); } catch { /* partial line */ }
  }
  return out;
}
const lastSeq = () => readEvents().reduce((m, { ev }) => Math.max(m, Number(ev.seq) || 0), 0);
// Message text: the remaining arguments, or "-" to read a heredoc from stdin so long replies need
// no quoting. stdin is read only when asked: an agent's shell often leaves it open, and reading
// it unasked would block forever.
function textArg(o, from, what = "text") {
  const rest = o._.slice(from);
  if (rest.length === 1 && rest[0] === "-") {
    let t = ""; try { t = fs.readFileSync(0, "utf8").trim(); } catch { /* no stdin */ }
    if (t) return t;
    fail(`no ${what} on stdin`);
  }
  const pos = rest.join(" ").trim();
  if (pos) return pos;
  fail(`no ${what}: give it as the last argument, or - and a heredoc on stdin`);
}
// Change state.json: read, apply fn, write atomically. fn returns the one-line summary to print.
function mutate(fn) {
  const st = readState();
  const now = new Date().toISOString();
  const result = fn(st, now);
  writeJson(STATE, st);
  print({ ok: true, ...result });
}
// Each item's FIRST attempt counts: a retake after a revisit (or after the lesson was edited) is practice, not new evidence.
function quizScore(id) {
  const items = new Map();
  for (const { ev } of readEvents()) for (const a of ev.actions || []) if (a.type === "quiz" && a.lesson === id && !items.has(a.item)) items.set(a.item, !!a.correct);
  return items.size ? { right: [...items.values()].filter(Boolean).length, total: items.size } : null;
}
const lessonOf = (st, id) => st.lessons.find((l) => l.id === id) || fail(`no lesson ${id} (lessons: ${st.lessons.map((l) => l.id).join(", ") || "none"})`);
const questionOf = (st, id) => st.questions.find((q) => q.id === id) || fail(`no question ${id} (questions: ${st.questions.map((q) => q.id).join(", ") || "none"})`);
function actionRef(ref) {
  const m = /^(\d+)\.(\d+)$/.exec(ref || "");
  if (!m) fail(`expected a send action like 7.0 (send 7, action 0), got ${JSON.stringify(ref)}`);
  const seq = Number(m[1]), i = Number(m[2]);
  const ev = readEvents().map((x) => x.ev).find((e) => e.seq === seq) || fail(`no send ${seq} in events.jsonl`);
  const a = (ev.actions || [])[i] || fail(`send ${seq} has no action ${i} (it has ${(ev.actions || []).length})`);
  return { ev, a };
}
function threadOf(st, a) {
  if (a.lesson) return (lessonOf(st, a.lesson).thread ||= []);
  if (a.q) return (questionOf(st, a.q).thread ||= []);
  return (st.thread ||= []);
}

// ---------- setup ----------
function cmdInit(o) {
  const workspace = fs.realpathSync(process.cwd());
  fs.mkdirSync(path.join(workspace, "assets"), { recursive: true });
  const kitAdded = [];
  for (const f of KIT) {
    const dest = path.join(workspace, "assets", f);
    if (!fs.existsSync(dest)) { fs.copyFileSync(path.join(HERE, "kit", f), dest); kitAdded.push(`assets/${f}`); }
  }
  if (fs.existsSync(STATE)) {
    const st = readState();
    // Resuming opens a new session: the last one's `finished` would leave the page locked,
    // so move it into history instead.
    const reopened = !!st.finished;
    if (reopened) {
      st.pastSessions = [...(st.pastSessions || []), st.finished];
      delete st.finished;
      writeJson(STATE, st);
    }
    return print({ ok: true, resumed: true, reopened, topic: st.topic, handled: st.agent.handled || 0, lastSeq: lastSeq(), kitAdded });
  }
  fs.mkdirSync(SESSION, { recursive: true });
  fs.writeFileSync(path.join(SESSION, ".gitignore"), "*\n"); // page state is machine-local scratch
  fs.writeFileSync(EVENTS, "");
  const now = new Date().toISOString();
  writeJson(STATE, { topic: optStr(o, "topic") || "", intent: optStr(o, "intent") || "", workspace, created: now,
    agent: { status: "working", since: now, handled: 0 }, thread: [], questions: [], lessons: [], queued: [] });
  print({ ok: true, resumed: false, workspace, kitAdded });
}

// ---------- serve ----------
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".json": "application/json", ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".mp3": "audio/mpeg", ".mp4": "video/mp4",
  ".woff2": "font/woff2",
};
function snapshot(workspace) {
  // Everything the page shows, as one string: the stream pushes it whenever it changes.
  let state = null;
  try { state = JSON.parse(fs.readFileSync(STATE, "utf8")); } catch { return null; } // mid-write: skip this tick
  const refDir = path.join(workspace, "reference");
  let reference = [];
  try {
    reference = fs.readdirSync(refDir).filter((f) => /\.html?$/i.test(f)).sort().map((f) => {
      let title = f;
      try { const m = /<title>([^<]*)<\/title>/i.exec(fs.readFileSync(path.join(refDir, f), "utf8").slice(0, 8192)); if (m && m[1].trim()) title = m[1].trim(); } catch {}
      return { file: `reference/${f}`, title };
    });
  } catch { /* no reference folder yet */ }
  // MISSION.md steers the teacher; the learner asked not to see it in the page.
  const docs = ["GLOSSARY.md", "RESOURCES.md"].filter((f) => fs.existsSync(path.join(workspace, f)));
  return JSON.stringify({ state, files: { reference, docs } });
}
function cmdServe(o) {
  needSession();
  const workspace = path.dirname(SESSION);
  const page = path.join(HERE, "page.html");
  let seq = lastSeq();
  let selfOrigins = [];
  const token = randomBytes(16).toString("hex"); // lets `stop` (which reads server.json) shut us down without a kill
  const clients = new Set();
  let latest = snapshot(workspace);
  // One poll of the disk for all clients: cheap, and works the same on every OS (fs.watch does not).
  setInterval(() => {
    const s = snapshot(workspace);
    if (s === null || s === latest) return;
    latest = s;
    for (const res of clients) res.write(`data: ${s}\n\n`);
  }, 300);
  setInterval(() => { for (const res of clients) res.write(": ping\n\n"); }, 15000);

  const send = (res, code, body, type, cache = "no-store") => { res.writeHead(code, { "content-type": type, "cache-control": cache }); res.end(body); };
  const json = (res, code, obj) => send(res, code, JSON.stringify(obj), "application/json");
  const srv = http.createServer((req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url, "http://x").pathname); } catch { return json(res, 400, { error: "bad url" }); }
    if (req.method === "GET" && p === "/") return send(res, 200, fs.readFileSync(page), "text/html; charset=utf-8");
    if (req.method === "GET" && p === "/stream") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
      if (latest) res.write(`data: ${latest}\n\n`);
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }
    if (req.method === "GET" && p.startsWith("/w/")) {
      // The workspace, read-only, at the same relative layout as on disk, so a lesson's links
      // (../assets/teach.css, 0002-x.html) resolve the same in the page and opened from a file.
      const rel = p.slice(3), file = path.resolve(workspace, rel);
      if (!file.startsWith(workspace + path.sep) || rel.split(/[\\/]/).some((s) => s.startsWith("."))) return json(res, 403, { error: "outside the workspace" });
      let stat; try { stat = fs.statSync(file); } catch { return json(res, 404, { error: "not found" }); }
      if (!stat.isFile()) return json(res, 404, { error: "not found" });
      return send(res, 200, fs.readFileSync(file), TYPES[path.extname(file).toLowerCase()] || "application/octet-stream", path.extname(file).toLowerCase() === ".woff2" ? "private, max-age=86400" : "no-store");
    }
    if (req.method === "POST" && p === "/send") {
      // Browsers always set Origin on a POST; refuse other sites. No Origin (curl, tests) is allowed.
      if (req.headers.origin !== undefined && !selfOrigins.includes(req.headers.origin)) return json(res, 403, { error: "cross-origin request rejected" });
      let body = "";
      req.on("data", (c) => { body += c; if (body.length > 1e6) req.destroy(); });
      req.on("end", () => {
        let parsed; try { parsed = JSON.parse(body); } catch { return json(res, 400, { error: "body must be JSON" }); }
        if (!parsed || !Array.isArray(parsed.actions) || !parsed.actions.length) return json(res, 400, { error: "actions must be a non-empty array" });
        const currentState = readState(), latest = currentState.lessons?.at(-1);
        for (const action of parsed.actions) if (action?.type === "next") {
          if (currentState.finished) return json(res, 409, {error:"This session has ended. Resume it before continuing."});
          if (latest?.status === "drafting") return json(res, 409, {error:"A lesson is already being prepared."});
          if ((latest && action.lesson !== latest.id) || (!latest && action.lesson)) return json(res, 409, {error:"Open the latest lesson to continue."});
        }
        const line = JSON.stringify({ type: "send", seq: ++seq, at: new Date().toISOString(), actions: parsed.actions });
        fs.appendFileSync(EVENTS, line + "\n");
        process.stdout.write(line + "\n"); // this line is what wakes the agent
        json(res, 200, { ok: true, seq });
      });
      return;
    }
    if (req.method === "POST" && p === "/shutdown") {
      // Only `stop` may call this: browsers always set Origin, so any Origin means a web page; the token proves it read server.json.
      if (req.headers.origin !== undefined) return json(res, 403, { error: "forbidden" });
      let body = "";
      req.on("data", (c) => { body += c; if (body.length > 1e4) req.destroy(); });
      req.on("end", () => {
        let parsed; try { parsed = JSON.parse(body); } catch { parsed = null; }
        if (!parsed || parsed.token !== token) return json(res, 403, { error: "forbidden" });
        // Exit 0 ourselves: on Windows a kill makes the process exit 1, which harnesses report as a failed task.
        res.on("finish", () => setTimeout(() => { for (const c of clients) c.end(); srv.close(); process.exit(0); }, 20));
        json(res, 200, { ok: true });
      });
      return;
    }
    json(res, 404, { error: "not found" });
  });
  const explicit = typeof o.port === "string";
  let port = explicit ? Number(o.port) : (() => { try { return Number(JSON.parse(fs.readFileSync(SERVER, "utf8")).port) || 0; } catch { return 0; } })();
  srv.on("error", (e) => {
    // Reuse last session's port so an open tab reconnects by itself; fall back if it is taken.
    if (!srv.listening && !explicit && port !== 0 && e.code === "EADDRINUSE") { port = 0; srv.listen(0, "127.0.0.1"); return; }
    process.stderr.write(`teach: server error: ${e.message}\n`); process.exit(1);
  });
  srv.on("listening", () => {
    const { port: real } = srv.address();
    const url = `http://127.0.0.1:${real}/`;
    selfOrigins = [`http://127.0.0.1:${real}`, `http://localhost:${real}`];
    writeJson(SERVER, { url, port: real, pid: process.pid, token, started: new Date().toISOString() });
    print({ type: "ready", url });
  });
  srv.listen(port, "127.0.0.1");
  for (const s of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(s, () => process.exit(0));
}
function cmdUrl(o) {
  needSession();
  const deadline = Date.now() + Number(typeof o.timeout === "string" ? o.timeout : 5) * 1000;
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  (function tick() {
    try { const { url, pid } = JSON.parse(fs.readFileSync(SERVER, "utf8")); if (url && alive(pid)) { console.log(url); process.exit(0); } } catch {}
    if (Date.now() >= deadline) { process.stderr.write("teach: no running server (start serve first)\n"); process.exit(1); }
    setTimeout(tick, 100);
  })();
}
async function cmdStop() {
  needSession();
  let info; try { info = JSON.parse(fs.readFileSync(SERVER, "utf8")); } catch { return print({ ok: true, stopped: false, reason: "no server has run here" }); }
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  const wasAlive = !!info.pid && alive(info.pid);
  let graceful = false;
  if (wasAlive && info.url && info.token) {
    try {
      const r = await fetch(new URL("shutdown", info.url), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: info.token }), signal: AbortSignal.timeout(2000) });
      if (r.ok) for (let end = Date.now() + 3000; alive(info.pid) && Date.now() < end;) await new Promise((r) => setTimeout(r, 50));
      graceful = r.ok && !alive(info.pid);
    } catch { /* fall through to the kill */ }
  }
  if (wasAlive && !graceful && alive(info.pid)) { try { process.kill(info.pid); } catch { /* already gone */ } }
  // Keep the port so the next serve reuses it and an open tab reconnects; drop the dead pid, url and token.
  writeJson(SERVER, { port: info.port });
  print({ ok: true, stopped: wasAlive, pid: info.pid || null, graceful });
}
function cmdPending() {
  const handled = readState().agent.handled || 0;
  for (const { line, ev } of readEvents()) if ((Number(ev.seq) || 0) > handled) process.stdout.write(line + "\n");
}
function cmdWait(o) {
  needSession();
  const after = typeof o.after === "string" ? Number(o.after) : (readState().agent.handled || 0);
  const deadline = Date.now() + Number(typeof o.timeout === "string" ? o.timeout : 480) * 1000;
  (function tick() {
    for (const { line, ev } of readEvents()) if ((Number(ev.seq) || 0) > after) { process.stdout.write(line + "\n"); process.exit(0); }
    if (Date.now() >= deadline) process.exit(3);
    setTimeout(tick, 250);
  })();
}
function cmdShow() {
  const st = readState();
  const out = [`${st.topic || "(no topic)"} · agent ${st.agent.status}, handled ${st.agent.handled || 0}, last send ${lastSeq()}${st.finished ? " · FINISHED" : ""}`];
  if (st.note) out.push(`note: ${st.note}`);
  for (const q of st.questions) out.push(`  ${q.id} [${q.status}] ${q.title}${q.answer ? ` → ${q.answer.option || q.answer.text}` : ""}`);
  for (const l of st.lessons) out.push(`  ${l.id} [${l.status}] ${l.title}${l.score ? ` ${l.score.right}/${l.score.total}` : ""}${l.outcome ? ` outcome: ${l.outcome.result}` : ""} (${l.file}, ${(l.thread || []).length} msgs)${st.current === l.id ? " ← current" : ""}`);
  if ((st.queued || []).length) out.push(`queued: ${st.queued.join(" | ")}`);
  console.log(out.join("\n"));
}

// progress: the evidence view. Lessons come from state.json, records straight from the markdown, so it
// works with the server stopped, and with no classroom at all for the records half.
const OUTCOMES = ["learned", "partial", "not-yet"];
const mdBare = (s) => s.replace(/[*_`]/g, "").trim(); // records are hand-written: tolerate **Level:** applied
function readRecords(workspace) {
  const dir = path.join(workspace, "learning-records");
  let names = [];
  try { names = fs.readdirSync(dir).filter((f) => /\.md$/i.test(f)).sort(); } catch { return []; }
  return names.map((f) => {
    let src = ""; try { src = fs.readFileSync(path.join(dir, f), "utf8"); } catch { /* unreadable: list it anyway */ }
    const title = /^#[ \t]+(.+?)\s*$/m.exec(src);
    const level = /^[\s>*_-]*level[\s*_]*:[\s*_]*(\S.*?)\s*$/im.exec(src);
    return { name: f.replace(/\.md$/i, ""), title: title ? mdBare(title[1]) : "(no title)", level: level ? mdBare(level[1]) : "",
      superseded: /^[\s>*_-]*status[\s*_]*:[\s*_]*superseded\b/im.test(src) };
  });
}
function cmdProgress() {
  const workspace = path.dirname(SESSION);
  const out = [];
  const tally = { learned: 0, partial: 0, "not-yet": 0, none: 0 };
  if (!fs.existsSync(STATE)) out.push("No classroom state here (no .teach/); showing learning records only.");
  else {
    const st = readState();
    out.push(`${st.topic || "(no topic)"} · lessons`);
    if (!st.lessons.length) out.push("  (no lessons yet)");
    for (const l of st.lessons) {
      const sc = l.score || quizScore(l.id); // read-only: a computed score is shown, never written
      const oc = l.outcome && OUTCOMES.includes(l.outcome.result) ? l.outcome : null;
      tally[oc ? oc.result : "none"]++;
      out.push(`  ${l.id} ${l.title}  ${l.status}  ${sc ? `${sc.right}/${sc.total}` : "-"}  ${oc ? `${oc.result}${oc.note ? `: ${oc.note}` : ""}` : "no outcome yet"}`);
    }
  }
  const recs = readRecords(workspace);
  out.push("", "Learning records");
  if (!recs.length) out.push("  (none yet)");
  const byLevel = {};
  for (const r of [...recs.filter((r) => !r.superseded), ...recs.filter((r) => r.superseded)]) {
    out.push(`  ${r.name}  ${r.title}  ${r.level || "(no level)"}${r.superseded ? "  [superseded]" : ""}`);
    if (!r.superseded) { const k = r.level ? r.level.split(/\s+/)[0].toLowerCase() : "no level"; byLevel[k] = (byLevel[k] || 0) + 1; }
  }
  const lv = Object.entries(byLevel).map(([k, n]) => `${n} ${k}`).join(", ");
  const nSup = recs.filter((r) => r.superseded).length;
  out.push("", `Tally: lessons ${tally.learned} learned, ${tally.partial} partial, ${tally["not-yet"]} not-yet, ${tally.none} no outcome yet` +
    ` · records ${lv || "none"}${nSup ? ` (+${nSup} superseded)` : ""}`);
  console.log(out.join("\n"));
}

// ---------- lesson check ----------
// Lessons are written by a subagent; this is the deterministic gate before the learner sees one.
// The markup is our own and regular (see kit/teach-quiz.js), so regexes do; no HTML parser.
const TAG_BODY = `(?:"[^"]*"|'[^']*'|[^'">])*`; // quote-aware: data-feedback may hold a ">"
const TAG = new RegExp(`<([a-zA-Z][\\w-]*)(${TAG_BODY})>`, "g");
const ANY_TAG = new RegExp(`</?[a-zA-Z][\\w-]*${TAG_BODY}>`, "g");
const ENTITY = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };
function attrsOf(s) {
  const a = {};
  for (const m of s.matchAll(/([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) a[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  return a;
}
const openTags = (html) => [...html.matchAll(TAG)].map((m) => ({ name: m[1].toLowerCase(), attrs: attrsOf(m[2]), start: m.index, end: m.index + m[0].length }));
const hasClass = (t, c) => (t.attrs.class || "").split(/\s+/).includes(c);
function bodyOf(html, t) { // up to the matching close tag, counting nested tags of the same name
  const re = new RegExp(`<(/?)${t.name}\\b${TAG_BODY}>`, "gi");
  re.lastIndex = t.end;
  for (let depth = 1, m; (m = re.exec(html));) { depth += m[1] ? -1 : 1; if (depth === 0) return html.slice(t.end, m.index); }
  return html.slice(t.end);
}
// Entities are decoded in one pass so "&amp;lt;" becomes "&lt;", not "<".
const plain = (s) => s.replace(ANY_TAG, "").replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e) => ENTITY[e]).replace(/\s+/g, " ").trim();

function checkLesson(workspace, file) {
  const errors = [], warnings = [];
  const abs = path.resolve(workspace, file);
  let src; try { src = fs.readFileSync(abs, "utf8"); } catch { return { file, items: 0, errors: [`${file} does not exist`], warnings }; }
  // Comments and inline script/style bodies may hold example markup; blank them so it is not checked.
  const html = src.replace(/<!--[\s\S]*?-->/g, "").replace(/(<(script|style)\b[^>]*>)[\s\S]*?(<\/\2\s*>)/gi, "$1$3");
  const tags = openTags(html);
  const dir = path.dirname(abs);
  const external = (u) => /^(https?:|\/\/)/i.test(u);

  if (!/<title\b[^>]*>[^<]*\S[^<]*<\/title>/i.test(html)) errors.push("no <title>");

  // The kit, matched by the path from this file's folder, so lessons/ and reference/ both work.
  const kit = (f) => path.relative(dir, path.join(workspace, "assets", f)).split(path.sep).join("/");
  const norm = (u) => path.posix.normalize(u.trim().split(/[?#]/)[0]);
  const loads = (tag, attr, f) => tags.some((t) => t.name === tag && t.attrs[attr] !== undefined && !external(t.attrs[attr]) && norm(t.attrs[attr]) === kit(f));
  if (!loads("link", "href", "teach.css")) errors.push(`does not link ${kit("teach.css")}`);
  if (!loads("script", "src", "teach-quiz.js")) errors.push(`does not load ${kit("teach-quiz.js")}`);
  for (const t of tags) {
    const attr = t.name === "script" ? "src" : t.name === "link" ? "href" : null;
    if (attr && t.attrs[attr] !== undefined && external(t.attrs[attr].trim())) errors.push(`external ${t.name} ${attr} ${t.attrs[attr].trim()} will not load offline`);
  }

  // Relative links must exist in the workspace. Other schemes, #anchors and /absolute paths are not ours to check.
  const broken = new Set();
  for (const t of tags) for (const attr of ["href", "src"]) {
    const u = (t.attrs[attr] ?? "").trim();
    if (!u || /^([a-z][a-z0-9+.-]*:|#|\/)/i.test(u)) continue;
    let p = u.split(/[?#]/)[0];
    if (!p) continue;
    try { p = decodeURIComponent(p); } catch { /* use as written */ }
    if (!fs.existsSync(path.resolve(dir, p))) broken.add(u);
  }
  for (const u of broken) errors.push(`broken relative link ${u}`);

  const KINDS = ["tq-quiz", "tq-fill", "tq-recall"];
  const items = tags.filter((t) => KINDS.some((c) => hasClass(t, c)));
  const seen = new Set(), dup = new Set();
  items.forEach((t, n) => {
    const kind = KINDS.find((c) => hasClass(t, c)).slice(3);
    const id = (t.attrs["data-id"] || "").trim();
    const who = id ? `${kind} "${id}"` : `${kind} #${n + 1}`;
    if (!id) errors.push(`${who} has no data-id`);
    else if (!seen.has(id)) seen.add(id);
    else if (!dup.has(id)) { dup.add(id); errors.push(`data-id "${id}" is used more than once`); }
    const body = bodyOf(html, t);
    const inner = openTags(body);
    if (kind === "quiz") {
      const list = inner.find((x) => hasClass(x, "tq-choices"));
      if (!list) { errors.push(`${who} has no .tq-choices list`); return; }
      const cb = bodyOf(body, list);
      const lis = openTags(cb).filter((x) => x.name === "li");
      const isRight = (x) => x.attrs["data-correct"] !== undefined;
      const right = lis.filter(isRight).length;
      if (right !== 1) errors.push(`${who} needs exactly one data-correct choice, found ${right}`);
      lis.forEach((x, i) => {
        if (isRight(x)) return;
        const missing = ["data-feedback", "data-misconception"].filter((k) => !(x.attrs[k] || "").trim());
        if (missing.length) warnings.push(`${who} wrong choice ${i + 1} lacks ${missing.join(" and ")}`);
      });
      // A longer or wordier choice gives the answer away, so uneven choices are a quality warning.
      const raws = lis.map((x, i) => cb.slice(x.end, lis[i + 1]?.start ?? cb.length).split(/<\/li\s*>/i)[0]);
      const texts = raws.map(plain);
      // Except when every choice is code: outputs like [120.0, 150.0] vs [] are what different
      // mistakes actually produce, and evening their length would mean faking them.
      const isCode = (raw) => /<(code|pre)\b/i.test(raw) && !plain(raw.replace(/<(code|pre)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ""));
      if (texts.length > 1 && !raws.every(isCode)) {
        const words = texts.map((s) => (s ? s.split(" ").length : 0)), chars = texts.map((s) => s.length);
        const [wl, wh, cl, ch] = [Math.min(...words), Math.max(...words), Math.min(...chars), Math.max(...chars)];
        if (wl !== wh || ch > 1.3 * cl) warnings.push(`${who} choices are uneven in length (${wl}-${wh} words, ${cl}-${ch} characters)`);
      }
    } else if (kind === "fill") {
      const blanks = inner.filter((x) => hasClass(x, "tq-blank"));
      if (!blanks.length) errors.push(`${who} has no .tq-blank`);
      blanks.forEach((b, i) => { if (!(b.attrs["data-answer"] || "").trim()) errors.push(`${who} blank ${i + 1} has no data-answer`); });
    } else if (!inner.some((x) => hasClass(x, "tq-prompt"))) errors.push(`${who} has no .tq-prompt`);
  });
  if (!items.length) warnings.push("no quiz-kit items, so the lesson has no practice");
  else {
    if (!items.some((t) => hasClass(t, "tq-fill") || hasClass(t, "tq-recall"))) warnings.push("no production item: add a .tq-fill or .tq-recall so the learner produces something, not only recognises it");
    if (hasClass(items[items.length - 1], "tq-quiz")) warnings.push("ends on recognition: the last item is multiple choice; end the lesson with a .tq-fill or .tq-recall the learner produces unaided");
  }
  return { file, items: items.length, errors, warnings };
}

// ---------- render check ----------
// --render: open the lesson in a real headless Chromium with #teach-selftest; the kit clicks through
// every item itself and writes a JSON summary into the DOM (see the self-test notes in kit/teach-quiz.js).
function findBrowser() {
  const env = process.env.TEACH_BROWSER;
  if (env && fs.existsSync(env)) return env;
  const local = process.env.LOCALAPPDATA;
  const fixed = process.platform === "win32" ? [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    ...(local ? [path.join(local, "Google", "Chrome", "Application", "chrome.exe")] : []),
  ] : process.platform === "darwin" ? [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ] : [];
  for (const p of fixed) if (fs.existsSync(p)) return p;
  if (process.platform !== "win32" && process.platform !== "darwin") {
    for (const name of ["google-chrome", "chromium", "chromium-browser", "microsoft-edge"]) {
      for (const dir of (process.env.PATH || "").split(path.delimiter)) {
        if (!dir) continue;
        const p = path.join(dir, name);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  return null;
}
// Run the browser to completion, or kill it (and its children) after timeoutMs. Resolves { stdout, stderr, timedOut }.
function runBrowser(browser, args, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(browser, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "", stderr = "", timedOut = false, settled = false;
    const done = () => { if (settled) return; settled = true; clearTimeout(timer); resolve({ stdout, stderr, timedOut }); };
    const killTree = () => {
      if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      else try { child.kill("SIGKILL"); } catch { /* already gone */ }
    };
    const timer = setTimeout(() => { timedOut = true; killTree(); setTimeout(done, 500); }, timeoutMs);
    child.stdout.on("data", (c) => { stdout += c; });
    child.stderr.on("data", (c) => { if (stderr.length < 1e6) stderr += c; });
    child.on("error", () => done());
    // 'close' waits for stdout to end; a stray browser child can hold the pipe, so do not wait long after exit.
    child.on("exit", () => setTimeout(done, 1500));
    child.on("close", done);
  });
}
async function renderLesson(workspace, file) {
  const browser = findBrowser();
  if (!browser) return { ran: false, reason: "no Chrome or Edge found" };
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "teach-render-"));
  const url = pathToFileURL(path.resolve(workspace, file)).href + "#teach-selftest";
  const args = ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--allow-file-access-from-files",
    ...(typeof process.getuid === "function" && process.getuid() === 0 ? ["--no-sandbox"] : []),
    `--user-data-dir=${profile}`, "--virtual-time-budget=8000", "--enable-logging=stderr", "--v=0", "--dump-dom", url];
  const fall = (errors) => ({ ran: true, browser, ok: false, items: [], errors });
  try {
    const { stdout, stderr, timedOut } = await runBrowser(browser, args, 30000);
    const m = /<pre\b[^>]*\bid="tq-selftest-result"[^>]*>([\s\S]*?)<\/pre>/.exec(stdout);
    if (!m) {
      return fall([timedOut ? "the browser did not finish within 30 s"
        : "no self-test result in the page: the browser failed to load it, or assets/teach-quiz.js is an old copy without self-test (copy the current kit/teach-quiz.js over it)"]);
    }
    let sum;
    try { sum = JSON.parse(m[1].replace(/&(lt|gt|amp|quot|#39);/g, (_, e) => ({ lt: "<", gt: ">", amp: "&", quot: '"', "#39": "'" })[e])); }
    catch (e) { return fall([`could not read the self-test result: ${e.message}`]); }
    // The kit only hears errors thrown after it loads (it is deferred); the browser's own console log also
    // has the ones from earlier inline scripts. Keep uncaught errors from the lesson's files, once each.
    const errors = [...(sum.errors || [])], extra = [];
    for (const l of stderr.split(/\r?\n/)) {
      const c = /CONSOLE[:(]\d+\)?\] "(Uncaught [^"]*)", source: file:/.exec(l);
      if (c && !errors.some((e) => e.includes(c[1])) && !extra.includes(c[1])) extra.push(c[1]);
    }
    errors.push(...extra.map((e) => `error: ${e}`));
    return { ran: true, browser, ok: !!sum.ok && !extra.length, items: sum.items || [], errors };
  } finally {
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch { /* a lingering browser process may hold it; the OS temp cleaner gets it */ }
  }
}
async function cmdCheckLesson(o) {
  // No needSession: a lesson can be checked in any workspace, classroom or not.
  const file = (o._[1] || fail("check-lesson needs a lesson file, e.g. check-lesson lessons/0002-x.html")).replace(/\\/g, "/");
  const workspace = path.dirname(SESSION);
  const r = checkLesson(workspace, file);
  let render;
  if (o.render) {
    if (r.errors.length) render = { ran: false, reason: "static check has errors; fix them first" };
    else {
      render = await renderLesson(workspace, file);
      if (!render.ran) r.warnings.push(`render check skipped: ${render.reason}`);
    }
  }
  const bad = r.errors.length > 0 || (render && render.ran && !render.ok);
  print({ ok: !bad, ...r, ...(render ? { render } : {}) });
  if (bad) process.exitCode = 2; // the JSON line is the result; the exit code only says whether to fix
}

// ---------- teaching verbs ----------
function userText(a) {
  if (a.type === "recall") return `Recall: ${a.prompt}\n${a.text}`;
  if (a.type === "thread" || a.type === "next") return String(a.text || "");
  fail(`action is a ${a.type}; reply works on thread and recall actions (use say for anything else)`);
}
const verbs = {
  reply(o) {
    const { ev, a } = actionRef(o._[1]);
    const text = textArg(o, 2, "reply");
    mutate((st, now) => {
      const th = threadOf(st, a);
      th.push({ who: "user", text: userText(a), at: ev.at }, { who: "agent", text, at: now });
      return { thread: a.lesson || a.q || "general", messages: th.length };
    });
  },
  say(o) {
    const text = textArg(o, 1, "message");
    mutate((st, now) => {
      const a = typeof o.lesson === "string" ? { lesson: o.lesson } : typeof o.q === "string" ? { q: o.q } : o.general ? {} : fail("say needs --lesson ID, --q ID or --general");
      threadOf(st, a).push({ who: "agent", text, at: now });
      return { thread: a.lesson || a.q || "general" };
    });
  },
  ask(o) {
    const id = o._[1] || fail("ask needs an id, e.g. ask m1 --title …");
    const options = (o.option || []).map((s) => {
      const m = /^([A-Za-z0-9]+)=(.+)$/s.exec(String(s)) || fail(`--option must look like A=text, got ${JSON.stringify(s)}`);
      return { k: m[1], text: m[2].trim() };
    });
    // A recommendation is optional: factual questions ("what have you tried?") have nothing to recommend.
    let rec;
    if (typeof o.rec === "string") {
      if (!options.some((x) => x.k === o.rec)) fail(`--rec ${o.rec} is not one of the options (${options.map((x) => x.k).join(", ") || "none"})`);
      rec = { option: o.rec, why: strArg(o, "why", "one paragraph naming the trade-off") };
    } else if (typeof o["rec-text"] === "string") rec = { text: o["rec-text"], why: strArg(o, "why", "one paragraph naming the trade-off") };
    else if (o.why !== undefined) fail("--why goes with --rec K or --rec-text T");
    if (!options.length && !rec) fail("a question needs --option choices, a --rec-text, or both");
    const kind = optStr(o, "kind") || "mission";
    if (!["mission", "check-in"].includes(kind)) fail("--kind must be mission or check-in");
    mutate((st) => {
      if (st.questions.some((q) => q.id === id)) fail(`question ${id} already exists`);
      st.questions.push({ id, kind, title: strArg(o, "title", "question"), body: optStr(o, "body") || "", options, ...(rec ? { rec } : {}), status: "open", thread: [] });
      return { question: id, open: st.questions.filter((q) => q.status === "open").length };
    });
  },
  answer(o) {
    const ref = o._[1] || fail("answer needs a send action (7.0) or a question id");
    let id, answer;
    if (/^\d+\.\d+$/.test(ref)) {
      const { a } = actionRef(ref);
      if (a.type !== "answer") fail(`action ${ref} is a ${a.type}, not an answer`);
      id = a.q; answer = { kind: a.kind || (a.text ? "text" : "option"), ...(a.option ? { option: a.option } : {}), ...(a.text ? { text: a.text } : {}) };
    } else {
      id = ref;
      if (typeof o.option === "object") answer = { kind: "option", option: String(o.option[0]) };
      else if (typeof o.text === "string") answer = { kind: "text", text: o.text };
      else fail("answer ID needs --option K or --text T");
    }
    mutate((st) => { const q = questionOf(st, id); q.answer = answer; q.status = "answered"; return { question: id, answer: answer.option || answer.text }; });
  },
  defer(o) { mutate((st) => { questionOf(st, o._[1]).status = "deferred"; return { question: o._[1], status: "deferred" }; }); },
  lesson(o) {
    const sub = o._[1], id = o._[2] || fail("lesson needs a subcommand and an id, e.g. lesson add 0001 --title …");
    let warnings = [];
    mutate((st, now) => {
      if (sub === "add") {
        if (st.lessons.some((l) => l.id === id)) fail(`lesson ${id} already exists`);
        const file = strArg(o, "file", "lessons/NNNN-slug.html").replace(/\\/g, "/");
        if (file.startsWith("/") || file.includes("..") || /^[a-z]:/i.test(file)) fail("--file must be relative to the workspace, e.g. lessons/0001-cargo.html");
        st.lessons.push({ id, title: strArg(o, "title", "title"), file, goal: optStr(o, "goal") || "", status: "drafting", since: now, thread: [] });
        st.current = id;
        return { lesson: id, status: "drafting" };
      }
      const l = lessonOf(st, id);
      if (sub === "outcome") {
        const result = o._[3];
        if (!OUTCOMES.includes(result)) fail(`lesson outcome needs a result: ${OUTCOMES.join(" | ")} (got ${JSON.stringify(result ?? "")})`);
        if (o.note !== undefined && typeof o.note !== "string") fail("--note <one line of evidence> needs a value");
        // Keep only the latest, but a changed verdict (not-yet then learned after a re-teach) stays visible.
        if (l.outcome) (l.outcomeHistory ||= []).push(l.outcome);
        l.outcome = { result, ...(o.note?.trim() ? { note: o.note.trim() } : {}), at: now };
        return { lesson: id, outcome: result, ...(l.outcomeHistory ? { changed: l.outcomeHistory.length } : {}) };
      }
      if (sub === "ready" || sub === "done") {
        if (!fs.existsSync(path.join(path.dirname(SESSION), l.file))) fail(`${l.file} does not exist yet; a lesson is ready only once its file is written`);
        if (sub === "ready") {
          const r = checkLesson(path.dirname(SESSION), l.file);
          const n = r.errors.length;
          if (n) fail(`${l.file} has ${n} error${n > 1 ? "s" : ""}: ${r.errors.slice(0, 3).join("; ")}${n > 3 ? `; and ${n - 3} more` : ""}. Fix them, or run check-lesson ${l.file} for the full list`);
          warnings = r.warnings;
        }
        l.status = sub; l.since = now; delete l.note;
      } else if (sub === "failed") { l.status = "failed"; l.since = now; l.note = strArg(o, "note", "what went wrong"); }
      else if (sub === "retitle") l.title = strArg(o, "title", "title");
      else fail("lesson subcommands: add, ready, done, failed, retitle, outcome");
      return { lesson: id, status: l.status, ...(warnings.length ? { warnings } : {}) };
    });
  },
  score(o) {
    const id = o._[1] || fail("score needs a lesson id");
    let score;
    if (o._[2]) {
      const m = /^(\d+)\/(\d+)$/.exec(o._[2]) || fail("score must look like 4/5");
      score = { right: Number(m[1]), total: Number(m[2]) };
    } else {
      // Count from the learner's own quiz sends for this lesson (first attempts only, see quizScore).
      score = quizScore(id) || fail(`no quiz results for lesson ${id} have been sent yet`);
    }
    mutate((st) => { lessonOf(st, id).score = score; return { lesson: id, score: `${score.right}/${score.total}` }; });
  },
  current(o) {
    mutate((st) => { const id = o._[1]; if (!st.lessons.some((l) => l.id === id) && !st.questions.some((q) => q.id === id)) fail(`no lesson or question ${id}`); st.current = id; return { current: id }; });
  },
  note(o) {
    const text = o.clear ? null : textArg(o, 1, "note");
    mutate((st) => { if (text === null) delete st.note; else st.note = text; return { note: text }; });
  },
  queue(o) {
    const sub = o._[1];
    const text = sub === "add" ? textArg(o, 2, "request") : null;
    mutate((st) => {
      if (sub === "add") st.queued = [...(st.queued || []), text];
      else if (sub === "clear") st.queued = [];
      else fail("queue add [text] | queue clear");
      return { queued: st.queued.length };
    });
  },
  working() { mutate((st, now) => { st.agent.status = "working"; st.agent.since = now; return { status: "working" }; }); },
  ack(o) {
    const seq = Number(o._[1]);
    if (!Number.isInteger(seq) || seq < 0) fail("ack needs the seq of the last send you handled");
    const last = lastSeq();
    if (seq > last) fail(`there is no send ${seq} yet (last is ${last})`);
    mutate((st, now) => {
      st.agent.handled = Math.max(st.agent.handled || 0, seq); st.agent.status = "waiting"; st.agent.since = now;
      return { handled: st.agent.handled, unhandled: last - st.agent.handled };
    });
  },
  finish(o) {
    const summary = o._.slice(1).join(" ").trim();
    mutate((st, now) => { st.finished = { at: now, ...(summary ? { summary } : {}) }; st.agent.status = "waiting"; st.agent.since = now; return { finished: true }; });
  },
};

const o = parseArgs(process.argv.slice(2));
const setup = { init: cmdInit, serve: cmdServe, url: cmdUrl, stop: cmdStop, "check-lesson": cmdCheckLesson, pending: cmdPending, wait: cmdWait, show: cmdShow, progress: cmdProgress };
const cmd = o._[0] ?? "";
const die = (e) => {
  process.stderr.write(`teach: ${e instanceof UsageError ? e.message : e.stack || e.message}\n`);
  process.exit(2);
};
try {
  let ran; // async commands (stop) return a promise; its rejection is handled like a thrown error
  if (Object.hasOwn(setup, cmd)) ran = setup[cmd](o);
  else if (Object.hasOwn(verbs, cmd)) ran = verbs[cmd](o);
  else fail(`unknown command ${JSON.stringify(cmd)}. Commands: ${[...Object.keys(setup), ...Object.keys(verbs)].join(", ")}`);
  if (ran instanceof Promise) ran.catch(die);
} catch (e) { die(e); }
