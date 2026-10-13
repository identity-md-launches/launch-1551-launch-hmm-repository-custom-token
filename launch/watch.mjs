// Follows the swarm's launch job after pay.mjs: prints each step as it moves, then the launch number, the token, the
// adapter and the mine, and checks them on chain (the mine names our forwarder and is not started yet).
// Usage: node launch/watch.mjs <jobId>
import { readFileSync } from "node:fs";
import { createPublicClient, http, parseAbi } from "viem";

const API = process.env.IMD_API ?? "https://api.imd.fun";
const RPC = process.env.MAINNET_RPC_URL ?? "http://127.0.0.1:8545";
const jobId = process.argv[2];
if (!jobId) throw new Error("usage: node launch/watch.mjs <jobId>");
const cfg = JSON.parse(readFileSync(new URL("config.json", import.meta.url)));
const pub = createPublicClient({ transport: http(RPC) });
const get = async (p) => (await fetch(`${API}${p}`)).json();
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

let last = "";
for (;;) {
  const job = await get(`/jobs/${jobId}`);
  const nodes = (job.nodes ?? []).map((n) => `${n.key ?? n.skill}:${n.state ?? n.verdict ?? "?"}`).join(" ");
  const line = `${job.state} | ${nodes}${job.blockedReason ? ` | blocked: ${job.blockedReason}` : ""}`;
  if (line !== last) console.log(new Date().toISOString().slice(11, 19), line);
  last = line;
  if (job.launch?.id || job.launch?.launchNumber || ["completed", "blocked", "cancelled", "failed"].includes(job.state)) {
    if (job.state === "blocked" || job.state === "cancelled" || job.state === "failed") {
      console.log(JSON.stringify(job.blockedReason ?? job, null, 2).slice(0, 4000));
      process.exit(1);
    }
    if (job.launch) {
      const launchId = job.launch.id ?? job.launch.launchId;
      const l = launchId ? await get(`/launches/${launchId}`) : job.launch;
      if (l.status === "live" || l.artifacts?.length) {
        console.log(`launch #${l.launchNumber} ${l.status}`);
        const art = Object.fromEntries((l.artifacts ?? []).map((a) => [a.name, a.address]));
        console.log(JSON.stringify(art, null, 2));
        const mine = art.HmmMine;
        if (mine) {
          const abi = parseAbi(["function forwarder() view returns (address)", "function started() view returns (bool)", "function token() view returns (address)", "function steward() view returns (address)", "function dev() view returns (address)"]);
          const [fwd, started, token, steward, dev] = await Promise.all(
            ["forwarder", "started", "token", "steward", "dev"].map((f) => pub.readContract({ address: mine, abi, functionName: f })),
          );
          const ok = fwd.toLowerCase() === cfg.forwarder.toLowerCase() && token.toLowerCase() === art.HmmToken?.toLowerCase();
          console.log({ forwarder: fwd, started, token, steward, dev, wiredRight: ok });
          console.log(`\nnext: cast send ${cfg.forwarder} "forward(uint64)" ${l.launchNumber} --account hmm-launcher --password-file ~/.hmm/hmm-launcher.password --rpc-url $MAINNET_RPC_URL`);
        }
        process.exit(0);
      }
    }
  }
  await sleep(20);
}
