import type { UiModule } from "../../core/contracts.js";

function loadBackground(): Promise<Blob | null> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("codex-ui-background", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("images");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction("images", "readonly");
      const image = transaction.objectStore("images").get("chat");
      image.onsuccess = () => resolve(image.result ?? null);
      image.onerror = () => reject(image.error);
      transaction.oncomplete = () => database.close();
      transaction.onabort = () => database.close();
    };
  });
}

export const chatBackgroundModule: UiModule = {
  id: "chat-background",
  activate(context) {
    let disposed = false;
    void loadBackground().then((image) => {
      if (!disposed) context.setChatBackground(image, 30);
    }).catch((error: unknown) => console.error("Could not load chat background:", error));
    return () => {
      disposed = true;
      context.setChatBackground(null, 30);
    };
  },
};
