# OpenChronology — Tour: Artificial Intelligence, from Llull to Language Models. Script and Storyboard

**Runtime:** ~3:35 (at 140 wpm, with pauses) · **Format:** the real app, captured, in a browser frame, with infographic callouts; **Neural** look · **Aspect:** 16:9
**Audience:** curious newcomers, students and teachers who hear about AI every day and have never seen its history laid out: where the ideas came from, how often the field has been wrong about itself, and what is actually new. Many of them are wary of hype, so the tour must be calm, sourced and even-handed.
**Purpose:** show a history-of-science timeline the way a reader would use it: seven centuries at a glance, the field's eras as bands (both AI winters among them), the founding years up close, a moment read with its sources, one thread (neural networks) pulled out of the rest to show one idea's long wait, the zoom from centuries to the days of 2023, and the one fact the line makes visible: the artificial neuron is older than the transistor, and it took sixty-nine years to win.

**How it differs:** Videos 5, 14 and 15 tour political history. This one tours the history of an idea, where the eras are moods of a field (booms and winters) rather than reigns, and where the most recent years are crowded, disputed and still moving. It shows how a timeline handles that: eras as bands with their own pictures, **Separate by tags** to follow one line of research through decades of neglect, and a zoom that keeps working from 1300 down to single days in 2023.

**Production notes:**

- Narration is 455 words, about 140 wpm when read, in the default scratch voice (Kokoro `af_heart`, as in the other videos): curious, unhurried, never breathless, never selling. Scenes 2 and 10 are the ones to trim if it must be shorter.
- **The timeline is the sample `publicity/video/samples/ai.ochx`**: an export of the live timeline at timescale.info/athan/artificial-intelligence, improved for this tour (see the samples README): 82 moments, 9 eras, 29 relationships; Wikipedia sources on every moment; pictures from Wikimedia Commons on 31 moments and a different picture behind each era (**Moment icons**, **Duration backgrounds**); **Dating context**, so each moment's **Date precision** shows in the reader; and the **Timeline theme** in the Neural look's colours. Moments are coloured by their first tag. Tags: `symbolic ai`, `machine learning`, `neural networks`, `robotics`, `games`, `language`, `vision`, `policy & safety`, `people`, `industry`; the eras are tagged `era`.
- **Shots** are captured from the real editor in full screen with `common/capture.mjs` (`shots.json` in `publicity/video/25-tour-artificial-intelligence/`, when it is made) and shown in a browser frame; the infographic layer adds titles, chips, brackets and pins around the frame, never over the app's own text. Views below are given as dates; in `shots.json` they are stored seconds (Gregorian display, seconds from 1970-01-01 UTC). The sample's background pictures are links, so capture needs the network (capture waits for them before each frame).
- **The Neural look** (`neural` in `common/core.js`): a near-black blue-violet ground, cyan and magenta accents, and a faint field of drifting nodes and edges with signals pulsing along a few of them. It is drawn only on the ground, behind the browser frame and the callouts, never over the capture.
- **Moments at exactly the same time stay together** however far one zooms: GPT-4 and Claude (both 14 March 2023), the perceptron and LISP (1958), ELIZA and Shakey (1966) are summaries of two. Expand on hover fans them out; the frames below say where a summary shows.
- **Accuracy guardrails:**
  - Year-only moments are placed on 1 January and their **Date precision** says so where it matters; narration gives years, not days, for them.
  - Say "a timeline we built". It isn't a definitive history; notes are our own summaries, and the account owner's timeline was first compiled by an AI assistant and reviewed by the owner (its description says so).
  - **Even-handed about today:** name companies plainly and in date order; give none more airtime than its peers (Anthropic and Claude appear once, in a list, as OpenAI, Meta and Google do). No claims about what AI will do next. Safety and policy are described as events (a letter, a statement, an order, a summit, a law), not argued for or against; the narration says researchers disagree.
  - "Gave the field its name": the term "artificial intelligence" was coined in the 1955 proposal for the 1956 workshop; Appendix B says so.
  - "Older than the transistor": the McCulloch–Pitts paper is from 1943; the first working transistor, at Bell Labs, from December 1947. The transistor isn't on this timeline; its pin is drawn by the infographic layer, labelled as ours.
  - "Won" in 2012 means AlexNet's decisive ImageNet result, the point most histories date the deep-learning era from; neural networks had real successes before it (LeCun's digit readers, for one), and the narration doesn't say otherwise.
  - Account and classroom claims as in Video 5: free; no account to read a public timeline; accounts are for people 13 and older.

---

## ACT 1 · SEVEN CENTURIES OF THINKING MACHINES (0:00 – 0:40)

### Scene 1 · 0:00 – 0:20 · The whole line

**FRAME:** The browser frame fills most of the screen, showing the sample after **Fit all**: from about 1290 to 2030. The era bands run along the axis, each with its own picture behind it: the Precursors band long and quiet at the left (Babbage's Analytical Engine behind it), then, crowded into the last eighty years, Founding ideas, The golden years, The first AI winter, The expert systems boom, The second AI winter, Statistical machine learning, Deep learning and Large language models. Above them, the round pictures of the moments (Llull, Leibniz, the Mechanical Turk, Lovelace, Boole) at the left and summaries packed at the right. To the frame's left, a vertical strip of four figures: "82 moments", "9 eras, as bands", "2 winters", "29 links".

**MOTION:** The frame rises into place; the chips tick in on "moments", "bands" and "winters".

**OST:** "Seven centuries of thinking machines."

**VO:**
"Here's a timeline we built of artificial intelligence, from a philosopher's paper wheels around 1300 to the language models of today. Programs, machines, papers and policy are moments, each linked to its sources, and the field's eras are bands behind them, two of them winters."

### Scene 2 · 0:20 – 0:40 · Reasoning as calculation

**FRAME:** The capture zooms to 1640-01-01 → 1960-01-01: the Precursors band and the start of Founding ideas; the moments "Leibniz imagines a calculus of reasoning" (1666), "The Mechanical Turk" (1770), "Ada Lovelace's notes on the Analytical Engine" (1843), "Boole's Laws of Thought" (1854), "R.U.R. gives us the word "robot"" (1921), "Turing's universal machine" (1936), each with its portrait or picture as its marker; arcs from Turing's machine onward.

**MOTION:** A continuous zoom; each marker brightens as it is named.

**OST:** "Reasoning as calculation."

**VO:**
"Long before computers, people imagined reasoning as calculation. Leibniz hoped arguments could be settled by computing. Ada Lovelace saw that Babbage's engine could work with symbols, not just numbers. Boole turned logic into algebra, and in 1936 Alan Turing described a machine that could carry out any computation."

---

## ACT 2 · BOOMS AND WINTERS (0:40 – 1:45)

### Scene 3 · 0:40 – 1:00 · A field gets its name

**FRAME:** The capture zooms to 1945-01-01 → 1975-01-01: the Founding ideas band, then The golden years (ENIAC's and the IBM 704's pictures behind them); the moments "Computing Machinery and Intelligence" (1950), "Shannon on programming a computer for chess", "The Logic Theorist" (1956), "The Dartmouth workshop" (1956-06-18), a summary of two at 1958 (the perceptron and LISP), "The General Problem Solver" (1959), "Unimate", a summary of two at 1966 (ELIZA and Shakey), "Minsky and Papert's Perceptrons" (1969), "SHRDLU" (1970).

**MOTION:** A continuous zoom from Scene 2's view; beside the frame, a strip of dates and names (1950, 1956, 1956–1974, 1958, 1966) ticks in as each is named.

**OST:** "1956: a field gets its name."

**VO:**
"In 1950, Turing asked whether machines can think. Six years later, a summer workshop at Dartmouth gave the field its name, and the golden years began: programs that proved theorems, the language LISP, ELIZA's conversations, and Shakey, a robot that planned its own moves."

### Scene 4 · 1:00 – 1:12 · A moment, and where it comes from

**FRAME:** The capture zooms to 1955-06-01 → 1957-06-01. With **View mode** on, "The Dartmouth workshop" opens in the reader: its picture (Dartmouth Hall), "1956-06-18 CE", the tags `symbolic ai` and `people`, the note ("McCarthy, Minsky, Rochester and Shannon's summer project names the field "artificial intelligence"." and the picture's credit), **Date precision** ("Approximate day: the workshop ran through the summer of 1956."), **Sources** (Dartmouth workshop, Wikipedia) and **Related to: The Logic Theorist**.

**MOTION:** The zoom settles; the reader opens over the app; the Date precision line, then the Sources line, highlight.

**OST:** "Every moment has its sources."

**VO:**
"Open a moment to read it: what happened, how sure its date is, its picture's credit, and the article it comes from. Every moment here has its sources."

### Scene 5 · 1:12 – 1:45 · Two winters

**FRAME:** The reader closes; the capture zooms to 1966-01-01 → 1996-01-01: the end of The golden years, then The first AI winter (1974–1980), The expert systems boom (1980–1987), The second AI winter (1987–1993) and the start of Statistical machine learning, each band with its own picture (the Edinburgh robot Freddy II, a VAX-11/780, a Sun-3 workstation). The moments "Prolog", "The Lighthill report" (1973), "MYCIN", "XCON earns its keep" with "The neocognitron" (a summary at 1980), "Japan's Fifth Generation project" with "Hopfield networks" (a summary at 1982), "Backpropagation popularized" (1986), "The Lisp machine market collapses" (1987), "Probabilistic reasoning", "Convolutional networks read zip codes", "TD-Gammon". Beside the frame, two small snowflake chips mark the winters.

**MOTION:** A continuous zoom; the first-winter band highlights on "first AI winter", the boom on "boom", the second winter on "second winter"; the chips tick in with them.

**OST:** "Booms and winters."

**VO:**
"Then the bands turn cold. Promises outran results; after Britain's Lighthill report in 1973, funding was cut, and the first AI winter set in. Expert systems brought a boom in the 1980s, with rules written by hand, until cheaper workstations undercut AI's special machines and a second winter followed."

---

## ACT 3 · ONE IDEA'S LONG WAIT (1:45 – 2:40)

### Scene 6 · 1:45 – 2:12 · One thread: neural networks

**FRAME:** The capture zooms out to 1935-01-01 → 2030-01-01, then **Separate by tags** with "neural networks" chosen: a track labelled "Tagged neural networks" rises above "Everything else", holding McCulloch and Pitts' artificial neuron (1943), Hebbian learning (1949), Rosenblatt's perceptron (1958), Minsky and Papert's Perceptrons (1969), then nothing until the neocognitron (1980), Hopfield networks (1982), backpropagation (1986), convolutional networks (1989), long short-term memory (1997), deep belief networks (2006), and a dense run from AlexNet (2012) to the Nobel prizes (2024), mostly as summaries at this zoom. Beside the frame, four year chips tick in as the narration names them: "1943", "1958", "1969", "1986".

**MOTION:** The tagged moments lift into their own track; a faint bracket draws over the empty stretch from 1969 to 1980 on "goes quiet".

**OST:** "One idea, on its own track."

**VO:**
"Now pull one thread. Separate by tags, choose neural networks, and one idea rises into its own track. 1943: a model of the neuron as logic. 1958: Rosenblatt's perceptron learns from examples. 1969: a book proves its limits, and the track goes quiet for over a decade. 1986: backpropagation trains deeper networks. And still they wait."

### Scene 7 · 2:12 – 2:24 · Older than the transistor

**FRAME:** Still separated, the same view. The infographic layer adds, under the frame, a bracket from the 1943 neuron to AlexNet in 2012, "69 years", and a small pin on the ruler at December 1947, labelled "First transistor, 1947 (not on this timeline)", just right of the neuron.

**MOTION:** The pin drops first; then the bracket draws left to right.

**OST:** "The artificial neuron is older than the transistor."

**VO:**
"Here's what the line makes visible. The artificial neuron is older than the transistor, and it took sixty-nine years to win."

### Scene 8 · 2:24 – 2:40 · 2012

**FRAME:** **Rejoin**; the capture zooms to 2004-01-01 → 2018-01-01: Statistical machine learning ends and Deep learning begins in September 2012 (a GTX graphics card behind it), Large language models from June 2017; the moments "Stanley wins the DARPA Grand Challenge", "Deep belief networks", "ImageNet", "Watson wins Jeopardy!", "Siri", "AlexNet wins ImageNet", "Deep Q-networks play Atari" with "word2vec", "Residual networks", "OpenAI is founded", "AlphaGo beats Lee Sedol", "Attention Is All You Need". Beside the frame, a strip ticks in: "2012 · AlexNet wins ImageNet", "top-5 error · 15.3% vs 26.2%", "2012 → · the Deep learning era", "2016 · AlphaGo beats Lee Sedol".

**MOTION:** A continuous zoom, settling as ImageNet is named; the strip ticks in on the narration.

**OST:** "2012: the bands change."

**VO:**
"In 2012, a network trained on graphics cards won the ImageNet challenge by a wide margin, and the bands change: deep learning. Four years later, AlphaGo beat Lee Sedol at Go."

---

## ACT 4 · LANGUAGE AT SCALE (2:40 – 3:35)

### Scene 9 · 2:40 – 2:55 · The Transformer

**FRAME:** The capture pans and zooms to 2016-06-01 → 2023-01-01: the Large language models band under Deep learning (a Tensor Processing Unit behind it); the moments "Attention Is All You Need" (2017-06-12), "AlphaZero", "GPT", "BERT", "GPT-2", "Turing Award for deep learning", "GPT-3", "AlphaFold 2 …", "Anthropic is founded", "DALL·E", "GitHub Copilot", "Stable Diffusion", "ChatGPT" (2022-11-30); arcs from the Transformer to GPT and BERT, and from GPT to GPT-2 to GPT-3 to ChatGPT.

**MOTION:** A pan and zoom (about 4 s); the arcs from the Transformer highlight in turn.

**OST:** "2017: attention."

**VO:**
"In 2017, researchers at Google published the Transformer, built on attention. Language models grew from it, larger each year, and in November 2022, ChatGPT put one in front of the public."

### Scene 10 · 2:55 – 3:20 · Down to the days

**FRAME:** The capture zooms to 2022-11-15 → 2024-01-01: "ChatGPT", "LLaMA" (02-24), a summary of two at 03-14 (GPT-4 and Claude), "The pause letter" (03-22), "The statement on AI risk" (05-30), "US executive order on AI" (10-30), "The AI Safety Summit at Bletchley Park" (11-01), "Gemini" (12-06); then on into 2023-03-08 → 2023-03-26, where the ruler reads single days and the summary of two sits on 14 March beside the pause letter. Beside the frame, a scale figure ("the window shows") counts down as the zoom runs: "7 years" → "13 months" → "18 days".

**MOTION:** One zoom in two stages, easing to a stop on the days of March 2023.

**OST:** "From centuries to days."

**VO:**
"Zoom in to the days. By the end of 2023 there were models from Meta, OpenAI, Anthropic and Google; an open letter asking for a pause; a statement on extinction risk; an American executive order; and a summit at Bletchley Park. Researchers disagree about how fast this is moving and what it means; the timeline keeps each step with its source."

### Scene 11 · 3:20 – 3:35 · Still being written

**FRAME:** The capture zooms out to 2023-06-01 → 2026-01-01: "The EU AI Act enters into force" (2024-08-01), "Reasoning models", "Nobel prizes for neural networks and protein structure" (2024-10-08), "US executive order on AI revoked" with "DeepSeek-R1" (both 20 January 2025), "The Stargate project is announced", "The International AI Safety Report", "The AI Action Summit in Paris" (2025-02-10); the line runs on, empty, to the right edge. Then the capture shrinks to the left half; on the right, three short lines with icons: "Read it: no account needed", "Follow one thread: Separate by tags", "Build your own, and share a link". End card: "timescale.info/athan/artificial-intelligence", and the source: "github.com/openchronology/timeline-app".

**MOTION:** A zoom out (about 3 s); the lines tick in; the end card rises and holds.

**OST:** "Still being written."

**VO:**
"In 2024, Nobel prizes went to work on neural networks and to the makers of AlphaFold, and Europe's AI Act came into force. The line is still being written. Anyone can read it, no account needed, and anyone can build one."

**[END · ~3:35]**

---

## Appendix A · Narration only (for the voice session)

> Here's a timeline we built of artificial intelligence, from a philosopher's paper wheels around 1300 to the language models of today. Programs, machines, papers and policy are moments, each linked to its sources, and the field's eras are bands behind them, two of them winters.
>
> Long before computers, people imagined reasoning as calculation. Leibniz hoped arguments could be settled by computing. Ada Lovelace saw that Babbage's engine could work with symbols, not just numbers. Boole turned logic into algebra, and in 1936 Alan Turing described a machine that could carry out any computation.
>
> In 1950, Turing asked whether machines can think. Six years later, a summer workshop at Dartmouth gave the field its name, and the golden years began: programs that proved theorems, the language LISP, ELIZA's conversations, and Shakey, a robot that planned its own moves.
>
> Open a moment to read it: what happened, how sure its date is, its picture's credit, and the article it comes from. Every moment here has its sources.
>
> Then the bands turn cold. Promises outran results; after Britain's Lighthill report in 1973, funding was cut, and the first AI winter set in. Expert systems brought a boom in the 1980s, with rules written by hand, until cheaper workstations undercut AI's special machines and a second winter followed.
>
> Now pull one thread. Separate by tags, choose neural networks, and one idea rises into its own track. 1943: a model of the neuron as logic. 1958: Rosenblatt's perceptron learns from examples. 1969: a book proves its limits, and the track goes quiet for over a decade. 1986: backpropagation trains deeper networks. And still they wait.
>
> Here's what the line makes visible. The artificial neuron is older than the transistor, and it took sixty-nine years to win.
>
> In 2012, a network trained on graphics cards won the ImageNet challenge by a wide margin, and the bands change: deep learning. Four years later, AlphaGo beat Lee Sedol at Go.
>
> In 2017, researchers at Google published the Transformer, built on attention. Language models grew from it, larger each year, and in November 2022, ChatGPT put one in front of the public.
>
> Zoom in to the days. By the end of 2023 there were models from Meta, OpenAI, Anthropic and Google; an open letter asking for a pause; a statement on extinction risk; an American executive order; and a summit at Bletchley Park. Researchers disagree about how fast this is moving and what it means; the timeline keeps each step with its source.
>
> In 2024, Nobel prizes went to work on neural networks and to the makers of AlphaFold, and Europe's AI Act came into force. The line is still being written. Anyone can read it, no account needed, and anyone can build one.

## Appendix B · Claims and where they come from

| Scene | Claim                                                                                                                                                                                                                                       | Source                                                                                                                                                                                                                                                                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | The sample: 82 moments, 9 eras, 29 relationships                                                                                                                                                                                            | `python3 -c` count of `publicity/video/samples/ai.ochx`                                                                                                                                                                                                                                                                              |
| 1     | Llull's Ars Magna, combinatorial paper wheels, about 1305 ("around 1300")                                                                                                                                                                   | [Ramon Llull](https://en.wikipedia.org/wiki/Ramon_Llull)                                                                                                                                                                                                                                                                             |
| 2     | Leibniz's calculus of reasoning (from 1666): disputes settled by calculation                                                                                                                                                                | [Characteristica universalis](https://en.wikipedia.org/wiki/Characteristica_universalis)                                                                                                                                                                                                                                             |
| 2     | Lovelace's notes (1843): the engine could act on symbols other than numbers                                                                                                                                                                 | [Ada Lovelace](https://en.wikipedia.org/wiki/Ada_Lovelace)                                                                                                                                                                                                                                                                           |
| 2     | Boole's _Laws of Thought_ (1854): logic as algebra                                                                                                                                                                                          | [The Laws of Thought](https://en.wikipedia.org/wiki/The_Laws_of_Thought)                                                                                                                                                                                                                                                             |
| 2     | Turing (1936): a universal machine can carry out any computation another such machine can                                                                                                                                                   | [Turing machine](https://en.wikipedia.org/wiki/Turing_machine)                                                                                                                                                                                                                                                                       |
| 3     | "Computing Machinery and Intelligence", _Mind_, October 1950: "Can machines think?"                                                                                                                                                         | [Computing Machinery and Intelligence](https://en.wikipedia.org/wiki/Computing_Machinery_and_Intelligence)                                                                                                                                                                                                                           |
| 3     | The Dartmouth workshop, summer 1956; the term "artificial intelligence" from its 1955 proposal; 1950 → 1956 = six years                                                                                                                     | [Dartmouth workshop](https://en.wikipedia.org/wiki/Dartmouth_workshop)                                                                                                                                                                                                                                                               |
| 3     | The Logic Theorist proved theorems (1956); LISP (1958); ELIZA (1966); Shakey (1966–1972) reasoned about its own actions                                                                                                                     | [Logic Theorist](https://en.wikipedia.org/wiki/Logic_Theorist); [Lisp](<https://en.wikipedia.org/wiki/Lisp_(programming_language)>); [ELIZA](https://en.wikipedia.org/wiki/ELIZA); [Shakey](https://en.wikipedia.org/wiki/Shakey_the_robot)                                                                                          |
| 4     | The reader shows pictures and their credits, tags, notes, plugin fields (Sources, Date precision) and Related to                                                                                                                            | [Guide: reading a timeline](../docs/guide.md#reading-a-timeline)                                                                                                                                                                                                                                                                     |
| 5     | The Lighthill report (1973) and the cuts to AI research in Britain; the first AI winter (about 1974–1980)                                                                                                                                   | [Lighthill report](https://en.wikipedia.org/wiki/Lighthill_report); [AI winter](https://en.wikipedia.org/wiki/AI_winter)                                                                                                                                                                                                             |
| 5     | Expert systems in the 1980s (MYCIN, XCON); the Lisp machine market's collapse in 1987, undercut by cheaper workstations; the second winter (about 1987–1993)                                                                                | [Expert system](https://en.wikipedia.org/wiki/Expert_system); [Lisp machine](https://en.wikipedia.org/wiki/Lisp_machine); [AI winter](https://en.wikipedia.org/wiki/AI_winter)                                                                                                                                                       |
| 6     | **Separate by tags** moves tagged events to a track above, on the same axis                                                                                                                                                                 | [Tags: separating](../docs/tags.md#separating-by-tags)                                                                                                                                                                                                                                                                               |
| 6     | McCulloch and Pitts' model of the neuron (1943); Rosenblatt's perceptron (1958); Minsky and Papert's _Perceptrons_ (1969); Rumelhart, Hinton and Williams on backpropagation (1986)                                                         | [Artificial neuron](https://en.wikipedia.org/wiki/Artificial_neuron); [Perceptron](https://en.wikipedia.org/wiki/Perceptron); [Perceptrons (book)](<https://en.wikipedia.org/wiki/Perceptrons_(book)>); [Backpropagation](https://en.wikipedia.org/wiki/Backpropagation)                                                             |
| 6     | "Quiet for over a decade": no moment tagged `neural networks` between 1969 and the neocognitron (1980): 11 years                                                                                                                            | `ai.ochx`; [Neocognitron](https://en.wikipedia.org/wiki/Neocognitron)                                                                                                                                                                                                                                                                |
| 7     | **The big idea.** McCulloch–Pitts, 1943; the first working transistor (point-contact, Bardeen and Brattain, Bell Labs), December 1947: the neuron is about four years older (1947 − 1943 = 4). 1943 → AlexNet, 2012: 2012 − 1943 = 69 years | [Artificial neuron](https://en.wikipedia.org/wiki/Artificial_neuron); [Transistor](https://en.wikipedia.org/wiki/Transistor); [History of the transistor](https://en.wikipedia.org/wiki/History_of_the_transistor); [AlexNet](https://en.wikipedia.org/wiki/AlexNet); the arithmetic is ours                                         |
| 8     | AlexNet, trained on two Nvidia GTX 580 GPUs (graphics cards), was entered in ILSVRC 2012 on 30 September 2012 and won with a top-5 error of 15.3%, more than 10.8 points better than the runner-up (26.2%)                                  | [AlexNet](https://en.wikipedia.org/wiki/AlexNet); [ILSVRC 2012 results](https://image-net.org/challenges/LSVRC/2012/results.html)                                                                                                                                                                                                    |
| 8     | The timeline's Deep learning era begins in September 2012                                                                                                                                                                                   | `ai.ochx`                                                                                                                                                                                                                                                                                                                            |
| 8     | AlphaGo beat Lee Sedol 4–1, March 2016; 2012 → 2016 = four years                                                                                                                                                                            | [AlphaGo versus Lee Sedol](https://en.wikipedia.org/wiki/AlphaGo_versus_Lee_Sedol)                                                                                                                                                                                                                                                   |
| 9     | "Attention Is All You Need" (Google researchers, June 2017); GPT (2018), GPT-2 (2019), GPT-3 (2020); ChatGPT released 30 November 2022                                                                                                      | [Attention Is All You Need](https://en.wikipedia.org/wiki/Attention_Is_All_You_Need); [GPT-3](https://en.wikipedia.org/wiki/GPT-3); [ChatGPT](https://en.wikipedia.org/wiki/ChatGPT)                                                                                                                                                 |
| 10    | LLaMA (Meta, 24 February 2023); GPT-4 (OpenAI) and Claude (Anthropic), 14 March 2023; Gemini (Google DeepMind), 6 December 2023                                                                                                             | [Llama](<https://en.wikipedia.org/wiki/Llama_(language_model)>); [GPT-4](https://en.wikipedia.org/wiki/GPT-4); [Claude](<https://en.wikipedia.org/wiki/Claude_(language_model)>); [Gemini](<https://en.wikipedia.org/wiki/Gemini_(language_model)>)                                                                                  |
| 10    | The pause letter (22 March 2023); the statement on AI risk (30 May 2023); Executive Order 14110 (30 October 2023); the AI Safety Summit at Bletchley Park (1–2 November 2023)                                                               | [Pause letter](https://en.wikipedia.org/wiki/Pause_Giant_AI_Experiments:_An_Open_Letter); [Statement on AI risk](https://en.wikipedia.org/wiki/Statement_on_AI_risk_of_extinction); [Executive Order 14110](https://en.wikipedia.org/wiki/Executive_Order_14110); [AI Safety Summit](https://en.wikipedia.org/wiki/AI_Safety_Summit) |
| 10    | The scale figure: 2016-06-01 → 2023-01-01 is about 7 years (6.6); 2022-11-15 → 2024-01-01 is about 13 months; 2023-03-08 → 2023-03-26 is 18 days                                                                                            | The shots' views; the arithmetic is ours                                                                                                                                                                                                                                                                                             |
| 11    | Nobel Prize in Physics 2024 to Hopfield and Hinton for artificial neural networks; Chemistry 2024 in part to Hassabis and Jumper for protein structure prediction (AlphaFold)                                                               | [Nobel Prize in Physics](https://en.wikipedia.org/wiki/Nobel_Prize_in_Physics); [AlphaFold](https://en.wikipedia.org/wiki/AlphaFold)                                                                                                                                                                                                 |
| 11    | The EU AI Act entered into force on 1 August 2024                                                                                                                                                                                           | [Artificial Intelligence Act](https://en.wikipedia.org/wiki/Artificial_Intelligence_Act)                                                                                                                                                                                                                                             |
| 11    | Public timelines need no account; links and embeds; accounts are for people 13 and older                                                                                                                                                    | [FAQ](../docs/faq.md#do-i-need-an-account), [sharing](../docs/sharing.md#embedding), [moderation: ages](../docs/moderation.md#ages)                                                                                                                                                                                                  |

## Appendix C · Questions this audience is likely to ask

1. **Who decided where the eras start and end?** The timeline's author did, following common periodisations (Wikipedia dates the two winters about 1974–1980 and 1987–2000; this timeline ends the second in 1993, when statistical methods take over). The boundaries are judgement calls, not events; each era's note says what it covers, and anyone can change them.
2. **Why does it stop where it does?** It records events that are well documented, each with a source. The most recent months are left out until they are; the timeline's description says its coverage of recent years is limited.
3. **Was this timeline written by an AI?** Its first draft was compiled by an AI assistant through OpenChronology's API, and reviewed and edited by the account owner; its description says so. Every moment links to its sources, so any of it can be checked.
4. **Why isn't my favourite model or lab on it?** A timeline of seventy years can't list every release. Add it: import `ai.ochx`, edit it, or publish your own version.
5. **Can I follow just safety and policy?** Yes: **Separate by tags** with `policy & safety` lifts the Lighthill report, the Asilomar principles, the pause letter, the executive order, the summits and the EU AI Act into their own track.
6. **Where do the pictures come from?** Wikimedia Commons, each freely licensed and credited in its moment's or era's note. They are links, not copies; link only images you may share ([images and copyright](../docs/images.md)).
