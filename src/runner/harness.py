# Runs inside Pyodide. Runs the player's spell top to bottom.
#
# The spell's commands (brew, serve, order, print) call `_shop.action`, a
# synchronous bridge provided by the host. In the browser it blocks the worker
# until the game has finished animating the action; in tests it runs the game
# simulation directly. Everything crossing the bridge is a JSON string.
import ast
import difflib
import json
import sys
import traceback

import _shop

FILENAME = "<your spell>"

STRING_METHODS = {"lower", "upper", "strip", "lstrip", "rstrip", "title", "replace", "split", "capitalize", "startswith", "endswith"}


class ShopError(Exception):
    """A command the shop couldn't carry out (unknown potion, missing recipe…)."""


class SpellStopped(BaseException):
    """The player pressed Stop. BaseException so a bare `except:` can't swallow it… mostly."""


class _PotionKind:
    """One kind of potion, e.g. Potion.health."""

    __slots__ = ("id",)

    def __init__(self, id):
        object.__setattr__(self, "id", id)

    def __repr__(self):
        return f"Potion.{self.id}"

    __str__ = __repr__

    def __eq__(self, other):
        return isinstance(other, _PotionKind) and other.id == self.id

    def __hash__(self):
        return hash(("Potion", self.id))

    def __setattr__(self, name, value):
        raise ShopError("Potions can't be changed.")


POTION_IDS = ["health", "mana"]


class _PotionList:
    """Every potion in the world. Write Potion.health, Potion.mana, …"""

    def __init__(self):
        for pid in POTION_IDS:
            object.__setattr__(self, pid, _PotionKind(pid))

    def __getattr__(self, name):
        close = difflib.get_close_matches(name.lower(), POTION_IDS, n=1, cutoff=0.6)
        hint = f" Did you mean Potion.{close[0]}?" if close else " Potions you can name: " + ", ".join(f"Potion.{p}" for p in POTION_IDS) + "."
        raise ShopError(f"There's no potion called Potion.{name}.{hint}")

    def __setattr__(self, name, value):
        raise ShopError("The Potion list can't be changed.")

    def __repr__(self):
        return "Potion"

    def __iter__(self):
        return iter([getattr(self, p) for p in POTION_IDS])


Potion = _PotionList()


def _to_wire(value):
    """Python value → JSON-able data for the game."""
    if isinstance(value, _PotionKind):
        return {"potion": value.id}
    if isinstance(value, (list, tuple)):
        return [_to_wire(v) for v in value]
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    return {"type": type(value).__name__}


def _from_wire(value):
    """Game data → Python value (potions come back as Potion.x)."""
    if isinstance(value, dict) and set(value) == {"potion"}:
        return getattr(Potion, value["potion"])
    if isinstance(value, list):
        return [_from_wire(v) for v in value]
    return value


def _features(tree):
    found = set()
    functions = 0
    for node in ast.walk(tree):
        if isinstance(node, ast.If):
            found.add("if")
        elif isinstance(node, (ast.Dict, ast.DictComp)):
            found.add("dict")
        elif isinstance(node, (ast.List, ast.ListComp)):
            found.add("list")
        elif isinstance(node, ast.For):
            found.add("for")
        elif isinstance(node, ast.While):
            found.add("while")
        elif isinstance(node, ast.JoinedStr):
            found.add("fstring")
        elif isinstance(node, (ast.FunctionDef, ast.Lambda)):
            functions += 1
        elif isinstance(node, (ast.Assign, ast.AugAssign, ast.AnnAssign)):
            found.add("variable")
        elif isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr in STRING_METHODS:
            found.add("method")
    if functions >= 1:
        found.add("helper")
    return sorted(found)


def _spell_line():
    """Line of the player's spell that is running right now."""
    frame = sys._getframe(1)
    while frame is not None:
        if frame.f_code.co_filename == FILENAME:
            return frame.f_lineno
        frame = frame.f_back
    return 0


def _act(name, *args):
    reply = json.loads(_shop.action(name, json.dumps(_to_wire(list(args))), _spell_line()))
    if reply.get("stop"):
        raise SpellStopped()
    if "error" in reply:
        raise ShopError(reply["error"])
    return _from_wire(reply.get("value"))


def brew(potion):
    """Walk to the cauldron and brew a potion, e.g. brew(Potion.health)."""
    return _act("brew", potion)


def serve():
    """Walk to the counter and hand your potion to the customer. Waits for one if nobody is there."""
    return _act("serve")


def order():
    """Walk to the counter and find out which potion the customer wants, e.g. Potion.mana."""
    return _act("order")


def say(*things, sep=" ", end="\n", file=None, flush=False):
    """print() makes your apprentice say something."""
    words = [str(t) for t in things]
    return _act("say", sep.join(words))


def _error(e):
    line = None
    if isinstance(e, SyntaxError) and e.filename == FILENAME:
        line = e.lineno
    frames = [f for f in traceback.extract_tb(e.__traceback__) if f.filename == FILENAME]
    if frames:
        line = frames[-1].lineno
    te = traceback.TracebackException(type(e), e, e.__traceback__)
    te.stack = traceback.StackSummary.from_list(frames)
    text = "".join(te.format()) if frames else "".join(te.format_exception_only())
    message = e.msg if isinstance(e, SyntaxError) else str(e)
    return {"errorType": type(e).__name__, "message": message, "line": line, "traceback": text}


def run_spell(source):
    """Run a whole spell. Returns a JSON outcome: finished, stopped or error."""
    try:
        tree = ast.parse(source, FILENAME)
        code = compile(tree, FILENAME, "exec")
    except SyntaxError as e:
        return json.dumps({"kind": "error", **_error(e)})

    _shop.loaded(json.dumps(_features(tree)))
    ns = {"__name__": "__spell__", "brew": brew, "serve": serve, "order": order, "print": say, "Potion": Potion}
    try:
        exec(code, ns)
    except (SpellStopped, KeyboardInterrupt):
        return json.dumps({"kind": "stopped"})
    except BaseException as e:
        return json.dumps({"kind": "error", **_error(e)})
    return json.dumps({"kind": "finished"})
