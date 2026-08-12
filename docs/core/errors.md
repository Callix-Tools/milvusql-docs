---
sidebar_position: 3
---

# Errors

`milvusql.dbapi.errors` owns the full [PEP 249](https://peps.python.org/pep-0249/) exception
hierarchy, and one function — `translate()` — mapping every upstream exception `milvusql` can hit
onto it. Both the sync `Cursor` and the async `aio` client call it at every boundary with
`pymilvus`/`sqlglot`, so the mapping lives once.

## Why this matters

SQLAlchemy and Django both inspect the *type* of whatever a DBAPI raises to decide things like "is
this connection dead, should the pool discard it." A foreign exception type (a bare
`pymilvus.exceptions.MilvusException`, a raw `grpc.RpcError`) defeats that — `translate()` is what
lets `milvusql-sqlalchemy` and `milvusql-django` get correct error handling for free, without
either package needing its own mapping.

## The hierarchy

```
Warning
Error
├── InterfaceError
└── DatabaseError
    ├── DataError
    ├── OperationalError
    ├── IntegrityError
    ├── InternalError
    ├── ProgrammingError
    └── NotSupportedError
```

All importable from `milvusql` directly: `milvusql.ProgrammingError`, `milvusql.OperationalError`,
etc.

## What maps to what

| Upstream | Mapped to | Why |
|---|---|---|
| `sqlglot.errors.ParseError` / `TokenError` | `ProgrammingError` | The MilvusQL text itself is wrong |
| `sqlglot.errors.UnsupportedError` | `NotSupportedError` | Well-formed, but Milvus (or MilvusQL) can't do it |
| `MilvusUnavailableException` / `ConnectError` | `OperationalError` | Not reachable right now, not a bad request |
| `CollectionNotExistException` / `IndexNotExistException` | `ProgrammingError` | The request names something that doesn't exist |
| a plain `MilvusException` with `code=100`/`ErrorCode.COLLECTION_NOT_FOUND` | `ProgrammingError` | The server reports "doesn't exist" this way too — confirmed directly, not just the typed subclass |
| a plain `MilvusException` mentioning "not loaded" | `ProgrammingError` | Searching an unloaded collection (no implicit `LOAD TABLE` — see [Overview](./overview)) |
| any other `MilvusException` | `DatabaseError` | Generic fallback |
| `grpc.RpcError` with `UNIMPLEMENTED` | `NotSupportedError` | Some RPCs aren't implemented on every server (Milvus Lite, notably) |
| `grpc.RpcError` with `UNAVAILABLE`/`DEADLINE_EXCEEDED` | `OperationalError` | Transport-level connectivity failure |

The last two rows exist because some failures happen at the gRPC transport layer *before* Milvus's
own `check_status()` ever runs — they surface as a bare `grpc.RpcError`, not a `MilvusException`, a
separate exception family `translate()` has to handle too.

## Catching errors

```python
import milvusql

try:
    cur.execute("SELECT id FROM does_not_exist LIMIT 1")
except milvusql.ProgrammingError as exc:
    print(f"bad query: {exc}")
```
