# samples

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

The sample timelines the tours open in the real editor. Each `.ochx` is built by [`build.mjs`](build.mjs) from its data file, with the editor's own plugin definitions, and checked with its validator; import any of them into OpenChronology to explore it. History and science use well-established dates, each with its source; the story, the incident and the investigation are made up; the Middle-earth chronology is an unofficial summary of the published one. `star-wars.ochx` isn't built here: it's the live timeline at timescale.info/athan/star-wars, downloaded through the API, an unofficial fan chronology not affiliated with Lucasfilm.

## Contents

| File                                                           | What it is for                                                                                                              |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| [`build.mjs`](build.mjs)                                       | Builds the `.ochx` files from the data files below (`npm run build:editor` first).                                          |
| [`lib.mjs`](lib.mjs)                                           | Helpers the samples share: exact times from dates and years, entities, plugins and the theme.                               |
| [`usa.mjs`](usa.mjs)                                           | The United States, 1775–2008: moments, durations, relationships and sources (Video 5).                                      |
| [`saga.mjs`](saga.mjs)                                         | "The Ember Crown", an original fantasy world in years After the Reckoning (Video 6).                                        |
| [`deep-time.mjs`](deep-time.mjs)                               | Earth's 4.5 billion years down to Apollo 11, in the ICS chart's eons and colours (Video 8).                                 |
| [`middle-earth.mjs`](middle-earth.mjs)                         | An unofficial chronology of Tolkien's legendarium, Years of the Trees to the Fourth Age, in each Age's reckoning (Video 7). |
| [`incident.mjs`](incident.mjs)                                 | A made-up outage: three hours of syslog from four hosts and the investigation on top (Video 10).                            |
| [`investigation.mjs`](investigation.mjs)                       | A made-up forklift collision on a warehouse night shift, as an events and causal factors chart (Video 13, Short 10).        |
| [`investigation-procedure.mjs`](investigation-procedure.mjs)   | The made-up written night-shift procedure for the same night, to compare with the investigation (Video 13).                 |
| [`covid-19.mjs`](covid-19.mjs)                                 | The COVID-19 pandemic worldwide, Wuhan 2019 to May 2023, from WHO and other sources (Video 22, Short 19).                   |
| [`usa.ochx`](usa.ochx)                                         | Built from `usa.mjs`.                                                                                                       |
| [`saga.ochx`](saga.ochx)                                       | Built from `saga.mjs`.                                                                                                      |
| [`deep-time.ochx`](deep-time.ochx)                             | Built from `deep-time.mjs`.                                                                                                 |
| [`middle-earth.ochx`](middle-earth.ochx)                       | Built from `middle-earth.mjs`.                                                                                              |
| [`incident.ochx`](incident.ochx)                               | Built from `incident.mjs`.                                                                                                  |
| [`investigation.ochx`](investigation.ochx)                     | Built from `investigation.mjs`.                                                                                             |
| [`investigation-procedure.ochx`](investigation-procedure.ochx) | Built from `investigation-procedure.mjs`.                                                                                   |
| [`covid-19.ochx`](covid-19.ochx)                               | Built from `covid-19.mjs`.                                                                                                  |
| [`star-wars.ochx`](star-wars.ochx)                             | The live Star Wars timeline, downloaded through the API (Video 12, Short 9).                                                |
