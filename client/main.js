const socket = io("http://localhost:3000/", {
  transports: ["websocket"],
});

let userDropDown = document.getElementById("users");
let messagesDiv = document.getElementById("messagesDiv");
let messageInput = document.getElementById("messageInput");

let privateKey;
userMap = new Map();

async function generateKeyPair() {
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

async function broadcastPublicKey() {
  let keyPair = await generateKeyPair();
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

broadcastPublicKey();

function base64ToArrayBuffer(base64) {
  let binary_string = window.atob(base64);
  let len = binary_string.length;
  let bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  let bytes = new Uint8Array(buffer);
  let len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

async function encryptData(message, publicKey) {
  let enc = new TextEncoder();
  let encodedMessage = enc.encode(message);
  let encryptedData = await window.crypto.subtle.encrypt(
    {
      name: "RSA-OAEP",
    },
    publicKey,
    encodedMessage
  );
  let encodedData = arrayBufferToBase64(encryptedData);
  return encodedData;
}

async function decryptData(cipher, privateKey) {
  let cipherBuffer = base64ToArrayBuffer(cipher);

  let decryptedData = await window.crypto.subtle.decrypt(
    {
      name: "RSA-OAEP",
    },
    privateKey,
    cipherBuffer
  );

  let dec = new TextDecoder();
  let decodedData = dec.decode(decryptedData);
  return decodedData;
}

function appendUser(user) {
  let option = document.createElement("option");
  option.text = user.id;
  option.value = user.id;
  userMap.set(user.id, user.publicKey);
  userDropDown.add(option);
}

function setOnlineUsers(users) {
  users.forEach((user) => {
    appendUser(user);
  });
}

socket.on("online", (users) => {
  document.getElementById("ownId").innerText = socket.id;
  setOnlineUsers(users);
});

socket.on("user-connected", (user) => {
  appendUser(user);
});

function removeUser(socketId) {
  let options = userDropDown.options;

  for (let i = 0; i < options.length; i++) {
    if (options[i].text === socketId) {
      userDropDown.remove(i);
      break;
    }
  }
  userMap.delete(socketId);
}

socket.on("user-disconnected", (socketId) => {
  removeUser(socketId);
});

function appendMessage(msg) {
  let paragraph = document.createElement("p");
  paragraph.innerText = msg;
  messagesDiv.append(paragraph);
}

async function sendMessage() {
  let selectedUser = users.options[users.selectedIndex];
  if (!selectedUser || !userMap.has(selectedUser.value)) return;

  const publicKeyBinary = Uint8Array.from(
    atob(userMap.get(selectedUser.value)),
    (c) => c.charCodeAt(0)
  );

  window.crypto.subtle
    .importKey(
      "spki",
      publicKeyBinary,
      {
        name: "RSA-OAEP",
        hash: "SHA-256",
      },
      false,
      ["encrypt"]
    )
    .then(async (importedPublicKey) => {
      let message = messageInput.value;

      let encryptedMessage = await encryptData(message, importedPublicKey);

      socket.emit("message", { to: selectedUser.text, msg: encryptedMessage });

      appendMessage(`To ${selectedUser.text}: ${message}`);

      messageInput.innerText = "";
    })
    .catch((error) => {
      console.error("Error importing public key of user:", error);
    });
}

socket.on("receivedMessage", async (data) => {
  let decryptedMsg = await decryptData(data.encryptedMessage, privateKey);
  appendMessage(`From ${data.from}: ${decryptedMsg}`);
});
