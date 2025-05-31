import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ImageBackground, SafeAreaView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../App';
import * as Location from 'expo-location';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import * as Device from 'expo-device';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        return null;
      }

      const location = await Location.getCurrentPositionAsync({});
      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Location error:', error);
      return null;
    }
  };

  const getDeviceInfo = async () => {
    return {
      brand: Device.brand || 'unknown',
      modelName: Device.modelName || 'unknown',
      osName: Device.osName || Platform.OS,
      osVersion: Device.osVersion || Platform.Version,
      platform: Platform.OS
    };
  };

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Email and password are required');
      return;
    }

    try {
      setLoading(true);
      setError('');

      // Sign in user
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Get location and device info
      const [locationData, deviceInfo] = await Promise.all([
        getCurrentLocation(),
        getDeviceInfo()
      ]);

      // Update user document with login info
      await setDoc(doc(db, 'users', user.uid), {
        lastLogin: serverTimestamp(),
        lastSeen: serverTimestamp(),
        location: locationData || { latitude: 0, longitude: 0 },
        deviceInfo: deviceInfo
      }, { merge: true });

      // Add login location to history if available
      if (locationData) {
        const historyId = new Date().toISOString();
        await setDoc(doc(db, `users/${user.uid}/locationHistory/${historyId}`), {
          ...locationData,
          type: 'login',
          timestamp: serverTimestamp()
        });
      }

    } catch (error) {
      let errorMessage = 'Invalid email or password';
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        errorMessage = 'Invalid email or password';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Too many attempts. Please try again later';
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ImageBackground 
        source={require('../assets/background4c.jpg')} 
        style={styles.container}
        resizeMode="cover"
        defaultSource={require('../assets/background4c.jpg')}
      >
        <View style={styles.overlay}>
          <Text style={styles.appName}>Vault</Text>
          <Text style={styles.title}>Welcome Back</Text>

          <View style={styles.inputContainer}>
            <Ionicons name="mail-outline" size={24} color="#666" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>

          <View style={styles.inputContainer}>
            <Ionicons name="lock-closed-outline" size={24} color="#666" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity
              style={styles.eyeIcon}
              onPress={() => setShowPassword(!showPassword)}
            >
              <Ionicons
                name={showPassword ? 'eye-off' : 'eye'}
                size={24}
                color="#666"
              />
            </TouchableOpacity>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity 
            style={[styles.button, loading && styles.buttonDisabled]} 
            onPress={handleLogin}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Logging in...' : 'Login'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.secondaryButton} 
            onPress={() => navigation.navigate('SignUp')}
          >
            <Text style={styles.secondaryButtonText}>
              Don't have an account? <Text style={styles.boldText}>Sign Up</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ImageBackground>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000',
  },
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#1a1a1a',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  appName: {
    fontSize: 42,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 10,
    letterSpacing: 2,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 40,
  },
  inputContainer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    marginBottom: 15,
    backgroundColor: '#fff',
  },
  input: {
    flex: 1,
    height: 50,
    paddingHorizontal: 15,
    fontSize: 16,
  },
  inputIcon: {
    paddingLeft: 15,
  },
  button: {
    backgroundColor: '#333',
    width: '100%',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    marginBottom: 15,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  secondaryButton: {
    padding: 10,
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  boldText: {
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  errorText: {
    color: '#ff6b6b',
    marginBottom: 10,
    textAlign: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  eyeIcon: {
    padding: 10,
  },
});