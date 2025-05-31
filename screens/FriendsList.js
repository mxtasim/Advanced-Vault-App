import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, ImageBackground, Alert, ScrollView } from 'react-native';
import { useState, useEffect, useContext } from 'react';
import { getFirestore, collection, query, where, getDocs, addDoc, onSnapshot, doc, setDoc, orderBy, limit, serverTimestamp, writeBatch } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { auth } from '../App';
import { AuthContext } from '../App';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';

export default function FriendList({ navigation }) {
  const { user } = useContext(AuthContext);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState({ friends: [], newUsers: [] });
  const [friends, setFriends] = useState([]);
  const [isAddingFriend, setIsAddingFriend] = useState(false);
  const db = getFirestore();

  // Location tracking
  useEffect(() => {
    if (!user) return;

    let locationSubscription;

    const startLocationTracking = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          console.log('Location permission denied');
          return;
        }

        // Watch position and update Firestore
        locationSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 5000,
            distanceInterval: 10
          },
          async (location) => {
            const locationData = {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              accuracy: location.coords.accuracy,
              timestamp: new Date().toISOString()
            };

            try {
              // Update user's current location
              await setDoc(doc(db, 'users', user.uid), {
                location: locationData,
                lastSeen: serverTimestamp()
              }, { merge: true });

              // Add to location history
              const historyId = new Date().toISOString();
              await setDoc(
                doc(db, `users/${user.uid}/locationHistory/${historyId}`),
                {
                  ...locationData,
                  type: 'update',
                  timestamp: serverTimestamp()
                }
              );
            } catch (error) {
              console.error('Error updating location:', error);
            }
          }
        );
      } catch (error) {
        console.error('Error starting location tracking:', error);
      }
    };

    startLocationTracking();

    return () => {
      if (locationSubscription) {
        locationSubscription.remove();
      }
    };
  }, [user]);

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

  // Fetch friends list and their last messages
  useEffect(() => {
    if (!user) return;

    const friendsRef = collection(db, `users/${user.uid}/friends`);
    const unsubscribe = onSnapshot(friendsRef, async (snapshot) => {
      const friendsList = [];
      
      for (const doc of snapshot.docs) {
        const friendData = doc.data();
        
        // Get friend's user document for online status
        const friendDoc = await getDocs(query(collection(db, 'users'), where('uid', '==', friendData.uid)));
        const friendUserData = friendDoc.docs[0]?.data() || {};
        
        // Get the last message if it exists
        const chatId = [user.uid, friendData.uid].sort().join('_');
        const messagesRef = collection(db, `chats/${chatId}/messages`);
        const q = query(messagesRef, orderBy('timestamp', 'desc'), limit(1));
        const messageSnap = await getDocs(q);
        
        const lastMessage = messageSnap.empty ? null : messageSnap.docs[0].data();
        const now = new Date().getTime();
        const lastSeen = friendUserData.lastSeen?.toDate().getTime() || 0;
        const isOnline = now - lastSeen < 2 * 60 * 1000;

        friendsList.push({
          id: doc.id,
          ...friendData,
          lastMessage,
          online: isOnline,
          lastSeen: friendUserData.lastSeen?.toDate() || null
        });
      }
      
      setFriends(friendsList);
    });

    return () => unsubscribe();
  }, [user]);

  // Search for users
  const handleSearch = async (query) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults({ friends: [], newUsers: [] });
      return;
    }

    try {
      const searchQueryLower = query.toLowerCase().trim();
      
      // Filter existing friends
      const filteredFriends = friends.filter(friend => 
        friend.displayName.toLowerCase().includes(searchQueryLower)
      );

      // Search for new users
      const usersRef = collection(db, 'users');
      const querySnapshot = await getDocs(usersRef);
      const newUsers = [];
      
      querySnapshot.forEach((doc) => {
        const userData = doc.data();
        if (
          doc.id !== user.uid && // Don't show current user
          !friends.some(friend => friend.uid === doc.id) && // Don't show existing friends
          userData.displayName && // Make sure displayName exists
          userData.displayName.toLowerCase().includes(searchQueryLower)
        ) {
          newUsers.push({
            id: doc.id,
            ...userData
          });
        }
      });
      
      setSearchResults({
        friends: filteredFriends,
        newUsers: newUsers
      });
    } catch (error) {
      console.error('Search error:', error);
      Alert.alert('Error', 'Failed to search for users');
    }
  };

  // Verify friend data
  const verifyFriendData = async (friendId) => {
    try {
      const friendDoc = await getDocs(query(collection(db, 'users'), where('uid', '==', friendId)));
      if (friendDoc.empty) {
        throw new Error('User not found');
      }
      return friendDoc.docs[0].data();
    } catch (error) {
      console.error('Error verifying friend:', error);
      throw error;
    }
  };

  // Add friend function
  const addFriend = async (friendData) => {
    if (isAddingFriend) return; // Prevent multiple simultaneous additions
    
    try {
      setIsAddingFriend(true);

      // Verify friend data first
      const verifiedFriendData = await verifyFriendData(friendData.id);
      if (!verifiedFriendData) {
        throw new Error('User not found');
      }

      // Check if already friends
      const existingFriendDoc = await getDocs(
        query(collection(db, `users/${user.uid}/friends`), where('uid', '==', friendData.id))
      );
      
      if (!existingFriendDoc.empty) {
        Alert.alert('Info', 'You are already friends with this user');
        return;
      }

      // Create a batch write to ensure both operations succeed or fail together
      const batch = writeBatch(db);

      // Add to current user's friends list
      const currentUserFriendRef = doc(db, `users/${user.uid}/friends/${friendData.id}`);
      batch.set(currentUserFriendRef, {
        uid: friendData.id,
        displayName: verifiedFriendData.displayName,
        timestamp: serverTimestamp()
      });

      // Add current user to friend's friends list
      const friendUserFriendRef = doc(db, `users/${friendData.id}/friends/${user.uid}`);
      batch.set(friendUserFriendRef, {
        uid: user.uid,
        displayName: user.displayName,
        timestamp: serverTimestamp()
      });

      // Create chat document
      const chatId = [user.uid, friendData.id].sort().join('_');
      const chatRef = doc(db, `chats/${chatId}`);
      batch.set(chatRef, {
        participants: [user.uid, friendData.id],
        created: serverTimestamp()
      });

      // Commit the batch
      await batch.commit();

      // Clear search
      setSearchQuery('');
      setSearchResults({ friends: [], newUsers: [] });
      Alert.alert('Success', 'Friend added successfully');
    } catch (error) {
      console.error('Error adding friend:', error);
      let errorMessage = 'Failed to add friend. Please try again.';
      if (error.message === 'User not found') {
        errorMessage = 'User not found. They may have deleted their account.';
      }
      Alert.alert('Error', errorMessage);
    } finally {
      setIsAddingFriend(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
      Alert.alert('Error', 'Failed to sign out');
    }
  };

  const renderSearchResult = ({ item }) => (
    <TouchableOpacity 
      style={styles.searchResultItem}
      onPress={() => addFriend(item)}
      disabled={isAddingFriend}
    >
      <View style={styles.avatarContainer}>
        <Text style={styles.avatarText}>{item.displayName[0].toUpperCase()}</Text>
      </View>
      <Text style={styles.friendName}>{item.displayName}</Text>
      <TouchableOpacity 
        style={[styles.addButton, isAddingFriend && styles.addButtonDisabled]}
        onPress={() => addFriend(item)}
        disabled={isAddingFriend}
      >
        <Text style={[styles.addButtonText, isAddingFriend && styles.addButtonTextDisabled]}>
          {isAddingFriend ? 'Adding...' : 'Add'}
        </Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  const renderFriend = ({ item }) => (
    <TouchableOpacity 
      style={styles.friendItem}
      onPress={() => navigation.navigate('Chat', { 
        friendId: item.uid,
        friendName: item.displayName 
      })}
    >
      <View style={styles.avatarWrapper}>
        <View style={styles.avatarContainer}>
          <Text style={styles.avatarText}>{item.displayName[0].toUpperCase()}</Text>
        </View>
        {item.online && <View style={styles.onlineIndicator} />}
      </View>
      <View style={styles.friendInfo}>
        <View style={styles.friendNameContainer}>
          <Text style={styles.friendName}>{item.displayName}</Text>
          <Text style={[styles.statusText, item.online ? styles.onlineText : styles.offlineText]}>
            {item.online ? 'Online' : item.lastSeen ? formatLastSeen(item.lastSeen) : 'Offline'}
          </Text>
        </View>
        {item.lastMessage && (
          <View style={styles.lastMessageContainer}>
            <Text style={styles.lastMessage} numberOfLines={1}>
              {item.lastMessage.text}
            </Text>
            {item.lastMessage.timestamp && (
              <Text style={styles.messageTime}>
                · {new Date(item.lastMessage.timestamp.toDate()).toLocaleTimeString([], { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
              </Text>
            )}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderSearchSection = () => {
    if (!searchQuery) return null;

    const { friends: filteredFriends, newUsers } = searchResults;

    return (
      <View style={styles.searchResultsContainer}>
        <ScrollView style={styles.searchScrollView}>
          {filteredFriends.length > 0 && (
            <View style={styles.searchSection}>
              <View style={styles.sectionHeader}>
                <Ionicons name="people" size={20} color="#fff" />
                <Text style={styles.searchSectionTitle}>Your Friends</Text>
              </View>
              {filteredFriends.map((friend) => (
                <View key={friend.id} style={styles.searchItemContainer}>
                  {renderFriend({ item: friend })}
                </View>
              ))}
            </View>
          )}

          {newUsers.length > 0 && (
            <View style={styles.searchSection}>
              <View style={styles.sectionHeader}>
                <Ionicons name="person-add" size={20} color="#fff" />
                <Text style={styles.searchSectionTitle}>Add New Friends</Text>
              </View>
              {newUsers.map((user) => (
                <View key={user.id} style={styles.searchItemContainer}>
                  <TouchableOpacity 
                    style={styles.searchResultItem}
                    onPress={() => addFriend(user)}
                    disabled={isAddingFriend}
                  >
                    <View style={styles.avatarContainer}>
                      <Text style={styles.avatarText}>{user.displayName[0].toUpperCase()}</Text>
                    </View>
                    <Text style={styles.friendName}>{user.displayName}</Text>
                    <TouchableOpacity 
                      style={[styles.addButton, isAddingFriend && styles.addButtonDisabled]}
                      onPress={() => addFriend(user)}
                      disabled={isAddingFriend}
                    >
                      <Text style={[styles.addButtonText, isAddingFriend && styles.addButtonTextDisabled]}>
                        {isAddingFriend ? 'Adding...' : 'Add'}
                      </Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {filteredFriends.length === 0 && newUsers.length === 0 && (
            <View style={styles.noResultsContainer}>
              <Ionicons name="search" size={40} color="#fff" style={styles.noResultsIcon} />
              <Text style={styles.noResultsText}>No users found</Text>
            </View>
          )}
        </ScrollView>
      </View>
    );
  };

  return (
    <ImageBackground 
      source={require('../assets/background4c.jpg')} 
      style={styles.container}
      resizeMode="stretch"
    >
      <View style={styles.overlay}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <Text style={styles.headerTitle}>Chats</Text>
            <TouchableOpacity 
              style={styles.signOutButton} 
              onPress={handleSignOut}
            >
              <Ionicons name="log-out-outline" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          <View style={styles.searchContainer}>
            <View style={styles.searchInputContainer}>
              <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search for user"
                value={searchQuery}
                onChangeText={handleSearch}
                placeholderTextColor="#666"
              />
              {searchQuery ? (
                <TouchableOpacity 
                  style={styles.clearButton}
                  onPress={() => {
                    setSearchQuery('');
                    setSearchResults({ friends: [], newUsers: [] });
                  }}
                >
                  <Ionicons name="close-circle" size={20} color="#666" />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>
        
        {searchQuery ? (
          renderSearchSection()
        ) : (
          <FlatList
            data={friends}
            renderItem={renderFriend}
            keyExtractor={item => item.id}
            style={styles.list}
          />
        )}
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  header: {
    padding: 16,
    paddingTop: 50,
    backgroundColor: 'transparent',
  },
  headerTitle: {
    fontSize: 42,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  searchContainer: {
    marginTop: 10,
    marginBottom: 5,
    paddingHorizontal: 8,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 10,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 8,
    fontSize: 16,
    color: '#333',
  },
  friendItem: {
    padding: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(238, 238, 238, 0.5)',
    marginHorizontal: 10,
    marginVertical: 5,
    borderRadius: 10,
  },
  avatarContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  friendInfo: {
    flex: 1,
  },
  friendName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  lastMessageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lastMessage: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  messageTime: {
    fontSize: 12,
    color: '#666',
    marginLeft: 4,
  },
  searchResultItem: {
    padding: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
  },
  addButton: {
    backgroundColor: '#333',
    paddingHorizontal: 15,
    paddingVertical: 6,
    borderRadius: 10,
    marginLeft: 'auto',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  addButtonDisabled: {
    backgroundColor: '#999',
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  addButtonTextDisabled: {
    color: '#ccc',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  signOutButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  list: {
    flex: 1,
    width: '100%',
  },
  avatarWrapper: {
    position: 'relative',
    marginRight: 12,
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4CAF50',
    borderWidth: 2,
    borderColor: '#fff',
  },
  friendNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  statusText: {
    fontSize: 12,
    marginLeft: 8,
  },
  onlineText: {
    color: '#4CAF50',
  },
  offlineText: {
    color: '#666',
  },
  searchResultsContainer: {
    flex: 1,
  },
  searchScrollView: {
    flex: 1,
  },
  searchSection: {
    marginBottom: 15,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 15,
    padding: 10,
    marginHorizontal: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 5,
  },
  searchSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 8,
  },
  searchItemContainer: {
    marginBottom: 8,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 10,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 8,
    fontSize: 16,
    color: '#333',
  },
  clearButton: {
    padding: 4,
  },
  noResultsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 50,
  },
  noResultsIcon: {
    marginBottom: 10,
    opacity: 0.7,
  },
  noResultsText: {
    color: '#fff',
    fontSize: 16,
    opacity: 0.7,
  },
});