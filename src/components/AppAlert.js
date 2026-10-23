import React, { createContext, useContext, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import Modal from 'react-native-modal';
import Icon from 'react-native-vector-icons/FontAwesome';
import { apple } from '../theme/appleTheme';

const AlertContext = createContext(null);

export function AppAlertProvider({ children }) {
  const [visible, setVisible] = useState(false);
  const [config, setConfig] = useState({ title: '', message: '', buttons: [], icon: null, type: 'info' });

  const hide = useCallback(() => setVisible(false), []);

  const showAlert = useCallback(({ title = '', message = '', buttons = [{ text: 'OK', style: 'default' }], icon, type = 'info' }) => {
    const normalized = buttons.map(b => ({
      text: b.text,
      style: b.style || 'default',
      onPress: b.onPress,
    }));
    setConfig({ title, message, buttons: normalized, icon, type });
    setVisible(true);
  }, []);

  const onPressButton = (btn) => {
    setVisible(false);
    setTimeout(() => btn.onPress && btn.onPress(), 100);
  };

    const iconMap = {
    info: { name: 'info', color: '#0F172A', bg: '#F1F5F9', border: '#E2E8F0' },
    warning: { name: 'exclamation-triangle', color: '#B45309', bg: '#FFFBEB', border: '#FDE68A' },
    error: { name: 'times', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
    success: { name: 'check', color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' },
  };
  const iconCfg = config.icon || iconMap[config.type] || iconMap.info;

  return (
    <AlertContext.Provider value={{ showAlert, hideAlert: hide }}>
      {children}
      <Modal isVisible={visible} onBackdropPress={hide} backdropOpacity={0.4} animationIn="zoomIn" animationOut="zoomOut" useNativeDriver backdropTransitionOutTiming={0} style={styles.modal}>
        <View style={styles.sheet}>
          <View style={[styles.iconWrap, { backgroundColor: iconCfg.bg, borderColor: iconCfg.border }]}>
            <Icon name={iconCfg.name} size={22} color={iconCfg.color} />
          </View>
          {!!config.title && <Text style={styles.title}>{config.title}</Text>}
          {!!config.message && <Text style={styles.message}>{config.message}</Text>}
          <View style={styles.actions}>
            {config.buttons.map((btn, idx) => {
              const isDestructive = btn.style === 'destructive';
              const isCancel = btn.style === 'cancel';
              const btnStyle = isDestructive ? styles.btnDestructive : isCancel ? styles.btnCancel : styles.btnDefault;
              const textStyle = isDestructive ? styles.btnDestructiveText : isCancel ? styles.btnCancelText : styles.btnDefaultText;
              return (
                <TouchableOpacity key={idx} style={[styles.btn, btnStyle, config.buttons.length === 1 && { flex: 1 }]} onPress={() => onPressButton(btn)} activeOpacity={0.8}>
                  <Text style={textStyle}>{btn.text}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>
    </AlertContext.Provider>
  );
}

export function useAppAlert() {
  const ctx = useContext(AlertContext);
  if (!ctx) throw new Error('useAppAlert must be inside AppAlertProvider');
  return ctx;
}

// Helper para reemplazar Alert.alert sin migrar todo de golpe
let globalShow = null;
export function setGlobalAlertFn(fn) { globalShow = fn; }
export function appAlert(title, message, buttons) {
  if (globalShow) globalShow({ title, message, buttons: buttons?.map(b => ({ text: b.text, style: b.style, onPress: b.onPress })) });
}

const styles = StyleSheet.create({
  modal: { justifyContent: 'center', alignItems: 'center' },
  sheet: { backgroundColor: '#fff', borderRadius: apple.radius.l, padding: 20, width: '86%', maxWidth: 360, alignSelf: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 12, borderWidth: 1 },
  title: { fontSize: 15, fontWeight: '800', color: '#0F172A', textAlign: 'center', letterSpacing: -0.2 },
  message: { fontSize: 13, color: '#64748B', textAlign: 'center', marginTop: 6, lineHeight: 18, paddingHorizontal: 4, fontWeight: '500' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  btn: { flex: 1, height: 44, borderRadius: apple.radius.m, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  btnDefault: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
  btnDefaultText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  btnCancel: { backgroundColor: '#fff', borderColor: '#E2E8F0' },
  btnCancelText: { color: '#0F172A', fontWeight: '700', fontSize: 13 },
  btnDestructive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
  btnDestructiveText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
