# SKSK 50-run benchmark (Termux, Node 18+)

`stress-sksk-50.js` is a standalone script. It uses built-in `fetch` and does **not** need `npm install`, external API keys, or changes to the server. Copy the script into `scripts/` of either checkout, or run it from any directory with Node.

Start the version of SKSK you want to measure in a **separate Termux session**, bound to `127.0.0.1:3000`. Do not run this against the production server. The harness refuses non-loopback target URLs.

For the June 24 pre-Buyer snapshot (`068b3ea`):

```sh
# 50 identical full estimates: cold start and warm performance
node scripts/stress-sksk-50.js --engine legacy --mode fixed --runs 50

# 50 randomized symptoms and trouble codes, one request at a time
node scripts/stress-sksk-50.js --engine legacy --mode random --runs 50

# 50 randomized full estimates at up to five simultaneous requests
node scripts/stress-sksk-50.js --engine legacy --mode concurrent --runs 50 --concurrency 5
```

For current SKSK:

```sh
# 50 diagnosis requests; no fabricated test evidence is inserted
node scripts/stress-sksk-50.js --engine current --mode fixed --runs 50
node scripts/stress-sksk-50.js --engine current --mode concurrent --runs 50 --concurrency 5
```

**Why isn't `current` the same endpoint?** The current application requires a recorded physical confirmation test before allowing the Estimate step. Fabricating fifty confirmed faults in a real shop database would corrupt evidence. By default this benchmark measures current **Diagnose** only and explicitly says so in its report.

There is an opt-in way to measure the entire current Diagnose → Test → Verify → Estimate lifecycle *in a disposable, isolated server and database*:

```sh
# ONLY for an isolated local instance with NO real Supabase/shop database connected.
node scripts/stress-sksk-50.js --engine current --mode fixed --runs 50 \
  --lifecycle --confirm-isolated-test-server
```

Synthetic confirmation entries are labeled as such, and must never be used as genuine repair evidence. Shut down and discard the disposable test data when finished.

Every run prints its outcome and wall time. The JSON output is saved to an auto-named `sksk-stress-*.json` file in your current directory, with mode, failure types, min/mean/p50/p95/p99/max, throughput, and per-run details. Use `--output filename.json` to choose the name. A nonzero exit code means at least one request failed. The script distinguishes legacy's reported `ai_used` flag from an obviously simulated fallback; the flag alone does **not** prove a provider answered.

If the old engine takes about 15 seconds per call, 50 sequential estimates will take around 13 minutes. Concurrent mode can finish faster but will put more load on the scrapers; start with the sequential baseline. A 53 ms or 23 ms result must be timed end-to-end on the specific route before claiming full pipeline speed.

For the user-provided sample Kia VIN, `--vin` is optional. To use your own known test vehicles, pass `--vin KNDJC736385765089` or `--vins VIN1,VIN2` in random/concurrent mode. Avoid production customer VINs in shared reports.

Run the automated contract tests from the current repository with `node --test tests/stress-sksk-50.test.js`. These use an ephemeral localhost mock server and do not call outside services.
