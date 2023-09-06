const socket = io("http://localhost:3000/", {
  transports: ["websocket"],
});

let privateKey;
let userToAesKey = new Map();

async function generateRSAKeyPair() {
  let key = await window.crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
      hash: { name: "SHA-256" },
    },
    true,
    ["encrypt", "decrypt"]
  );
  return key;
}

async function broadcastRSAPublicKey() {
  let keyPair = await generateRSAKeyPair();
  privateKey = keyPair.privateKey;
  const publicKey = await window.crypto.subtle.exportKey(
    "spki",
    keyPair.publicKey
  );
  const publicKeyBase64 = btoa(
    String.fromCharCode(...new Uint8Array(publicKey))
  );
  socket.emit("key-generated", publicKeyBase64);
}

broadcastRSAPublicKey();

async function generateAESKey() {
  try {
    const keyAlgorithm = { name: "AES-GCM", length: 256 };

    const aesKey = await crypto.subtle.generateKey(keyAlgorithm, true, [
      "encrypt",
      "decrypt",
    ]);

    return aesKey;
  } catch (error) {
    console.error("Error generating AES key:", error);
  }
}

async function extractNewAESKey(userSocketId) {
  try {
    const aesKey = await generateAESKey();
    userToAesKey.set(userSocketId, aesKey);
    const exportedKey = new Uint8Array(
      await crypto.subtle.exportKey("raw", aesKey)
    );
    return exportedKey;
  } catch (error) {
    console.error("Error extracting AES key:", error);
  }
}

async function encryptKey(aesKey, publicKey) {
  let encryptedData = await window.crypto.subtle.encrypt(
    {
      name: "RSA-OAEP",
    },
    publicKey,
    aesKey
  );
  return encryptedData;
}

async function createAndEncryptAESKey(userSocketId) {
  return new Promise(async (resolve, reject) => {
    try {
      const publicKeyBinary = Uint8Array.from(
        atob(userMap.get(userSocketId)),
        (c) => c.charCodeAt(0)
      );

      const importedPublicKey = await window.crypto.subtle.importKey(
        "spki",
        publicKeyBinary,
        {
          name: "RSA-OAEP",
          hash: "SHA-256",
        },
        false,
        ["encrypt"]
      );

      const newAesKey = await extractNewAESKey(userSocketId);
      const encryptedAesKey = await encryptKey(newAesKey, importedPublicKey);

      resolve(encryptedAesKey);
    } catch (error) {
      console.error("Error creating and encrypting AES key:", error);
      reject(error);
    }
  });
}

async function encryptMessage(plaintext, aesKey) {
  try {
    const encoder = new TextEncoder();
    const plaintextBuffer = encoder.encode(plaintext);

    const iv = crypto.getRandomValues(new Uint8Array(12));

    const ciphertextBuffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      aesKey,
      plaintextBuffer
    );
    return { cipher: ciphertextBuffer, iv: iv };
  } catch (error) {
    console.error("Error encrypting message:", error);
  }
}

async function sendMessage() {
  let selectedUser = users.options[users.selectedIndex];
  if (!selectedUser || !userMap.has(selectedUser.value)) return;
  let userSocketId = selectedUser.value;
  const aesKeyAlreadyExisted = userToAesKey.has(userSocketId);
  let encryptedAesKey;

  if (!aesKeyAlreadyExisted) {
    await createAndEncryptAESKey(userSocketId)
      .then((key) => {
        encryptedAesKey = key;
      })
      .catch((error) => {
        console.error("Error:", error);
      });
  }
  let aesKey = userToAesKey.get(userSocketId);
  let message = messageInput.value;
  const aesEncryption = await encryptMessage(message, aesKey);

  const messageData = {
    to: userSocketId,
    msg: aesEncryption.cipher,
    iv: aesEncryption.iv,
    ...(!aesKeyAlreadyExisted ? { encryptedAesKey } : {}),
  };

  socket.emit("sendMessage", messageData);
  appendMessage(`To ${userSocketId}: ${message}`);
  messageInput.value = "";
}

socket.on("online", (users) => {
  document.getElementById("ownId").innerText = socket.id;
  setOnlineUsers(users);
});

socket.on("user-connected", (user) => {
  appendUser(user);
});

socket.on("user-disconnected", (socketId) => {
  removeUser(socketId);
});

async function importAESKey(exportedKeyBytes) {
  try {
    const keyAlgorithm = { name: "AES-GCM" };
    const keyFormat = "raw";

    const importedKey = await crypto.subtle.importKey(
      keyFormat,
      exportedKeyBytes,
      keyAlgorithm,
      false,
      ["encrypt", "decrypt"]
    );

    return importedKey;
  } catch (error) {
    console.error("Error importing AES key:", error);
  }
}

async function decryptKey(aesKey, privateKey, userSocketId) {
  let decryptedData = await window.crypto.subtle.decrypt(
    {
      name: "RSA-OAEP",
    },
    privateKey,
    aesKey
  );
  let key = await importAESKey(decryptedData);
  userToAesKey.set(userSocketId, key);

  return key;
}

async function decryptMessage(ciphertextBuffer, aesKey, iv) {
  try {
    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      aesKey,
      ciphertextBuffer
    );

    const decoder = new TextDecoder();
    const plaintext = decoder.decode(decryptedBuffer);

    return plaintext;
  } catch (error) {
    console.error("Error decrypting message:", error);
  }
}

socket.on("receivedMessage", async (data) => {
  if (!userToAesKey.has(data.from))
    await decryptKey(data.encryptedAesKey, privateKey, data.from);
  let aesKey = userToAesKey.get(data.from);
  let decryptedMsg = await decryptMessage(data.msg, aesKey, data.iv);
  appendMessage(`From ${data.from}: ${decryptedMsg}`);
});
