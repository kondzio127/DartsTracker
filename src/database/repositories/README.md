# Future repositories

No repository implementations in Milestone 2.3. Future repositories must submit
statement requests to ../database.ts. Helpers can construct plain statement objects;
there are no public callbacks or sessions. Do not open another connection or dual-write
SQLite and AsyncStorage. See ../README.md for ownership, batch limitations and cutover.
JavaScript branching based on intermediate transaction results needs separate design
at the repository milestone; it is not supported by fixed statement batches.
