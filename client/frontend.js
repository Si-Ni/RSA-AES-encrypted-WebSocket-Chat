let userDropDown = document.getElementById("users");
let messagesDiv = document.getElementById("messagesDiv");
let messageInput = document.getElementById("messageInput");

let userMap = new Map();

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

function appendMessage(msg) {
  let paragraph = document.createElement("p");
  paragraph.innerText = msg;
  messagesDiv.append(paragraph);
}

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
