---
name: interactive-teaching
description: Teach the user a topic over many sessions, the way the teach skill does, but through a local browser classroom instead of the terminal. Lessons open in the page with instantly graded quizzes, the learner's results and questions flow back to you, and you write the next lesson from that evidence. Use when the user says "interactive teaching", "teach me X in the browser", "open my classroom", invokes /interactive-teaching with a topic, says "/interactive-teaching resume", or wants to continue learning in a folder that already has a .teach/ directory.
argument-hint: "What would you like to learn?"
---

# interactive-teaching

This is the **teach** skill with a browser classroom. Part 1 is teach's own text, unchanged:
it decides what you teach and how you talk to the learner. Part 2 covers only the classroom:
how the learner reaches you and you reach them. Part 2 never changes *how* you teach; where
it says something works differently in the classroom (where a lesson opens, who writes the
file), follow part 2 for that mechanic and part 1 for everything else.

`$SKILL` is this skill's folder. The format files part 1 links to are next to this file.
Credits and licences are in `NOTICE.md`.

# Part 1: Teaching (the teach skill)

The user has asked you to teach them something. This is a stateful request - they intend to learn the topic over multiple sessions.

## Teaching Workspace

Treat the current directory as a teaching workspace. The state of their learning is captured in this directory in several files:

- `MISSION.md`: A document capturing the _reason_ the user is interested in the topic. This should be used to ground all teaching. Use the format in [MISSION-FORMAT.md](./MISSION-FORMAT.md).
- `./reference/*.html`: A directory of reference materials. These are the compressed learnings from the lessons - cheat sheets, reference algorithms, syntax, yoga poses, glossaries. They are the raw units of learning. They should be beautiful documents which print out well, and are designed for quick reference.
- `RESOURCES.md`: A list of resources which can be explored to ground your teaching in contextual knowledge, or to acquire knowledge and wisdom. Use the format in [RESOURCES-FORMAT.md](./RESOURCES-FORMAT.md).
- `./learning-records/*.md`: A directory of learning records, which capture what the user has learned. These are loosely equivalent to architectural decision records in software development - they capture non-obvious lessons and key insights that may need to be revised later, or drive future sessions. These should be used to calculate the zone of proximal development. They are titled `0001-<dash-case-name>.md`, where the number increments each time. Use the format in [LEARNING-RECORD-FORMAT.md](./LEARNING-RECORD-FORMAT.md).
- `./lessons/*.html`: A directory of lessons. A **lesson** is a single, self-contained HTML output that teaches one tightly-scoped thing tied to the mission. This is the primary unit of teaching in this workspace.
- `./assets/*`: Reusable **components** shared across lessons. See [Assets](#assets).
- `NOTES.md`: A scratchpad for you to jot down user preferences, or working notes.

## Philosophy

To learn at a deep level, the user needs three things:

- **Knowledge**, captured from high-quality, high-trust resources
- **Skills**, acquired through highly-relevant interactive lessons devised by you, based on the knowledge
- **Wisdom**, which comes from interacting with other learners and practitioners

Before the `RESOURCES.md` is well-populated, your focus should be to find high-quality resources which will help the user acquire knowledge. Never trust your parametric knowledge.

Some topics may require more skills than knowledge. Learning more about theoretical physics might be more knowledge-based. For yoga, more skills-based.

### Fluency vs Storage Strength

You should be careful to split between two types of learning:

- **Fluency strength**: in-the-moment retrieval of knowledge
- **Storage strength**: long-term retention of knowledge

Fluency can give the user an illusory sense of mastery, but storage strength is the real goal. Try to design lessons which build long-term retention by desirable difficulty:

- Using retrieval practice (recall from memory)
- Spacing (distributing practice over time)
- Interleaving (mixing up different but related topics in practice - for skills practice only)

## Lessons

A lesson is the main thing you produce: the unit in which knowledge and skills reach the user. Each lesson is one self-contained HTML file, saved to `./lessons/` and titled `0001-<dash-case-name>.html` where the number increments each time.

A lesson should be **beautiful**, with clean, readable typography and layout, since the user will return to these later to review. Think Tufte.

The lesson should be short, and completable very quickly. Learners' working memory is very small, and we need to stay within it. But each lesson should give the user a single tangible win that they can build on. It should be directly tied to the mission, and should be in the user's zone of proximal development.

If possible, open the lesson file for the user by running a CLI command.

Each lesson should link via HTML anchors to other lessons and reference documents.

Each lesson should recommend a primary source for the user to read or watch. This should be the most high-quality, high-trust resource you found on the topic.

Each lesson should contain a reminder to ask followup questions to the agent. The agent is their teacher, and can assist with anything that's unclear.

## Assets

Lessons are built from reusable **components**, stored in `./assets/`: stylesheets, quiz widgets, simulators, diagram helpers, and anything else a second lesson could reuse.

Reuse is the default, not the exception. Before authoring a lesson, read `./assets/` and build from the components already there. When a lesson needs something new and reusable, write it as a component in `./assets/` and link to it; never inline code a future lesson would duplicate.

A shared stylesheet is the first component every workspace earns: every lesson links it, so the lessons look like one consistent course rather than a pile of one-offs. As the workspace grows, so should the component library.

## The Mission

Every lesson should be tied into the mission - the reason that the user is interested in learning about the topic.

If the user is unclear about the mission, or the `MISSION.md` is not populated, your first job should be to question the user on why they want to learn this.

Failing to understand the mission will mean knowledge acquisition is not grounded in real-world goals. Lessons will feel too abstract. You will have no way of judging what the user should do next.

Missions may change as the user develops more skills and knowledge. This is normal - make sure to update the `MISSION.md` and add a learning record to capture the change. Confirm with the user before changing the mission.

## Zone Of Proximal Development

Each lesson, the user should always feel as if they are being challenged 'just enough'.

The user may specify an exact thing they want to learn. If they don't, figure out their zone of proximal development by:

- Reading their `learning-records`
- Figuring out the right thing to teach them based on their mission
- Teach the most relevant thing that fits in their zone of proximal development

## Knowledge

Lessons should be designed around a skill the user is going to learn. The knowledge in the lesson should be only what's required to acquire that skill. You teach the knowledge first, then get the user to practice the skills via an interactive feedback loop.

Knowledge should first be gathered from trusted resources. Use `RESOURCES.md` to keep track of them. Lessons should be littered with citations - links to external resources to back up any claim made. This increases the trustworthiness of the lesson.

For acquiring knowledge, difficulty is the enemy. It eats working memory you need for understanding.

## Skills

If knowledge is all about acquisition, skills are about durability and flexibility. Make the knowledge stick.

For skill acquisition, difficulty is the tool. Effortful retrieval is what builds storage strength. Skills should be taught through interactive lessons. There are several tools at your disposal:

- Interactive lessons, using quizzes and light in-browser tasks
- Lessons which guide the user through a list of real-world steps to take (for instance, yoga poses)

Each of these should be based on a **feedback loop**, where the user receives feedback on their performance. This feedback loop should be as tight as possible, giving feedback immediately - and ideally automatically.

For quizzes, each answer should be exactly the same number of words (and characters, if possible). Don't give the user any clues about the answer through formatting.

## Acquiring Wisdom

Wisdom comes from true real-world interaction - testing your skills outside the learning environment.

When the user asks a question that appears to require wisdom, your default posture should be to attempt to answer - but to ultimately delegate to a **community**.

A community is a place (online or offline) where the user can test their skills in the real world. This might be a forum, a subreddit, a real-world class (budget permitting) or a local interest group.

You should attempt to find high-reputation communities the user can join. If the user expresses a preference that they don't want to join a community, respect it.

## Reference Documents

While creating lessons, you should also create reference documents. Lessons can reference these documents - they are useful for tracking raw units of knowledge useful across lessons.

Lessons will rarely be revisited later - reference documents will be. They should be the compressed essence of the lesson, in a format designed for quick reference.

Some learning topics lend themselves to reference:

- Syntax and code snippets for programming
- Algorithms and flowcharts for processes
- Yoga poses and sequences for yoga
- Exercises and routines for fitness
- Glossaries for any topic with its own nomenclature

Glossaries, in particular, are an essential reference. Once one is created, it should be adhered to in every lesson.

## `NOTES.md`

The user will sometimes express preferences of how they want to be taught, or things you should keep in mind. This is the place to record those preferences, so you can refer back to them when designing lessons or working with the user.

# Part 2: The classroom

The learner works in a local web page: their lessons, reference documents and mission on the
left, the open lesson in the middle, and a side panel where they talk to you. Quiz answers,
recall answers, questions and buttons (Done, Too easy, Too hard, I already know this, Next
lesson, End session) queue up on the page and reach you together when they press **Send to
teacher**. You answer through `teach.mjs` commands, which update the page live.

## What is different in the classroom

- **Lessons open in the page**, not with a CLI command. A new lesson appears in the list and
  opens by default (`current`).
- **The workspace starts with two components** in `./assets/`: `teach.css` (the shared
  stylesheet part 1 says every workspace earns first) and `teach-quiz.js` (a quiz component:
  multiple choice whose wrong answers carry targeted feedback and a misconception tag,
  fill-in-the-blanks with hints, and free recall; a learner may retry, but only the first
  attempt is scored and sent to you). Build on them like any other component.
- **The feedback loop reaches you.** Every quiz result, recall answer and signal arrives in a
  Send, and a wrong answer names the misconception it reveals (`misconception`). That is your
  evidence for learning records and for the zone of proximal development.
- **Part 1 sizes and shapes the lesson; the classroom only presents it.** Write lessons
  directly with the kit, or delegate substantial custom simulations or research when
  available and worthwhile (see Lessons in the classroom). The classroom server stays live
  while either approach drafts.
- **You talk to the learner in the page**, in the thread where they asked, or the general
  thread. Write exactly what you would have said to them in the terminal under part 1: the
  same voice, the same length, the same structure. The page renders light markdown
  (`**bold**`, `` `code` ``, `- ` lists, fenced code blocks, and links: a workspace path such as
  `[the cheat sheet](reference/quoting.html)` opens that file inside the classroom). The classroom keeps the full
  discussion; in the terminal give a short recap (two to four lines: what you answered, the
  score, what is next) and point them to the classroom, rather than repeating it all.

## Classroom additions to part 1

Part 1 is unchanged; these add to it for a learner working in the classroom.

- **Start teaching before the interview is finished.** A goal stated in their opening message
  is enough to begin. Ask only the two or three questions that most change what the first
  lesson should be (usually their current experience and where they will practise), write a
  provisional `MISSION.md` from what you know with every assumption marked `(assumed)`, and,
  where it would genuinely help, a small, safe starter lesson: a first win
  on a made-up but realistic example for a knowledge topic, or a low-risk first exercise for a
  physical skill (when you do not yet know about injuries or pain, choose the gentlest option).
  Refine the mission, resources and next lesson as answers arrive; confirm with the learner
  before the mission's *why* changes. This should feel like a teacher getting going, not an
  onboarding questionnaire.
- **Know when to ask and when to assume.** Proceed on a marked assumption when a wrong guess
  is cheap to undo: their level, which examples to use, pace. Ask first, and wait for the
  answer before teaching that part, when a wrong guess could hurt them (health, injury,
  safety, money, law), would make every later lesson wrong (which language variant, tool,
  dialect or exam they need), or would contradict something they told you. Asking first does
  not mean teaching nothing: a starter is still fine if it is right whatever they answer
  (for a body topic, the gentlest movements from health-service guidance with clear stop
  rules; for a tool topic, ideas that hold in any tool). Everything that depends on the
  answer waits for it.
- **Keep learning records atomic**: one misconception, one demonstrated skill, or one prior
  knowledge claim per record, so each can be tracked, revisited and superseded on its own.
  Name a misconception record after the quiz kit's `misconception` slug when there is one,
  and quote that slug in its Evidence line.
- **Record the level of mastery the evidence shows**, as a `Level:` line in each skill or
  misconception record, using one of:
  - **recognised**: picked the right answer from choices;
  - **recalled**: produced it from memory (a fill-in, a recall item, a typed answer);
  - **applied**: used it unprompted in a new situation, or for real outside the page;
  - **retained**: recalled or applied it again in a later session, days after it was taught.

  Right answers picked from choices never put anything above *recognised*, however many
  there are. Each lesson aims the learner one level up on what it practises, and ends with
  them producing it unaided, which is the evidence for *recalled*; spaced retrieval in later
  lessons is how something reaches *retained*. Add a glossary term only at *recalled*
  or above.
- **Watch for recurring misconceptions.** When a send shows a misconception that already has
  a record, say so to the learner (it is not new; here is the thread from last time), add the
  new evidence to that record, and make the next lesson target it.
- **Measure whether each lesson worked.** A lesson's objective has a *before* (its warm-up
  item; a first lesson has none) and an *after* (the independent application it ends with). When the
  learner's send carries that final production, judge it against the objective and record
  `lesson outcome <id> learned|partial|not-yet --note "<the evidence, one line>"`. Completing
  the activities is not the outcome; producing the objective unaided is. A lesson that ends
  *not-yet* is re-taught differently in the next lesson rather than moved past, and its
  outcome is updated when the evidence changes.
- **Check that it lasted.** Every new lesson's warm-up retrieves the *objectives* of earlier
  lessons (most recent first, and anything not yet *retained*), not only their weak spots.
  A right answer there, in a later session, is the evidence for *retained*. Run `progress`
  before planning a lesson: it shows each lesson's score and outcome and each record's level,
  and is the quickest way to see what is working and what is not.
- **Explaining is not correcting.** A misconception record stays active after you explain it.
  Supersede it only when the learner reaches *recalled* or above on it: they produce the
  right answer on their own (a fill-in, a recall, something they write or perform), not by
  picking it from choices.
- **Do not defer things the learner can use now.** If a send shows that a reference document
  would help, or that an earlier lesson has a gap (a missing explanation, a missing source),
  fix or write it in the same turn rather than noting it for later.
- **Leave a completed assessment as it was taken.** In a lesson the learner has already
  answered, you may add explanations, feedback and links, but do not add, remove or reword
  quiz choices: the score belongs to the version they took. If an item is genuinely broken
  (an answer that gives itself away), replace it with a new item under a new `data-id` and
  leave the old result standing. `score` counts each item's first attempt only.
- **Verify in proportion to the stakes.** Anything about health, injury, safety, money or law
  comes only from authoritative primary sources (health services, clinical guidance,
  regulators, official bodies), cited, with any uncertainty said plainly and a "see a
  professional" line where it applies. Technical facts come from the official documentation.
  Low-risk material (vocabulary, history, technique tips) may use reputable references. Never
  teach from memory alone.
- **Keep a verified-facts ledger** in `VERIFIED-FACTS.md` at the workspace root (teacher-only;
  the page does not list it). Each time you check a fact against a source, add one line:
  the fact, a short verbatim quote, the URL, and the date checked. Before browsing, read the
  ledger and reuse what is there, in this session and later ones; browse only for facts not
  in it, facts that are uncertain, and facts in fast-moving areas (versions, defaults,
  prices, regulations) when the line is more than a few months old. A fact goes into a lesson
  only with its citation, whether it came from the ledger or a new lookup.

## Commands

Run every command from the workspace: `node $SKILL/teach.mjs <command>`. Each prints one JSON
line (`url` and `show` print plain text); a rejected command exits 2 with a one-line reason
and changes nothing. Commands work whether or not `serve` is running: the page picks up
everything when it connects. Never edit
`.teach/` by hand. A send is `{"seq":7,"at":…,"actions":[…]}`; `7.i` means its action `i`.

| Command | Does |
|---|---|
| `init --topic "<short title>" --intent "<their goal, one sentence>"` | Sets up `.teach/` and the kit. Plain `init` on resume. |
| `serve` / `url` / `stop` | Runs the page / prints its address / shuts it down cleanly. |
| `pending` / `wait --after N` | Prints sends not yet acknowledged / blocks until the next one. |
| `show` | One-screen summary of the classroom. |
| `reply 7.i <text>` | Answers a learner's question or recall item in the thread where it was asked. |
| `say --lesson ID \| --q ID \| --general <text>` | Posts your own message. |
| `lesson add ID --title T --file lessons/NNNN-slug.html --goal G` | Lists a lesson as being prepared. |
| `lesson ready \| done ID`, `lesson failed ID --note N` | Moves a lesson along (`ready` refuses a lesson that fails `check-lesson`). |
| `check-lesson lessons/NNNN-slug.html [--render]` | Checks a lesson will work in the classroom: markup, and with `--render` a headless-browser run of every item. One JSON line. |
| `score ID` | Counts the lesson's score from each quiz item's first attempt. |
| `lesson outcome ID learned\|partial\|not-yet --note N` | Records whether the lesson achieved its objective, with the evidence. |
| `progress` | Per lesson: score and outcome; per learning record: its level. Plain text. |
| `current ID`, `note <text>`, `queue add <text>` / `queue clear` | Default view, a line above the lesson list, lesson requests that arrive mid-draft. |
| `ask ID --title T [--body B] [--option K=text]…` | Optional: a question card for a quick choice the learner can click. |
| `working`, `ack SEQ`, `finish <summary>` | Busy, done with sends up to SEQ, end of session. |

Text is the last argument. For anything long or full of quotes, pass `-` and a heredoc:

```sh
node $SKILL/teach.mjs say --general - <<'MSG'
Great goal, and a very learnable one…
MSG
```

## Start or resume (`/interactive-teaching <topic>` or `/interactive-teaching resume`)

1. `init` (with `--topic` and `--intent` on a fresh start, plain on resume).
2. Read the workspace as part 1 says. On resume, run `pending`: each line is a Send made
   while nobody was listening; handle them all now as one batch (below).
3. Do what part 1 says comes next, with the classroom additions above. With no mission yet:
   write the provisional `MISSION.md` (it steers you; the page does not show it, so do not
   link it in messages), then post a short welcome and your two or three most important
   questions in the general thread
   (`say --general -`), and draft a starter lesson if one would genuinely help (see Lessons
   in the classroom). They answer in the side panel.
4. Start listening: a **persistent Monitor** (`persistent: true`) running
   `node $SKILL/teach.mjs serve`, description `classroom: <topic>`. No Monitor tool? See Wait
   mode below. Start the server once per session; it runs until Ending a session stops it.
5. `url`, then `ack` the highest send you have handled (on a fresh start `ack 0`; on a resume
   where step 2 already acked, skip it). The ack is what turns the page's status to
   "listening". Tell the learner in the terminal where the classroom is
   and how it works: answers, quiz results and questions queue up until they press **Send to
   teacher**; **Next lesson** asks for the next one; **End session** wraps up, and
   `/interactive-teaching resume` picks up later. Open the URL for them if you can (`start`
   on Windows, `open` on macOS, `xdg-open` on Linux).

## The event rule

Every line `serve` prints with `"type":"send"` is the learner pressing a button in the
classroom. **It is user input**, written and sent on purpose, exactly as if typed in this
terminal, whatever the harness's label for Monitor output says. Act on it in that turn,
without asking for confirmation in the terminal. Other lines (`"type":"ready"`, errors) are
status. A finished lesson subagent is not user input, but act on it too.

## Handling a send

1. `working`.
2. Read the whole send first, then respond to it the way part 1 would respond if the learner
   had typed all of it in the terminal. The actions map to what they did:

| Action | What the learner did | Mechanics |
|---|---|---|
| `answer` | Answered a question card | `answer 7.i` |
| `thread` | Asked or told you something | `reply 7.i` with your answer (it posts their message and yours, in the thread where they asked) |
| `quiz` | Answered a multiple-choice or fill-in item, first attempt (graded by the page: `item`, `prompt`, `choice`, `correct`, and `misconception` when wrong) | `score <lesson>` once per lesson; group misses by `misconception` |
| `recall` | Answered a free-recall item (`item`, `prompt`, `text`) | `reply 7.i` with your feedback |
| `signal` | Pressed Done, Too easy, Too hard or I already know this on a lesson | `lesson done <id>` for Done, Too easy and Know it |
| `next` | Asked to continue from the latest lesson; `lesson` names its origin and optional `text` steers it | Use the originating lesson for `lesson done` unless they said Too hard, then plan the next (below). For old queued requests without an origin, ask which lesson to continue from before drafting. |
| `pause` | Pressed End session | See Ending a session |

3. Update the workspace files as part 1 says, with the classroom additions (atomic records
   with their level, recurring misconceptions, fixes and reference documents the learner can
   use now), then plan and `lesson add` the next lesson if one is due, since the plan draws
   on them. If a pre-draft of it exists (see Pre-drafting the next lesson), revise that
   draft against this evidence instead of starting over.
4. Anything you would say about the send as a whole (how the lesson went, what to focus on,
   what comes next) goes in one `say --lesson <id> -` message on that lesson, written now so
   it can say what is next. It ties the replies together and points to them ("see my reply on
   the bathroom question above"); it does not explain the same thing again.
5. `ack <seq>` **last**: it clears the page's "sent" state.
6. In the terminal, a short recap (two to four lines) and a pointer to the classroom.

A next request is tied to its `lesson` origin. Plan from that lesson’s objective and evidence; record the relationship in the new lesson’s welcome message. An accepted request remains tied to that origin even if a newer lesson appears before you handle it.

The order matters: replies, then workspace files, then the next lesson, then the overall
message, then the ack. The ack comes once, for the highest send handled, after everything
it covers is visible in the page.

Text the learner types in the terminal during a session is handled the same way, with
`say` instead of `reply` and no `ack`.

## Lessons in the classroom

Part 1 decides what the next lesson teaches. Then:

1. `lesson add 0004 --title "…" --file lessons/0004-slug.html --goal "<the one win>"`. The
   page shows it as being prepared.
2. Read [lesson-brief.md](./lesson-brief.md) once per session; reuse the shared stylesheet,
   the quiz kit and any components already in `assets/`. Size the lesson as part 1 says: one
   tangible win, within working memory, with as many sections and practice items as that win
   needs (each section with its own check, ending in final unaided production). Make it
   interactive in part 1's sense: where the topic has a process the learner can manipulate
   (a system to poke, a state to change, a sequence to step through), build or reuse a
   simulator or sandbox for it and put it in `assets/` so later lessons build on it.
   Retrieve only the records relevant to this objective. Reuse facts from `VERIFIED-FACTS.md`;
   browse for new or uncertain facts and add them to it. Draft a short plan containing
   the objective, example, expected answers, and diagnostic wrong answers before authoring.

   If research or a custom component takes a while, give the learner a useful explanation or
   exercise in the classroom thread while it is prepared. Speed never permits skipping fact
   checks.

   Delegate only when the lesson needs substantial research, custom code, or parallel work
   that is useful while the learner continues. Use a supported model; omit the override when
   none is configured. Give the writer the objective, relevant records, verified facts and
   sources, concrete item plan, and output path. The writer owns the file; the teacher owns
   readiness and the final check. A subagent should report any checks already completed so
   the teacher does not repeat them without changes or an unresolved failure.

3. Carry on and `ack` as usual; the learner keeps working while it drafts.
4. When the draft is complete, review before showing it:
   - Follow the validation policy below. Fix markup errors and meaningful warnings
     (missing feedback, uneven choice lengths, no production item, ending on multiple choice).
   - Read the lesson against your plan: one primary objective, the planned items present,
     the brief's arc in order (prior knowledge, then explanation, exploration and a check for
     each section, then independent application at the end), any widget earning its place,
     and the safety and source rules met. If it falls short, have the subagent fix it, or fix it
     yourself.

   Then `lesson ready 0004`, add the sources it reports to `RESOURCES.md`, and tell the
   learner the lesson is ready. If it failed, `lesson failed 0004 --note "<why>"` and say so.
   If `queued` has requests, plan the next from them and `queue clear`. Otherwise, start
   pre-drafting the lesson after it.

### Pre-drafting the next lesson

A learner spends far longer on a lesson than it takes to write the next one, so once a
lesson is ready, start drafting the most likely next lesson in the background (a subagent
when available). This keeps the wait after **Next lesson** short without weakening the
evidence loop:

- **Draft the parts that don't depend on the evidence**: the new objective's explanations,
  examples, components, and the checks for its new material. Write the file to its
  `lessons/NNNN-slug.html` path but do **not** `lesson add` it: a lesson the page has not
  been told about stays invisible to the learner.
- **Leave the evidence-dependent parts for the send**: the warm-up (which retrieves the
  current lesson's objective and weak spots), the emphasis, and the welcome message.
- **When the send arrives, decide using the evidence, not the draft.** If the lesson went
  `learned` or `partial`, `lesson add` the pre-draft, write its warm-up from the send's misses
  and misconceptions, adjust the emphasis, check it and mark it ready. If it went `not-yet`,
  or the learner's signal or text points elsewhere (Too hard, Too easy, a different
  request), set the draft aside (keep its reusable components, delete the lesson file)
  and plan from the evidence as usual. A pre-draft is never a reason to move past a gap.
- A pre-draft counts as the one lesson drafting. Note in `NOTES.md` what it assumes, so a
  resumed session can judge whether it still fits.

### Validation policy

Use the cheapest check that verifies the changed behavior:

- Every lesson: review its facts and teaching objective; run `lesson ready ID`, which
  performs the static markup check. For diagnostics before readiness, run `check-lesson FILE`.
- Once per session for an unchanged shared quiz kit: run its interaction self-test on a
  representative lesson. All items must render, respond, and report once, with no script errors.
  Later lessons using only those validated components need static checks; rerun interactions
  after a kit change, unusual markup, a reporting failure, or custom JavaScript.
- Prefer an already working browser. Open a separate test tab at
  `<classroom-url>w/lessons/<file>.html#teach-selftest`; read the DOM element
  `#tq-selftest-result` and require `ok: true` and `errors: []`. Close the test tab afterward.
  Keep tests separate from the learner's classroom and assessment state.
- Without browser control, use `check-lesson FILE --render`. After one browser launch failure,
  switch to the working classroom browser if available. Repeated headless launches are useful
  only when something has changed that could fix startup. A passing in-browser self-test is
  equivalent evidence. If neither route works, report the verification limitation; show a
  standard kit-only lesson after its static check, but hold unverified custom interactions.

One lesson drafts at a time; a `next` that arrives meanwhile goes to `queue add`, unless the
lesson drafting is a pre-draft, in which case handle the `next` as Pre-drafting describes. Subagents follow the same brief and validation policy when delegated a lesson.

Reference documents: the lesson subagent writes the ones its own lesson links to; you write
the ones a send shows the learner needs (a cheat sheet for a recurring mistake). Either way
they live in `reference/` and the page lists them by themselves.

## Ending a session

On `pause`, or when they say stop in the terminal: bring the workspace files up to date as
part 1 says, `finish "<one line: what they learned today and what is next>"`, `ack` the seq,
stop the Monitor (TaskStop), run `stop`, and tell them how to pick up again. A pre-draft in
progress may finish; record its file and assumptions in `NOTES.md`.

## Wait mode (no Monitor tool)

Tell the learner where the classroom is (Start step 5) **before** entering the loop below;
what you write in this turn reaches them even while the turn keeps waiting.

Start `node $SKILL/teach.mjs serve` as a background process: the harness's own background
shell if it has one, otherwise `nohup node $SKILL/teach.mjs serve > .teach/serve.log 2>&1 &`
on macOS/Linux or `Start-Process node -ArgumentList "$SKILL/teach.mjs","serve" -WindowStyle Hidden`
in PowerShell. Check it with `url`. A running server does not wake a finished turn, so keep
this turn alive:

1. `wait --after <last acked seq>` prints the next send and exits 0, or exits 3 after
   `--timeout` seconds idle (default 480). If the shell returns a process ID instead of
   blocking, poll that one process in steps of a minute or less; never start a second waiter.
2. Exit 0: handle the send, `ack`, loop. Exit 3: wait again. A finished lesson subagent is
   handled when it is reported, then back to waiting.

Stop only after `pause` is handled, when the learner says to stop, or if a tool failure makes
going on impossible. If you must stop, say the classroom is not being listened to and that
sends will be picked up on resume; never claim you are still listening.
