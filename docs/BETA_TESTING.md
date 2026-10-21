# Beta testing guide

Local demo: Johnstone Supply and Parts Town, agent engine. Grainger is out of
scope for now (its bot check blocks automated browsing on this network).

## Start

```bash
cd /Volumes/workplace/collin-torq-backend
SUPPLIER_ENGINE=agent npm start
```

Open http://127.0.0.1:4310/flow. The server listens on 127.0.0.1 only.
Each supplier check takes 1-2 minutes and costs about $0.01 of the $3.00
cloud budget. Current spend: `curl -s http://127.0.0.1:4310/api/health`.

## Sample inputs

Use the job site `2100 Clarendon Blvd, Arlington, VA 22201` for real
distances. Expected results are what a person found in early October
(run3 workbook, "Test 2 - all Suppliers"); prices may have moved since.

### Guided flow (equipment model, then parts)

| Model | Manufacturer | Parts | Expected |
| --- | --- | --- | --- |
| `York - E1RD036` | York | control board, capacitor | Board: Johnstone $196.72, Parts Town $198.49; Johnstone stores Arbutus, Rosedale, Pittston with addresses. Capacitor: Johnstone $10.75, Parts Town about $12.59 |

### Exact part numbers (API)

Send one or more lines in a single request:

```bash
curl -s -X POST http://127.0.0.1:4310/api/searches \
  -H 'content-type: application/json' \
  -d '{"mode":"live","stopAfter":"comparison",
       "origin":{"address":"2100 Clarendon Blvd, Arlington, VA 22201"},
       "suppliers":["partstown","johnstone"],
       "lines":[{"name":"condenser fan blade","manufacturer":"York","partNumber":"S1-02625511000","quantity":1}]}'
```

Then open `http://127.0.0.1:4310/flow?job=<id>` to see it in the UI.

| Part | Manufacturer | Part number | Parts Town | Johnstone |
| --- | --- | --- | --- | --- |
| Defrost control board | York | S1-33101975102 | $198.49 | $196.72, 3 stores |
| Run capacitor | York | S1-02420043700 | ~$12.59 | $10.75 |
| Condenser fan blade | York | S1-02625511000 | ~$105.49 | $102.43 |
| Filter drier | Trane | DHY01481 | $52.79 | not carried |
| Fuse | Trane | FUS00907 | $51.79 | not carried |
| Contactor | Trane | SFCTR3P40A120VLA2L | $31.25 | not carried |
| Mod gas board | AAON | ASM01668 | $1,278.99 | not carried |
| Relay | Trane | RLY00681 | not carried | not carried |
| Maintenance kit | Lochinvar | 100345163 | listed, no price (temporarily unavailable) | not carried |

## What to check

- Every price shown matches the supplier's own page for that exact part.
- "not carried" parts show no price, never a similar part.
- Stores with stock show name, count, address and phone.
- After 15 minutes the page says prices are old and hides them until refresh.

## Automated regression

```bash
npm run regression:live -- --base http://127.0.0.1:4310          # all 9 parts
npm run regression:live -- --base http://127.0.0.1:4310 A C F    # a subset
```

Results land in `reports/regression-*.json`.
