// src/components/ConnectionStatus.js
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

const ConnectionStatus = ({ onConnectionChange }) => {
  const [isConnected, setIsConnected] = useState(true);
  const [connectionType, setConnectionType] = useState('');

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const connected = state.isConnected;
      setIsConnected(connected);
      setConnectionType(state.type || '');
      
      // Notificar cambios de conexión
      if (onConnectionChange) {
        onConnectionChange(connected, state);
      }
    });
    
    return () => unsubscribe();
  }, [onConnectionChange]);

  return (
    <View style={[
      styles.connectionBadge, 
      { backgroundColor: isConnected ? '#4CAF50' : '#F44336' }
    ]}>
      <Text style={styles.connectionText}>
        {isConnected ? 'Online' : 'Offline'}
      </Text>
      {!isConnected && (
        <Text style={styles.offlineText}>Modo local activo</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  connectionBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
  },
  connectionText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  offlineText: {
    color: 'white',
    fontSize: 10,
    marginLeft: 5,
  }
});

export default ConnectionStatus;