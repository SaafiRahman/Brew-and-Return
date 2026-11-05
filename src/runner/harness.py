# Runs inside Pyodide. Loads the player's spell and calls its functions.
# Everything that crosses back to JavaScript is a JSON string.
import ast
import json
import traceback

FILENAME = "<your spell>"
_ns = None

STRING_METHODS = {"lower", "upper", "strip", "lstrip", "rstrip", "title", "replace", "split", "capitalize", "startswith", "endswith"}


class Order:
    """The order slip handed to serve(). Fields are read with a dot: order.potion"""

    def __init__(self, data):
        for key, value in data.items():
            object.__setattr__(self, key, value)

    def __repr__(self):
        inner = ", ".join(f"{k}={v!r}" for k, v in self.__dict__.items())
        return f"Order({inner})"


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
    if functions > 1:
        found.add("helper")
    return sorted(found)


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


def _to_json(value, depth=0):
    if value is None or isinstance(value, (bool, int, str)):
        return value
    if isinstance(value, float):
        return value if value == value and abs(value) != float("inf") else repr(value)
    if depth > 20:
        return {"__type__": type(value).__name__, "__repr__": "…"}
    if isinstance(value, (list, tuple)):
        return [_to_json(v, depth + 1) for v in value]
    if isinstance(value, dict):
        return {str(k): _to_json(v, depth + 1) for k, v in value.items()}
    kind = "function" if callable(value) and not isinstance(value, type) else type(value).__name__
    return {"__type__": kind, "__repr__": repr(value)[:200]}


def set_code(source):
    global _ns
    try:
        tree = ast.parse(source, FILENAME)
        ns = {"__name__": "__spell__", "Order": Order}
        exec(compile(tree, FILENAME, "exec"), ns)
    except BaseException as e:
        return json.dumps({"ok": False, **_error(e)})
    if not callable(ns.get("serve")):
        return json.dumps({"ok": False, "errorType": "MissingServe", "message": "", "line": None, "traceback": ""})
    _ns = ns
    return json.dumps({"ok": True, "features": _features(tree)})


def call(fn_name, arg_json):
    if _ns is None or not callable(_ns.get(fn_name)):
        return json.dumps({"kind": "error", "errorType": "MissingServe", "message": "", "line": None, "traceback": ""})
    try:
        result = _ns[fn_name](Order(json.loads(arg_json)))
    except BaseException as e:
        return json.dumps({"kind": "error", **_error(e)})
    return json.dumps({"kind": "ok", "value": _to_json(result)})
