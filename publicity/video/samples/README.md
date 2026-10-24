# samples

Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only

The sample timelines the tours open in the real editor. Each `.ochx` is built by [`build.mjs`](build.mjs) from its data file, with the editor's own plugin definitions, and checked with its validator; import any of them into OpenChronology to explore it. History and science use well-established dates, each with its source; the story and the incident are made up.

## Contents

| File                               | What it is for                                                                                  |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| [`build.mjs`](build.mjs)           | Builds the `.ochx` files from the data files below (`npm run build:editor` first).              |
| [`lib.mjs`](lib.mjs)               | Helpers the samples share: exact times from dates and years, entities, plugins and the theme.   |
| [`usa.mjs`](usa.mjs)               | The United States, 1775–2008: moments, durations, relationships and sources (Video 5).          |
| [`saga.mjs`](saga.mjs)             | "The Ember Crown", an original fantasy world in years After the Reckoning (Video 6).            |
| [`deep-time.mjs`](deep-time.mjs)   | Earth's 4.5 billion years down to Apollo 11, in the ICS chart's eons and colours (Video 7).     |
| [`incident.mjs`](incident.mjs)     | A made-up outage: three hours of syslog from four hosts and the investigation on top (Video 9). |
| [`usa.ochx`](usa.ochx)             | Built from `usa.mjs`.                                                                           |
| [`saga.ochx`](saga.ochx)           | Built from `saga.mjs`.                                                                          |
| [`deep-time.ochx`](deep-time.ochx) | Built from `deep-time.mjs`.                                                                     |
| [`incident.ochx`](incident.ochx)   | Built from `incident.mjs`.                                                                      |
