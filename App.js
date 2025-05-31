import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { createContext, useState, useEffect } from 'react';
import LoginScreen from './screens/LoginScreen';
import SignUpScreen from './screens/SignUpScreen';
import FriendsList from './screens/FriendsList';
import Chat from './screens/Chat';
import { getFirestore, setDoc, doc } from 'firebase/firestore';

// Your Firebase configuration
const firebaseConfig = {
  // Add your Firebase config here
  apiKey: "AIzaSyCSqR2bBqvxsOHdANWH10UCWtR15tukKBs",
  authDomain: "vaultrn.firebaseapp.com",
  projectId: "vaultrn",
  storageBucket: "vaultrn.firebasestorage.app",
  messagingSenderId: "962260241751",
  appId: "1:962260241751:web:7e6ac40a01c2f518768212",
  measurementId: "G-EWM0JESQZW"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const AuthContext = createContext();
export const db = getFirestore(app);

const Stack = createNativeStackNavigator();

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Create/update user document in Firestore
        await setDoc(doc(db, 'users', user.uid), {
          displayName: user.displayName,
          email: user.email,
          lastSeen: new Date().toISOString(),
        }, { merge: true });
      }
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#333" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <AuthContext.Provider value={{ user, setUser }}>
        <Stack.Navigator 
          initialRouteName={user ? "FriendsList" : "Login"}
          screenOptions={{
            headerShown: false,
            animation: 'fade'
          }}
        >
          {!user ? (
            <>
              <Stack.Screen name="Login" component={LoginScreen} />
              <Stack.Screen name="SignUp" component={SignUpScreen} />
            </>
          ) : (
            <>
              <Stack.Screen name="FriendsList" component={FriendsList} />
              <Stack.Screen name="Chat" component={Chat} />
            </>
          )}
        </Stack.Navigator>
      </AuthContext.Provider>
      <StatusBar style="light" />
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
  },
});
