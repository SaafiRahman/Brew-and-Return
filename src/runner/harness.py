# Runs inside Pyodide. Runs the player's spell top to bottom.
#
# The spell's commands (brew, serve, order, print) call `_shop.action`, a
# synchronous bridge provided by the host. In the browser it blocks the worker
# until the game has finished animating the action; in tests it runs the game
# simulation directly. Everything crossing the bridge is a JSON string.
import ast
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
    reply = json.loads(_shop.action(name, json.dumps(list(args)), _spell_line()))
    if reply.get("stop"):
        raise SpellStopped()
    if "error" in reply:
        raise ShopError(reply["error"])
    return reply.get("value")


def brew(potion):
    """Walk to the cauldron and brew a potion, e.g. brew("health potion")."""
    return _act("brew", potion)


def serve():
    """Walk to the counter and hand your potion to the customer. Waits for one if nobody is there."""
    return _act("serve")


def order():
    """Walk to the counter and find out what the customer wants, e.g. "mana potion"."""
    return _act("order")


def say(*things, sep=" ", end="\n", file=None, flush=False):
    """print() makes your apprentice say something."""
    words = []
    for t in things:
        words.append(t if isinstance(t, str) else repr(t))
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
    ns = {"__name__": "__spell__", "brew": brew, "serve": serve, "order": order, "print": say}
    try:
        exec(code, ns)
    except (SpellStopped, KeyboardInterrupt):
        return json.dumps({"kind": "stopped"})
    except BaseException as e:
        return json.dumps({"kind": "error", **_error(e)})
    return json.dumps({"kind": "finished"})
