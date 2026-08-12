---
sidebar_position: 2
---

# With SQLAlchemy

```python
from sqlalchemy import create_engine, select, insert, MetaData, Table, Column, BigInteger, String, Index
from milvusql_sqlalchemy.types import VECTOR

engine = create_engine("milvusql:///items.db")

metadata = MetaData()
items = Table(
    "items", metadata,
    Column("id", BigInteger, primary_key=True, autoincrement=True),
    Column("category", String(64)),
    Column("embedding", VECTOR(8)),
    milvusql_shards=1,
    milvusql_consistency_level="Bounded",
)
Index(
    "idx_emb", items.c.embedding,
    milvusql_using="HNSW",
    milvusql_with={"metric_type": "COSINE", "M": 16, "ef_construction": 200},
)

metadata.create_all(engine)

with engine.begin() as conn:
    conn.exec_driver_sql("LOAD TABLE items")

    conn.execute(insert(items), [
        {"category": "book", "embedding": [0.1] * 8},
        {"category": "movie", "embedding": [0.9] * 8},
    ])

    rows = conn.execute(
        select(items.c.id, items.c.category)
        .where(items.c.category == "book")
        .order_by(items.c.embedding.l2_distance([0.1] * 8))
        .limit(5)
    ).all()
    print(rows)
    # [(1, 'book')]

    result = conn.execute(items.delete().where(items.c.category == "movie"))
    print(result.rowcount)
    # 1
```

## Reflection

```python
from sqlalchemy import inspect

insp = inspect(engine)
print(insp.get_columns("items"))
print(insp.get_indexes("items"))
```

See [SQLAlchemy → Overview](../sqlalchemy/overview) for the rest of what the dialect covers,
including [hybrid search](../sqlalchemy/hybrid-search).
