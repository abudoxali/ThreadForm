// Provides a real, spec-faithful IndexedDB implementation in the Node test
// environment so these tests exercise actual IndexedDB semantics (transaction
// lifecycles, key paths, indexes) rather than a hand-rolled mock.
import 'fake-indexeddb/auto';
