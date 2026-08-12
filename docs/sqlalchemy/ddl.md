---
sidebar_position: 3
---

# DDL

MilvusQL's `CREATE TABLE ... WITH (...)` and `CREATE INDEX ... USING <method> WITH (...)` have no
base-SQL equivalent, so they're exposed through SQLAlchemy's standard mechanism for
dialect-specific DDL options — the same `<dialect>_<option>` prefixed-kwarg pattern
`mysql_engine=...` uses.

## Table options

```python
from sqlalchemy import Table, Column, BigInteger, String

items = Table(
    "items", metadata,
    Column("id", BigInteger, primary_key=True, autoincrement=True),
    Column("category", String(64)),
    milvusql_shards=1,
    milvusql_consistency_level="Bounded",
    milvusql_partition_key="category",
)
```

Renders `WITH (shards=1, consistency_level='Bounded', partition_key=category)` on `CREATE TABLE`.

A single-column primary key with `autoincrement=True` renders inline as `PRIMARY KEY AUTO_INCREMENT`
— not as a separate trailing `PRIMARY KEY (id)` constraint, which is what SQLAlchemy's base DDL
compiler emits by default and MilvusQL's grammar doesn't parse the same way for `AUTO_INCREMENT`
detection. Milvus only ever has one primary key column, so this is unconditional, not configurable.

## Index options

```python
from sqlalchemy import Index

Index(
    "idx_emb", items.c.embedding,
    milvusql_using="HNSW",
    milvusql_with={"metric_type": "COSINE", "M": 16, "ef_construction": 200},
)
```

Renders `CREATE INDEX idx_emb ON items (embedding) USING HNSW WITH (metric_type='COSINE', M=16, ef_construction=200)`.

String values in `WITH (...)` are single-quoted — MilvusQL follows ANSI SQL here, where `"..."`
means a quoted *identifier* and `'...'` means a string literal. (A double-quoted value in a
property parses as `exp.Var`, not `exp.Literal` — confirmed directly against `sqlglot-milvus`.)

## Loading a collection

`LOAD TABLE`/`RELEASE TABLE` have no `Table`/`Index`-level equivalent to attach kwargs to — issue
them directly:

```python
with engine.begin() as conn:
    conn.exec_driver_sql("LOAD TABLE items")
```
