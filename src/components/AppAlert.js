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
    info: { name: 'info-circle', color: apple.colors.blue, bg: '#EFF6FF', border: '#DBEAFE' },
    warning: { name: 'exclamation-triangle', color: apple.colors.warning, bg: '#FFF8E1', border: '#FFE9A8' },
    error: { name: 'times-circle', color: apple.colors.danger, bg: '#FFEBEE', border: '#FFD4D4' },
    success: { name: 'check-circle', color: apple.colors.success, bg: '#E8F5E9', border: '#C8E6C9' },
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
  sheet: { backgroundColor: '#fff', borderRadius: 20, padding: 22, width: '84%', maxWidth: 340, alignSelf: 'center' },
  iconWrap: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 14, borderWidth: 1 },
  title: { fontSize: 17, fontWeight: '700', color: '#1D1D1F', textAlign: 'center' },
  message: { fontSize: 13, color: '#6E6E73', textAlign: 'center', marginTop: 8, lineHeight: 18, paddingHorizontal: 8 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  btn: { flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5 },
  btnDefault: { backgroundColor: apple.colors.blue, borderColor: apple.colors.blue },
  btnDefaultText: { color: '#fff', fontWeight: '700' },
  btnCancel: { backgroundColor: '#F2F2F7', borderColor: '#E5E5EA' },
  btnCancelText: { color: '#1D1D1F', fontWeight: '600' },
  btnDestructive: { backgroundColor: '#FF3B30', borderColor: '#FF3B30' },
  btnDestructiveText: { color: '#fff', fontWeight: '700' },
});
