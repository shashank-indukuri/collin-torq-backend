import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { config } from './config.js';
import type { SearchInput, Offer } from './domain.js';
export type State = 'queued' | 'running' | 'needs_input' | 'needs_permission' | 'completed' | 'partial' | 'failed' | 'cancelled';
export type SupplierAttempt = {noMatchEvidence?:import('./domain.js').QueryInspection;recovery?:{attempted:true;navigationVerified:boolean};supplier: Offer['supplier']; phase:'exact'|'alternative'; status:'found'|'no_match'|'error'; query:string; observedAt:string; code?:string; message?:string; evidence?:{url:string;screenshot:string;observedAt:string}};
export type LineResult = { name: string; quantity: number; offers: Offer[]; attempts?:SupplierAttempt[]; errors: {supplier: string; code: string; message: string}[]; rankings?: ReturnType<typeof import('./domain.js').rank> };
export type Job = { execution?:{provider:string;model:string;supplierEngine:string;startedAt:string}; comparisonOf?:{jobId:string;updatedAt:string};comparison?:import('./comparison.js').Comparison; alternativeReview?:import('./alternatives.js').AlternativeReview; id: string; state: State; input: SearchInput; results: LineResult[]; guide?: import('./guides.js').GuideResolution; parts?: import('./parts.js').PartExtraction; capturedParts?: import('./capture.js').CapturedParts; sourceCapture?:{jobId:string;capturedAt:string;guideSha256:string;modelBasis:'test_model'|'user_confirmed_model';phase:'exact'}; message: string; createdAt: string; updatedAt: string; events: {at: string; message: string}[] };
export class Store {
  db: DatabaseSync;
  constructor(path = join(config.dataDir, 'torq.sqlite')) {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS branches (key TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS idempotency (key TEXT PRIMARY KEY, job_id TEXT NOT NULL, body TEXT NOT NULL);');
  }
  getBranch(supplier:string,id:string){const row=this.db.prepare('SELECT data FROM branches WHERE key=?').get(supplier+':'+id) as {data:string}|undefined;return row?JSON.parse(row.data) as {supplier:string;id:string;name:string;address:string;sourceUrl:string;observedAt:string;location?:import('./geocoding.js').GeoResolution}:undefined;}
  saveBranch(row:{supplier:string;id:string;name:string;address:string;sourceUrl:string;observedAt:string;location?:import('./geocoding.js').GeoResolution}){
    // Address/coordinates are cached independently of volatile product inventory.
    const {supplier,id,name,address,sourceUrl,observedAt,location}=row;
    this.db.prepare('INSERT INTO branches VALUES (?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data').run(supplier+':'+id,JSON.stringify({supplier,id,name,address,sourceUrl,observedAt,location}));
  }
  create(input: SearchInput, key?: string, context:Pick<Job,'sourceCapture'|'capturedParts'|'guide'|'parts'|'comparisonOf'>={}) {
    if (key) {
      const old = this.db.prepare('SELECT job_id,body FROM idempotency WHERE key=?').get(key) as {job_id: string;body: string} | undefined;
      if (old) {
        if (old.body !== JSON.stringify(input)) throw new Error('IDEMPOTENCY_CONFLICT');
        return { job: this.get(old.job_id)!, reused: true };
      }
    }
    const now = new Date().toISOString();
    const job: Job = { id: randomUUID(), state: 'queued', input, results: [], message: 'Queued', createdAt: now, updatedAt: now, events: [],...context };
    this.db.exec('BEGIN');
    try {
      this.save(job);
      if (key) this.db.prepare('INSERT INTO idempotency VALUES (?,?,?)').run(key, job.id, JSON.stringify(input));
      this.db.exec('COMMIT');
    } catch(e) { this.db.exec('ROLLBACK'); throw e; }
    return { job, reused: false };
  }
  get(id: string): Job | undefined {
    const row = this.db.prepare('SELECT data FROM jobs WHERE id=?').get(id) as {data: string} | undefined;
    return row ? JSON.parse(row.data) : undefined;
  }
  list(): Job[] { return (this.db.prepare('SELECT data FROM jobs ORDER BY rowid DESC LIMIT 100').all() as {data:string}[]).map(r => JSON.parse(r.data)); }
  pending(): Job[] { return (this.db.prepare('SELECT data FROM jobs').all() as {data:string}[]).map(r => JSON.parse(r.data)).filter(j => ['queued','running'].includes(j.state)); }
  save(job: Job) { this.db.prepare('INSERT INTO jobs VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(job.id, JSON.stringify(job)); }
  update(id: string, change: Partial<Job>, message?: string) {
    const job = this.get(id); if (!job) throw new Error('JOB_NOT_FOUND');
    Object.assign(job, change, {updatedAt: new Date().toISOString()});
    if (message) { job.message = message; job.events.push({at: job.updatedAt, message}); }
    this.save(job); return job;
  }
}
