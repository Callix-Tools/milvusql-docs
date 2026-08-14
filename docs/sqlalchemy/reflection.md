---
sidebar_position: 5
---

# Reflection

`get_table_names`, `get_columns`, `get_pk_constraint`, and `get_indexes` all read Milvus's own
schema API (`list_collections`, `describe_collection`, `list_indexes`, `describe_index`) directly —
not a `SELECT`-based probe through `connection.execute()`. Milvus has a real schema endpoint; there
is no SQL text to route reflection through the way a `SELECT * FROM table LIMIT 1` probe would for
a database that doesn't expose one. `get_foreign_keys` always returns `[]` without calling the API
at all, since Milvus has no foreign-key concept.

```python
from sqlalchemy import inspect

insp = inspect(engine)
insp.get_table_names()
# ['items']

insp.get_columns("items")
# [{'name': 'id', 'type': BigInteger(), 'nullable': False, ...},
#  {'name': 'category', 'type': String(length=64), 'nullable': True, ...},
#  {'name': 'embedding', 'type': VECTOR(dim=768), 'nullable': False, ...}]

insp.get_pk_constraint("items")
# {'constrained_columns': ['id'], 'name': None}

insp.get_indexes("items")
# [{'name': 'embedding', 'column_names': ['embedding'], 'unique': False, ...}]
```

Milvus genuinely has no foreign keys, which is a fact about the database, not a missing feature in
this dialect.

## Type mapping

Only what phase-1 DDL actually emits is mapped; anything else reflects as `NullType` rather than
guessing at a Python-side representation for a Milvus field type this dialect has never had reason
to produce.

| Milvus type | SQLAlchemy type |
|---|---|
| `INT8`/`INT16` | `SmallInteger` |
| `INT32` | `Integer` |
| `INT64` | `BigInteger` |
| `FLOAT`/`DOUBLE` | `Float`/`Double` |
| `BOOL` | `Boolean` |
| `JSON` | `JSON` |
| `VARCHAR` | `String(length=...)` |
| `FLOAT_VECTOR` | `VECTOR(dim=...)` |
| `SPARSE_FLOAT_VECTOR` | `SPARSEVEC()` |
