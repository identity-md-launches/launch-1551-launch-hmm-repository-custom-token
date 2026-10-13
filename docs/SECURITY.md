# Security

Status: **unaudited by a third party.** Reviewed internally and by an independent adversarial review (findings and
fixes below). The IMD swarm runs its own audit panel on the code before it deploys the launch.

## Admin keys: none
The launch sets the steward to `address(0)`: nobody can change the adapter, the action id, the schedule, the dev share
or anything else after launch. The token has no owner.

## What is at stake
- The mining reserve (~650M HMM) in `HmmMine`.
- IMD that backers have put into questions still raising (`openRaised`), at most a few IMD per question.
- Backers' unclaimed rewards.

## Trust assumptions
| Who | Can | Cannot |
|---|---|---|
| IMD Intake owner | change the price, the writer, the callback gas; stop selling the action | touch the mine's funds; credit anything |
| IMD Intake writer | complete requests (or not); hand a valid answer for one of our questions to another of our questions | forge an answer; credit a question nobody paid for; move funds |
| IMD oracle signer | sign answers | without the writer, nothing reaches the mine |
| hmm steward | **none at launch** (`address(0)`). If one were set: queue a new adapter / action id, applied after 3 days, for questions proposed afterwards. An adapter decides which questions mine, so a malicious one could take the emission of every round it controls. | touch claimed rewards, past questions, or the IMD of questions proposed before the change (they refuse to be asked under it) |
| hmm dev | receive 5% of rounds | anything else |

## Properties the tests enforce
- HMM conservation: `balance(mine) + claimed + devPaid == reserve` (invariant, ~20k random calls per run).
- Solvency: `claimed + devPaid + devOwed ≤ assigned ≤ schedule(now) ≤ reserve` (invariant + fuzz).
- IMD conservation: the mine holds exactly what open questions raised; every ask paid the swarm exactly once.
- A question is credited at most once; a round's shares equal its answered questions' payments.
- Only answers signed by the oracle for this adapter, with panel ≥ 5, quorum ≥ 4, agreed ≥ quorum and a majority,
  unexpired and never used before, can credit; everything else is recorded as failed with a reason.
- An outsider who pays the Intake directly and names the adapter cannot mine; a writer handing one request's callback
  another request's id is refused.
- The first answer ever, with a 32-address answer, 40 eras in, needs 118,437 of the Intake's 200,000 callback gas.
- The EIP-712 encoding matches five real attestations signed by the swarm's oracle.
- The launch, rehearsed on a mainnet fork through IMD's real factory, registry, pool, Intake and IMD.

## Independent review (2026-10-12): findings and fixes
| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | Medium (key) | A steward-installed adapter can credit questions without oracle answers and fail others, taking future emission. | Launch with no steward. The steward code path is unreachable when it is zero (`test/audit/StewardAdapter.t.sol` shows both). |
| 2 | Medium | The proposer controlled the raw JSON body: a foreign `consumer`, a `deliver`, a tiny panel or a short validity made the answer not count, so the other backers paid for an answer signed for the proposer's contract. | The mine now writes the body itself from a validated `Spec` (printable ASCII question without `"` or `\`, panel ≥ 5, quorum ≥ 4 and a majority, fixed validity, scalar answer types). Injection is impossible by construction (`test_spec_rulesAndInjection`). |
| 3 | Low | A long list answer was logged in full and could run the callback out of its 200k gas; the answer would be lost. | `Thought` logs `answerHash` and the answer only up to 128 bytes; the answer is hashed once. A 3,000-entry answer is delivered (`test_longAnswer_isCountedAndHashed`). |
| 4 | Low | Completing a pooled question inside a transaction that already made another Intake request leaves the mine's request unserved. | Completing a question that holds other backers' IMD must come from an account calling directly (`tx.origin`); a contract can still back, or ask with only its own IMD. |
| 5 | Low | A question proposed just before a config change could be asked under the new adapter. | Questions record the config version; a stale one refuses to be asked and its backers refund. |
| 6 | Info | The forwarder's address is fixed in advance by the deployer's first nonce. | `DeployForwarder` refuses unless the deployer is at nonce 0 and matches `launch/config.json`; `pay.mjs` checks the forwarder on chain before paying. |

The reviewer's own adversarial invariant suite (price moves, rotations, rejected / reused / expired / oversized
answers) is kept in `test/audit/AdversarialInvariants.t.sol`.

## Known limitations
- With no steward, if IMD stops serving Intake v2 or changes the oracle's callback format, mining stops and the
  unemitted reserve stays in the mine forever. That is the price of having no admin key.
- An account using an EIP-7702 batch could still put its own Intake request before completing a pooled question in
  one transaction, on purpose, at its own cost; the mine cannot see requests made directly to the Intake.
- A question whose wording the swarm refuses or cannot agree on spends its IMD. The site runs the swarm's free check
  first and shows its verdict on every open question.
