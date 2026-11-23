'use client';
// Resume database: tick candidates, then add them all to a job's pipeline, or delete them (Admin / HR).
import { useEffect, useState } from 'react';
import { addSelectedToJob, deleteSelectedCandidates } from '@/app/_actions/candidates';
import { SubmitButton } from './client';

const FORM = 'bulkjob';
const boxes = () => [...document.querySelectorAll(`input[name="cand"][form="${FORM}"]`)];

export function SelectAll() {
  return <input type="checkbox" aria-label="Select all on this page" className="tick" onChange={(e) => { boxes().forEach((b) => { b.checked = e.target.checked; }); document.dispatchEvent(new Event('bulkjob')); }} />;
}

export function Tick({ id, name }) {
  return <input type="checkbox" name="cand" value={id} form={FORM} className="tick" aria-label={`Select ${name}`} onChange={() => document.dispatchEvent(new Event('bulkjob'))} />;
}

export default function BulkJobBar({ jobs, back, stages, canDelete = false }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const count = () => setN(boxes().filter((b) => b.checked).length);
    document.addEventListener('bulkjob', count);
    return () => document.removeEventListener('bulkjob', count);
  }, []);
  return (
    <form id={FORM} action={addSelectedToJob} className={`bulkbar${n ? ' on' : ''}`}>
      <input type="hidden" name="back" value={back} />
      <span className="small strong">{n ? `${n} selected` : 'Tick candidates to add them to a job'}</span>
      <select name="job_id" required defaultValue="" aria-label="Job" disabled={!n}>
        <option value="" disabled>Choose job · company…</option>
        {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}{j.client ? ` · ${j.client}` : ''}</option>)}
      </select>
      <select name="stage" defaultValue="pending" aria-label="Stage" disabled={!n}>
        {stages.map(([v, l]) => <option key={v} value={v}>as {l}</option>)}
      </select>
      <SubmitButton className="btn primary sm" pendingText="Adding…">Add to job</SubmitButton>
      {canDelete ? (
        <button type="submit" formAction={deleteSelectedCandidates} formNoValidate className="btn danger sm" disabled={!n}
          onClick={(e) => { if (!window.confirm(`Delete ${n} candidate(s)? Their resumes, job applications, interviews and history are removed too. This can't be undone.`)) e.preventDefault(); }}>
          Delete selected
        </button>
      ) : null}
      {n ? <button type="button" className="btn sm" onClick={() => { boxes().forEach((b) => { b.checked = false; }); document.querySelectorAll('input.tick').forEach((b) => { b.checked = false; }); setN(0); }}>Clear</button> : null}
    </form>
  );
}
