import { randomUUID } from 'node:crypto';

type JobResult = Record<string, any>;
type JobState = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
type Job = {
  id: string; channel: string; projectName: string; args: any[]; state: JobState;
  createdAt: string; startedAt?: string; finishedAt?: string; result?: JobResult;
  done: Promise<JobResult>; resolve: (value: JobResult) => void;
};

// One active tool job across API clients: rate limits no longer multiply per button/tab.
export class ScanQueue {
  private jobs = new Map<string, Job>();
  private pending: Job[] = [];
  private active?: Job;
  constructor(private execute: (channel: string, args: any[]) => Promise<JobResult>) {}

  submit(channel: string, args: any[], projectName: string) {
    const existing = [...this.jobs.values()].find(job => job.channel === channel && job.projectName === projectName && ['queued', 'running'].includes(job.state));
    if (existing) return this.view(existing.id)!;
    if (this.pending.length >= 32) throw new Error('The scan queue is full. Wait for current jobs to finish.');
    if (this.jobs.size > 100) {
      for (const [id, job] of this.jobs) if (!['queued', 'running'].includes(job.state)) this.jobs.delete(id);
    }
    let resolve!: (result: JobResult) => void;
    const done = new Promise<JobResult>(finish => { resolve = finish; });
    const job: Job = { id: randomUUID(), channel, projectName, args, state: 'queued', createdAt: new Date().toISOString(), done, resolve };
    this.jobs.set(job.id, job); this.pending.push(job);
    void this.pump();
    return this.view(job.id)!;
  }

  view(id: string) {
    const job = this.jobs.get(id);
    if (!job) return null;
    const { args, done, resolve, ...publicJob } = job;
    const result = job.result ? Object.fromEntries(Object.entries(job.result).filter(([key]) => !['stderr', 'command'].includes(key))) : undefined;
    return { ...publicJob, result, position: job.state === 'queued' ? this.pending.indexOf(job) + 1 : 0 };
  }

  list(projectName: string) { return [...this.jobs.values()].filter(job => job.projectName === projectName).map(job => this.view(job.id)); }
  wait(id: string) { const job = this.jobs.get(id); if (!job) throw new Error('Job not found.'); return job.done; }
  cancel(id: string) {
    const job = this.jobs.get(id);
    if (!job || job.state !== 'queued') return false;
    this.pending = this.pending.filter(item => item.id !== id);
    job.state = 'cancelled'; job.finishedAt = new Date().toISOString();
    job.result = { success: false, cancelled: true, message: 'Scan cancelled before execution.', error: null };
    job.resolve(job.result); return true;
  }

  private async pump() {
    if (this.active) return;
    const job = this.pending.shift();
    if (!job) return;
    this.active = job; job.state = 'running'; job.startedAt = new Date().toISOString();
    try { job.result = await this.execute(job.channel, job.args); }
    catch (error: any) { job.result = { success: false, message: 'Tool job could not finish.', error: error?.message || String(error) }; }
    finally {
      job.state = job.result?.success === false ? 'failed' : 'completed';
      job.finishedAt = new Date().toISOString(); job.resolve(job.result!);
      this.active = undefined; void this.pump();
    }
  }
}
