/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import * as React from 'react';
import Navigation from './src/screens/Navigation';
import { AuthProvider } from './src/context/AuthContext';
import Toast from 'react-native-toast-message';

export default function App() {
  return (
    <AuthProvider>
      <Navigation />
      <Toast />
    </AuthProvider>
  );
} 