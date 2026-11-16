import { envValue } from 'file:///C:/Users/zhang/.agents/skills/github-account/scripts/env.mjs';
const token = envValue(['GITHUB_TOKEN']);
const repo = 'zhanghu-god/ddl-desktop';
const H = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'ddl-ci',
};
const tag = process.argv[2] || 'v0.3.6';

const d = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/release.yml/dispatches`, {
  method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
  body: JSON.stringify({ ref: 'main', inputs: { tag } }),
});
console.log('dispatch status', d.status);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 60; i++) {
  await sleep(20000);
  const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/release.yml/runs?per_page=1`, { headers: H });
  const j = await r.json();
  const run = j.workflow_runs && j.workflow_runs[0];
  if (!run) { console.log('no run yet'); continue; }
  console.log(`[${i}] run #${run.run_number} status=${run.status} conclusion=${run.conclusion}`);
  if (run.status === 'completed') {
    const jr = await fetch(`https://api.github.com/repos/${repo}/actions/runs/${run.id}/jobs`, { headers: H });
    const jj = await jr.json();
    for (const job of jj.jobs || []) console.log(`  job ${job.name}: ${job.conclusion}`);
    console.log('RUN_URL', run.html_url);
    process.exit(run.conclusion === 'success' ? 0 : 1);
  }
}
console.log('timeout waiting for CI');
process.exit(2);
