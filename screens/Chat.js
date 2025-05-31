import React, { useState, useEffect, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Platform,
  KeyboardAvoidingView,
  Alert,
  ImageBackground,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { getFirestore, collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { AuthContext } from '../App';

export default function Chat({ route, navigation }) {
  const { friendId, friendName } = route.params;
  const { user } = useContext(AuthContext);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [friendStatus, setFriendStatus] = useState({ online: false, lastSeen: null });
  const db = getFirestore();
  const storage = getStorage();

  // Listen to friend's online status
  useEffect(() => {
    if (!user || !friendId) return;

    const friendRef = doc(db, 'users', friendId);
    const unsubscribe = onSnapshot(friendRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        const now = new Date().getTime();
        const lastSeen = data.lastSeen?.toDate().getTime() || 0;
        
        // Consider user online if last seen within last 2 minutes
        const isOnline = now - lastSeen < 2 * 60 * 1000;
        
        setFriendStatus({
          online: isOnline,
          lastSeen: data.lastSeen?.toDate() || null
        });
      }
    });

    return () => unsubscribe();
  }, [friendId]);

  // Format last seen time
  const formatLastSeen = (date) => {
    if (!date) return '';
    
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    
    return date.toLocaleDateString();
  };

  // Listen to messages
  useEffect(() => {
    if (!user || !friendId) return;

    const chatId = [user.uid, friendId].sort().join('_');
    const messagesRef = collection(db, `chats/${chatId}/messages`);
    const q = query(messagesRef, orderBy('timestamp', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messageList = [];
      snapshot.forEach((doc) => {
        messageList.push({
          id: doc.id,
          ...doc.data(),
          sender: doc.data().senderId === user.uid ? 'me' : 'friend'
        });
      });
      setMessages(messageList);
    });

    return () => unsubscribe();
  }, [user, friendId]);

  const sendMessage = async () => {
    if (!message.trim()) return;

    try {
      const chatId = [user.uid, friendId].sort().join('_');
      const messagesRef = collection(db, `chats/${chatId}/messages`);
      
      await addDoc(messagesRef, {
        text: message,
        senderId: user.uid,
        timestamp: serverTimestamp(),
        type: 'text'
      });

      setMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert('Error', 'Failed to send message');
    }
  };

  const handleAttachment = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert('Sorry, we need camera roll permissions to make this work!');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
        allowsEditing: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        await uploadMedia(result.assets[0].uri);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const uploadMedia = async (uri) => {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const filename = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const storageRef = ref(storage, `chat-media/${filename}`);
      
      await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);

      const chatId = [user.uid, friendId].sort().join('_');
      const messagesRef = collection(db, `chats/${chatId}/messages`);
      
      await addDoc(messagesRef, {
        mediaUrl: downloadURL,
        senderId: user.uid,
        timestamp: serverTimestamp(),
        type: 'image'
      });
    } catch (error) {
      console.error('Error uploading media:', error);
      Alert.alert('Error', 'Failed to upload media');
    }
  };

  const renderMessage = ({ item }) => (
    <View style={[
      styles.messageBubble,
      item.sender === 'me' ? styles.myMessage : styles.friendMessage
    ]}>
      {item.type === 'image' ? (
        <Image 
          source={{ uri: item.mediaUrl }} 
          style={styles.messageImage}
          resizeMode="cover"
        />
      ) : (
        <Text style={[
          styles.messageText,
          item.sender === 'me' ? styles.myMessageText : styles.friendMessageText
        ]}>
          {item.text}
        </Text>
      )}
      {item.timestamp && (
        <Text style={styles.timestamp}>
          {new Date(item.timestamp.toDate()).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
          })}
        </Text>
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ImageBackground 
        source={require('../assets/background4c.jpg')} 
        style={styles.backgroundImage}
        resizeMode="stretch"
      >
        <View style={styles.overlay}>
          <View style={styles.header}>
            <TouchableOpacity 
              style={styles.backButton} 
              onPress={() => navigation.goBack()}
            >
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            
            <View style={styles.profileContainer}>
              <View style={styles.avatarContainer}>
                <Text style={styles.avatarText}>
                  {friendName[0].toUpperCase()}
                </Text>
              </View>
              <View style={styles.headerInfo}>
                <Text style={styles.headerTitle}>{friendName}</Text>
                <Text style={[
                  styles.statusText,
                  friendStatus.online ? styles.onlineText : styles.offlineText
                ]}>
                  {friendStatus.online 
                    ? 'Online'
                    : friendStatus.lastSeen 
                      ? `Last seen ${formatLastSeen(friendStatus.lastSeen)}`
                      : 'Offline'
                  }
                </Text>
              </View>
            </View>
          </View>

          <FlatList
            data={messages}
            renderItem={renderMessage}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.messageList}
            inverted={false}
          />

          <View style={styles.inputContainer}>
            <TouchableOpacity 
              style={styles.attachButton} 
              onPress={handleAttachment}
            >
              <Ionicons name="attach" size={24} color="#333" />
            </TouchableOpacity>
            
            <TextInput
              style={styles.input}
              value={message}
              onChangeText={setMessage}
              placeholder="Type a message..."
              multiline
              maxLength={500}
            />
            
            <TouchableOpacity 
              style={[styles.sendButton, !message.trim() && styles.sendButtonDisabled]}
              onPress={sendMessage}
              disabled={!message.trim()}
            >
              <Ionicons 
                name="send" 
                size={24} 
                color={message.trim() ? "#fff" : "#999"} 
              />
            </TouchableOpacity>
          </View>
        </View>
      </ImageBackground>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    paddingTop: Platform.OS === 'ios' ? 50 : 16,
  },
  backButton: {
    padding: 8,
  },
  profileContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginLeft: 8,
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  statusText: {
    fontSize: 12,
    marginTop: 2,
    color: '#fff',
  },
  onlineText: {
    color: '#4CAF50',
  },
  offlineText: {
    color: '#bbb',
  },
  messageList: {
    padding: 16,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    marginBottom: 8,
  },
  myMessage: {
    backgroundColor: '#333',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  friendMessage: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
  },
  myMessageText: {
    color: '#fff',
  },
  friendMessageText: {
    color: '#000',
  },
  messageImage: {
    width: 200,
    height: 200,
    borderRadius: 8,
  },
  timestamp: {
    fontSize: 12,
    color: '#666',
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    alignItems: 'center',
    margin: 8,
    borderRadius: 24,
  },
  attachButton: {
    padding: 8,
  },
  input: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingHorizontal: 16,
    paddingVertical: 8,
    maxHeight: 100,
    fontSize: 16,
  },
  sendButton: {
    backgroundColor: '#333',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
});
