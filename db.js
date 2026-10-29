
const RecallDB = (() => {
  const DB_NAME = "RecallKnowledgeDB";
  const DB_VERSION = 1;
  let database;

  function open() {
    if (database) return Promise.resolve(database);

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains("notes")) {
          const notes = db.createObjectStore("notes", {
            keyPath: "id"
          });

          notes.createIndex("updatedAt", "updatedAt");
          notes.createIndex("folderId", "folderId");
          notes.createIndex("trashed", "trashed");
        }

        if (!db.objectStoreNames.contains("folders")) {
          db.createObjectStore("folders", {
            keyPath: "id"
          });
        }
      };

      request.onsuccess = () => {
        database = request.result;

        database.onversionchange = () => {
          database.close();
          database = null;
        };

        resolve(database);
      };

      request.onerror = () => reject(request.error);

      request.onblocked = () => {
        reject(new Error(
          "Database upgrade blocked. Close other Recall tabs and retry."
        ));
      };
    });
  }

  async function transaction(storeNames, mode, operation) {
    const db = await open();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeNames, mode);
      let result;

      try {
        result = operation(tx);
      } catch (error) {
        reject(error);
        return;
      }

      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(
        tx.error || new Error("Database transaction aborted")
      );
    });
  }

  async function getAll(storeName) {
    const db = await open();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const request = tx.objectStore(storeName).getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function get(storeName, id) {
    const db = await open();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const request = tx.objectStore(storeName).get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function put(storeName, item) {
    const db = await open();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).put(item);

      tx.oncomplete = () => resolve(item);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async function remove(storeName, id) {
    const db = await open();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).delete(id);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  return {
    open,
    getAll,
    get,
    put,
    remove,

    async getNotes() {
      return getAll("notes");
    },

    async getFolders() {
      return getAll("folders");
    },

    saveNote(note) {
      return put("notes", note);
    },

    saveFolder(folder) {
      return put("folders", folder);
    },

    deleteNote(id) {
      return remove("notes", id);
    },

    deleteFolder(id) {
      return remove("folders", id);
    },

    async clearAll() {
      const db = await open();

      return new Promise((resolve, reject) => {
        const tx = db.transaction(
          ["notes", "folders"],
          "readwrite"
        );

        tx.objectStore("notes").clear();
        tx.objectStore("folders").clear();

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    }
  };
})();
