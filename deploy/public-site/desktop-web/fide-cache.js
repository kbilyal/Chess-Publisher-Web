(() => {
  "use strict";

  const rowsPerRecord = 5000;
  const chunkKey = (key, index) => `${key}:rows:${index}`;

  function read(db, storeName, key) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const header = store.get(key);
      let snapshot;
      let missingChunk = false;
      let settled = false;
      const fail = error => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      transaction.onerror = () => fail(transaction.error || new Error('Rating-list cache read failed.'));
      transaction.onabort = () => fail(transaction.error || new Error('Rating-list cache read aborted.'));
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        if (missingChunk) reject(new Error('The stored rating-list generation is incomplete.'));
        else resolve(snapshot);
      };
      header.onsuccess = () => {
        const value = header.result;
        if (!value?.fideChunkCount) {
          snapshot = value || null;
          return;
        }
        const { fideChunkCount, ...metadata } = value;
        snapshot = { ...metadata, rows: [] };
        for (let index = 0; index < fideChunkCount; index++) {
          const request = store.get(chunkKey(key, index));
          request.onsuccess = () => {
            if (Array.isArray(request.result)) snapshot.rows.push(...request.result);
            else missingChunk = true;
          };
        }
      };
    });
  }

  function write(db, storeName, key, snapshot, activation) {
    const { rows, ...metadata } = snapshot;
    const fideChunkCount = Math.ceil(rows.length / rowsPerRecord);
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      let settled = false;
      const fail = error => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve(true);
      };
      transaction.onerror = () => fail(transaction.error || new Error('Atomic rating-list write failed.'));
      transaction.onabort = () => fail(transaction.error || new Error('Atomic rating-list write aborted.'));
      try {
        // A single structured clone of the full FIDE list can exceed Chromium's
        // per-record message limit. Enqueue bounded records in the same transaction.
        store.put({ ...metadata, fideChunkCount }, key);
        for (let index = 0; index < fideChunkCount; index++) {
          const offset = index * rowsPerRecord;
          store.put(rows.slice(offset, offset + rowsPerRecord), chunkKey(key, index));
        }
        if (activation) store.put(activation.pointer, activation.key);
      } catch (error) {
        fail(error);
        try { transaction.abort(); } catch {}
      }
    });
  }

  window.cpWebFideCache = { read, write };
})();
