---
sidebar_position: 1
---

# Basic (DBAPI only)

A complete, runnable example against Milvus Lite — no SQLAlchemy, no Django, just the core DBAPI.

```python
import milvusql

conn = milvusql.connect(uri="./rag_example.db")
cur = conn.cursor()

cur.execute("""
    CREATE TABLE documents (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        embedding VECTOR(8),
        text VARCHAR(1024)
    ) WITH (shards=1, consistency_level='Bounded')
""")
cur.execute("""
    CREATE INDEX idx_emb ON documents (embedding) USING HNSW
    WITH (metric_type='COSINE', M=16, ef_construction=200)
""")
cur.execute("LOAD TABLE documents")

docs = [
    {"text": "Milvus is a vector database.", "embedding": [0.1] * 8},
    {"text": "SQLAlchemy is a Python SQL toolkit.", "embedding": [0.5] * 8},
    {"text": "Django is a web framework.", "embedding": [0.9] * 8},
]
for doc in docs:
    cur.execute(
        "INSERT INTO documents (text, embedding) VALUES (:text, :embedding)",
        doc,
    )

query_vector = [0.12] * 8
cur.execute(
    """
    SELECT id, text FROM documents
    ORDER BY embedding <-> :q
    LIMIT 2
    SEARCH PARAMS (ef_search=64)
    """,
    {"q": query_vector},
)
for row in cur.fetchall():
    print(row)
# (1, 'Milvus is a vector database.')
# (2, 'SQLAlchemy is a Python SQL toolkit.')

conn.close()
```

## The async version

Identical statements, `AsyncMilvusClient` underneath:

```python
import asyncio
from milvusql import aio

async def main():
    conn = aio.connect(uri="./rag_example.db")
    cur = conn.cursor()
    await cur.execute(
        "SELECT id, text FROM documents ORDER BY embedding <-> :q LIMIT 2",
        {"q": [0.12] * 8},
    )
    for row in await cur.fetchall():
        print(row)
    await conn.close()

asyncio.run(main())
```
