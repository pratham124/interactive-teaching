// teach-quiz.js: the quiz component every lesson uses. Lives in the workspace's assets/ folder.
//
// Multiple choice (graded here, instantly; diagnostic and retryable, scored on the FIRST attempt):
//   <div class="tq-quiz" data-id="ownership-1">
//     <p class="tq-prompt">Which line moves the String?</p>
//     <ol class="tq-choices">
//       <li data-feedback="clone() copies the heap data, so a is still valid. Nothing moves."
//           data-misconception="clone-is-move">let b = a.clone();</li>
//       <li data-correct>let b = a;</li>
//     </ol>
//     <p class="tq-explain">Assignment moves; clone copies the heap data.</p>
//   </div>
//   - A wrong <li> may carry data-feedback (shown when exactly that choice is picked; if absent,
//     the .tq-explain text is shown instead) and data-misconception (a kebab-case slug naming the
//     misconception that choice reveals; reported to the teacher).
//   - A wrong click marks and disables that choice and lets the learner try again. The correct
//     click shows .tq-explain and locks the question.
//   - Only the FIRST attempt is reported: { item, prompt, correct, choice, misconception? }.
//     Later attempts are practice. The score line counts first attempts only.
//   - data-attempts="1" on .tq-quiz allows a single try: a wrong click reveals the answer and locks.
//     (A larger number, e.g. "2", locks and reveals after that many tries.)
//
// Fill in the blank (graded here; the learner can fix and re-check until every blank is right):
//   <div class="tq-fill" data-id="sum-by-region">
//     <p class="tq-prompt">Complete the query.</p>
//     <pre><code>SELECT region, <span class="tq-blank" data-answer="SUM(amount)"
//         data-accept="sum (amount)|total(amount)" data-hint="Which function adds up a column?"
//         data-misconception="count-vs-sum"></span>
//     FROM orders GROUP BY <span class="tq-blank" data-answer="region"></span>;</code></pre>
//     <p class="tq-explain">SUM adds the values; GROUP BY makes one row per region.</p>
//   </div>
//   - Each .tq-blank becomes a text input. A blank is right if, after trimming, collapsing inner
//     whitespace and lowercasing, it equals data-answer or one of the |-separated data-accept
//     alternatives. Wrong blanks show data-hint; right blanks lock; .tq-explain shows when all are right.
//   - Reported ONCE, on the first Check, as a quiz result:
//     { item, prompt, correct: all blanks right on first check, choice: values joined with " | ",
//       misconception?: slug of the first wrong blank }.
//
// Recall (free text, graded by the teacher; the model answer is revealed after submitting):
//   <div class="tq-recall" data-id="ownership-why">
//     <p class="tq-prompt">In one sentence: why does Rust move instead of copy?</p>
//     <p class="tq-model">So exactly one owner frees the heap allocation.</p>
//   </div>
//
// Custom widgets report through window.teach.report({ item, prompt, correct, choice, misconception? })
// or window.teach.recall({ item, prompt, text }).
//
// Accessibility: each item is a labelled group (aria-labelledby the prompt); verdicts, feedback and the
// explanation go through ONE aria-live region per item (.tq-feedback, created once, text replaced) which
// takes focus when the item locks. A wrong choice gets visually-hidden "(incorrect)" text, the right one
// "(correct)"; after a wrong choice focus moves to the next enabled choice. Blanks are named
// "Blank N of M", with aria-invalid on wrong ones and aria-describedby pointing at the shown hint.
//
// Opened on its own, a lesson works the same; inside the classroom page every result is also
// posted to the parent window, which queues it for the teacher.
//
// Self-test (used by `teach.mjs check-lesson <file> --render`): when the page URL hash contains
// "teach-selftest" (lesson.html#teach-selftest) the kit drives every item itself after mounting,
// records the messages report()/recall() would post, plus script errors, unhandled rejections and
// console.error calls, then writes a JSON summary into <pre id="tq-selftest-result"> and sets
// <html data-tq-selftest="done">. Without that hash none of this runs and nothing changes.
(function () {
  "use strict";
  const SELFTEST = /teach-selftest/.test(location.hash);
  const captured = SELFTEST ? [] : null;   // every message post() was asked to send
  const pageErrors = SELFTEST ? [] : null; // errors thrown by the lesson's own scripts
  const probes = SELFTEST ? new Map() : null; // fill box -> its blanks, with the answers
  if (SELFTEST) {
    const note = (m) => { m = String(m).replace(/\s+/g, " ").trim().slice(0, 300); if (m && !pageErrors.includes(m)) pageErrors.push(m); };
    window.addEventListener("error", (e) => { if (e.message) note(`error: ${e.message}${e.filename ? ` (${String(e.filename).split("/").pop()}:${e.lineno})` : ""}`); });
    window.addEventListener("unhandledrejection", (e) => note(`unhandled rejection: ${(e.reason && e.reason.message) || e.reason}`));
    const origError = console.error;
    console.error = function (...a) { note(`console.error: ${a.map(String).join(" ")}`); return origError.apply(this, a); };
  }
  const inClassroom = window.parent && window.parent !== window;
  const post = (msg) => {
    if (captured) captured.push(JSON.parse(JSON.stringify(msg)));
    if (inClassroom) window.parent.postMessage({ source: "teach-quiz", ...msg }, "*");
  };
  const text = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
  const results = { right: 0, total: 0 };

  function scoreLine() {
    let el = document.querySelector(".tq-score");
    if (!el && results.total > 1) { el = document.createElement("p"); el.className = "tq-score"; (document.querySelector("main") || document.body).appendChild(el); }
    if (el) el.textContent = `Score so far: ${results.right} / ${results.total}`;
  }

  function report({ item, prompt, correct, choice, misconception }) {
    results.total++; if (correct) results.right++;
    const msg = { type: "quiz", item: String(item || ""), prompt: String(prompt || ""), correct: !!correct, choice: String(choice || "") };
    if (misconception) msg.misconception = String(misconception);
    post(msg);
    scoreLine();
  }
  function recall({ item, prompt, text: answer }) {
    post({ type: "recall", item: String(item || ""), prompt: String(prompt || ""), text: String(answer || "") });
  }
  window.teach = { report, recall, inClassroom };

  let uid = 0;
  const srText = (t) => { const s = document.createElement("span"); s.className = "tq-sr"; s.textContent = t; return s; };
  // Label a group by its prompt, giving the prompt an id if it lacks one.
  function labelGroup(box) {
    const p = box.querySelector(".tq-prompt");
    box.setAttribute("role", "group");
    if (p) { if (!p.id) p.id = `tq-prompt-${++uid}`; box.setAttribute("aria-labelledby", p.id); }
    return p;
  }
  function verdict(ok) {
    const v = document.createElement("span");
    v.className = `tq-verdict ${ok ? "ok" : "no"}`; v.textContent = ok ? "Right." : "Not quite.";
    return v;
  }
  // The item's single live region: created once (empty, so later text is announced), text replaced.
  function feedbackEl(box, before) {
    let fb = box.querySelector(".tq-feedback");
    if (!fb) {
      fb = document.createElement("div"); fb.className = "tq-feedback";
      fb.setAttribute("aria-live", "polite"); fb.setAttribute("tabindex", "-1");
      box.insertBefore(fb, before || null);
    }
    return fb;
  }
  // Lock the item: the verdict plus the explanation go into the live region, which takes focus.
  function reveal(box, ok) {
    box.classList.add("tq-done");
    const fb = feedbackEl(box, box.querySelector(".tq-explain"));
    fb.replaceChildren(verdict(ok), " ");
    const explain = box.querySelector(".tq-explain");
    if (explain) { const span = document.createElement("span"); span.innerHTML = explain.innerHTML; fb.append(span); explain.remove(); }
    fb.focus();
  }

  function mountQuiz(box, n) {
    const id = box.dataset.id || `quiz-${n + 1}`;
    const prompt = text(box.querySelector(".tq-prompt"));
    const list = box.querySelector(".tq-choices");
    if (!list) return;
    labelGroup(box);
    feedbackEl(box, box.querySelector(".tq-explain"));
    const parsed = parseInt(box.dataset.attempts, 10);
    const maxAttempts = parsed > 0 ? parsed : Infinity;
    const items = [...list.children];
    const buttons = items.map((li) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "tq-choice"; b.innerHTML = li.innerHTML;
      b.dataset.correct = li.hasAttribute("data-correct") ? "1" : "";
      b.dataset.feedback = li.getAttribute("data-feedback") || "";
      b.dataset.misconception = li.getAttribute("data-misconception") || "";
      li.replaceChildren(b);
      return b;
    });
    const mark = (b, t) => b.append(" ", srText(`(${t})`));
    let attempts = 0;
    buttons.forEach((b, i) => b.addEventListener("click", () => {
      if (box.classList.contains("tq-done") || b.disabled) return;
      attempts++;
      const correct = b.dataset.correct === "1";
      if (attempts === 1) {
        report({ item: id, prompt, correct, choice: text(b), misconception: correct ? "" : b.dataset.misconception });
      }
      if (correct) {
        buttons.forEach((x) => { x.disabled = true; });
        b.classList.add("tq-right"); mark(b, "correct");
        reveal(box, true);
        return;
      }
      b.classList.add("tq-wrong"); b.disabled = true; mark(b, "incorrect");
      if (attempts >= maxAttempts) {
        // Out of tries: reveal the answer, as before.
        buttons.forEach((x) => { x.disabled = true; if (x.dataset.correct === "1") { x.classList.add("tq-right"); mark(x, "correct"); } });
        reveal(box, false);
        return;
      }
      // A disabled button drops focus to <body>: hand it to the next enabled choice.
      const next = buttons.slice(i + 1).concat(buttons.slice(0, i)).find((x) => !x.disabled);
      if (next) next.focus();
      const fb = feedbackEl(box, box.querySelector(".tq-explain"));
      fb.replaceChildren(verdict(false), " ");
      const own = b.dataset.feedback;
      if (own) fb.append(own);
      else {
        const ex = box.querySelector(".tq-explain");
        if (ex) { const span = document.createElement("span"); span.innerHTML = ex.innerHTML; fb.append(span); }
        else fb.append("Try another choice.");
      }
    }));
  }

  const norm = (s) => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();

  function mountFill(box, n) {
    const id = box.dataset.id || `fill-${n + 1}`;
    const prompt = text(box.querySelector(".tq-prompt"));
    labelGroup(box);
    const spans = [...box.querySelectorAll(".tq-blank")];
    const blanks = spans.map((span, i) => {
      const answer = span.getAttribute("data-answer") || "";
      const accepted = [answer, ...(span.getAttribute("data-accept") || "").split("|")].map(norm).filter(Boolean);
      const input = document.createElement("input");
      input.type = "text"; input.className = "tq-blank"; input.autocomplete = "off"; input.spellcheck = false;
      input.setAttribute("autocapitalize", "off"); input.setAttribute("aria-label", `Blank ${i + 1} of ${spans.length}`);
      input.size = Math.max(4, answer.length + 1);
      span.replaceWith(input);
      return { input, answer, accepted, hintId: `tq-hint-${++uid}`, hint: span.getAttribute("data-hint") || "", misconception: span.getAttribute("data-misconception") || "", right: false };
    });
    if (!blanks.length) return;
    if (probes) probes.set(box, blanks);
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "tq-submit"; btn.textContent = "Check";
    const explain = box.querySelector(".tq-explain");
    box.insertBefore(btn, explain || null);
    const fb = feedbackEl(box, explain || null);
    let checks = 0;

    function check() {
      if (box.classList.contains("tq-done")) return;
      if (!blanks.some((bl) => !bl.right && bl.input.value.trim())) { (blanks.find((bl) => !bl.right) || blanks[0]).input.focus(); return; }
      checks++;
      const lines = [];
      blanks.forEach((bl, i) => {
        if (bl.right) return;
        const ok = bl.accepted.includes(norm(bl.input.value));
        bl.input.classList.toggle("tq-right", ok); bl.input.classList.toggle("tq-wrong", !ok);
        if (ok) { bl.right = true; bl.input.readOnly = true; bl.input.removeAttribute("aria-invalid"); bl.input.removeAttribute("aria-describedby"); }
        else {
          bl.input.setAttribute("aria-invalid", "true");
          lines.push({ bl, label: blanks.length > 1 ? `Blank ${i + 1}: ` : "", msg: bl.hint || "Not quite. Check it and try again." });
        }
      });
      if (checks === 1) {
        const firstWrong = blanks.find((bl) => !bl.right);
        report({ item: id, prompt, correct: !firstWrong, choice: blanks.map((bl) => bl.input.value.trim()).join(" | "), misconception: firstWrong ? firstWrong.misconception : "" });
      }
      if (blanks.every((bl) => bl.right)) {
        btn.disabled = true;
        reveal(box, true);
        return;
      }
      fb.replaceChildren(verdict(false), " ");
      lines.forEach((l, i) => {
        if (i) fb.append(document.createElement("br"));
        const h = document.createElement("span"); h.id = l.bl.hintId; h.textContent = l.label + l.msg;
        fb.append(h);
        l.bl.input.setAttribute("aria-describedby", l.bl.hintId);
      });
    }
    btn.addEventListener("click", check);
    blanks.forEach((bl) => bl.input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); check(); } }));
  }

  function mountRecall(box, n) {
    const id = box.dataset.id || `recall-${n + 1}`;
    const prompt = text(box.querySelector(".tq-prompt"));
    const promptEl = labelGroup(box);
    const ta = document.createElement("textarea");
    if (promptEl) ta.setAttribute("aria-labelledby", promptEl.id);
    ta.placeholder = "Answer from memory first, then check.";
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "tq-submit";
    btn.textContent = inClassroom ? "Submit to teacher" : "Check";
    const model = box.querySelector(".tq-model");
    box.insertBefore(ta, model || null); box.insertBefore(btn, model || null);
    const fb = feedbackEl(box, model || null);
    if (model) model.setAttribute("tabindex", "-1");
    btn.addEventListener("click", () => {
      const answer = ta.value.trim();
      if (!answer) { ta.focus(); return; }
      ta.readOnly = true; btn.disabled = true; box.classList.add("tq-done");
      if (model) model.insertAdjacentHTML("afterbegin", "<b>Model answer:</b> ");
      if (inClassroom) { fb.classList.add("tq-sent"); fb.textContent = "Queued for your teacher. It goes with your next Send."; }
      else fb.append(srText("Answer submitted. Model answer follows."));
      recall({ item: id, prompt, text: answer });
      (model || fb).focus();
    });
  }

  // ---------- self-test (only with #teach-selftest in the URL) ----------
  // Drives every item the way a learner would, checks the page reacted, and reports what it saw.
  async function selfTest(summary, finish) {
    const tick = () => new Promise((r) => setTimeout(r, 0));
    const squash = (s) => String(s || "").replace(/\s+/g, " ").trim();
    const msgsFor = (id, type) => captured.filter((m) => m.item === id && m.type === type);
    const counters = { quiz: 0, fill: 0, recall: 0 };
    for (const box of document.querySelectorAll(".tq-quiz, .tq-fill, .tq-recall")) {
      const type = box.classList.contains("tq-quiz") ? "quiz" : box.classList.contains("tq-fill") ? "fill" : "recall";
      const n = ++counters[type], id = box.dataset.id || `${type}-${n}`; // same fallback ids as the mount functions
      const rec = { id, type, mounted: false, responded: false, reports: 0, correctReported: null, ok: false, problems: [] };
      summary.items.push(rec);
      const bad = (m) => rec.problems.push(m);
      const isDone = () => box.classList.contains("tq-done");
      const feedback = () => squash(box.querySelector(".tq-feedback") && box.querySelector(".tq-feedback").textContent);
      try {
        if (type === "quiz") {
          const choices = [...box.querySelectorAll(".tq-choice")];
          rec.mounted = choices.length > 0;
          const right = choices.find((b) => b.dataset.correct === "1");
          const wrongs = choices.filter((b) => b.dataset.correct !== "1");
          if (!rec.mounted) bad("not mounted (no .tq-choices list?)");
          else if (!right) bad("no correct choice");
          else {
            const wrongFirst = wrongs.length > 1 && parseInt(box.dataset.attempts, 10) !== 1;
            const w = wrongs[0];
            if (wrongFirst) {
              w.click(); await tick();
              const want = squash(w.dataset.feedback), got = feedback();
              if (want ? !got.includes(want) : !got) bad(want ? "the wrong choice's data-feedback did not appear" : "no feedback appeared after a wrong choice");
              if (isDone()) bad("locked after one wrong choice although retries are allowed");
              if (!w.disabled) bad("the wrong choice stayed clickable");
            }
            right.click(); await tick();
            if (!isDone()) bad("not locked after the correct choice");
            if (choices.some((b) => !b.disabled)) bad("choices still clickable after the correct choice");
            if (!feedback()) bad("no verdict shown after the correct choice");
            const msgs = msgsFor(id, "quiz");
            rec.reports = msgs.length;
            if (msgs.length !== 1) bad(`expected exactly 1 report, got ${msgs.length}`);
            else {
              rec.correctReported = msgs[0].correct;
              if (msgs[0].correct !== !wrongFirst) bad(`first attempt reported correct=${msgs[0].correct}, expected ${!wrongFirst}`);
              const want = wrongFirst ? w.dataset.misconception : "";
              if ((msgs[0].misconception || "") !== want) bad(`misconception reported as "${msgs[0].misconception || ""}", expected "${want}"`);
            }
          }
        } else if (type === "fill") {
          const blanks = probes.get(box), btn = box.querySelector(".tq-submit");
          rec.mounted = !!(blanks && btn);
          if (!rec.mounted) bad("not mounted (no .tq-blank with data-answer?)");
          else if (!blanks[0].answer) bad("first blank has no data-answer");
          else {
            const first = blanks[0];
            blanks.forEach((bl, i) => { bl.input.value = i === 0 ? "tq-selftest-wrong" : bl.answer; });
            btn.click(); await tick();
            if (first.input.getAttribute("aria-invalid") !== "true" || !first.input.classList.contains("tq-wrong")) bad("the wrong blank was not marked invalid");
            if (first.hint && !feedback().includes(squash(first.hint))) bad("the blank's data-hint did not appear");
            if (isDone()) bad("locked after a wrong answer");
            first.input.value = first.answer;
            btn.click(); await tick();
            if (!isDone()) bad("not locked after every blank was right");
            const msgs = msgsFor(id, "quiz");
            rec.reports = msgs.length;
            if (msgs.length !== 1) bad(`expected exactly 1 report, got ${msgs.length}`);
            else {
              rec.correctReported = msgs[0].correct;
              if (msgs[0].correct !== false) bad("first check had a wrong blank but was reported correct");
              if ((msgs[0].misconception || "") !== first.misconception) bad(`misconception reported as "${msgs[0].misconception || ""}", expected "${first.misconception}"`);
            }
          }
        } else {
          const ta = box.querySelector("textarea"), btn = box.querySelector(".tq-submit");
          rec.mounted = !!(ta && btn);
          if (!rec.mounted) bad("not mounted (no .tq-prompt?)");
          else {
            ta.value = "Self-test answer."; btn.click(); await tick();
            if (!isDone()) bad("not locked after submitting");
            const msgs = msgsFor(id, "recall");
            rec.reports = msgs.length;
            if (msgs.length !== 1) bad(`expected exactly 1 recall message, got ${msgs.length}`);
            else if (msgs[0].text !== "Self-test answer.") bad("the recall message did not carry the typed answer");
            const model = box.querySelector(".tq-model");
            if (model) {
              const cs = getComputedStyle(model);
              if (cs.display === "none" || cs.visibility === "hidden") bad("the model answer is still hidden after submitting");
              else if (!/^Model answer:/.test(squash(model.textContent))) bad("the model answer was not revealed");
            }
          }
        }
        rec.responded = rec.reports > 0 && isDone();
      } catch (e) { bad(`threw: ${e && e.message || e}`); }
      rec.ok = rec.mounted && rec.responded && !rec.problems.length;
    }
    finish();
  }

  function startSelfTest() {
    const summary = { items: [], errors: [], ok: false };
    let finished = false, timer = 0;
    const finish = (err) => {
      if (finished) return; finished = true; clearTimeout(timer);
      if (err) summary.errors.push(err);
      for (const e of pageErrors) if (!summary.errors.includes(e)) summary.errors.push(e);
      for (const it of summary.items) if (!it.ok && !it.problems.length) it.problems.push("did not finish");
      summary.ok = !summary.errors.length && summary.items.every((i) => i.ok);
      const pre = document.createElement("pre");
      pre.id = "tq-selftest-result"; pre.hidden = true;
      // Escape <, > and & so the serialized DOM holds the JSON verbatim.
      pre.textContent = JSON.stringify(summary).replace(/[<>&]/g, (c) => "\\u00" + c.charCodeAt(0).toString(16));
      document.body.appendChild(pre);
      document.documentElement.dataset.tqSelftest = "done";
    };
    timer = setTimeout(() => finish("self-test timed out after 5s"), 5000);
    const go = () => setTimeout(() => selfTest(summary, finish).catch((e) => finish(`self-test crashed: ${e && e.message || e}`)), 0);
    if (document.readyState === "complete") go(); else window.addEventListener("load", go);
  }

  function mount() {
    document.querySelectorAll(".tq-quiz").forEach(mountQuiz);
    document.querySelectorAll(".tq-fill").forEach(mountFill);
    document.querySelectorAll(".tq-recall").forEach(mountRecall);
    if (SELFTEST) startSelfTest();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();
