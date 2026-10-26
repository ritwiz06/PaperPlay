"""
Trains PaperPlay's miniature transformer on "previous digit plus mirrored digit" (ADR-0057).

Run it from this folder:

    uv run python train.py              # train 20 seeds of each model, write results and weights
    uv run python train.py --seeds 3    # a quick look at three seeds, nothing written
    uv run python train.py --task minus --write   # another task, its own results and weights

The task: a sequence of 8 digits goes in; at each position i the answer is

    (the digit before i  +  the digit at the mirrored position, 7 - i)  mod 10

where "the digit before" position 0 wraps round to the last digit. Each answer needs two other
positions at once, so a model with two attention heads can give one head to "the previous
position" and the other to "the mirrored position". Whether its heads really do that is what this
script measures, over 20 seeds, rather than hoping one run shows it.

The model is one transformer block, as small as the task allows:

    digits -> embedding + positional encoding -> two-head self-attention (+ residual)
           -> a small feed-forward layer (+ residual) -> a readout to 10 digits

Its attention layer is exactly attention.toy's (packages/primitives/src/attention/primitive.ts), so
the TypeScript can run these weights and must agree with PyTorch (packages/primitives/test/).

Everything is deterministic: CPU only, float32, one thread, fixed seeds, and PyTorch asked to use
deterministic algorithms. The same command on the same machine gives the same weights, bit for bit.
"""

import warnings

# torch warns on import when numpy is absent; this script never needs numpy.
warnings.filterwarnings("ignore", message="Failed to initialize NumPy")

import argparse
import hashlib
import json
import math
import platform
import struct
import subprocess
import sys
from pathlib import Path

import torch
from torch import nn

# ---------------------------------------------------------------------------------------------
# The task
# ---------------------------------------------------------------------------------------------

LENGTH = 8  # digits in a sequence
VOCAB = 10  # the digits 0 to 9

# The task the answers come from (ADR-0057's amendment):
#   plus   (previous + mirrored) mod 10, the first, whose answer depends only on the two digits' sum
#   minus  (previous - mirrored) mod 10, whose answer depends on which digit is which
#   table  a fixed random table of answers, one for every (previous, mirrored) pair: order matters,
#          and there is no arithmetic shortcut
TASK = "plus"
TASKS = {
    "plus": "previous digit plus mirrored digit, mod 10",
    "minus": "previous digit minus mirrored digit, mod 10",
    "table": "a fixed random table of the previous and the mirrored digit",
}


def lookup_table() -> torch.Tensor:
    """The table task's answers, 10 by 10, the same for every seed, from their own generator."""
    return torch.randint(0, VOCAB, (VOCAB, VOCAB), generator=torch.Generator().manual_seed(7))


def previous_positions() -> list[int]:
    """For each position, the position before it: 0's is the last, 7."""
    return [(i - 1) % LENGTH for i in range(LENGTH)]


def mirrored_positions() -> list[int]:
    """For each position, its mirror: 0 <-> 7, 1 <-> 6, and so on."""
    return [LENGTH - 1 - i for i in range(LENGTH)]


def answers(digits: torch.Tensor) -> torch.Tensor:
    """The right answer at every position, for a batch of sequences shaped (batch, LENGTH)."""
    previous = digits[:, previous_positions()]  # pick, for each position, the digit before it
    mirrored = digits[:, mirrored_positions()]  # and the digit at its mirror
    if TASK == "minus":
        return (previous - mirrored) % VOCAB  # torch's % keeps the result in 0 to 9, as Python's does
    if TASK == "table":
        return lookup_table()[previous, mirrored]
    return (previous + mirrored) % VOCAB


def codes(digits: torch.Tensor) -> torch.Tensor:
    """Each sequence as one number, its digits read in base 10, so sets of sequences compare fast (up to 18 digits)."""
    weights = torch.tensor([10**p for p in range(LENGTH - 1, -1, -1)], dtype=torch.int64)
    return (digits * weights).sum(dim=1)


# ---------------------------------------------------------------------------------------------
# The model
# ---------------------------------------------------------------------------------------------


def sinusoidal_encoding(length: int, d_model: int) -> torch.Tensor:
    """
    The positional encoding of "Attention Is All You Need", section 3.5, as attention.toy computes
    it: for position p and feature index f, with pair = f // 2,
        angle = p * exp(-(2 * pair / d_model) * ln 10000)
        feature f is sin(angle) when f is even, cos(angle) when it is odd.
    Computed in float64, then stored as float32 like every other weight.
    """
    table = torch.zeros(length, d_model, dtype=torch.float64)
    for p in range(length):
        for f in range(d_model):
            angle = p * math.exp(-(2 * (f // 2) / d_model) * math.log(10000))
            table[p, f] = math.sin(angle) if f % 2 == 0 else math.cos(angle)
    return table.float()


class Miniature(nn.Module):
    """One transformer block. Every layer is an nn.Linear, so its weights are plain matrices."""

    def __init__(self, d_model: int, heads: int, d_ff: int):
        super().__init__()
        assert d_model % heads == 0, "the heads must share the width evenly"
        self.heads = heads
        self.d_k = d_model // heads  # each head's width
        self.embedding = nn.Embedding(VOCAB, d_model)  # one learned vector per digit
        # Queries, keys and values for all heads at once, side by side: head h owns features
        # h * d_k to (h + 1) * d_k. No biases, as attention.toy has none.
        self.query = nn.Linear(d_model, d_model, bias=False)
        self.key = nn.Linear(d_model, d_model, bias=False)
        self.value = nn.Linear(d_model, d_model, bias=False)
        self.out = nn.Linear(d_model, d_model, bias=False)  # joins the heads back together
        self.ff1 = nn.Linear(d_model, d_ff)  # the feed-forward layer: up, ReLU, down
        self.ff2 = nn.Linear(d_ff, d_model)
        self.readout = nn.Linear(d_model, VOCAB)  # a score for each digit
        # A buffer is saved with the model but never trained: the encoding is fixed.
        self.register_buffer("positions", sinusoidal_encoding(LENGTH, d_model))

    def forward(self, digits: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """Scores for each digit at each position, shaped (batch, LENGTH, VOCAB), and the attention weights (batch, heads, LENGTH, LENGTH)."""
        x = self.embedding(digits) + self.positions  # (batch, LENGTH, d_model)
        batch = x.shape[0]

        def split(t: torch.Tensor) -> torch.Tensor:
            # (batch, LENGTH, d_model) -> (batch, heads, LENGTH, d_k): one slice per head
            return t.view(batch, LENGTH, self.heads, self.d_k).transpose(1, 2)

        q, k, v = split(self.query(x)), split(self.key(x)), split(self.value(x))
        # Scaled dot-product attention, section 3.2.1: each query's dot product with every key,
        # divided by sqrt(d_k), then a softmax across the keys gives each row's weights.
        logits = q @ k.transpose(-1, -2) / math.sqrt(self.d_k)
        weights = logits.softmax(dim=-1)
        mixed = weights @ v  # each position's weighted mix of the values, per head
        joined = mixed.transpose(1, 2).reshape(batch, LENGTH, -1)  # the heads side by side again
        h = x + self.out(joined)  # a residual connection keeps the token's own vector
        h = h + self.ff2(torch.relu(self.ff1(h)))  # the feed-forward layer, also residual
        return self.readout(h), weights


# ---------------------------------------------------------------------------------------------
# Training and measuring one seed
# ---------------------------------------------------------------------------------------------

HELD_OUT = 2000  # sequences never trained on, for accuracy and for the cross-check
STEPS = 8000
BATCH = 256
LEARNING_RATE = 3e-3
D_MODEL = 16
D_FF = 64
# Heads "split the work" (ADR-0057's amendment) when one head's attention on the previous position
# is at least DOMINANT times its attention on the mirror, and another head's the reverse: what a
# learner sees as two beams going different ways.
DOMINANT = 2.0
# Two heads "beat" one when their held-out accuracy is at least this much higher, on the same seed.
BEATS = 0.10


def configure(d_model: int, d_ff: int, steps: int, task: str = "plus", length: int = 8) -> None:
    """Sets the sizes and the task a run uses, for trying others from the command line."""
    global D_MODEL, D_FF, STEPS, TASK, LENGTH
    D_MODEL, D_FF, STEPS, TASK, LENGTH = d_model, d_ff, steps, task, length


def held_out_set() -> torch.Tensor:
    """The same 2000 sequences for every seed, from their own generator."""
    generator = torch.Generator().manual_seed(2026)
    return torch.randint(0, VOCAB, (HELD_OUT, LENGTH), generator=generator)


def train(seed: int, heads: int, held_out: torch.Tensor) -> Miniature:
    torch.manual_seed(seed)  # the starting weights come from this seed
    model = Miniature(D_MODEL, heads, D_FF)
    optimiser = torch.optim.Adam(model.parameters(), lr=LEARNING_RATE)
    data = torch.Generator().manual_seed(10_000 + seed)  # the training sequences, from their own seed
    # Sequences longer than 18 digits do not fit one number; among 10^19 or more, a training
    # sequence meeting a held-out one is as good as impossible, so they are not excluded.
    excluded = codes(held_out) if LENGTH <= 18 else None
    for _ in range(STEPS):
        digits = torch.randint(0, VOCAB, (BATCH, LENGTH), generator=data)
        if excluded is not None:
            digits = digits[~torch.isin(codes(digits), excluded)]  # never a held-out sequence
        scores, _ = model(digits)
        # Cross-entropy at every position: how surprised the model is by each right answer.
        loss = nn.functional.cross_entropy(scores.reshape(-1, VOCAB), answers(digits).reshape(-1))
        optimiser.zero_grad()
        loss.backward()
        optimiser.step()
    return model


@torch.no_grad()  # measuring needs no gradients
def measure(model: Miniature, held_out: torch.Tensor) -> dict:
    scores, weights = model(held_out)
    accuracy = (scores.argmax(dim=-1) == answers(held_out)).float().mean().item()
    # Attention mass on the previous and the mirrored position, per head, averaged over the
    # positions where those two differ (in 8 digits, at 0 and 4 they are the same position).
    previous, mirrored = previous_positions(), mirrored_positions()
    rows = [i for i in range(LENGTH) if previous[i] != mirrored[i]]
    mass = []
    for head in range(model.heads):
        on_previous = sum(weights[:, head, i, previous[i]].mean().item() for i in rows) / len(rows)
        on_mirrored = sum(weights[:, head, i, mirrored[i]].mean().item() for i in rows) / len(rows)
        mass.append({"previous": round(on_previous, 4), "mirrored": round(on_mirrored, 4)})
    # Split: some head looks at the previous position at least twice as much as at the mirror,
    # and another head the reverse.
    specialised = any(
        a["previous"] >= DOMINANT * a["mirrored"] and b["mirrored"] >= DOMINANT * b["previous"] for i, a in enumerate(mass) for j, b in enumerate(mass) if i != j
    )
    return {"accuracy": round(accuracy, 4), "heads": mass, "specialised": specialised}


# ---------------------------------------------------------------------------------------------
# Exporting weights for the TypeScript
# ---------------------------------------------------------------------------------------------


def tensors_for_typescript(model: Miniature) -> list[tuple[str, torch.Tensor]]:
    """
    Every weight, in attention.toy's layout, where a layer multiplies rows by a matrix on the right
    (x @ W). nn.Linear stores W transposed (x @ W.T), so each is transposed here; head h's query,
    key and value matrices are the d_k columns it owns.
    """
    d_k = model.d_k
    out = [("embedding", model.embedding.weight)]
    for h in range(model.heads):
        for name, layer in (("q", model.query), ("k", model.key), ("v", model.value)):
            out.append((f"head{h}.{name}", layer.weight[h * d_k : (h + 1) * d_k, :].T))
    out += [
        ("out", model.out.weight.T),
        ("ff1", model.ff1.weight.T),
        ("ff1.bias", model.ff1.bias),
        ("ff2", model.ff2.weight.T),
        ("ff2.bias", model.ff2.bias),
        ("readout", model.readout.weight.T),
        ("readout.bias", model.readout.bias),
    ]
    return [(name, tensor.detach().contiguous().float()) for name, tensor in out]


def export(model: Miniature, folder: Path, manifest: dict) -> None:
    """weights.bin: every tensor as little-endian float32, one after another; manifest.json: where each starts, its shape, and the file's sha256."""
    folder.mkdir(parents=True, exist_ok=True)
    blob = bytearray()
    entries = []
    for name, tensor in tensors_for_typescript(model):
        values = tensor.reshape(-1).tolist()
        entries.append({"name": name, "shape": list(tensor.shape), "offset": len(blob), "count": len(values)})
        blob += struct.pack(f"<{len(values)}f", *values)
    (folder / "weights.bin").write_bytes(bytes(blob))
    manifest = {**manifest, "dtype": "float32", "byteOrder": "little", "bytes": len(blob), "sha256": hashlib.sha256(blob).hexdigest(), "tensors": entries}
    (folder / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


@torch.no_grad()
def cross_check(model: Miniature, held_out: torch.Tensor, count: int) -> dict:
    """PyTorch's own outputs on held-out sequences, for the TypeScript to match."""
    digits = held_out[:count]
    scores, weights = model(digits)
    return {
        "inputs": digits.tolist(),
        "weights": weights.tolist(),  # (count, heads, LENGTH, LENGTH)
        "scores": scores.tolist(),  # (count, LENGTH, VOCAB)
        "predictions": scores.argmax(dim=-1).tolist(),
    }


# ---------------------------------------------------------------------------------------------
# The run: 20 seeds of each model, a table, and the chosen seeds' weights
# ---------------------------------------------------------------------------------------------


def git_commit() -> str:
    """The commit the script ran at, with "+changes" when the tree was not clean."""
    root = Path(__file__).resolve().parent.parent
    commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=root, capture_output=True, text=True).stdout.strip()
    # Only the run's inputs count: its own outputs, results.json and the weights, are written before this is read.
    dirty = subprocess.run(["git", "status", "--porcelain", "--", "training/train.py", "training/pyproject.toml", "training/uv.lock"], cwd=root, capture_output=True, text=True).stdout.strip()
    return commit + ("+changes" if dirty else "")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--seeds", type=int, default=20, help="how many seeds of each model to train")
    # For trying other sizes; the weights are written only with the defaults and 20 seeds.
    parser.add_argument("--d-model", type=int, default=D_MODEL, help="each digit's vector width")
    parser.add_argument("--d-ff", type=int, default=D_FF, help="the feed-forward layer's width")
    parser.add_argument("--steps", type=int, default=STEPS, help="training steps")
    parser.add_argument("--task", choices=sorted(TASKS), default="plus", help="the task the answers come from")
    parser.add_argument("--length", type=int, default=8, help="digits in a sequence")
    parser.add_argument("--write", action="store_true", help="write this task's results and weights (the plus task's are written by default)")
    args = parser.parse_args()
    configure(args.d_model, args.d_ff, args.steps, args.task, args.length)

    torch.use_deterministic_algorithms(True)  # refuse any operation that is not reproducible
    torch.set_num_threads(1)  # one thread: sums always added in the same order

    held_out = held_out_set()
    seeds = list(range(1, args.seeds + 1))
    results = {}
    models = {}
    results = {2: [], 1: []}
    # Seed by seed, two heads then one: each seed's gap between them is a paired comparison.
    for seed in seeds:
        for heads in (2, 1):
            model = train(seed, heads, held_out)
            row = {"seed": seed, **measure(model, held_out)}
            print(f"{heads} head(s), seed {seed:2d}: accuracy {row['accuracy']:.4f}, " + "; ".join(f"head {h + 1} previous {m['previous']:.2f} mirrored {m['mirrored']:.2f}" for h, m in enumerate(row["heads"])) + (", split" if heads == 2 and row["specialised"] else ""), flush=True)
            results[heads].append(row)
            models[(heads, seed)] = model
    beats = [two["seed"] for two, one in zip(results[2], results[1]) if two["accuracy"] - one["accuracy"] >= BEATS]
    print(f"{TASK}, {LENGTH} digits: two heads beat one by {BEATS * 100:.0f} points or more on {len(beats)} of {len(seeds)} seeds; the heads split the work on {sum(row['specialised'] for row in results[2])} of {len(seeds)}", flush=True)

    # The rule (ADR-0057): of the two-head seeds whose heads specialised, the most accurate on the
    # held-out set, the lowest seed on a tie. The one-head model, the What-if's, is the most accurate.
    specialised = [row for row in results[2] if row["specialised"]]
    chosen_two = min(specialised or results[2], key=lambda row: (-row["accuracy"], row["seed"]))
    chosen_one = min(results[1], key=lambda row: (-row["accuracy"], row["seed"]))
    print(f"specialised: {len(specialised)} of {len(seeds)}; chosen: two heads, seed {chosen_two['seed']}; one head, seed {chosen_one['seed']}")
    default = (args.task, args.length) == ("plus", 8)
    # The plus task's weights are written with its settings alone; another task's when asked, at its own steps.
    if args.seeds != 20 or (args.d_model, args.d_ff) != (16, 64) or not ((default and args.steps == 8000) or args.write):
        print("a quick look: nothing written")
        return

    here = Path(__file__).resolve().parent
    suffix = "" if default else f"-{TASK}" + ("" if LENGTH == 8 else f"-{LENGTH}")
    (here / f"results{suffix}.json").write_text(json.dumps({"task": TASK, "length": LENGTH, "seeds": seeds, "dominant": DOMINANT, "beats": BEATS, "twoHeads": results[2], "oneHead": results[1], "split": len(specialised), "twoBeatOne": beats, "chosen": {"twoHeads": chosen_two["seed"], "oneHead": chosen_one["seed"]}}, indent=2) + "\n")
    common = {
        "schemaVersion": "weights/1",
        "task": f"{TASKS[TASK]}, over {LENGTH} digits",
        "architecture": {"vocab": VOCAB, "length": LENGTH, "dModel": D_MODEL, "dFF": D_FF, "positional": "sinusoidal", "scaled": True, "residual": True},
        "training": {
            "command": "cd training && uv run python train.py" + ("" if default else f" --task {TASK}" + ("" if LENGTH == 8 else f" --length {LENGTH}") + ("" if STEPS == 8000 else f" --steps {STEPS}") + " --write"),
            "commit": git_commit(),
            "torch": torch.__version__,
            "python": platform.python_version(),
            "platform": f"{platform.system()} {platform.machine()}",
            "steps": STEPS,
            "batch": BATCH,
            "learningRate": LEARNING_RATE,
            "heldOut": HELD_OUT,
        },
    }
    weights_root = here.parent / "fixtures" / "weights"
    two_rule = (
        f"of the {len(specialised)} seeds of {len(seeds)} whose heads split the work, the most accurate on the held-out set, the lowest seed on a tie"
        if specialised
        else f"no seed of {len(seeds)} split the work, so the most accurate of them all on the held-out set, the lowest seed on a tie"
    )
    for heads, chosen, rule in ((2, chosen_two, two_rule), (1, chosen_one, f"of {len(seeds)} seeds, the most accurate on the held-out set, the lowest seed on a tie")):
        model = models[(heads, chosen["seed"])]
        name = f"miniature{suffix}-{heads}-head{'s' if heads > 1 else ''}"
        manifest = {**common, "name": name, **({"table": lookup_table().tolist()} if TASK == "table" else {}), "architecture": {**common["architecture"], "heads": heads}, "training": {**common["training"], "seed": chosen["seed"]}, "selection": {"rule": rule, "specialised": f"{len(specialised)} of {len(seeds)}" if heads == 2 else None}, "metrics": chosen}
        export(model, weights_root / name, manifest)
        (weights_root / name / "check.json").write_text(json.dumps(cross_check(model, held_out, 20)) + "\n")
        print(f"wrote fixtures/weights/{name}/")


if __name__ == "__main__":
    sys.exit(main())
