// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
// The download page's guided choice (/download): "I run… Windows | Mac | Linux", Linux's
// distribution next, then that system's guide. The page picks the visitor's system first.
import { useRef, useState } from 'react';
import CopyCommand from './copy-command.jsx';

/**
 * A row of tabs, one chosen; the arrow keys, Home and End move between them (the WAI-ARIA
 * tabs pattern, with manual activation left out: moving chooses, as in a segmented control).
 */
function Tabs({ label, prefix, options, value, onChange, id }) {
  const refs = useRef([]);
  const keyDown = (event, index) => {
    const last = options.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : event.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    onChange(options[next].key);
    refs.current[next]?.focus();
  };
  return (
    <div className="download-tabs">
      {prefix ? <span className="download-tabs-prefix">{prefix}</span> : null}
      <div role="tablist" aria-label={label}>
        {options.map((option, index) => {
          const selected = option.key === value;
          return (
            <button
              key={option.key}
              ref={(el) => (refs.current[index] = el)}
              type="button"
              role="tab"
              id={`${id}-${option.key}`}
              aria-selected={selected}
              aria-controls={`${id}-panel`}
              tabIndex={selected || (value == null && index === 0) ? 0 : -1}
              data-choice={option.key}
              onClick={() => onChange(option.key)}
              onKeyDown={(event) => keyDown(event, index)}
            >
              {option.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** One file of a guide: the large button that names the system, or a row. */
function GuideFile({ file }) {
  return (
    <a
      className={file.primary ? 'button primary download-primary' : 'download-file'}
      href={file.href}
      data-asset={file.asset}
    >
      <span>
        {file.primary ? `Download for ${file.name}` : file.label}
        {file.primary ? <small>{file.label}</small> : null}
      </span>
      {file.size ? <span className="download-size">{file.size}</span> : null}
    </a>
  );
}

/**
 * The tabs and the chosen guide.
 * @param {object} props
 * @param {string} props.id a prefix for the tabs' and panel's IDs, unique on the page
 * @param {string} props.label what the tabs choose, for screen readers
 * @param {{key: string, name: string, variants?: {key: string, name: string}[]}[]} props.systems
 * @param {Record<string, object>} props.guides each guide (lib/releases.js) by "system" or
 *   "system/variant"
 * @param {{system: string|null, variant: string|null, detected: boolean}} props.initial the
 *   visitor's system as the page guessed it
 * @param {string} props.all where every download is listed
 */
export default function DownloadChooser({ id, label, systems, guides, initial, all }) {
  const [system, setSystem] = useState(initial.system);
  const chosen = systems.find((s) => s.key === system);
  const [variants, setVariants] = useState(() =>
    Object.fromEntries(
      systems
        .filter((s) => s.variants)
        .map((s) => [
          s.key,
          s.key === initial.system && initial.variant ? initial.variant : s.variants[0].key,
        ]),
    ),
  );
  const variant = chosen?.variants ? variants[chosen.key] : null;
  const guide = chosen ? guides[variant ? `${chosen.key}/${variant}` : chosen.key] : null;
  const tab = variant
    ? `${id}-${chosen.key}-${variant}`
    : chosen
      ? `${id}-${chosen.key}`
      : undefined;
  return (
    <div className="download-chooser" data-system={system ?? ''} data-variant={variant ?? ''}>
      <Tabs
        id={id}
        label={label}
        prefix="I run…"
        options={systems}
        value={system}
        onChange={setSystem}
      />
      {chosen?.variants ? (
        <Tabs
          id={`${id}-${chosen.key}`}
          label={`Your ${chosen.name} distribution`}
          options={chosen.variants}
          value={variant}
          onChange={(key) => setVariants((v) => ({ ...v, [chosen.key]: key }))}
        />
      ) : null}
      {initial.detected && system === initial.system ? (
        <p className="muted download-detected">
          {!chosen?.variants || initial.variant
            ? 'Chosen from your browser; pick another if it is wrong.'
            : 'Your browser does not say which distribution you run; pick yours.'}
        </p>
      ) : null}
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={tab} className="download-guide">
        {guide ? (
          <>
            <h3>{guide.heading}</h3>
            {guide.intro ? <p>{guide.intro}</p> : null}
            {guide.files?.some((f) => f.primary) ? (
              <div className="download-actions">
                {guide.files.map((file) => (
                  <GuideFile key={file.asset} file={file} />
                ))}
              </div>
            ) : null}
            {guide.steps?.map((step, i) => (
              <div key={i} className="download-step">
                <p>{step.text}</p>
                {step.command ? <CopyCommand command={step.command} label={step.label} /> : null}
              </div>
            ))}
            {guide.files?.length && !guide.files.some((f) => f.primary) ? (
              <div className="download-files">
                {guide.files.map((file) => (
                  <GuideFile key={file.asset} file={file} />
                ))}
              </div>
            ) : null}
            {guide.note ? <p className="muted">{guide.note}</p> : null}
            {guide.links?.length ? (
              <p className="download-links">
                {guide.links.map((link) => (
                  <a key={link.href} className="download-file" href={link.href}>
                    {link.label}
                  </a>
                ))}
              </p>
            ) : null}
          </>
        ) : (
          <p>Choose your system for its download and how to install it.</p>
        )}
        <p className="download-all">
          <a href={all}>All downloads</a>
        </p>
      </div>
    </div>
  );
}
