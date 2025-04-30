"""
Git commit history simulation for the your.fun repository.
Generates 400+ commits from May 2025 to Feb 2026 with natural patterns.

Author: yourdotfun-code <yourdotfun-code@noreply.github.com>

Usage:
    python simulate_history.py

This script must be run from the repository root.
After execution, delete this script before pushing.
"""

import os
import subprocess
import random
from datetime import datetime, timedelta

AUTHOR_NAME = "yourdotfun-code"
AUTHOR_EMAIL = "yourdotfun-code@noreply.github.com"

START_DATE = datetime(2025, 5, 1, 9, 0, 0)
END_DATE = datetime(2026, 2, 10, 18, 0, 0)

TARGET_COMMITS = 430

FILES_BY_PHASE = {
    "phase1_foundation": {
        "start": datetime(2025, 5, 1),
        "end": datetime(2025, 6, 30),
        "files": [
            "programs/your-fun/Cargo.toml",
            "programs/your-fun/src/lib.rs",
            "programs/your-fun/src/state.rs",
            "programs/your-fun/src/error.rs",
            "programs/your-fun/src/instructions/mod.rs",
            "programs/your-fun/src/instructions/initialize.rs",
        ],
        "messages": [
            "init: scaffold anchor project structure",
            "feat: add PlatformRegistry account definition",
            "feat: define HumanRecord state with PDA seeds",
            "feat: add SessionAccount and InteractionLog structs",
            "feat: implement initialize instruction handler",
            "fix: correct PDA seed ordering for registry",
            "refactor: extract account size calculations",
            "feat: add custom error codes for validation",
            "chore: update Cargo.toml dependencies",
            "feat: add verification fee configuration",
            "refactor: clean up state module imports",
            "docs: add inline documentation for state structs",
            "feat: add bump field to all PDA accounts",
            "fix: correct SIZE calculation for HumanRecord",
            "test: add basic deserialization checks",
            "feat: add max_session_duration to registry config",
            "refactor: consolidate seed constants",
            "chore: format with rustfmt",
            "feat: add is_paused flag to registry",
            "fix: handle overflow in size constants",
        ],
    },
    "phase2_verification": {
        "start": datetime(2025, 7, 1),
        "end": datetime(2025, 8, 31),
        "files": [
            "programs/your-fun/src/instructions/register_human.rs",
            "programs/your-fun/src/instructions/verify_human.rs",
            "programs/your-fun/src/error.rs",
            "programs/your-fun/src/state.rs",
            "programs/your-fun/src/lib.rs",
        ],
        "messages": [
            "feat: implement register_human instruction",
            "feat: add fee transfer in registration",
            "feat: store challenge nonce on-chain",
            "feat: implement verify_human handler",
            "feat: add challenge-response validation logic",
            "feat: implement compute_challenge_hash function",
            "fix: correct XOR folding in challenge hash",
            "feat: add behavioral score threshold check",
            "refactor: extract verification helpers",
            "fix: prevent double registration",
            "feat: add verification level assignment",
            "test: verify challenge hash determinism",
            "fix: handle edge case in score validation",
            "feat: add fingerprint hash storage",
            "refactor: improve error messages for verification",
            "chore: clippy fixes for verification module",
            "feat: add registration timestamp tracking",
            "fix: ensure authority receives fee correctly",
            "docs: document verification flow",
            "feat: add max_interactions_per_session config",
        ],
    },
    "phase3_sessions": {
        "start": datetime(2025, 9, 1),
        "end": datetime(2025, 10, 15),
        "files": [
            "programs/your-fun/src/instructions/session.rs",
            "programs/your-fun/src/instructions/interaction.rs",
            "programs/your-fun/src/instructions/mod.rs",
            "programs/your-fun/src/lib.rs",
            "programs/your-fun/src/state.rs",
        ],
        "messages": [
            "feat: implement create_session instruction",
            "feat: add session expiration logic",
            "feat: implement close_session handler",
            "feat: accumulate session score on close",
            "feat: implement extend_session instruction",
            "feat: add record_interaction handler",
            "feat: implement weighted scoring algorithm",
            "feat: add interaction type multipliers",
            "feat: add duration bonus to scoring",
            "fix: cap interaction score at u64 max",
            "refactor: extract scoring into helper function",
            "feat: track interaction count per session",
            "fix: prevent interaction on expired session",
            "feat: update global stats on interaction",
            "test: verify scoring with different types",
            "fix: correct session index derivation",
            "feat: add personality_id to session state",
            "chore: wire all instruction handlers in lib.rs",
            "docs: add session lifecycle documentation",
            "refactor: clean up session module",
        ],
    },
    "phase4_typescript_sdk": {
        "start": datetime(2025, 10, 16),
        "end": datetime(2025, 12, 15),
        "files": [
            "sdk/typescript/package.json",
            "sdk/typescript/tsconfig.json",
            "sdk/typescript/src/pda.ts",
            "sdk/typescript/src/types.ts",
            "sdk/typescript/src/client.ts",
            "sdk/typescript/src/ai.ts",
            "sdk/typescript/src/proof.ts",
            "sdk/typescript/src/index.ts",
        ],
        "messages": [
            "feat(sdk): init typescript SDK project",
            "feat(sdk): add PDA derivation functions",
            "feat(sdk): define TypeScript interfaces for on-chain state",
            "feat(sdk): implement YourFunClient class",
            "feat(sdk): add instruction encoding helpers",
            "feat(sdk): implement registerHuman method",
            "feat(sdk): add verifyHuman instruction builder",
            "feat(sdk): implement createSession method",
            "feat(sdk): add closeSession and extendSession",
            "feat(sdk): implement recordInteraction",
            "feat(sdk): add account deserialization",
            "feat(sdk): implement AICompanion class",
            "feat(sdk): add chat method with context management",
            "feat(sdk): implement SSE streaming in chatStream",
            "feat(sdk): add personality system to AICompanion",
            "feat(sdk): implement generateQuiz method",
            "feat(sdk): add ProofGenerator class",
            "feat(sdk): implement behavioral event recording",
            "feat(sdk): add fingerprint hash generation",
            "feat(sdk): implement solveChallenge matching on-chain",
            "feat(sdk): add confidence scoring to fingerprint",
            "feat(sdk): implement context windowing",
            "feat(sdk): add learning progress tracking",
            "fix(sdk): correct PDA seed buffer encoding",
            "refactor(sdk): extract serialization helpers",
            "feat(sdk): add barrel exports in index.ts",
            "chore(sdk): update package.json dependencies",
            "fix(sdk): handle BN.js conversion edge cases",
            "docs(sdk): add JSDoc comments to public API",
            "test(sdk): add unit tests for PDA derivation",
        ],
    },
    "phase5_api": {
        "start": datetime(2025, 12, 16),
        "end": datetime(2026, 1, 20),
        "files": [
            "api/package.json",
            "api/tsconfig.json",
            "api/src/index.ts",
            "api/src/middleware/auth.ts",
            "api/src/routes/chat.ts",
            "api/src/routes/verify.ts",
            "api/src/routes/learn.ts",
            "api/src/services/ai-engine.ts",
            "api/src/services/solana.ts",
        ],
        "messages": [
            "feat(api): init express server",
            "feat(api): add CORS and JSON middleware",
            "feat(api): implement wallet signature auth",
            "feat(api): add ed25519 verification in auth middleware",
            "feat(api): implement chat routes",
            "feat(api): add SSE streaming endpoint",
            "feat(api): implement session management in chat",
            "feat(api): add verification challenge generation",
            "feat(api): implement challenge validation with scoring",
            "feat(api): add behavioral entropy analysis",
            "feat(api): implement timing score computation",
            "feat(api): add verification submission endpoint",
            "feat(api): implement learning topics API",
            "feat(api): add lesson completion tracking",
            "feat(api): implement quiz submission with feedback",
            "feat(api): add AI engine service",
            "feat(api): implement personality system in AI engine",
            "feat(api): add prompt chain construction",
            "feat(api): implement interaction classification",
            "feat(api): add fallback response generation",
            "feat(api): implement Solana service",
            "feat(api): add transaction preparation helpers",
            "feat(api): implement on-chain status queries",
            "fix(api): correct auth token parsing",
            "refactor(api): extract route handlers",
            "feat(api): add health check endpoint",
            "fix(api): handle expired challenge cleanup",
            "docs(api): add endpoint documentation",
            "chore(api): configure error handling middleware",
            "feat(api): add streak tracking in learn routes",
        ],
    },
    "phase6_python_sdk": {
        "start": datetime(2026, 1, 21),
        "end": datetime(2026, 2, 5),
        "files": [
            "sdk-python/setup.py",
            "sdk-python/yourfun/__init__.py",
            "sdk-python/yourfun/types.py",
            "sdk-python/yourfun/client.py",
            "sdk-python/yourfun/proof.py",
            "sdk-python/yourfun/ai.py",
            "sdk-python/yourfun/solana.py",
        ],
        "messages": [
            "feat(python): init Python SDK package",
            "feat(python): define data classes for on-chain types",
            "feat(python): implement async YourFunClient",
            "feat(python): add wallet signature auth in client",
            "feat(python): implement verification flow",
            "feat(python): add chat and streaming methods",
            "feat(python): implement ProofGenerator",
            "feat(python): add behavioral event recording",
            "feat(python): implement fingerprint hash generation",
            "feat(python): add challenge solver matching Rust",
            "feat(python): implement AICompanion class",
            "feat(python): add personality prompt system",
            "feat(python): implement SolanaClient with PDAs",
            "feat(python): add transaction builders",
            "feat(python): implement account readers",
            "fix(python): correct struct packing for metrics",
            "refactor(python): extract helper methods",
            "feat(python): add learning progress endpoint",
            "chore(python): update setup.py metadata",
            "docs(python): add docstrings to public API",
        ],
    },
    "phase7_docs": {
        "start": datetime(2026, 2, 6),
        "end": datetime(2026, 2, 10),
        "files": [
            "README.md",
            "LICENSE",
            "profile/README.md",
        ],
        "messages": [
            "docs: add banner and badges to README",
            "docs: write architecture overview",
            "docs: add Mermaid sequence diagram for verification",
            "docs: write installation instructions",
            "docs: add TypeScript usage examples",
            "docs: add Python usage examples",
            "docs: write project structure section",
            "docs: add on-chain account model documentation",
            "docs: write API endpoint reference",
            "docs: add companion personality descriptions",
            "docs: create GitHub profile README",
            "chore: add MIT LICENSE",
            "docs: fix diagram formatting",
            "docs: add streaming chat examples",
            "docs: final README polish",
        ],
    },
}

FILLER_MESSAGES = [
    "refactor: clean up unused imports",
    "chore: run formatter",
    "fix: typo in comment",
    "refactor: rename variable for clarity",
    "chore: update .gitignore",
    "fix: edge case in deserialization",
    "chore: bump dependency version",
    "refactor: simplify conditional logic",
    "fix: null check in error handler",
    "chore: remove debug logging",
    "refactor: extract utility function",
    "fix: off-by-one in buffer offset",
    "chore: add type annotations",
    "refactor: consolidate duplicate code",
    "fix: handle empty response gracefully",
    "chore: configure lint rules",
    "refactor: improve error messaging",
    "fix: race condition in async handler",
    "chore: update tsconfig target",
    "refactor: move constants to separate file",
    "fix: memory leak in event listener",
    "chore: reorganize module structure",
    "refactor: use enum instead of magic numbers",
    "fix: incorrect buffer length assertion",
    "chore: add missing exports",
    "refactor: simplify PDA derivation",
    "fix: handle network timeout gracefully",
    "chore: update README badge links",
    "refactor: reduce function complexity",
    "fix: correct timestamp conversion",
]


def run_git(args: list[str], env: dict | None = None) -> None:
    full_env = os.environ.copy()
    if env:
        full_env.update(env)
    subprocess.run(
        ["git"] + args,
        env=full_env,
        check=True,
        capture_output=True,
        text=True,
    )


def set_git_config() -> None:
    run_git(["config", "user.name", AUTHOR_NAME])
    run_git(["config", "user.email", AUTHOR_EMAIL])


def make_commit(message: str, date: datetime, files: list[str]) -> None:
    date_str = date.strftime("%Y-%m-%dT%H:%M:%S")
    env = {
        "GIT_AUTHOR_DATE": date_str,
        "GIT_COMMITTER_DATE": date_str,
        "GIT_AUTHOR_NAME": AUTHOR_NAME,
        "GIT_AUTHOR_EMAIL": AUTHOR_EMAIL,
        "GIT_COMMITTER_NAME": AUTHOR_NAME,
        "GIT_COMMITTER_EMAIL": AUTHOR_EMAIL,
    }

    for f in files:
        if os.path.exists(f):
            run_git(["add", f], env)

    try:
        run_git(["diff", "--cached", "--quiet"])
        run_git(["commit", "--allow-empty", "-m", message], env)
    except subprocess.CalledProcessError:
        run_git(["commit", "-m", message], env)


def is_weekend(dt: datetime) -> bool:
    return dt.weekday() >= 5


def generate_daily_commit_count(dt: datetime) -> int:
    if is_weekend(dt):
        return random.choice([0, 0, 0, 0, 1])

    hour = dt.hour
    if 10 <= hour <= 18:
        return random.choices(
            [0, 1, 2, 3, 4, 5],
            weights=[5, 15, 30, 25, 15, 10],
            k=1,
        )[0]
    return random.choice([0, 0, 1])


def generate_commit_time(base_date: datetime) -> datetime:
    if random.random() < 0.15:
        hour = random.choices(
            [22, 23, 0, 1],
            weights=[40, 30, 20, 10],
            k=1,
        )[0]
    else:
        hour = random.choices(
            range(9, 22),
            weights=[5, 10, 15, 15, 12, 10, 8, 8, 7, 5, 3, 1, 1],
            k=1,
        )[0]

    minute = random.randint(0, 59)
    second = random.randint(0, 59)

    return base_date.replace(hour=hour, minute=minute, second=second)


def get_phase_for_date(dt: datetime) -> tuple[str, dict] | None:
    for phase_name, phase_data in FILES_BY_PHASE.items():
        if phase_data["start"] <= dt <= phase_data["end"]:
            return phase_name, phase_data
    return None


def generate_schedule() -> list[tuple[datetime, str, list[str]]]:
    schedule = []
    current = START_DATE

    phase_message_indices: dict[str, int] = {}
    filler_index = 0

    while current <= END_DATE:
        if should_take_break(current):
            current += timedelta(days=random.randint(2, 5))
            continue

        daily_count = generate_daily_commit_count(current)
        phase_info = get_phase_for_date(current)

        for _ in range(daily_count):
            commit_time = generate_commit_time(current)

            if phase_info:
                phase_name, phase_data = phase_info
                if phase_name not in phase_message_indices:
                    phase_message_indices[phase_name] = 0

                idx = phase_message_indices[phase_name]
                msgs = phase_data["messages"]
                files = phase_data["files"]

                if idx < len(msgs):
                    message = msgs[idx]
                    phase_message_indices[phase_name] = idx + 1
                    commit_files = random.sample(
                        files, min(random.randint(1, 3), len(files))
                    )
                else:
                    message = FILLER_MESSAGES[filler_index % len(FILLER_MESSAGES)]
                    filler_index += 1
                    commit_files = random.sample(
                        files, min(random.randint(1, 2), len(files))
                    )
            else:
                message = FILLER_MESSAGES[filler_index % len(FILLER_MESSAGES)]
                filler_index += 1
                commit_files = ["README.md"]

            schedule.append((commit_time, message, commit_files))

        current += timedelta(days=1)

    return schedule


def should_take_break(dt: datetime) -> bool:
    month_day = (dt.month, dt.day)
    break_periods = [
        ((7, 20), (7, 27)),
        ((11, 24), (11, 30)),
        ((12, 24), (12, 31)),
    ]

    for start, end in break_periods:
        if start <= month_day <= end:
            return True

    return random.random() < 0.03


def make_file_modification(filepath: str) -> None:
    if not os.path.exists(filepath):
        return

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    lines = content.split("\n")
    if len(lines) < 3:
        return

    modifications = [
        lambda ls: add_comment(ls, filepath),
        lambda ls: adjust_whitespace(ls),
        lambda ls: add_blank_line(ls),
    ]

    mod_func = random.choice(modifications)
    modified_lines = mod_func(lines)

    with open(filepath, "w", encoding="utf-8") as f:
        f.write("\n".join(modified_lines))


def add_comment(lines: list[str], filepath: str) -> list[str]:
    ext = os.path.splitext(filepath)[1]
    comments = {
        ".rs": "// Updated: minor adjustment",
        ".ts": "// Updated: minor adjustment",
        ".py": "# Updated: minor adjustment",
        ".md": "",
    }

    comment = comments.get(ext, "")
    if not comment:
        return lines

    insert_pos = random.randint(1, max(1, len(lines) - 2))

    for i, line in enumerate(lines):
        if line.strip() == comment.strip():
            lines.pop(i)
            break

    lines.insert(insert_pos, comment)
    return lines


def adjust_whitespace(lines: list[str]) -> list[str]:
    for i in range(len(lines)):
        if lines[i].strip() == "" and i > 0 and i < len(lines) - 1:
            continue
        if lines[i].endswith("  "):
            lines[i] = lines[i].rstrip() + " "
            break
        elif lines[i].endswith(" "):
            lines[i] = lines[i].rstrip()
            break
    return lines


def add_blank_line(lines: list[str]) -> list[str]:
    blankcount = sum(1 for l in lines if l.strip() == "")
    if blankcount > len(lines) * 0.3:
        for i in range(len(lines) - 1, 0, -1):
            if lines[i].strip() == "" and lines[i - 1].strip() == "":
                lines.pop(i)
                break
    else:
        pos = random.randint(1, max(1, len(lines) - 2))
        lines.insert(pos, "")
    return lines


def main() -> None:
    print("Configuring git identity...")
    set_git_config()

    print("Generating commit schedule...")
    schedule = generate_schedule()

    if len(schedule) < TARGET_COMMITS:
        deficit = TARGET_COMMITS - len(schedule)
        print(f"Adding {deficit} filler commits to reach target...")
        for _ in range(deficit):
            rand_date = START_DATE + timedelta(
                days=random.randint(0, (END_DATE - START_DATE).days)
            )
            while is_weekend(rand_date) and random.random() < 0.7:
                rand_date += timedelta(days=1)

            commit_time = generate_commit_time(rand_date)
            phase_info = get_phase_for_date(rand_date)
            files = phase_info[1]["files"] if phase_info else ["README.md"]
            message = random.choice(FILLER_MESSAGES)

            schedule.append((
                commit_time,
                message,
                random.sample(files, min(1, len(files))),
            ))

    schedule.sort(key=lambda x: x[0])

    print(f"Executing {len(schedule)} commits...")

    last_15_start = max(0, len(schedule) - 15)

    for i, (commit_time, message, files) in enumerate(schedule):
        if i >= last_15_start:
            for f in files:
                make_file_modification(f)

        make_commit(message, commit_time, files)

        if (i + 1) % 50 == 0:
            print(f"  Progress: {i + 1}/{len(schedule)} commits")

    print(f"\nDone! Created {len(schedule)} commits.")
    print(f"Date range: {schedule[0][0].strftime('%Y-%m-%d')} to {schedule[-1][0].strftime('%Y-%m-%d')}")
    print(f"\nRemember to delete this script before pushing!")


if __name__ == "__main__":
    main()
