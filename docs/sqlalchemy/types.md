---
sidebar_position: 2
---

# Types

## `VECTOR`

```python
from milvusql_sqlalchemy.types import VECTOR

Column("embedding", VECTOR(768))
```

Renders as `VECTOR(768)` in DDL — MilvusQL's `FLOAT_VECTOR` field type. Bind values pass through as
plain Python lists; nothing is stringified (`bind_processor` is the identity function), because
`milvusql`'s DBAPI takes real Python values in its `parameters` dict and never serializes a vector
into SQL text.

### Comparator methods

Deliberately parallels [`pgvector.sqlalchemy`](https://github.com/pgvector/pgvector-python) almost
line for line:

```python
Item.embedding.l2_distance(query_vec)        # <->
Item.embedding.cosine_distance(query_vec)    # <=>
Item.embedding.max_inner_product(query_vec)  # <#>
Item.embedding.l1_distance(query_vec)        # <+>
```

Each generates a `custom_op` via SQLAlchemy's own `ColumnOperators.op()` — the base `SQLCompiler`
already knows how to render a custom op as plain infix text (`left <-> right`), so none of these
need any compiler-side code of their own. Only the `VECTOR(n)` column type needed dialect work.

```python
select(Item.id).order_by(Item.embedding.cosine_distance(query_vec)).limit(10)
```

## `SPARSEVEC`

```python
from milvusql_sqlalchemy.types import SPARSEVEC

Column("sparse_embedding", SPARSEVEC)
```

MilvusQL's `SPARSE_FLOAT_VECTOR` field type. Only `.max_inner_product()` is exposed — Milvus's
sparse index only supports the `IP` metric.
