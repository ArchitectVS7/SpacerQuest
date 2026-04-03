# SpacerQuest LLM Playtest Agent

This directory contains the LLM Playtest Agent for SpacerQuest. The agent simulates a real human player interacting with the game through the terminal interface, making decisions based on reasoning and the provided strategy guide.

It now supports both cloud-based Claude models and local LLM models (powered by [Ollama](https://ollama.com)).

## Quick Start

Run the Playwright test script and pass configuring environment variables to guide the agent.

```bash
# Example 1: Use Claude to reach 50,000 credits
export ANTHROPIC_API_KEY="your-api-key"
PLAYTEST_MODEL=claude-haiku-4-5-20251001 PLAYTEST_GOAL=credits:50000 npx playwright test tests/e2e/playtest/agent.spec.ts

# Example 2: Use a local Ollama model to play for 10 turns
PLAYTEST_MODEL=qwen3-coder:latest PLAYTEST_GOAL=turns:10 npx playwright test tests/e2e/playtest/agent.spec.ts
```

## Environment Variables

### Core Configuration

| Variable | Description | Default | Example |
| -------- | ----------- | ------- | ------- |
| `PLAYTEST_MODEL` | The LLM to use. Automatically routes to Anthropic if the name contains "claude". Otherwise routes to localhost Ollama. | `claude-haiku-4-5-20251001` | `qwen3-coder:latest` |
| `PLAYTEST_GOAL` | The objective the AI player will attempt to complete. See the "Goals" section below. | `turns:50` | `credits:100000` |

### Provider Configuration

| Variable | Description | Default | Example |
| -------- | ----------- | ------- | ------- |
| `ANTHROPIC_API_KEY` | Your Anthropic key. Required **only** if using a Claude model. | `undefined` | `sk-ant-...` |
| `OLLAMA_URL` | The endpoint for your local Ollama server if you use custom ports or a network server. | `http://localhost:11434` | `http://192.168.1.50:11434` |
| `PLAYTEST_PROVIDER` | Forces the API provider logic (bypasses auto-detection logic of `PLAYTEST_MODEL`). | Auto | `ollama` |

### Logging

| Variable | Description | Default | Example |
| -------- | ----------- | ------- | ------- |
| `PLAYTEST_LOG` | Absolute path to output the agent's full raw decision logs and debug dumps. | `/tmp/spacerquest-playtest.log` | `./playtest.log` |

## Playtest Goals (`PLAYTEST_GOAL`)

Provide goals in a `type:value` format. The test will automatically finish and assert success once the agent attains the goal.

* **`turns:<number>`** — Complete `<number>` end-turn cycles. (e.g., `turns:50`)
* **`credits:<number>`** — Accumulate `<number>` credits. (e.g., `credits:50000`)
* **`battles:<number>`** — Win `<number>` battles. (e.g., `battles:3`)
* **`cargo:<number>`** — Complete `<number>` cargo deliveries. (e.g., `cargo:5`)
* **`alliance:<number>`** — Join any alliance (value doesn't matter, just use `1`). (e.g., `alliance:1`)
* **`arena:<number>`** — Fight in the arena (value doesn't matter, use `1`). (e.g., `arena:1`)
* **`rank:<string>`** — Reach the specified rank. (e.g., `rank:Commander`)
* **`upgrade:<number>`** — Upgrade ship components `<number>` times. (e.g., `upgrade:5`)

## How it works

1. The script (`agent.spec.ts`) boots up the SpacerQuest local backend/frontend.
2. It generates a Dev Token and creates a new mock user and ship seamlessly.
3. Once in the main menu, control is handed over to the `ClaudePlayer` class.
4. The agent queries the current text on the terminal screen, bundles it with history and its strategy guide (`strategy-guide.md`), and asks the chosen LLM for an action.
5. The LLM dictates the action, which the script executes in the browser using Playwright.
6. The test fails if the LLM enters an unrecoverable "bug state" or errors out. It succeeds if the goal is achieved.
