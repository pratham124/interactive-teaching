// node --test test/teach.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "teach.mjs");

function workspace() { return fs.mkdtempSync(path.join(os.tmpdir(), "teach-test-")); }
function run(ws, args, input) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: ws, encoding: "utf8", input: input ?? "" });
  return { code: r.status, out: r.stdout.trim(), err: r.stderr.trim(), json: (() => { try { return JSON.parse(r.stdout.trim().split("\n").pop()); } catch { return null; } })() };
}
const ok = (ws, args, input) => { const r = run(ws, args, input); assert.equal(r.code, 0, `${args.join(" ")} failed: ${r.err}`); return r; };
const state = (ws) => JSON.parse(fs.readFileSync(path.join(ws, ".teach", "state.json"), "utf8"));
function addSend(ws, actions) {
  const file = path.join(ws, ".teach", "events.jsonl");
  const seq = fs.readFileSync(file, "utf8").split("\n").filter(Boolean).length + 1;
  fs.appendFileSync(file, JSON.stringify({ type: "send", seq, at: "2026-10-10T10:00:00.000Z", actions }) + "\n");
  return seq;
}

// A minimal lesson that passes check-lesson with no warnings; `body` replaces the default practice items.
const QUIZ = `<div class="tq-quiz" data-id="q1"><p class="tq-prompt">Which line moves?</p><ol class="tq-choices">
<li data-feedback="Clone copies." data-misconception="clone-is-move">copy the value</li>
<li data-correct>move the value</li></ol><p class="tq-explain">Assignment moves.</p></div>`;
const FILL = `<div class="tq-fill" data-id="f1"><p class="tq-prompt">Complete.</p><code>let b = <span class="tq-blank" data-answer="a"></span>;</code></div>`;
const RECALL = `<div class="tq-recall" data-id="r1"><p class="tq-prompt">Why?</p><p class="tq-model">One owner.</p></div>`;
const lessonHtml = (body = QUIZ + FILL + RECALL, head = `<link rel="stylesheet" href="../assets/teach.css"><script src="../assets/teach-quiz.js" defer></script>`) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>Lesson</title>${head}</head><body><main>${body}</main></body></html>`;
function writeLesson(ws, rel, html = lessonHtml()) {
  const file = path.join(ws, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
}
const check = (ws, rel) => run(ws, ["check-lesson", rel]);

test("next requests require the latest lesson origin and reject stale requests atomically", async () => {
  const ws=workspace(); ok(ws,["init","--topic","Next origin"]);
  for (const id of ["0001","0002"]) {
    writeLesson(ws,`lessons/${id}.html`);
    ok(ws,["lesson","add",id,"--title",id,"--file",`lessons/${id}.html`]);
    ok(ws,["lesson","ready",id]);
  }
  ok(ws,["current","0001"]);
  const child=spawn(process.execPath,[CLI,"serve","--port","0"],{cwd:ws,stdio:["ignore","pipe","inherit"]});
  const ready=new Promise(resolve=>{let buf="";child.stdout.on("data",chunk=>{buf+=chunk;let i;while((i=buf.indexOf("\n"))>=0){const event=JSON.parse(buf.slice(0,i));buf=buf.slice(i+1);if(event.type==="ready")resolve(event.url);}});});
  try {
    const url=await ready;
    const post=actions=>fetch(url+"send",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({actions})});
    assert.equal((await post([{type:"next",lesson:"0001"}])).status,409);
    assert.equal((await post([{type:"next"}])).status,409);
    assert.equal((await post([{type:"thread",lesson:"0001",text:"Keep this queued"},{type:"next",lesson:"0001"}])).status,409);
    assert.equal(run(ws,["pending"]).out,"","a rejected batch records no partial send");
    assert.equal((await post([{type:"next",lesson:"0002"}])).status,200,"latest origin is accepted even when current points elsewhere");
    assert.equal(JSON.parse(run(ws,["pending"]).out).actions[0].lesson,"0002");
    writeLesson(ws,"lessons/0003.html");
    ok(ws,["lesson","add","0003","--title","Third","--file","lessons/0003.html"]);
    assert.equal((await post([{type:"next",lesson:"0003"}])).status,409,"drafting blocks another next request");
    ok(ws,["lesson","ready","0003"]);
    assert.equal((await post([{type:"next",lesson:"0002"}])).status,409,"an origin made stale by a new lesson is rejected");
    assert.equal((await post([{type:"next",lesson:"0003"}])).status,200);
    ok(ws,["finish","Finished test"]);
    assert.equal((await post([{type:"next",lesson:"0003"}])).status,409,"ended sessions cannot advance");
  } finally { run(ws,["stop"]); child.kill(); }
});

test("init creates the classroom and kit, and is idempotent", () => {
  const ws = workspace();
  const r = ok(ws, ["init", "--topic", "Rust", "--intent", "Ship a CLI"]);
  assert.equal(r.json.resumed, false);
  assert.deepEqual(r.json.kitAdded.sort(), ["assets/outfit-OFL.txt", "assets/outfit.woff2", "assets/teach-quiz.js", "assets/teach.css"]);
  assert.equal(state(ws).topic, "Rust");
  fs.writeFileSync(path.join(ws, "assets", "teach.css"), "/* mine */");
  const again = ok(ws, ["init", "--topic", "Other"]);
  assert.equal(again.json.resumed, true);
  assert.equal(state(ws).topic, "Rust", "resume must not overwrite");
  assert.equal(fs.readFileSync(path.join(ws, "assets", "teach.css"), "utf8"), "/* mine */", "the learner's edited kit is kept");
});

test("commands outside a workspace fail with a clear message", () => {
  const r = run(workspace(), ["show"]);
  assert.equal(r.code, 2);
  assert.match(r.err, /run init/);
});

test("ask validates options and recommendation", () => {
  const ws = workspace(); ok(ws, ["init"]);
  let r = run(ws, ["ask", "m1", "--title", "Goal?", "--option", "A=Ship", "--rec", "B", "--why", "w"]);
  assert.equal(r.code, 2); assert.match(r.err, /not one of the options/);
  r = run(ws, ["ask", "m1", "--title", "Goal?", "--option", "nope", "--rec", "A", "--why", "w"]);
  assert.equal(r.code, 2); assert.match(r.err, /A=text/);
  ok(ws, ["ask", "m1", "--title", "Goal?", "--option", "A=Ship a CLI", "--option", "B=Review code", "--rec", "A", "--why", "Concrete."]);
  const q = state(ws).questions[0];
  assert.deepEqual(q.options, [{ k: "A", text: "Ship a CLI" }, { k: "B", text: "Review code" }]);
  assert.equal(q.status, "open"); assert.equal(q.kind, "mission");
  assert.equal(run(ws, ["ask", "m1", "--title", "x", "--rec-text", "y", "--why", "z"]).code, 2, "duplicate id rejected");
  ok(ws, ["ask", "m2", "--title", "What have you tried?", "--option", "A=Nothing", "--option", "B=Excel"]);
  assert.equal(state(ws).questions[1].rec, undefined, "a factual question needs no recommendation");
  assert.match(run(ws, ["ask", "m3", "--title", "x", "--option", "A=a", "--why", "w"]).err, /--why goes with/);
  assert.match(run(ws, ["ask", "m4", "--title", "x"]).err, /needs --option/);
});

test("answer from a send action and from the terminal", () => {
  const ws = workspace(); ok(ws, ["init"]);
  ok(ws, ["ask", "m1", "--title", "Goal?", "--option", "A=Ship", "--option", "B=Review", "--rec", "A", "--why", "w"]);
  ok(ws, ["ask", "m2", "--title", "Time?", "--rec-text", "20 min", "--why", "w"]);
  const seq = addSend(ws, [{ type: "answer", q: "m1", kind: "option", option: "B" }]);
  ok(ws, ["answer", `${seq}.0`]);
  ok(ws, ["answer", "m2", "--text", "Evenings"]);
  const [m1, m2] = state(ws).questions;
  assert.deepEqual([m1.status, m1.answer.option], ["answered", "B"]);
  assert.deepEqual([m2.status, m2.answer.text], ["answered", "Evenings"]);
  const bad = run(ws, ["answer", "9.0"]);
  assert.equal(bad.code, 2); assert.match(bad.err, /no send 9/);
});

test("reply threads the learner's words and the teacher's answer, text from stdin", () => {
  const ws = workspace(); ok(ws, ["init"]);
  fs.mkdirSync(path.join(ws, "lessons"));
  ok(ws, ["lesson", "add", "0001", "--title", "Cargo", "--file", "lessons/0001-cargo.html"]);
  const seq = addSend(ws, [
    { type: "thread", lesson: "0001", text: "Why Cargo.lock?" },
    { type: "recall", lesson: "0001", item: "r1", prompt: "What does cargo build do?", text: "compiles" },
    { type: "thread", text: "general q" },
    { type: "quiz", lesson: "0001", item: "q1", correct: true },
  ]);
  ok(ws, ["reply", `${seq}.0`, "-"], "It pins exact versions.\nSo builds repeat.");
  ok(ws, ["reply", `${seq}.1`, "Partly:", "it", "also", "fetches", "deps."]);
  ok(ws, ["reply", `${seq}.2`, "General answer"]);
  const bad = run(ws, ["reply", `${seq}.3`, "x"]);
  assert.equal(bad.code, 2); assert.match(bad.err, /use say/);
  const st = state(ws);
  const th = st.lessons[0].thread;
  assert.deepEqual(th.map((m) => m.who), ["user", "agent", "user", "agent"]);
  assert.equal(th[0].text, "Why Cargo.lock?"); assert.equal(th[0].at, "2026-10-10T10:00:00.000Z");
  assert.equal(th[1].text, "It pins exact versions.\nSo builds repeat.");
  assert.match(th[2].text, /^Recall: What does cargo build do\?\ncompiles$/);
  assert.equal(th[3].text, "Partly: it also fetches deps.");
  assert.equal(st.thread[1].text, "General answer");
  assert.equal(run(ws, ["say", "hi"]).code, 2, "say needs a target");
  ok(ws, ["say", "--general", "Welcome!"]);
  assert.equal(state(ws).thread.at(-1).text, "Welcome!", "--general takes no value");
  ok(ws, ["say", "--lesson", "0001", "Focus on the lockfile."]);
  assert.equal(state(ws).lessons[0].thread.at(-1).text, "Focus on the lockfile.");
});

test("lesson lifecycle: add drafts, ready requires the file, paths stay in the workspace", () => {
  const ws = workspace(); ok(ws, ["init"]);
  assert.equal(run(ws, ["lesson", "add", "0001", "--title", "x", "--file", "../evil.html"]).code, 2);
  assert.equal(run(ws, ["lesson", "add", "0001", "--title", "x", "--file", "C:/evil.html"]).code, 2);
  ok(ws, ["lesson", "add", "0001", "--title", "Cargo", "--file", "lessons\\0001-cargo.html", "--goal", "Build a project"]);
  let l = state(ws).lessons[0];
  assert.deepEqual([l.status, l.file, state(ws).current], ["drafting", "lessons/0001-cargo.html", "0001"]);
  const early = run(ws, ["lesson", "ready", "0001"]);
  assert.equal(early.code, 2); assert.match(early.err, /does not exist yet/);
  writeLesson(ws, "lessons/0001-cargo.html");
  ok(ws, ["lesson", "ready", "0001"]);
  ok(ws, ["lesson", "done", "0001"]);
  ok(ws, ["lesson", "add", "0002", "--title", "Y", "--file", "lessons/0002-y.html"]);
  assert.equal(run(ws, ["lesson", "failed", "0002"]).code, 2, "failed needs --note");
  ok(ws, ["lesson", "failed", "0002", "--note", "search failed"]);
  l = state(ws).lessons;
  assert.deepEqual(l.map((x) => x.status), ["done", "failed"]);
  assert.equal(run(ws, ["lesson", "ready", "0009"]).code, 2);
});

test("score counts each quiz item's first attempt from sends", () => {
  const ws = workspace(); ok(ws, ["init"]);
  ok(ws, ["lesson", "add", "0001", "--title", "A", "--file", "lessons/a.html"]);
  assert.equal(run(ws, ["score", "0001"]).code, 2, "no results yet");
  addSend(ws, [{ type: "quiz", lesson: "0001", item: "q1", correct: false }, { type: "quiz", lesson: "0001", item: "q2", correct: true }]);
  addSend(ws, [{ type: "quiz", lesson: "0001", item: "q1", correct: true }, { type: "quiz", lesson: "0002", item: "q1", correct: false }]);
  ok(ws, ["score", "0001"]);
  assert.deepEqual(state(ws).lessons[0].score, { right: 1, total: 2 }, "q1's later retake does not overwrite its first miss");
  ok(ws, ["score", "0001", "3/5"]);
  assert.deepEqual(state(ws).lessons[0].score, { right: 3, total: 5 });
});

test("working, ack, pending, queue, note, finish", () => {
  const ws = workspace(); ok(ws, ["init"]);
  addSend(ws, [{ type: "next" }]); addSend(ws, [{ type: "next", text: "loops" }]);
  assert.equal(run(ws, ["pending"]).out.split("\n").length, 2);
  ok(ws, ["working"]); assert.equal(state(ws).agent.status, "working");
  assert.equal(run(ws, ["ack", "5"]).code, 2, "cannot ack the future");
  const a = ok(ws, ["ack", "1"]);
  assert.deepEqual([a.json.handled, a.json.unhandled], [1, 1]);
  assert.equal(state(ws).agent.status, "waiting");
  assert.equal(JSON.parse(run(ws, ["pending"]).out).seq, 2);
  ok(ws, ["queue", "add", "loops please"]); ok(ws, ["queue", "clear"]);
  assert.deepEqual(state(ws).queued, []);
  ok(ws, ["note", "Mission set."]); assert.equal(state(ws).note, "Mission set.");
  ok(ws, ["note", "--clear"]); assert.equal(state(ws).note, undefined);
  ok(ws, ["finish", "Learned", "cargo."]);
  assert.equal(state(ws).finished.summary, "Learned cargo.");
  assert.match(run(ws, ["show"]).out, /FINISHED/);
});

test("wait returns the next send, or exits 3 on timeout", () => {
  const ws = workspace(); ok(ws, ["init"]);
  assert.equal(run(ws, ["wait", "--timeout", "0.3"]).code, 3);
  addSend(ws, [{ type: "next" }]);
  const r = run(ws, ["wait", "--after", "0", "--timeout", "2"]);
  assert.equal(r.code, 0); assert.equal(JSON.parse(r.out).seq, 1);
});

test("unknown command lists the commands", () => {
  const r = run(workspace(), ["frobnicate"]);
  assert.equal(r.code, 2); assert.match(r.err, /Commands: init, serve/);
});

test("serve: page, stream, workspace files, sends", async () => {
  const ws = workspace(); ok(ws, ["init", "--topic", "Rust"]);
  fs.mkdirSync(path.join(ws, "reference"));
  fs.writeFileSync(path.join(ws, "reference", "cheat.html"), "<title>Cheat sheet</title>");
  fs.writeFileSync(path.join(ws, "MISSION.md"), "# Mission");
  const child = spawn(process.execPath, [CLI, "serve", "--port", "0"], { cwd: ws, stdio: ["ignore", "pipe", "inherit"] });
  const lines = [];
  let resolveReady;
  const ready = new Promise((r) => { resolveReady = r; });
  let buf = "";
  child.stdout.on("data", (c) => {
    buf += c; let i;
    while ((i = buf.indexOf("\n")) >= 0) { const l = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); lines.push(l); if (l.type === "ready") resolveReady(l.url); }
  });
  try {
    const url = await ready;
    const origin = url.replace(/\/$/, "");
    assert.match(await (await fetch(url)).text(), /<title>classroom<\/title>/);

    // stream: first event is the snapshot; a command's change is pushed
    const ctrl = new AbortController();
    const res = await fetch(url + "stream", { signal: ctrl.signal });
    const reader = res.body.getReader(); const dec = new TextDecoder(); let sse = "";
    const nextEvent = async () => {
      for (;;) {
        const i = sse.indexOf("\n\n");
        if (i >= 0) { const chunk = sse.slice(0, i); sse = sse.slice(i + 2); if (chunk.startsWith("data: ")) return JSON.parse(chunk.slice(6)); continue; }
        const { value } = await reader.read(); sse += dec.decode(value);
      }
    };
    const first = await nextEvent();
    assert.equal(first.state.topic, "Rust");
    assert.deepEqual(first.files.reference, [{ file: "reference/cheat.html", title: "Cheat sheet" }]);
    assert.deepEqual(first.files.docs, [], "MISSION.md is not shown in the page");
    ok(ws, ["note", "pushed"]);
    assert.equal((await nextEvent()).state.note, "pushed");
    ctrl.abort();

    // workspace files, read-only and fenced in
    assert.equal(await (await fetch(url + "w/MISSION.md")).text(), "# Mission");
    assert.match((await fetch(url + "w/assets/teach.css")).headers.get("content-type"), /text\/css/);
    assert.equal((await fetch(url + "w/assets/teach.css")).headers.get("cache-control"), "no-store", "lesson CSS stays fresh");
    const fontResponse = await fetch(url + "w/assets/outfit.woff2");
    assert.equal(fontResponse.status, 200);
    assert.equal(fontResponse.headers.get("content-type"), "font/woff2");
    assert.equal(fontResponse.headers.get("cache-control"), "private, max-age=86400", "local fonts can be reused across lessons");
    assert.equal(Buffer.from(await fontResponse.arrayBuffer()).subarray(0,4).toString(), "wOF2", "a real font is served");
    assert.equal((await fetch(url + "w/.teach/state.json")).status, 403);
    assert.equal((await fetch(url + "w/..%2F..%2Fetc%2Fpasswd")).status, 403);
    assert.equal((await fetch(url + "w/nope.html")).status, 404);

    // sends: same-origin and no-origin accepted, foreign origin refused, bad bodies refused
    const post = (body, headers = {}) => fetch(url + "send", { method: "POST", headers: { "content-type": "application/json", ...headers }, body });
    assert.equal((await post(JSON.stringify({ actions: [{ type: "next" }] }), { origin })).status, 200);
    assert.equal((await post(JSON.stringify({ actions: [{ type: "pause" }] }))).status, 200);
    assert.equal((await post(JSON.stringify({ actions: [{ type: "next" }] }), { origin: "http://evil.example" })).status, 403);
    assert.equal((await post("{nope")).status, 400);
    assert.equal((await post(JSON.stringify({ actions: [] }))).status, 400);
    await new Promise((r) => setTimeout(r, 100));
    const sends = lines.filter((l) => l.type === "send");
    assert.deepEqual(sends.map((s) => s.seq), [1, 2]);
    assert.equal(run(ws, ["pending"]).out.split("\n").length, 2);
    assert.equal(run(ws, ["url"]).out, url);
    // shutdown: a wrong token or any Origin (even with the right token) is refused and the server stays up
    const token = JSON.parse(fs.readFileSync(path.join(ws, ".teach", "server.json"), "utf8")).token;
    const shut = (body, headers = {}) => fetch(url + "shutdown", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
    assert.equal((await shut({ token: "wrong" })).status, 403);
    assert.equal((await shut({ token }, { origin: "http://evil.example" })).status, 403);
    assert.equal((await shut({ token }, { origin })).status, 403);
    assert.equal((await fetch(url)).status, 200, "still serving after refused shutdowns");
    const exited = new Promise((r) => child.once("exit", r));
    const st = run(ws, ["stop"]);
    assert.equal(st.json.stopped, true);
    assert.equal(st.json.graceful, true);
    assert.equal(await exited, 0, "serve exits 0 on stop, not killed");
    assert.equal(run(ws, ["url", "--timeout", "0.3"]).code, 1, "url reports no running server after stop");
    assert.ok(JSON.parse(fs.readFileSync(path.join(ws, ".teach", "server.json"), "utf8")).port, "the port is remembered");
  } finally { child.kill(); }
});

test("text commands never block on an open, silent stdin", async () => {
  // An agent's shell often leaves stdin open; a command that read it unasked would hang forever.
  const ws = workspace(); ok(ws, ["init"]);
  const child = spawn(process.execPath, [CLI, "say", "--general", "hello"], { cwd: ws, stdio: ["pipe", "pipe", "pipe"] });
  const code = await new Promise((resolve) => {
    const t = setTimeout(() => { child.kill(); resolve("hung"); }, 3000);
    child.on("exit", (c) => { clearTimeout(t); resolve(c); });
  });
  assert.equal(code, 0);
  assert.equal(state(ws).thread.at(-1).text, "hello");
});

test("a moved workspace still finds its lesson files", () => {
  const ws = workspace(); ok(ws, ["init"]);
  ok(ws, ["lesson", "add", "0001", "--title", "A", "--file", "lessons/a.html"]);
  const moved = workspace(); fs.cpSync(ws, moved, { recursive: true }); fs.rmSync(ws, { recursive: true });
  writeLesson(moved, "lessons/a.html");
  ok(moved, ["lesson", "ready", "0001"]);
});

test("check-lesson passes a valid lesson, in lessons/ and in reference/", () => {
  const ws = workspace(); ok(ws, ["init"]);
  writeLesson(ws, "lessons/0001-a.html");
  writeLesson(ws, "reference/cheat.html");
  for (const f of ["lessons/0001-a.html", "reference/cheat.html"]) {
    const r = check(ws, f);
    assert.equal(r.code, 0, r.out);
    assert.deepEqual(r.json, { ok: true, file: f, items: 3, errors: [], warnings: [] });
  }
  // A file at the workspace root reaches the kit as assets/..., not ../assets/...
  writeLesson(ws, "top.html", lessonHtml(QUIZ, `<link rel="stylesheet" href="assets/teach.css"><script src="assets/teach-quiz.js"></script>`));
  assert.equal(check(ws, "top.html").code, 0);
  assert.equal(check(ws, "lessons\\0001-a.html").json.file, "lessons/0001-a.html", "backslashes are accepted");
  assert.match(run(ws, ["check-lesson"]).err, /needs a lesson file/);
});

test("check-lesson ignores comments, other schemes, anchors and links that exist", () => {
  const ws = workspace(); ok(ws, ["init"]);
  writeLesson(ws, "lessons/0002-b.html");
  const body = QUIZ + `<!-- <div class="tq-quiz"><a href="gone.html">x</a></div> -->
<a href="0002-b.html#top">self</a> <a href="#x">a</a> <a href="mailto:a@b.c">m</a> <a href="https://example.com/p">ext</a>
<img src="../assets/teach.css?v=1"><script>const s = '<script src="https://x.test/a.js">';</script>`;
  writeLesson(ws, "lessons/0001-a.html", lessonHtml(body));
  const r = check(ws, "lessons/0001-a.html");
  assert.equal(r.code, 0, r.out);
  assert.deepEqual([r.json.errors, r.json.items], [[], 1]);
});

test("check-lesson reports each error class and exits 2 with the JSON line on stdout", () => {
  const ws = workspace(); ok(ws, ["init"]);
  const kitHead = lessonHtml("", "").match(/<head>(.*)<\/head>/)[1]; // charset + title only
  const quiz = (id, lis, extra = "") => `<div class="tq-quiz"${id ? ` data-id="${id}"` : ""}><p class="tq-prompt">P</p>${extra}<ol class="tq-choices">${lis}</ol></div>`;
  const wrong = `<li data-feedback="f" data-misconception="m">aa bb</li>`;
  const right = `<li data-correct>cc dd</li>`;
  const cases = [
    ["no title", lessonHtml().replace(/<title>.*<\/title>/, ""), /no <title>/],
    ["no stylesheet", lessonHtml(undefined, `<script src="../assets/teach-quiz.js"></script>`), /does not link \.\.\/assets\/teach\.css/],
    ["no quiz script", lessonHtml(undefined, `<link rel="stylesheet" href="../assets/teach.css">`), /does not load \.\.\/assets\/teach-quiz\.js/],
    ["wrong kit path", lessonHtml(undefined, `<link rel="stylesheet" href="assets/teach.css"><script src="assets/teach-quiz.js"></script>`), /does not link/],
    ["external script", lessonHtml(QUIZ, `<link rel="stylesheet" href="../assets/teach.css"><script src="../assets/teach-quiz.js"></script><script src="https://cdn.example/x.js"></script>`), /external script src https:\/\/cdn\.example\/x\.js/],
    ["external stylesheet", lessonHtml(QUIZ, `<link rel="stylesheet" href="../assets/teach.css"><script src="../assets/teach-quiz.js"></script><link rel="stylesheet" href="//fonts.example/f.css">`), /external link href \/\/fonts\.example/],
    ["duplicate data-id", lessonHtml(quiz("dup", wrong + right) + FILL.replace('"f1"', '"dup"')), /data-id "dup" is used more than once/],
    ["quiz without data-id", lessonHtml(quiz("", wrong + right)), /quiz #1 has no data-id/],
    ["fill without data-id", lessonHtml(FILL.replace(' data-id="f1"', "")), /fill #1 has no data-id/],
    ["recall without data-id", lessonHtml(RECALL.replace(' data-id="r1"', "")), /recall #1 has no data-id/],
    ["quiz with no correct choice", lessonHtml(quiz("q0", wrong + wrong)), /quiz "q0" needs exactly one data-correct choice, found 0/],
    ["quiz with two correct choices", lessonHtml(quiz("q2", right + right)), /quiz "q2" needs exactly one data-correct choice, found 2/],
    ["quiz without choices", lessonHtml(`<div class="tq-quiz" data-id="qn"><p class="tq-prompt">P</p></div>`), /quiz "qn" has no \.tq-choices list/],
    ["fill without blank", lessonHtml(`<div class="tq-fill" data-id="fb"><p class="tq-prompt">P</p></div>`), /fill "fb" has no \.tq-blank/],
    ["blank without answer", lessonHtml(FILL.replace(' data-answer="a"', "")), /fill "f1" blank 1 has no data-answer/],
    ["recall without prompt", lessonHtml(RECALL.replace('<p class="tq-prompt">Why?</p>', "")), /recall "r1" has no \.tq-prompt/],
    ["broken relative link", lessonHtml(QUIZ + `<a href="0009-missing.html">next</a><img src="pics/a.png">`), /broken relative link 0009-missing\.html/],
  ];
  for (const [name, html, want] of cases) {
    writeLesson(ws, "lessons/bad.html", html);
    const r = check(ws, "lessons/bad.html");
    assert.equal(r.code, 2, `${name}: exit code`);
    assert.equal(r.json.ok, false, name);
    assert.ok(r.json.errors.some((e) => want.test(e)), `${name}: expected ${want}, got ${JSON.stringify(r.json.errors)}`);
  }
  // A head with no kit gives exactly three errors: no stylesheet, no quiz script, and the broken image link.
  writeLesson(ws, "lessons/bad.html", lessonHtml(QUIZ + `<img src="pics/a.png">`, kitHead));
  const r = check(ws, "lessons/bad.html");
  assert.equal(r.json.errors.length, 3);
  assert.ok(r.json.errors.some((e) => /broken relative link pics\/a\.png/.test(e)));
  const gone = check(ws, "lessons/none.html");
  assert.equal(gone.code, 2); assert.match(gone.json.errors[0], /does not exist/);
});

test("check-lesson warns about missing feedback, uneven choices and no practice, but stays ok", () => {
  const ws = workspace(); ok(ws, ["init"]);
  const quiz = (lis) => `<div class="tq-quiz" data-id="qw"><p class="tq-prompt">P</p><ol class="tq-choices">${lis}</ol></div>`;
  const run1 = (html, tail = RECALL) => { writeLesson(ws, "lessons/w.html", lessonHtml(html + tail)); const r = check(ws, "lessons/w.html"); assert.equal(r.code, 0, r.out); assert.equal(r.json.ok, true); return r.json.warnings; };

  let w = run1(quiz(`<li>aa bb</li><li data-feedback="f">cc dd</li><li data-correct>ee ff</li>`));
  assert.deepEqual(w, [`quiz "qw" wrong choice 1 lacks data-feedback and data-misconception`, `quiz "qw" wrong choice 2 lacks data-misconception`]);

  const fb = `data-feedback="f" data-misconception="m"`;
  w = run1(quiz(`<li ${fb}>one two three</li><li data-correct>one two</li>`));
  assert.equal(w.length, 1); assert.match(w[0], /uneven in length \(2-3 words/);
  w = run1(quiz(`<li ${fb}>ab cd</li><li data-correct>abcdefghijklmnop</li>`));
  assert.equal(w.length, 1); assert.match(w[0], /uneven/, "same words, but more than 1.3x the characters");
  w = run1(quiz(`<li ${fb}>Tom &amp; Jerry</li><li data-correct>Tom <code>&lt;b&gt;</code> Jerr&#39;s</li>`));
  assert.deepEqual(w, [], "tags are stripped and entities decoded before measuring: 'Tom & Jerry' vs 'Tom <b> Jerr's'");

  assert.deepEqual(run1("", ""), ["no quiz-kit items, so the lesson has no practice"]);
  assert.equal(check(ws, "lessons/w.html").json.items, 0);
});

test("check-lesson warns when nothing is produced, and when the lesson ends on multiple choice", () => {
  const ws = workspace(); ok(ws, ["init"]);
  const warn = (body) => { writeLesson(ws, "lessons/p.html", lessonHtml(body)); const r = check(ws, "lessons/p.html"); assert.equal(r.code, 0, r.out); return r.json.warnings; };
  const NO_PROD = /^no production item/, ENDS = /^ends on recognition/;
  const has = (w, re) => w.filter((x) => re.test(x)).length;
  let w = warn(QUIZ + QUIZ.replace('"q1"', '"q2"'));
  assert.equal(has(w, NO_PROD), 1, "quizzes only: nothing produced");
  assert.equal(has(w, ENDS), 1, "quizzes only: ends on a quiz");
  w = warn(QUIZ + FILL + QUIZ.replace('"q1"', '"q2"'));
  assert.equal(has(w, NO_PROD), 0, "a fill is production even when a quiz follows it");
  assert.equal(has(w, ENDS), 1);
  w = warn(QUIZ + RECALL + QUIZ.replace('"q1"', '"q2"'));
  assert.deepEqual([has(w, NO_PROD), has(w, ENDS)], [0, 1]);
  assert.deepEqual(warn(QUIZ + FILL), [], "ends on a fill: clean");
  assert.deepEqual(warn(RECALL), [], "a lone recall: clean");
  assert.deepEqual(warn(QUIZ + FILL + RECALL), [], "the default lesson is clean");
  assert.deepEqual(warn(""), ["no quiz-kit items, so the lesson has no practice"], "no items: only the old warning");
});

test("lesson ready refuses a lesson with errors, and accepts one with only warnings", () => {
  const ws = workspace(); ok(ws, ["init"]);
  ok(ws, ["lesson", "add", "0001", "--title", "A", "--file", "lessons/a.html"]);
  writeLesson(ws, "lessons/a.html", lessonHtml(QUIZ + FILL.replace(' data-answer="a"', "") + RECALL.replace('<p class="tq-prompt">Why?</p>', "") + `<a href="x.html">x</a><a href="y.html">y</a>`));
  const bad = run(ws, ["lesson", "ready", "0001"]);
  assert.equal(bad.code, 2);
  assert.equal(bad.err.split("\n").length, 1, "one line");
  assert.match(bad.err, /lessons\/a\.html has 4 errors: .*; and 1 more\. Fix them, or run check-lesson lessons\/a\.html for the full list/);
  assert.equal(bad.err.split("; ").length, 4, "names the first three errors only");
  assert.equal(state(ws).lessons[0].status, "drafting", "a refused lesson stays a draft");
  assert.equal(check(ws, "lessons/a.html").json.errors.length, 4);

  writeLesson(ws, "lessons/a.html", lessonHtml(QUIZ.replace(' data-feedback="Clone copies." data-misconception="clone-is-move"', "") + RECALL));
  const r = ok(ws, ["lesson", "ready", "0001"]);
  assert.equal(r.json.status, "ready");
  assert.deepEqual(r.json.warnings, [`quiz "q1" wrong choice 1 lacks data-feedback and data-misconception`]);
  assert.equal(state(ws).lessons[0].status, "ready");

  writeLesson(ws, "lessons/a.html");
  assert.equal(ok(ws, ["lesson", "ready", "0001"]).json.warnings, undefined, "no warnings key when clean");
  writeLesson(ws, "lessons/a.html", "x");
  assert.equal(run(ws, ["lesson", "done", "0001"]).code, 0, "done is not checked");
});

// ---------- check-lesson --render (needs Chrome or Edge; skipped without one) ----------
const WRONG_FIRST = `<div class="tq-quiz" data-id="q1"><p class="tq-prompt">Which line moves?</p><ol class="tq-choices">
<li data-feedback="Clone copies." data-misconception="clone-is-move">copy the value</li>
<li data-feedback="A borrow does not move." data-misconception="borrow-is-move">borrow the value</li>
<li data-correct>move the value</li></ol><p class="tq-explain">Assignment moves.</p></div>`;
const FILL2 = `<div class="tq-fill" data-id="f1"><p class="tq-prompt">Complete.</p><code>let <span class="tq-blank" data-answer="b" data-hint="Pick a name."></span> = <span class="tq-blank" data-answer="a"></span>;</code><p class="tq-explain">Done.</p></div>`;
const renderWs = (body, extraHead = "") => {
  const ws = workspace(); ok(ws, ["init"]);
  writeLesson(ws, "lessons/r.html", lessonHtml(body, `<link rel="stylesheet" href="../assets/teach.css"><script src="../assets/teach-quiz.js" defer></script>${extraHead}`));
  return ws;
};

test("check-lesson --render skips the browser when the static check fails", () => {
  const ws = renderWs(QUIZ + FILL + RECALL);
  fs.writeFileSync(path.join(ws, "lessons", "r.html"), "<title>x</title>");
  const r = run(ws, ["check-lesson", "lessons/r.html", "--render"]);
  assert.equal(r.code, 2);
  assert.equal(r.json.render.ran, false);
  assert.match(r.json.render.reason, /static check/);
});

test("check-lesson --render drives every item in a real browser", (t) => {
  const ws = renderWs(WRONG_FIRST + FILL2 + RECALL);
  const r = run(ws, ["check-lesson", "lessons/r.html", "--render"]);
  if (!r.json.render.ran) { assert.equal(r.code, 0, "a skipped render is only a warning"); assert.ok(r.json.warnings.some((w) => /render check skipped/.test(w))); return t.skip(r.json.render.reason); }
  assert.equal(r.code, 0, r.out);
  const { render } = r.json;
  assert.equal(render.ok, true, JSON.stringify(render));
  assert.deepEqual(render.errors, []);
  assert.deepEqual(render.items.map((i) => [i.id, i.type, i.mounted, i.responded, i.reports, i.ok]),
    [["q1", "quiz", true, true, 1, true], ["f1", "fill", true, true, 1, true], ["r1", "recall", true, true, 1, true]]);
  assert.deepEqual(render.items.map((i) => i.correctReported), [false, false, null], "first attempts were wrong, so they are reported as misses");
});

test("check-lesson --render reports a lesson whose script throws, and a stale kit", (t) => {
  const ws = renderWs(QUIZ + FILL + RECALL + `<script>throw new Error("boom now");</script><script>addEventListener("load", () => { throw new Error("boom later"); });</script>`);
  const r = run(ws, ["check-lesson", "lessons/r.html", "--render"]);
  if (!r.json.render.ran) return t.skip(r.json.render.reason);
  assert.equal(r.code, 2, r.out);
  assert.equal(r.json.ok, false);
  assert.equal(r.json.render.ok, false);
  assert.ok(r.json.render.errors.some((e) => /boom now/.test(e)), JSON.stringify(r.json.render.errors));
  assert.ok(r.json.render.errors.some((e) => /boom later/.test(e)), JSON.stringify(r.json.render.errors));
  assert.deepEqual(r.json.errors, [], "the static errors are unchanged");

  fs.writeFileSync(path.join(ws, "assets", "teach-quiz.js"), "/* an old kit without self-test */");
  writeLesson(ws, "lessons/r.html");
  const old = run(ws, ["check-lesson", "lessons/r.html", "--render"]);
  assert.equal(old.code, 2);
  assert.match(old.json.render.errors[0], /no self-test result.*old copy/);
});

test("check-lesson skips the length warning when every choice is code", () => {
  const ws = workspace(); ok(ws, ["init"]);
  const quiz = (id, choices) => `<div class="tq-quiz" data-id="${id}"><p class="tq-prompt">Q</p><ol class="tq-choices">${choices}</ol></div>`;
  const codeQuiz = quiz("predict", `<li data-correct><code>[120.0, 150.0]</code></li><li data-misconception="a" data-feedback="f"><code>[('East', 120.0), ('North', 150.0)]</code></li><li data-misconception="b" data-feedback="f"><code>[]</code></li>`);
  const proseQuiz = quiz("prose", `<li data-correct>Short</li><li data-misconception="a" data-feedback="f">A much longer and wordier choice</li>`);
  const mixedQuiz = quiz("mixed", `<li data-correct><code>[]</code> is empty</li><li data-misconception="a" data-feedback="f"><code>[120.0, 150.0, 210.0]</code></li>`);
  writeLesson(ws, "lessons/a.html", lessonHtml(codeQuiz + proseQuiz + mixedQuiz + RECALL));
  const w = check(ws, "lessons/a.html").json.warnings.join(" | ");
  assert.doesNotMatch(w, /"predict" choices are uneven/, "all-code choices are not length-checked");
  assert.match(w, /"prose" choices are uneven/, "prose choices still are");
  assert.match(w, /"mixed" choices are uneven/, "a choice with prose outside the code still counts as prose");
});

test("lesson outcome: set, overwrite keeps history, bad input rejected", () => {
  const ws = workspace(); ok(ws, ["init"]);
  ok(ws, ["lesson", "add", "0001", "--title", "Totals", "--file", "lessons/a.html"]);
  const r = ok(ws, ["lesson", "outcome", "0001", "not-yet", "--note", "could not write the GROUP BY unaided"]);
  assert.equal(r.json.outcome, "not-yet");
  let l = state(ws).lessons[0];
  assert.equal(l.outcome.result, "not-yet");
  assert.equal(l.outcome.note, "could not write the GROUP BY unaided");
  assert.match(l.outcome.at, /^\d{4}-\d\d-\d\dT/, "the server stamps the time");
  assert.equal(l.outcomeHistory, undefined, "nothing to remember on the first verdict");
  const first = l.outcome;
  ok(ws, ["lesson", "outcome", "0001", "learned"]);
  l = state(ws).lessons[0];
  assert.equal(l.outcome.result, "learned");
  assert.equal(l.outcome.note, undefined, "a note belongs to its own verdict");
  assert.deepEqual(l.outcomeHistory, [first], "the previous outcome stays visible");
  const bad = run(ws, ["lesson", "outcome", "0001", "mastered"]);
  assert.equal(bad.code, 2); assert.match(bad.err, /learned \| partial \| not-yet/);
  assert.equal(run(ws, ["lesson", "outcome", "0001"]).code, 2, "result is required");
  assert.equal(run(ws, ["lesson", "outcome", "0001", "partial", "--note"]).code, 2, "--note needs a value");
  const missing = run(ws, ["lesson", "outcome", "0009", "learned"]);
  assert.equal(missing.code, 2); assert.match(missing.err, /no lesson 0009/);
  assert.equal(state(ws).lessons[0].outcome.result, "learned", "rejected calls change nothing");
  ok(ws, ["lesson", "add", "0002", "--title", "Joins", "--file", "lessons/b.html"]);
  ok(ws, ["lesson", "outcome", "0002", "partial"]);
  assert.match(run(ws, ["show"]).out, /0002 \[drafting\] Joins .*outcome: partial/);
});

test("progress lists lessons with score and outcome, records with levels, superseded last", () => {
  const ws = workspace(); ok(ws, ["init", "--topic", "SQL"]);
  ok(ws, ["lesson", "add", "0001", "--title", "Filtering", "--file", "lessons/a.html"]);
  ok(ws, ["lesson", "add", "0002", "--title", "Totals per region", "--file", "lessons/b.html"]);
  ok(ws, ["lesson", "add", "0003", "--title", "Joins", "--file", "lessons/c.html"]);
  addSend(ws, [{ type: "quiz", lesson: "0002", item: "q1", correct: true }, { type: "quiz", lesson: "0002", item: "q2", correct: false }, { type: "quiz", lesson: "0002", item: "q3", correct: true }]);
  ok(ws, ["score", "0001", "4/5"]);
  ok(ws, ["lesson", "outcome", "0002", "learned", "--note", "wrote the Q1 query unaided"]);
  ok(ws, ["lesson", "outcome", "0001", "partial"]);
  const before = fs.readFileSync(path.join(ws, ".teach", "state.json"), "utf8");
  const rec = path.join(ws, "learning-records");
  fs.mkdirSync(rec);
  fs.writeFileSync(path.join(rec, "0001-where-clause.md"), "# WHERE filters rows\n\nLevel: recalled\n\nSaid so.\n");
  fs.writeFileSync(path.join(rec, "0002-group-by.md"), "---\nStatus: superseded by LR-0004\n---\n# GROUP BY basics\n\n**Level:** recognised\n");
  fs.writeFileSync(path.join(rec, "0003-having.md"), "# HAVING versus WHERE\n\nLevel: applied\n");
  fs.writeFileSync(path.join(rec, "0004-group-by-again.md"), "no heading here, no level either\n");
  fs.writeFileSync(path.join(rec, "notes.txt"), "# not a record\n");
  const r = ok(ws, ["progress"]);
  const lines = r.out.split("\n");
  const line = (re) => lines.find((x) => re.test(x)) || assert.fail(`no line matching ${re} in:\n${r.out}`);
  assert.match(line(/0002/), /0002 Totals per region +drafting +2\/3 +learned: wrote the Q1 query unaided/, "score computed from sends, outcome with note");
  assert.match(line(/0001/), /0001 Filtering +drafting +4\/5 +partial$/, "a set score wins, outcome without a note");
  assert.match(line(/0003/), /0003 Joins +drafting +- +no outcome yet/);
  assert.match(line(/0001-where-clause/), /WHERE filters rows +recalled/);
  assert.match(line(/0003-having/), /HAVING versus WHERE +applied/);
  assert.match(line(/0004-group-by-again/), /\(no title\) +\(no level\)/);
  assert.match(line(/0002-group-by/), /GROUP BY basics +recognised +\[superseded\]/);
  assert.ok(!/notes/.test(r.out), "only .md files are records");
  const at = (re) => lines.findIndex((x) => re.test(x));
  assert.ok(at(/0002-group-by/) > Math.max(at(/0001-where/), at(/0003-having/), at(/0004-group/)), "superseded records come last");
  assert.match(line(/^Tally/), /1 learned, 1 partial, 0 not-yet, 1 no outcome yet.*1 recalled.*1 applied.*1 no level.*\+1 superseded/);
  assert.equal(fs.readFileSync(path.join(ws, ".teach", "state.json"), "utf8"), before, "progress is read-only: the computed score is not written");
  assert.equal(state(ws).lessons[1].score, undefined);
});

test("progress without .teach still lists the learning records, and tolerates none", () => {
  const ws = workspace();
  let r = ok(ws, ["progress"]);
  assert.match(r.out, /no classroom state/i); assert.match(r.out, /\(none yet\)/);
  fs.mkdirSync(path.join(ws, "learning-records"));
  fs.writeFileSync(path.join(ws, "learning-records", "0001-ownership.md"), "# Ownership moves\n\nLevel: retained\n");
  r = ok(ws, ["progress"]);
  assert.match(r.out, /no classroom state/i);
  assert.match(r.out, /0001-ownership +Ownership moves +retained/);
  assert.equal(fs.existsSync(path.join(ws, ".teach")), false, "progress never creates a classroom");
});

test("init on a finished classroom reopens it and keeps the last session in history", () => {
  const ws = workspace(); ok(ws, ["init", "--topic", "X"]);
  ok(ws, ["finish", "Day one done."]);
  const r = ok(ws, ["init"]);
  assert.equal(r.json.reopened, true);
  const st = state(ws);
  assert.equal(st.finished, undefined, "the page is no longer locked");
  assert.equal(st.pastSessions[0].summary, "Day one done.");
  assert.equal(ok(ws, ["init"]).json.reopened, false, "a second init changes nothing");
});
