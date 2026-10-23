import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BackHandler, View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, SafeAreaView, Animated } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/FontAwesome';
import { getData, getDbConnection } from '../../database/db';
import CustomPicker from './CustomPicker';
import { apple } from '../../theme/appleTheme';
import { AppleButton } from '../../components/AppleButton';
import { appAlert } from '../../components/AppAlert';
import { useAuth } from '../../context/AuthContext';
import { getCajaActual } from '../../services/cajaService';
import { supabase } from '../../lib/supabase';

import { SyncWithSupabase } from '../../utils/sync';
import { formatMoneyInput, parseMoneyToNumeric } from '../../utils/utilities';

const FormField = React.memo(({ label, value, onChangeText, placeholder, keyboardType, icon }) => (
  <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <View style={styles.inputWrap}>
      {icon && <Icon name={icon} size={14} color={apple.colors.tertiaryLabel} style={{ marginRight: 8 }} />}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={apple.colors.tertiaryLabel}
        style={styles.input}
        keyboardType={keyboardType}
      />
    </View>
  </View>
));

const CrearCliente = () => {
  const navigation = useNavigation();
  const { accessToken, userId } = useAuth();
  const fade = useRef(new Animated.Value(0)).current;
  let db;
  const [formData, setFormData] = useState({ nombre: '', apellido: '', alias: '', direccion: '', telefono: '', genero: '', documento: '', valor: '', plazo: '', interes: '' });
  const [formDataLabels, setFormDataLabels] = useState({ plazo: '', interes: '' });
  const [isFormValid, setIsFormValid] = useState(false);
  const [conceptosInteres, setConceptosInteres] = useState([]);
  const [conceptosPlazo, setConceptosPlazo] = useState([]);
  const [showPlazoModal, setShowPlazoModal] = useState(false);
  const [showInteresModal, setShowInteresModal] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    LoadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useFocusEffect(
    React.useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        navigation.navigate('Payments');
        return true;
      });
      const beforeRemove = navigation.addListener('beforeRemove', (e) => {
        if (e.data.action.type === 'GO_BACK') {
          e.preventDefault();
          navigation.navigate('Payments');
        }
      });
      return () => {
        sub.remove();
        beforeRemove();
      };
    }, [navigation])
  );

  useEffect(() => {
    const isValid = Object.entries(formData).every(([k, v]) => {
      if (k === 'valor') return parseMoneyToNumeric(v) > 0;
      return typeof v === 'string' && v.trim() !== '';
    });
    setIsFormValid(isValid);
  }, [formData]);

  const LoadData = async () => {
    try {
      db = await getDbConnection();
      const conceptosData = await getData(db, 'select * from concepts');
      setConceptosInteres(conceptosData.filter(c => c.tipo === 'interes'));
      setConceptosPlazo(conceptosData.filter(c => c.tipo === 'plazo'));
    } catch (e) { console.error(e); }
  };

  const handleChange = useCallback((name, value) => {
    if (name === 'valor') {
      const formatted = formatMoneyInput(value);
      setFormData(p => ({ ...p, [name]: formatted }));
      return;
    }
    setFormData(p => ({ ...p, [name]: value }));
  }, []);
  const handlePickerSelect = (name, value, label) => { setFormData(p => ({ ...p, [name]: value })); setFormDataLabels(p => ({ ...p, [name]: label })); };
  const handleGeneroChange = g => setFormData(p => ({ ...p, genero: g }));

  const handleSubmit = async () => {
    if (!isFormValid) return;
    if (!userId) {
      appAlert('Error', 'Sesión no válida. Por favor inicia sesión nuevamente.');
      return;
    }
    setSaving(true);
    try {
      // 1. Obtener caja abierta (Offline-First desde SQLite o Supabase)
      const cajaAbierta = await getCajaActual();
      if (!cajaAbierta) {
        appAlert('Sin caja', 'No tienes una caja abierta. Ve a la sección Caja y abre una antes de registrar ventas.');
        setSaving(false);
        return;
      }

      const { nombre, apellido, alias, telefono, direccion, documento, valor, plazo, interes } = formData;
      const montoNum = parseMoneyToNumeric(valor);
      if (!montoNum || montoNum <= 0) {
        appAlert('Valor inválido', 'El valor debe ser mayor a 0');
        setSaving(false);
        return;
      }
      const database = await getDbConnection();

      // Calcular número de cuotas y valor por cuota según el plazo seleccionado
      const plazoObj = conceptosPlazo.find(c => String(c.id) === String(plazo));
      let numCuotas = 1;
      if (plazoObj?.valor) {
        const match = plazoObj.valor.match(/\d+/);
        if (match) numCuotas = parseInt(match[0], 10) || 1;
      }
      const valorCuota = Math.round(montoNum / numCuotas);
      const tempId = -Date.now();
      const nowIso = new Date().toISOString();
      const todayDate = nowIso.slice(0, 10);

      const salePayload = {
        nombre: nombre.trim(),
        apellido: (apellido || '').trim(),
        alias: (alias || '').trim(),
        email: '',
        telefono: (telefono || '').trim(),
        direccion: (direccion || '').trim(),
        documento: (documento || '').trim(),
        monto: montoNum,
        vendedor_id: userId,
        caja_id: cajaAbierta.id,
        plazo_id: parseInt(plazo, 10),
        interes_id: parseInt(interes, 10),
      };

      // 2. Guardar en ventas_pendientes (para que el worker de sync lo suba cuando haya red)
      await database.executeSql(`CREATE TABLE IF NOT EXISTS ventas_pendientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        temp_id TEXT UNIQUE,
        payload TEXT,
        estado TEXT DEFAULT 'pendiente',
        created_at TEXT
      )`);
      await database.executeSql(
        `INSERT INTO ventas_pendientes (temp_id, payload, estado, created_at) VALUES (?, ?, 'pendiente', ?)`,
        [String(tempId), JSON.stringify(salePayload), nowIso]
      );

      // 3. Guardar en la tabla local facturas para que aparezca inmediatamente en Cartera
      await database.executeSql(
        `INSERT OR REPLACE INTO facturas (
          id, nombreUno, apellidoUno, alias, documento, celular, direccion,
          saldo, valorInicial, valorCuota, num_cuotas, cuotasPagas, cuotasVencidas,
          estado, estadoMovil, fecha, idVendedor, usuarioId, paymentTermId, detalles, consecutivoTramitado
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'pendiente', 'pendiente', ?, ?, ?, ?, ?, 0)`,
        [
          String(tempId),
          nombre.trim(),
          (apellido || '').trim(),
          (alias || '').trim(),
          (documento || '').trim(),
          (telefono || '').trim(),
          (direccion || '').trim(),
          montoNum,
          montoNum,
          valorCuota,
          String(numCuotas),
          todayDate,
          userId,
          userId,
          plazo,
          JSON.stringify(salePayload),
        ]
      );

      // 4. Registrar movimiento local de venta para actualizar la caja
      await database.executeSql(
        `INSERT INTO movimientos (id, descripcion, monto, horaDispositivo, tipo, estadoMovil, idCaja, fecha) VALUES (?, ?, ?, ?, 'venta', 'sincronizado', ?, ?)`,
        [tempId - 1, `Venta: ${nombre.trim()} (${documento.trim()})`, montoNum, nowIso, cajaAbierta.id, nowIso]
      );

      // 5. Descontar saldo_final de la caja localmente
      try {
        await database.executeSql(`UPDATE cajas SET saldo_final = COALESCE(saldo_final, 0) - ? WHERE id = ?`, [montoNum, cajaAbierta.id]);
      } catch { }

      // 6. Si hay conexión en este instante, disparar sincronización en background
      try {
        SyncWithSupabase(false, () => { });
      } catch { }

      appAlert('Éxito', 'Venta registrada localmente. Se sincronizará de inmediato si tienes conexión, o se guardará offline para subir luego.');
      setFormData({ nombre: '', apellido: '', alias: '', direccion: '', telefono: '', genero: '', documento: '', valor: '', plazo: '', interes: '' });
      setFormDataLabels({ plazo: '', interes: '' });
      navigation.navigate('Payments');
    } catch (err) {
      console.log("E error------------", err.message);
      appAlert('Error', err.message || 'No se pudo guardar la venta');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={styles.headerBtn}>
          <Icon name="chevron-left" size={16} color={apple.colors.blue} />
          <Text style={styles.headerBack}>Atrás</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nueva Venta</Text>
        <View style={{ width: 60 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Animated.View style={{ opacity: fade }}>
            <Text style={styles.pageTitle}>Crear cliente y crédito</Text>
            <Text style={styles.pageSub}>Completa los datos. El cliente y la factura se crean transaccionalmente.</Text>

            <View style={styles.section}>
              <View style={styles.sectionHeader}><View style={[styles.sectionIcon, { backgroundColor: '#E8F0FE' }]}><Icon name="user" size={14} color={apple.colors.blue} /></View><Text style={styles.sectionTitle}>Información personal</Text></View>
              <FormField label="Nombre *" value={formData.nombre} onChangeText={t => handleChange('nombre', t)} placeholder="Ej. Carlos" icon="user" />
              <FormField label="Apellido *" value={formData.apellido} onChangeText={t => handleChange('apellido', t)} placeholder="Ej. Ramírez" icon="user-o" />
              <FormField label="Alias *" value={formData.alias} onChangeText={t => handleChange('alias', t)} placeholder="Ej. carlosr" icon="star-o" />
              <Text style={styles.fieldLabel}>Género *</Text>
              <View style={styles.segment}>
                {['masculino', 'femenino'].map(g => (
                  <TouchableOpacity key={g} onPress={() => handleGeneroChange(g)} style={[styles.segmentOpt, formData.genero === g && styles.segmentOptActive]}>
                    <Text style={[styles.segmentText, formData.genero === g && styles.segmentTextActive]}>{g === 'masculino' ? 'Masculino' : 'Femenino'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}><View style={[styles.sectionIcon, { backgroundColor: '#E8F5E9' }]}><Icon name="map-marker" size={14} color={apple.colors.success} /></View><Text style={styles.sectionTitle}>Contacto</Text></View>
              <FormField label="Dirección *" value={formData.direccion} onChangeText={t => handleChange('direccion', t)} placeholder="Calle 123 #45-67" icon="home" />
              <FormField label="Teléfono *" value={formData.telefono} onChangeText={t => handleChange('telefono', t)} placeholder="311 234 5678" keyboardType="phone-pad" icon="phone" />
              <FormField label="Documento *" value={formData.documento} onChangeText={t => handleChange('documento', t)} placeholder="CC / NIT" keyboardType="numeric" icon="id-card" />
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}><View style={[styles.sectionIcon, { backgroundColor: '#FFF3E0' }]}><Icon name="money" size={14} color={apple.colors.warning} /></View><Text style={styles.sectionTitle}>Venta</Text></View>
              <FormField label="Valor *" value={formData.valor} onChangeText={t => handleChange('valor', t)} placeholder="$ 0" keyboardType="numeric" /* icon="dollar" */ />
              <Text style={styles.fieldLabel}>Plazo *</Text>
              <TouchableOpacity style={styles.picker} onPress={() => setShowPlazoModal(true)}>
                <Text style={[styles.pickerText, !formDataLabels.plazo && { color: apple.colors.tertiaryLabel }]}>{formDataLabels.plazo || 'Selecciona plazo'}</Text>
                <Icon name="chevron-down" size={12} color={apple.colors.tertiaryLabel} />
              </TouchableOpacity>
              <Text style={styles.fieldLabel}>Interés *</Text>
              <TouchableOpacity style={styles.picker} onPress={() => setShowInteresModal(true)}>
                <Text style={[styles.pickerText, !formDataLabels.interes && { color: apple.colors.tertiaryLabel }]}>{formDataLabels.interes || 'Selecciona interés'}</Text>
                <Icon name="chevron-down" size={12} color={apple.colors.tertiaryLabel} />
              </TouchableOpacity>
            </View>

            <AppleButton title={saving ? 'Guardando...' : 'Guardar venta'} onPress={handleSubmit} loading={saving} disabled={!isFormValid || saving} style={{ marginTop: 8 }} />
            {!isFormValid && <Text style={styles.hint}>Completa todos los campos para habilitar el guardado.</Text>}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      <CustomPicker data={conceptosPlazo} selectedValue={formData.plazo} onSelect={(v, l) => handlePickerSelect('plazo', v, l)} placeholder="Seleccionar Plazo" visible={showPlazoModal} onClose={() => setShowPlazoModal(false)} />
      <CustomPicker data={conceptosInteres} selectedValue={formData.interes} onSelect={(v, l) => handlePickerSelect('interes', v, l)} placeholder="Seleccionar Interés" visible={showInteresModal} onClose={() => setShowInteresModal(false)} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: apple.colors.bgGrouped },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: apple.colors.card, borderBottomWidth: 0.5, borderColor: apple.colors.separator },
  headerBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerBack: { color: apple.colors.blue, fontSize: 17, fontWeight: '400' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: apple.colors.label },
  pageTitle: { ...apple.typography.title2, marginTop: 4 },
  pageSub: { ...apple.typography.subheadline, marginTop: 4, marginBottom: 16 },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: apple.radius.l,
    borderWidth: 1,
    borderColor: '#E8EAED',
    marginBottom: 16,
    padding: 16,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  sectionIcon: { width: 28, height: 28, borderRadius: apple.radius.s, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { ...apple.typography.headline },
  field: { marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: apple.colors.secondaryLabel, marginBottom: 6, letterSpacing: 0.3, textTransform: 'uppercase' },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: apple.colors.fill, borderRadius: apple.radius.s, borderWidth: 1, borderColor: apple.colors.separator, paddingHorizontal: 12, height: 46 },
  input: { flex: 1, fontSize: 16, color: apple.colors.label },
  segment: { flexDirection: 'row', backgroundColor: apple.colors.fill, borderRadius: apple.radius.s, padding: 3, gap: 4 },
  segmentOpt: { flex: 1, paddingVertical: 8, borderRadius: apple.radius.s, alignItems: 'center' },
  segmentOptActive: { backgroundColor: apple.colors.card },
  segmentText: { fontSize: 14, fontWeight: '500', color: apple.colors.secondaryLabel },
  segmentTextActive: { color: apple.colors.label, fontWeight: '600' },
  picker: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: apple.colors.fill, borderRadius: apple.radius.s, borderWidth: 1, borderColor: apple.colors.separator, paddingHorizontal: 12, height: 46, marginBottom: 12 },
  pickerText: { fontSize: 16, color: apple.colors.label },
  hint: { ...apple.typography.caption1, textAlign: 'center', marginTop: 8 },
});

export default CrearCliente;
