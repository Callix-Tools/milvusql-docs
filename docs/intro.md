---
slug: /
sidebar_position: 1
---

# Introduction

**milvusql** is a [PEP 249](https://peps.python.org/pep-0249/) DBAPI for [Milvus](https://milvus.io) — sync
and async — with a SQLAlchemy 2.0 dialect and a Django database backend built on top of it.

## Why does this exist?

Milvus speaks gRPC, not SQL. There is no server-side SQL surface to connect a normal DBAPI to. So
`milvusql` builds one: it parses and generates a SQL-like language called **MilvusQL** (via
[`sqlglot-milvus`](https://github.com/Callix-Tools/sqlglot-milvus), a standalone `sqlglot` dialect),
and translates the resulting AST into [`pymilvus`](https://github.com/milvus-io/pymilvus) calls.

```
SQLAlchemy Core / Django ORM
      │  select(Item).order_by(Item.embedding.l2_distance(q)).limit(5)
      ▼
milvusql's SQLCompiler / SQL generation
      │  "SELECT id, category FROM items ORDER BY embedding <-> :q LIMIT 5"
      ▼
milvusql.dbapi.Cursor.execute(sql_text, params)   ← PEP 249
      │
      ▼
sqlglot.parse_one(sql_text, read="milvus")        ← sqlglot-milvus
      │  AST
      ▼
translate.ast_to_pymilvus.build_call(...)          ← milvusql core
      │
      ▼
pymilvus.MilvusClient.search(...) / .insert(...) / ...
```

A vector never becomes query text. It travels as a real bind value the whole way down — the same
reason [`pgvector.psycopg`](https://github.com/pgvector/pgvector-python) passes vectors as
parameters instead of formatting them into SQL.

## Three packages, one workspace

| Package | What it is | Depends on |
|---|---|---|
| [`milvusql`](./core/overview) | The DBAPI itself — `connect()`, `Cursor`, `AsyncCursor`, the PEP 249 error hierarchy | `sqlglot-milvus`, `pymilvus` |
| [`milvusql-sqlalchemy`](./sqlalchemy/overview) | A SQLAlchemy 2.0 dialect | `milvusql`, `sqlalchemy` |
| [`milvusql-django`](./django/overview) | A Django database backend | `milvusql`, `django` |

They're separately installable: a script that only needs `cursor.execute(...)` doesn't have to pull
in SQLAlchemy or Django to get it.

## Status

Early development. The DBAPI core and the SQLAlchemy dialect are exercised end-to-end against
Milvus Lite (create/load/insert/search/delete/release, DDL, reflection). The Django backend's
schema/migration layer is a first cut — see [Schema & Migrations](./django/schema-and-migrations)
for exactly what that does and doesn't cover yet.

## Next steps

- [Installation](./getting-started/installation) — install the package(s) you need
- [Quick Start](./getting-started/quick-start) — a working example against Milvus Lite in minutes
- [MilvusQL Concepts](./getting-started/concepts) — distance operators, bind parameters, clause order
