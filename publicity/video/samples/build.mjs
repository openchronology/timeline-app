// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
// Builds the tours' sample timelines (usa.ochx, saga.ochx, deep-time.ochx, incident.ochx, middle-earth.ochx, investigation.ochx, investigation-procedure.ochx, great-depression.ochx and egypt.ochx) from the data in this folder, with the editor's own plugin definitions, and
// checks each one with the editor's validator. Run `npm run build:editor` first.
// Usage: node publicity/video/samples/build.mjs
import { writeFileSync } from 'node:fs';
import * as core from '../../../dist/core.mjs';
import { usa } from './usa.mjs';
import { saga } from './saga.mjs';
import { deepTime } from './deep-time.mjs';
import { incident } from './incident.mjs';
import { middleEarth } from './middle-earth.mjs';
import { investigation } from './investigation.mjs';
import { investigationProcedure } from './investigation-procedure.mjs';
import { greatDepression } from './great-depression.mjs';
import { egypt } from './egypt.mjs';

const here = new URL('.', import.meta.url).pathname;
for (const [name, make] of [
  ['usa', usa],
  ['saga', saga],
  ['deep-time', deepTime],
  ['incident', incident],
  ['middle-earth', middleEarth],
  ['investigation', investigation],
  ['investigation-procedure', investigationProcedure],
  ['great-depression', greatDepression],
  ['egypt', egypt],
]) {
  const document = make(core);
  core.validateDocument(document);
  writeFileSync(`${here}${name}.ochx`, JSON.stringify(document, null, 1) + '\n');
  console.log(
    `${name}.ochx: ${document.events.length} moments, ${document.durations?.length ?? 0} durations, ${document.relationships?.length ?? 0} relationships`,
  );
}
