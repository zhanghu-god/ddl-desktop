import { envValue } from 'file:///C:/Users/zhang/.agents/skills/github-account/scripts/env.mjs';
const token = envValue(['GITHUB_TOKEN']);
const repo = 'zhanghu-god/ddl-desktop';
const H = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'ddl-poll',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 60; i++) {
  const r = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/release.yml/runs?per_page=1`,
    { headers: H },
  );
  const j = await r.json();
  const run = j.workflow_runs && j.workflow_runs[0];
  if (!run) {
    console.log('no run');
    await sleep(20000);
    continue;
  }
  console.log(`[${i}] run#${run.run_number} ${run.status} ${run.conclusion} tag=${run.head_branch}`);
  if (run.status === 'completed') {
    console.log('RUN_URL', run.html_url);
    process.exit(run.conclusion === 'success' ? 0 : 1);
  }
  await sleep(20000);
}
process.exit(2);
