---
sidebar_position: 5
---

# ORM Models (Declarative)

SQLAlchemy 2.0's declarative style — `class Foo(Base): ...` with `Mapped[...]`/`mapped_column(...)` —
works against `milvusql` the same way it does against any other dialect: `Base.metadata.create_all()`
emits DDL through [`sqlglot-milvus`](https://github.com/Callix-Tools/sqlglot-milvus), and
`Session`/`AsyncSession` read and write rows through it.

```python
from sqlalchemy import Boolean, Integer, String, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

from milvusql_sqlalchemy.types import VECTOR


class Base(DeclarativeBase):
    pass


class CharacteristicKind(Base):
    __tablename__ = "characteristic_kind"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, autoincrement=False)
    default_owner: Mapped[str | None] = mapped_column(String(36), nullable=True)
    available_for_customer: Mapped[bool] = mapped_column(Boolean)
    code: Mapped[str] = mapped_column(String(64))
    name: Mapped[str] = mapped_column(String(128))
    main_for_customer: Mapped[int] = mapped_column(Integer)
    is_deleted: Mapped[bool] = mapped_column(Boolean)
    parent_id: Mapped[str | None] = mapped_column(String(36))
    embedding: Mapped[list[float]] = mapped_column(VECTOR(4))


engine = create_engine("milvusql:///items.db")
Base.metadata.create_all(engine)

with engine.begin() as conn:
    from sqlalchemy import text
    conn.execute(text("LOAD TABLE characteristic_kind"))  # explicit, see below

with Session(engine) as session:
    session.add(CharacteristicKind(
        id="...", available_for_customer=True, code="c1", name="n1",
        main_for_customer=1, is_deleted=False,
        embedding=[0.1, 0.2, 0.3, 0.4],
    ))
    session.commit()

with Session(engine) as session:
    row = session.get(CharacteristicKind, "...")
```

This end-to-end shape (a model with a string primary key, nullable columns, plain scalar columns, and
a `VECTOR` column, exercised through `create_all()` → `insert` → `Session.get()`) is verified directly
against Milvus Lite, not assumed from SQLAlchemy's general dialect contract — two real gaps were found
and fixed while confirming it (see below), not just this specific example.

## Milvus-specific caveats for declarative models

**`__table_args__ = {"schema": "..."}` does not do what it does on a relational database.** Milvus has
no schema/namespace concept — only a top-level `db_name`, which is already part of the connection
URL. If you set a `"schema"` table arg, SQLAlchemy renders it into DDL text as
`CREATE TABLE schema.table (...)`, but `sqlglot-milvus`'s `CREATE TABLE` handling only reads the
right-hand part of a dotted identifier as the collection name — the schema segment is silently
dropped, not honored, not rejected. Don't rely on it for isolation; use a separate `db_name` (a
separate connection/engine) instead if you need namespacing.

**No UUID column type.** Milvus's own field types don't include anything UUID-shaped (`_map_datatype`
in `milvusql.translate.ast_to_pymilvus` accepts only Milvus's actual column types — the
integer/float/boolean/JSON scalars in `_SCALAR_TYPES`, plus `VARCHAR`, `TEXT`, `ARRAY<T>(n)`,
`VECTOR(n)`, `SPARSEVEC` and the dimensioned vector spellings — and raises `NotSupportedError` for
anything else, `CHAR` included). `sqlalchemy.Uuid`/
`sqlalchemy.dialects.postgresql.UUID` render as `CHAR(...)`, which MilvusQL's grammar doesn't accept
as a column type either. Store UUIDs as `Mapped[str]` / `mapped_column(String(36))` and convert with
Python's own `uuid.UUID(...)`/`str(...)` at the boundary — there's no dialect-level UUID type to
`import` here the way there is for Postgres.

**A collection is loaded automatically the first time it's queried** (`SELECT`, `Session.get()`, a
relationship lazy-load, ...) — `milvusql`'s `Cursor`/`AsyncCursor` auto-`LOAD` a collection on first
use per connection and cache the result (see [Core → Overview](../core/overview#loading-a-collection));
`milvusql-sqlalchemy` gets this for free since it drives the ORM through that same `Cursor`.
`Base.metadata.create_all()` still doesn't create an index, and a vector search still needs one
regardless of load state, so `LOAD TABLE <name>` (through `conn.execute(text(...))`, same as any
other raw DDL/DML this dialect doesn't have a `Table`-level Core construct for) is only needed
explicitly if you want control over replica count or want to warm a collection up ahead of traffic —
not as a precondition for querying through the ORM.

**Nullable columns need `nullable=True` (or an `Optional`/`| None` `Mapped` type) to actually be
nullable at the Milvus schema level**, not just at the Python type level — `milvusql`'s `CREATE TABLE`
translation reads the DDL's `NOT NULL` presence/absence and sets the Milvus `FieldSchema`'s own
`nullable` flag accordingly (confirmed directly: without it, inserting Python `None` for an
unconstrained column used to fail with `FieldData 'x' has 0 rows, expected 1`). Primary-key and
`VECTOR`/`SPARSEVEC` columns can never be nullable, regardless of what's declared — Milvus itself
doesn't support it for those.

## Async

Everything above works the same way through `AsyncSession`/`create_async_engine("milvusql+aio:///...")`
— see [Async Engine](./async-engine).
