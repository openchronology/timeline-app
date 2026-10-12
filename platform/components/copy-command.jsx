// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
import { useState } from 'react';
/** A shell command to copy and paste, with a button that copies it. */
export default function CopyCommand({ command, label }) {
  const [copied, setCopied] = useState('');
  const copy = () =>
    navigator.clipboard
      .writeText(command)
      .then(() => setCopied('Copied'))
      .catch(() => setCopied('Select the command and copy it'));
  return (
    <div className="copy-command">
      <pre aria-label={label}>
        <code>{command}</code>
      </pre>
      <button type="button" onClick={copy}>
        {copied || 'Copy'}
      </button>
    </div>
  );
}
