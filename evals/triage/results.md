# Triage model eval

`POST /api/contact` asks a Workers AI model to label each enquiry (`worker/triage.ts`). This eval
picks that model. `evals/triage/run.ts` sends the 20 cases in `evals/triage/cases.json`
(8 English, 8 Romanian, 4 spam/off-topic, one of them a prompt-injection attempt) through the
Worker's own `triage()` function, with the same prompt, JSON schema and retry, over the Workers AI
REST API. Per model it reports accuracy for `category`, `language` and `urgency`, the schema-valid
rate (a `null` from `triage()` or a "JSON Mode couldn't be met" error counts as invalid), median
and p95 latency per case (retries included), and the number of retries. Each run appends a dated
section below; nothing here is edited by hand.

## Selection rule

From the Task 10 brief: choose a model that reaches **at least 90% category accuracy** and
**100% schema-valid** output, set `TRIAGE_MODEL` in `worker/triage.ts` to it, and write the
reasoning here. The brief does not rank several passing models; suggested tie-break: Romanian
cases first (the site's main audience), then language and urgency accuracy, then cost per
token, then latency.

## Candidates for the go-live run

From the Workers AI catalogue, checked 2026-11-11:
<https://developers.cloudflare.com/workers-ai/models/?tasks=Text+Generation>

| Model | Why | JSON mode | Deprecation |
| --- | --- | --- | --- |
| `@cf/ibm-granite/granite-4.0-h-micro` | Current provisional `TRIAGE_MODEL`; cheapest text model ($0.017 / $0.112 per M input/output tokens). Romanian not in its advertised languages. | `response_format` listed | none shown |
| `@cf/zai-org/glm-4.7-flash` | Catalogue lists "100+ languages"; fast, 131k context ($0.0605 / $0.40 per M). | `response_format` listed | none shown |
| `@cf/google/gemma-4-26b-a4b-it` | Gemma family is trained multilingual (the catalogue page itself does not list languages); MoE with 4B active ($0.10 / $0.30 per M). | `response_format` listed | none shown |

Model pages: <https://developers.cloudflare.com/workers-ai/models/granite-4.0-h-micro/>,
<https://developers.cloudflare.com/workers-ai/models/glm-4.7-flash/>,
<https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/>.
Not chosen: `@cf/meta/llama-3.1-8b-instruct-fp8` and `@cf/qwen/qwen3-30b-a3b-fp8` (both
"Planned Deprecation: 11/20/2026" when Task 8 checked); `@cf/mistralai/mistral-small-3.1-24b-instruct`
(lists `guided_json`, not `response_format`, which `triage()` sends). Check the catalogue again
on the day of the run: names and deprecation dates change.

## How to run

Needs a Cloudflare account ID and an API token with Workers AI permission
(<https://developers.cloudflare.com/workers-ai/get-started/rest-api/>). Export them in the shell
rather than typing them inline, so the token stays out of shell history and out of this repo:

```sh
export CLOUDFLARE_ACCOUNT_ID=<account id>
export CLOUDFLARE_API_TOKEN=<workers ai token>
npm run eval:triage -- --model @cf/ibm-granite/granite-4.0-h-micro --model @cf/zai-org/glm-4.7-flash --model @cf/google/gemma-4-26b-a4b-it
```

Three models make 60 model calls (at most 120 with retries), well inside the Workers AI free daily allowance.

## Results

Not yet run: needs a Cloudflare account (go-live).
