# Vault Chat App (Advanced Version)

This is the **advanced version** of my original chat application, which I developed as part of my graduation project. It is now rebuilt using **Expo** to provide a smoother **mobile** and **web** experience.

This version continues to use **Firebase** as the backend for authentication, real-time chat, media storage, and notifications.

## 🔗 Link to Original Project

Check out the original version of this app (graduation project):

👉 [Vault Chat App (Original Version)](https://github.com/mxtasim/Vault-Chat-App)

## 🚀 Features

- Built with **Expo** for cross-platform compatibility
- Firebase integration for:
  - Authentication (email/password)
  - Real-time messaging
  - Image, file & voice message sharing
  - Push notifications
  - Message read status (Seen/Delivered)
- Search for users & send friend requests
- Friend list & private chat
- Emoji support

## 🛠️ Tech Stack

- **Frontend**: React Native (Expo)
- **Backend**: Firebase (Firestore, Auth, Storage, Cloud Messaging)

## 📱 Platforms Supported

- Android
- iOS
- Web

## 📦 Installation

1. Clone this repo:
   ```bash
   git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME
   cd YOUR_REPO_NAME
Install dependencies:

bash
Copy
Edit
npm install
Start the Expo server:

bash
Copy
Edit
npm start
You must have Expo CLI installed globally. If not:

bash
Copy
Edit
npm install -g expo-cli
🔐 Firebase Setup
Make sure you add your own firebaseConfig inside the project:

js
Copy
Edit
// firebase.js or config.js
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
📸 Screenshots
Here are some previews of the app in action:

Chat Interface

Friend List & Requests

Message View with Media

🧑‍💻 Author
Motasim Abuhalima

GitHub: @mxtasim

