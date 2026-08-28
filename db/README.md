# Database definitions

The ordered SQL files in `migrations/` are the executable source of truth. They
own every PostgreSQL constraint, partial index, and tenant-aware foreign key.

The modules in `schema/` are typed Drizzle table metadata for application
queries. They mirror relational structure, but they are not a migration
generator. Do not generate or overwrite migrations from these modules. Schema
changes must begin in explicit SQL, update the typed mirror, and pass the
PostgreSQL migration metadata tests.
