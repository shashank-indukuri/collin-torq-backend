import { spawn } from 'node:child_process';

export type RecoveryResult = {
  successful: boolean;
  agentReportedSuccess?: boolean | null;
  result: string | null;
  visitedCandidateIndices?: number[];
  modelVisitedCandidateIndices?: number[];
  boundedInspectionIndices?: number[];
  toolNames?: string[];
  identityVerification?: {
    matched: boolean;
    manufacturer?: string | null;
    partNumber?: string | null;
  };
};
/** Resolve only after the child closes: Stagehand must never race a live recovery process. */
export function runRecoveryProcess(
  request: unknown,
  options: {
    timeoutMs: number;
    executable?: string;
    args?: string[];
    onLog?: (output: string) => void;
    onProgress?: (phase: string) => void;
  },
): Promise<RecoveryResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      options.executable ?? '.venv/bin/python',
      options.args ?? ['python/recover.py'],
      {
        env: { ...process.env, ANONYMIZED_TELEMETRY: 'false', BROWSER_USE_CLOUD: 'false' },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
    let out = '',
      error = '',
      progress = '',
      failure: Error | undefined;
    const stop = (message: string) => {
      failure ??= new Error(message);
      child.kill('SIGKILL');
    };
    const timer = setTimeout(
      () => stop('Browser Use recovery deadline exceeded'),
      options.timeoutMs,
    );
    child.stdout.on('data', (b) => {
      if (out.length + b.length > 1024 * 1024) {
        stop('Browser Use recovery output limit exceeded');
        return;
      }
      out += b;
      progress += b;
      let newline: number;
      while ((newline = progress.indexOf('\n')) >= 0) {
        const line = progress.slice(0, newline);
        progress = progress.slice(newline + 1);
        if (/^TORQ_PROGRESS=[a-z0-9_]{1,60}$/.test(line))
          options.onProgress?.(line.slice('TORQ_PROGRESS='.length));
      }
    });
    child.stderr.on('data', (b) => {
      error = (error + b).slice(-20000);
    });
    child.stdin.on('error', () => {
      /* A child can exit before reading input; close supplies the outcome. */
    });
    child.on('error', (e) => {
      failure ??= e;
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      options.onLog?.(out + '\n' + error);
      if (failure) return reject(failure);
      if (code !== 0)
        return reject(
          new Error(`Browser Use recovery failed (exit ${code}); see .local/recovery.log`),
        );
      const lines = out.split('\n').filter((l) => l.startsWith('TORQ_RESULT='));
      if (lines.length !== 1)
        return reject(new Error('Browser Use recovery returned no unique result'));
      try {
        const result = JSON.parse(lines[0]!.slice('TORQ_RESULT='.length));
        if (
          typeof result?.successful !== 'boolean' ||
          !(result.result === null || typeof result.result === 'string') ||
          (result.agentReportedSuccess != null && typeof result.agentReportedSuccess !== 'boolean')
        )
          throw new Error('Invalid recovery result');
        for (const field of [
          'visitedCandidateIndices',
          'modelVisitedCandidateIndices',
          'boundedInspectionIndices',
        ])
          if (
            result[field] !== undefined &&
            (!Array.isArray(result[field]) ||
              result[field].length > 32 ||
              result[field].some(
                (i: unknown) => typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i > 11,
              ))
          )
            throw new Error('Invalid executed recovery actions');
        if (
          result.toolNames !== undefined &&
          (!Array.isArray(result.toolNames) ||
            result.toolNames.length > 50 ||
            result.toolNames.some((n: unknown) => typeof n !== 'string'))
        )
          throw new Error('Invalid recovery tools');
        if (
          result.identityVerification !== undefined &&
          (typeof result.identityVerification?.matched !== 'boolean' ||
            ['manufacturer', 'partNumber'].some(
              (k) =>
                result.identityVerification[k] != null &&
                typeof result.identityVerification[k] !== 'string',
            ))
        )
          throw new Error('Invalid recovery identity result');
        resolve(result);
      } catch {
        return reject(new Error('Browser Use recovery returned an invalid result'));
      }
    });
    child.stdin.end(JSON.stringify(request));
  });
}
