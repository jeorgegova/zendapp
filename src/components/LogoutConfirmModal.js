// src/components/LogoutConfirmModal.js
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import Modal from 'react-native-modal';
import Icon from 'react-native-vector-icons/FontAwesome';
import { apple } from '../theme/appleTheme';

export default function LogoutConfirmModal({
  visible,
  onClose,
  onConfirm,
  title = '¿Cerrar sesión?',
  subtitle = 'Saldrás de tu cuenta y volverás al inicio de sesión.',
}) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      if (onConfirm) {
        await onConfirm();
      }
    } finally {
      setLoading(false);
      onClose();
    }
  };

  return (
    <Modal
      isVisible={visible}
      onBackdropPress={onClose}
      backdropOpacity={0.4}
      animationIn="slideInUp"
      animationOut="slideOutDown"
      useNativeDriver
      hideModalContentWhileAnimating
    >
      <View style={styles.logoutSheet}>
        <View style={styles.logoutHandle} />
        <View style={styles.logoutIcon}>
          <Icon name="sign-out" size={22} color={apple.colors.danger} />
        </View>
        <Text style={styles.logoutTitle}>{title}</Text>
        <Text style={styles.logoutSub}>{subtitle}</Text>
        <View style={styles.logoutActions}>
          <TouchableOpacity
            style={styles.logoutCancel}
            onPress={onClose}
            disabled={loading}
            activeOpacity={0.7}
          >
            <Text style={styles.logoutCancelText}>Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.logoutConfirm}
            onPress={handleConfirm}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.logoutConfirmText}>Cerrar sesión</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  logoutSheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: apple.radius.xl,
    padding: 20,
    paddingBottom: 24,
  },
  logoutHandle: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#E5E5EA',
    alignSelf: 'center',
    marginBottom: 16,
  },
  logoutIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFEBEE',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FFD4D4',
  },
  logoutTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1D1D1F',
    textAlign: 'center',
  },
  logoutSub: {
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 12,
  },
  logoutActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  logoutCancel: {
    flex: 1,
    height: 46,
    borderRadius: apple.radius.m,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: '#E5E5EA',
  },
  logoutCancelText: {
    fontWeight: '600',
    color: '#1D1D1F',
  },
  logoutConfirm: {
    flex: 1,
    height: 46,
    borderRadius: apple.radius.m,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutConfirmText: {
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
