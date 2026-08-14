---
sidebar_position: 3
---

# Schema & Migrations

This is the part of `milvusql-django` most worth reading closely before relying on it — it's a
working first cut, not a finished implementation of Django's full migration surface.

## Why it's a hand-written `SchemaEditor`

`DatabaseSchemaEditor` deliberately does **not** inherit Django's base `table_sql`/`column_sql`/
`_alter_field` machinery. That machinery is built for databases with full `ALTER TABLE` and
deferred foreign-key constraint SQL — neither of which Milvus has. Milvus's real DDL surface
(MilvusQL's own grammar) is much smaller: `CREATE TABLE`, `ADD FIELD`, nothing else. Fighting the
generic machinery to produce that smaller surface was worse than hand-writing the column-list
builder it actually needs.

## What works

**`CreateModel`** — a model with scalar fields and one or more `VectorField`s:

```python
from django.db import connection

with connection.schema_editor() as editor:
    editor.create_model(Item)
```

A single-column primary key with `autoincrement=True` renders inline as `id BIGINT PRIMARY KEY
AUTO_INCREMENT` (Milvus requires `INT64` or `VARCHAR` primary keys — every `AutoField`/
`BigAutoField`/`SmallAutoField` maps to `BIGINT`, since Milvus has no `INT32` auto-increment option
to distinguish Django's Auto field size classes by).

**`AddField`** — maps to MilvusQL's `ALTER TABLE ... ADD FIELD`, the one `ALTER` operation Milvus
supports, **against a real Milvus server**. Milvus Lite's gRPC server does not implement
`AddCollectionField`, so `AddField` raises `NotSupportedError` when `DATABASES` points at a local
Milvus Lite file (the `NAME: "/path/to/items.db"` style config used elsewhere in these docs) — it
only works against an actual Milvus server (`HOST`/`PORT`).

## What deliberately raises

```python
editor.remove_field(Item, some_field)
# NotImplementedError: Milvus cannot drop a field from an existing
# collection -- the collection needs recreating.

editor.alter_field(Item, old_field, new_field)
# NotImplementedError: Milvus cannot change a field's type or a
# vector's dimension in place -- the collection needs recreating.
```

Fails loudly at migration time rather than silently producing a migration that doesn't match what
actually happened — the same philosophy `sqlglot-milvus` applies to `ALTER TABLE` at the SQL level.

## What `create_model` does *not* do

It does **not** automatically create a vector index or `LOAD` the collection. Milvus requires an
index before a collection is searchable, but the index method and metric (`HNSW` vs. `IVF_FLAT`,
`COSINE` vs. `L2`) are a query-shape decision, not something a generic schema migration should
guess at. Call this explicitly once the model is defined — in a data migration, or at app startup:

```python
from milvusql_django.schema import create_index_and_load

create_index_and_load(
    connection, Item._meta.db_table, "embedding",
    using="HNSW", metric_type="COSINE",
)
```

This is the single biggest open item in this package. It's flagged here rather than papered over
with a guessed default.

## Not implemented at all

`_create_test_db`/`_destroy_test_db` are no-ops — Django's test-runner database creation/teardown
flow assumes a SQL `CREATE DATABASE`/`DROP DATABASE` a "nodb" connection can issue. Milvus's closest
equivalent (`MilvusClient.create_database()`) is a client call, not SQL text, and wiring it up is
future work.
