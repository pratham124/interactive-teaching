# interactive-teaching

A [Claude Code](https://claude.com/claude-code) skill that teaches you a topic over many sessions in a
browser classroom. It uses the pedagogy of Matt Pocock's [`teach`](https://github.com/mattpocock/skills)
skill: a mission, short lessons in your zone of proximal development, and retrieval practice. Instead of the
terminal, it runs in a local page that looks like a chalkboard.

![The classroom: a walnut-framed chalkboard with the lesson list on the left, a lesson pinned up on paper in the middle, and the teacher's notes on the right](docs/classroom.png)

## How it works

- **Lessons** open in the middle of the page. Each one has a single goal, cites its sources, and ends with you
  producing the skill unaided.
- **Quizzes are graded instantly in the page.** Wrong answers explain the specific mistake. Only your first
  attempt counts.
- **Your answers, quiz results and questions queue up** until you press **Send to teacher**. Claude then reads
  them as evidence, replies in the side panel, keeps learning records, and writes the next lesson from what you
  actually got right and wrong.
- **Everything lives in a folder you own:** `MISSION.md`, lessons, printable reference sheets, learning
  records, and a ledger of verified facts.

## Install

Clone into your Claude Code skills folder:

```sh
git clone https://github.com/<your-username>/interactive-teaching ~/.claude/skills/interactive-teaching
```

On Windows, the folder is `%USERPROFILE%\.claude\skills\interactive-teaching`. You also need
[Node.js](https://nodejs.org) 18 or newer.

## Use

Make an empty folder for the topic, open Claude Code in it, and run:

```
/interactive-teaching I'd like to learn Redis
```

Claude asks a few questions about why you're learning, starts the classroom, and opens it in your browser.
Press **Next lesson** to continue and **End session** to stop. To pick up later, open Claude Code in the same
folder and run:

```
/interactive-teaching resume
```

## What's inside

| Path | What it is |
|---|---|
| `SKILL.md` | The skill: Part 1 is the teaching method, Part 2 is the classroom mechanics |
| `lesson-brief.md` | The brief given to whoever writes a lesson |
| `*-FORMAT.md` | Formats for the mission, resources, learning records and glossary |
| `teach.mjs` | The classroom server and CLI (`init`, `serve`, `say`, `lesson`, `check-lesson`, …) |
| `page.html` | The classroom page |
| `kit/` | Starter components copied into each workspace: stylesheet, quiz kit, font |
| `test/` | Tests: `node --test test/teach.test.mjs` |
| `evals/` | Evaluation prompts for the skill |

## Credits

Built on the [`teach`](https://github.com/mattpocock/skills) skill by Matt Pocock (MIT), with the
classroom idea inspired by [grill-with-ui](https://github.com/jasonku09/grill-with-ui). Third-party notices
are in [NOTICE.md](NOTICE.md).

## Licence

[MIT](LICENSE).
