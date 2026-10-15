// Copyright (c) 2026 Athan Clark. SPDX-License-Identifier: GPL-3.0-only
'use client';
import { useState } from 'react';
import ReportDialog from './report-dialog.jsx';
/** A Report button opening the report dialog for `target` (as report-dialog.jsx takes it). */
export default function ReportLink({ target, title }) {
  const [report, setReport] = useState(null);
  return (
    <>
      <button type="button" className="link-button" onClick={() => setReport({ target, title })}>
        Report
      </button>
      <ReportDialog report={report} onClose={() => setReport(null)} />
    </>
  );
}
