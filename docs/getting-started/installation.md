---
sidebar_position: 1
---

# Installation

## Requirements

- Python **3.12** or higher
- A Milvus instance to connect to — a real server, or [Milvus Lite](https://milvus.io/docs/milvus_lite.md)
  (embedded, no server needed, bundled with `pymilvus` ≥ 2.4.2)

## Core package

The DBAPI is the only hard requirement. Install it on its own if you only need
`cursor.execute(...)` — a script, a notebook, a raw async client:

```bash
pip install milvusql
```

Or with `uv`:

```bash
uv add milvusql
```

This pulls in [`sqlglot-milvus`](https://github.com/Callix-Tools/sqlglot-milvus) (the MilvusQL
parser), `pymilvus`, and `polars` (the client-side relational engine used for `JOIN`/`GROUP
BY`/subqueries) — nothing else.

## SQLAlchemy

```bash
pip install milvusql-sqlalchemy
```

Installing it registers the `milvusql` dialect under SQLAlchemy's entry points — `create_engine("milvusql://...")`
works as soon as the package is importable, no explicit registration call needed.

## Django

```bash
pip install milvusql-django
```

Point `DATABASES["default"]["ENGINE"]` at `"milvusql_django"` (see [Django → Overview](../django/overview)).

## Everything

Each package depends on `milvusql`, so installing all three doesn't duplicate anything:

```bash
pip install milvusql-sqlalchemy milvusql-django
```

## A note on `sqlglot[c]`/`sqlglot[rs]`

`sqlglot-milvus` (and therefore `milvusql`) needs the pure-Python build of `sqlglot`. The
mypyc-compiled variants (`sqlglot[c]`, `sqlglot[rs]`) disable runtime subclassing of the classes
every third-party dialect is built on. `sqlglot-milvus` detects this at import time and raises
`ImportError` with the fix, rather than letting it fail confusingly deep inside `sqlglot` on your
first `parse_one()` call.
